"""VARUNA intent agents — deterministic domain handlers backed by live Open-Meteo marine data.

Each handler is backed by the embedded SQLite store (``app.db``), the
offline Satellite EO ``RasterEngine``, and the live Open-Meteo Marine API.
No external cloud LLM APIs, no static mocks; every advisory is computed live
from real data. Agents are pure functions over ``UserQueryRequest`` + extracted
NLU entities and return the canonical ``AgentDecisionResponse`` contract consumed
by the frontend.
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Callable, Optional

from app.data.open_meteo import get_all_marine_data, live_sea_state
from app.db.database import (
    get_geofence_ring,
    get_port_by_name,
    list_ports,
)
from app.db.models import PortChannel
from app.schemas import AgentDecisionResponse, UserQueryRequest
from app.services.raster_service import RasterEngine

logger = logging.getLogger("varuna.agents")

# Shared stateless raster engine (safe: all methods are side-effect free).
RASTER = RasterEngine()

# ---------------------------------------------------------------------------
# Domain constants.
# ---------------------------------------------------------------------------
PFZ_TARGET_LAT = 9.28      # canonical PFZ hotspot anchor (matches frontend)
PFZ_TARGET_LON = 79.31
WAVE_SAFE_LIMIT_M = 1.5
IMBL_CRITICAL_NM = 2.0
IMBL_WARNING_NM = 5.0

EARTH_RADIUS_KM = 6371.0088
KM_PER_NM = 1.852
_NAUTICAL_EARTH_RADIUS = EARTH_RADIUS_KM / KM_PER_NM  # 3440.065 NM


# ---------------------------------------------------------------------------
# Geometry helpers (great-circle).
# ---------------------------------------------------------------------------
def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points in kilometres."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0) ** 2
    )
    return EARTH_RADIUS_KM * 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))


def _central_angle_rad(phi1: float, lam1: float, phi2: float, lam2: float) -> float:
    """Haversine central angle (radians) between two unit-sphere points."""
    dphi = phi2 - phi1
    dlam = lam2 - lam1
    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0) ** 2
    )
    return 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))


def _bearing_rad(phi1: float, lam1: float, phi2: float, lam2: float) -> float:
    """Forward azimuth (radians) from point 1 toward point 2."""
    dlam = lam2 - lam1
    y = math.sin(dlam) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlam)
    return math.atan2(y, x)


def _cross_track_distance_nm(
    lat: float,
    lon: float,
    seg_a: tuple[float, float],
    seg_b: tuple[float, float],
) -> float:
    """
    Perpendicular great-circle distance (NM) from a point to segment a→b.

    Uses the standard cross-track / along-track decomposition; when the
    projection falls beyond either endpoint the nearest endpoint distance is
    returned instead.
    """
    r_nm = _NAUTICAL_EARTH_RADIUS
    phi_p, lam_p = math.radians(lat), math.radians(lon)
    phi_a, lam_a = math.radians(seg_a[0]), math.radians(seg_a[1])
    phi_b, lam_b = math.radians(seg_b[0]), math.radians(seg_b[1])

    d13 = _central_angle_rad(phi_p, lam_p, phi_a, lam_a)      # point → start (rad)
    theta12 = _bearing_rad(phi_a, lam_a, phi_b, lam_b)        # start → end
    theta13 = _bearing_rad(phi_a, lam_a, phi_p, lam_p)        # start → point
    delta_theta = theta13 - theta12

    x_track = math.asin(
        max(-1.0, min(1.0, math.sin(d13) * math.sin(delta_theta)))
    ) * r_nm

    # Along-track distance from the segment start (sign indicates direction).
    denom = max(1e-12, math.cos(x_track / r_nm))
    a_track = math.acos(max(-1.0, min(1.0, math.cos(d13) / denom))) * r_nm
    if delta_theta < 0.0:
        a_track = -a_track

    seg_len = _central_angle_rad(phi_a, lam_a, phi_b, lam_b) * r_nm
    if a_track < 0.0:
        return abs(d13 * r_nm)                                  # before start
    if a_track > seg_len:
        d2b = _central_angle_rad(phi_p, lam_p, phi_b, lam_b) * r_nm
        return abs(d2b)                                        # past end
    return abs(x_track)


def _nearest_imbl_segment_nm(
    lat: float,
    lon: float,
    ring: list[tuple[float, float]],
) -> tuple[float, int]:
    """Min cross-track distance (NM) to the closed ring and its segment index."""
    best_nm, best_idx = math.inf, -1
    n = len(ring)
    for i in range(n):
        d = _cross_track_distance_nm(lat, lon, ring[i], ring[(i + 1) % n])
        if d < best_nm:
            best_nm, best_idx = d, i
    return best_nm, best_idx


def _point_in_polygon(lat: float, lon: float, ring: list[tuple[float, float]]) -> bool:
    """Ray-casting point-in-polygon test (ring: ordered (lat, lon) vertices)."""
    num = len(ring)
    j = num - 1
    inside = False
    for i in range(num):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lon) != (yj > lon):
            intersect_lat = xi + (lon - yi) * (xj - xi) / (yj - yi)
            if lat < intersect_lat:
                inside = not inside
        j = i
    return inside


def _find_nearest_port(
    lat: float,
    lon: float,
    ports: Optional[list[PortChannel]] = None,
) -> tuple[Optional[PortChannel], float]:
    """Nearest seeded port and its great-circle distance in km."""
    candidates = ports if ports is not None else list_ports()
    best_port, best_dist = None, math.inf
    for port in candidates:
        dist = _haversine_km(lat, lon, port.latitude, port.longitude)
        if dist < best_dist:
            best_port, best_dist = port, dist
    return best_port, best_dist


# ---------------------------------------------------------------------------
# Sea-state model: live Open-Meteo marine weather.
# ---------------------------------------------------------------------------
def _sea_state(lat: float, lon: float) -> dict:
    """Return live marine data from Open-Meteo."""
    marine = get_all_marine_data(lat, lon)
    return {
        "wave_height_m": marine["wave_height_m"],
        "sst_celsius": marine["sst_celsius"],
        "ocean_current_ms": marine["ocean_current_ms"],
        "wave_direction_deg": marine["wave_direction_deg"],
        "swell_height_m": marine["swell_height_m"],
        "max_wave_24h": marine["max_wave_24h"],
        "wind_speed_knots": marine.get("wind_speed_knots") or marine.get("wind_knots"),
        "wind_knots": marine.get("wind_knots") or marine.get("wind_speed_knots"),
        "gust_knots": marine.get("gust_knots"),
        "wave_period_s": marine.get("wave_period_s"),
        "source": marine["source"],
    }


def _resolve_vessel_draft(req: UserQueryRequest, entities: Optional[dict]) -> float:
    """Draft priority: request body > query-text entity > assumed 12.0 m."""
    if req.draft is not None:
        return float(req.draft)
    if entities and entities.get("draft") is not None:
        return float(entities["draft"])
    return 12.0


def _resolve_port(req: UserQueryRequest, entities: Optional[dict]) -> PortChannel:
    """Port priority: query-text entity > nearest to vessel > Chennai default."""
    if entities and entities.get("port"):
        port = get_port_by_name(entities["port"])
        if port is not None:
            return port
    port, _ = _find_nearest_port(req.lat, req.lon)
    if port is not None:
        return port
    fallback = get_port_by_name("Chennai Port")
    if fallback is None:
        raise RuntimeError("No ports seeded in the embedded database")
    return fallback


# ---------------------------------------------------------------------------
# Agent: Port & Hydrographic — UKC from the embedded ports_channels table.
# ---------------------------------------------------------------------------
def port_hydrographic_agent(
    req: UserQueryRequest,
    entities: Optional[dict] = None,
) -> AgentDecisionResponse:
    """Compute Under-Keel Clearance = (channel_depth + tidal surge) - draft."""
    port = _resolve_port(req, entities)
    draft = _resolve_vessel_draft(req, entities)
    depth = port.channel_depth_m
    tide = port.tidal_surge_offset_m
    threshold = port.safe_clearance_m
    ukc = round(depth + tide - draft, 2)
    now_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    marine = get_all_marine_data(req.lat, req.lon)
    sst = float(marine["sst_celsius"])
    wave = float(marine["wave_height_m"])
    current = float(marine["ocean_current_ms"])

    ring = get_geofence_ring()
    nearest_nm, _ = _nearest_imbl_segment_nm(req.lat, req.lon, ring)
    nearest_nm = round(nearest_nm, 2)

    evidence: list[str] = [
        f"SST: {sst}C from Open-Meteo Marine Live",
        f"Wave: {wave}m from Open-Meteo Marine Live",
        f"IMBL: {nearest_nm} NM from Haversine geometry",
        f"Layer-1 UKC: draft entity={entities.get('draft') if entities else None}, "
        f"request draft={req.draft} -> used {draft}m",
        f"Port resolved: {port.port_name} (channel {depth}m, tide {tide}m, "
        f"safe clearance {threshold}m)",
        f"UKC formula: {depth}m + {tide}m - {draft}m = {ukc}m",
    ]

    metrics = {
        "port_name": port.port_name,
        "channel_depth_m": depth,
        "current_tide_m": tide,
        "user_draft_m": draft,
        "ukc_m": ukc,
        "threshold_min_ukc_m": threshold,
        "sst_celsius": sst,
        "wave_height_m": wave,
        "ocean_current_ms": current,
        "data_source": marine["source"],
    }

    if ukc < threshold:
        evidence.append(f"UKC {ukc}m < minimum {threshold}m -> CRITICAL grounding risk")
        return AgentDecisionResponse(
            status="CRITICAL",
            alert_level="CRITICAL",
            agent_name="PORT & NAVIGATION AGENT",
            advisory_en=(
                f"Critical: Under-Keel Clearance at {port.port_name} is only {ukc}m. "
                f"A {draft}m draft with {depth}m channel and {tide}m tide leaves no "
                f"safe margin (minimum {threshold}m). Do not attempt the approach channel."
            ),
            advisory_ta=(
                f"முக்கிய எச்சரிக்கை: {port.port_name} துறைமுகத்தில் கீழ்-மிதவை "
                f"இடைவெளி {ukc} மீட்டர் மட்டுமே. {draft} மீட்டர் பாரம், {depth} மீட்டர் "
                f"ஆழம், {tide} மீட்டர் அலை நிலையில் குறைந்தபட்ச {threshold} மீட்டர் "
                f"இடைவெளி இல்லை. கால்வாயில் செல்ல வேண்டாம்."
            ),
            sst_celsius=sst,
            wave_height_m=wave,
            ocean_current_ms=current,
            data_source=marine["source"],
            data_timestamp=now_ts,
            metrics=metrics,
            evidence=evidence,
            evidence_trace=evidence,
        )

    if ukc < threshold * 2.0:
        evidence.append(f"UKC {ukc}m within 2x safety band -> CAUTION")
        return AgentDecisionResponse(
            status="CAUTION",
            alert_level="CAUTION",
            agent_name="PORT & NAVIGATION AGENT",
            advisory_en=(
                f"Caution: UKC at {port.port_name} is {ukc}m — above the {threshold}m "
                f"minimum but inside the 2x safety margin. Proceed slowly with pilot "
                f"assist and monitor tide."
            ),
            advisory_ta=(
                f"எச்சரிக்கை: {port.port_name} துறைமுகத்தில் UKC {ukc} மீட்டர். "
                f"குறைந்தபட்ச {threshold} மீட்டருக்கு மேல் உள்ளது, ஆனால் பாதுகாப்பான "
                f"வரம்புக்குள் மட்டுமே. மெதுவாகவும் பைலட் உதவியுடனும் செல்லவும்."
            ),
            sst_celsius=sst,
            wave_height_m=wave,
            ocean_current_ms=current,
            data_source=marine["source"],
            data_timestamp=now_ts,
            metrics=metrics,
            evidence=evidence,
            evidence_trace=evidence,
        )

    evidence.append(f"UKC {ukc}m >= 2x threshold -> SAFE to navigate")
    return AgentDecisionResponse(
        status="SAFE",
        alert_level="SAFE",
        agent_name="PORT & NAVIGATION AGENT",
        advisory_en=(
            f"Safe: Under-Keel Clearance at {port.port_name} is {ukc}m with a "
            f"{draft}m draft. The approach channel is navigable; maintain safe speed."
        ),
        advisory_ta=(
            f"பாதுகாப்பானது: {port.port_name} துறைமுகத்தில் UKC {ukc} மீட்டர். "
            f"{draft} மீட்டர் பாரத்திற்கு கால்வாய் பயணத்திற்கு தகுதியானது. "
            f"பாதுகாப்பான வேகத்தில் செல்லுங்கள்."
        ),
        sst_celsius=sst,
        wave_height_m=wave,
        ocean_current_ms=current,
        data_source=marine["source"],
        data_timestamp=now_ts,
        metrics=metrics,
        evidence=evidence,
        evidence_trace=evidence,
    )


# ---------------------------------------------------------------------------
# Agent: Coastal Hazard — IMBL proximity from the geofence_boundaries table.
# ---------------------------------------------------------------------------
def coastal_hazard_agent(
    req: UserQueryRequest,
    entities: Optional[dict] = None,
) -> AgentDecisionResponse:
    """Cross-track great-circle distance (NM) to the nearest IMBL segment."""
    ring = get_geofence_ring()
    nearest_nm, seg_idx = _nearest_imbl_segment_nm(req.lat, req.lon, ring)
    nearest_nm = round(nearest_nm, 2)
    inside = _point_in_polygon(req.lat, req.lon, ring)
    now_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    marine = get_all_marine_data(req.lat, req.lon)
    sst = float(marine["sst_celsius"])
    wave = float(marine["wave_height_m"])
    current = float(marine["ocean_current_ms"])

    evidence: list[str] = [
        f"SST: {sst}C from Open-Meteo Marine Live",
        f"Wave: {wave}m from Open-Meteo Marine Live",
        f"IMBL: {nearest_nm} NM from Haversine geometry",
        f"IMBL ring loaded from embedded DB: {len(ring)} vertices "
        f"(start {ring[0]}, end {ring[-1]})",
        f"Cross-track distance to nearest IMBL segment #{seg_idx} = {nearest_nm} NM",
        f"Ray-cast inside-zone test for ({req.lat}, {req.lon}): "
        f"{'INSIDE' if inside else 'OUTSIDE'} (informational)",
    ]

    metrics = {
        "nearest_imbl_distance_nm": nearest_nm,
        "nearest_imbl_segment_index": seg_idx,
        "inside_geofence": inside,
        "critical_threshold_nm": IMBL_CRITICAL_NM,
        "warning_threshold_nm": IMBL_WARNING_NM,
        "sst_celsius": sst,
        "wave_height_m": wave,
        "ocean_current_ms": current,
        "data_source": marine["source"],
    }

    if nearest_nm < IMBL_CRITICAL_NM:
        evidence.append(f"Within {IMBL_CRITICAL_NM} NM of IMBL -> CRITICAL")
        return AgentDecisionResponse(
            status="CRITICAL",
            alert_level="CRITICAL",
            agent_name="Coastal Hazard Agent",
            advisory_en=(
                f"Critical: your vessel is within {nearest_nm} NM of the IMBL "
                "boundary. This is the India–Sri Lanka International Maritime "
                "Boundary Line — do not cross. Turn back to port immediately."
            ),
            advisory_ta=(
                f"முக்கிய எச்சரிக்கை: உங்கள் கப்பல் IMBL பால்க் விரிகுடா எல்லைக்கு "
                f"{nearest_nm} கடல் மைல் அருகில் உள்ளது. இது இந்திய-இலங்கை "
                f"சர்வதேச கடல் எல்லை. கடக்க வேண்டாம்; உடனே துறைமுகத்திற்கு திரும்புங்கள்."
            ),
            sst_celsius=sst,
            wave_height_m=wave,
            ocean_current_ms=current,
            data_source=marine["source"],
            data_timestamp=now_ts,
            metrics=metrics,
            evidence=evidence,
            evidence_trace=evidence,
        )

    if nearest_nm < IMBL_WARNING_NM:
        evidence.append(f"{nearest_nm} NM within warning band (< {IMBL_WARNING_NM} NM) -> CAUTION")
        return AgentDecisionResponse(
            status="CAUTION",
            alert_level="CAUTION",
            agent_name="Coastal Hazard Agent",
            advisory_en=(
                f"Caution: vessel is {nearest_nm} NM from the IMBL boundary. "
                f"Approach cautiously; do not cross the international maritime line."
            ),
            advisory_ta=(
                f"எச்சரிக்கை: கப்பல் IMBL எல்லையிலிருந்து {nearest_nm} கடல் மைல் "
                f"தொலைவில் உள்ளது. எல்லையைக் கடக்க வேண்டாம்."
            ),
            sst_celsius=sst,
            wave_height_m=wave,
            ocean_current_ms=current,
            data_source=marine["source"],
            data_timestamp=now_ts,
            metrics=metrics,
            evidence=evidence,
            evidence_trace=evidence,
        )

    evidence.append(f"{nearest_nm} NM beyond warning band -> SAFE")
    return AgentDecisionResponse(
        status="SAFE",
        alert_level="SAFE",
        agent_name="Coastal Hazard Agent",
        advisory_en=(
            f"Safe: vessel is {nearest_nm} NM from the nearest IMBL segment. "
            f"No border-proximity risk detected; routine navigation permitted."
        ),
        advisory_ta=(
            f"பாதுகாப்பானது: கப்பல் IMBL எல்லையிலிருந்து {nearest_nm} கடல் மைல் "
            f"தொலைவில் உள்ளது. எல்லை அருகாமை ஆபத்து இல்லை."
        ),
        sst_celsius=sst,
        wave_height_m=wave,
        ocean_current_ms=current,
        data_source=marine["source"],
        data_timestamp=now_ts,
        metrics=metrics,
        evidence=evidence,
        evidence_trace=evidence,
    )


# ---------------------------------------------------------------------------
# Agent: Fishery & Safety — live Open-Meteo marine data + compass vector.
# ---------------------------------------------------------------------------
def fishery_safety_agent(
    req: UserQueryRequest,
    entities: Optional[dict] = None,
) -> AgentDecisionResponse:
    """Pull live Open-Meteo marine data, compute PFZ, and evaluate safety."""
    marine = get_all_marine_data(req.lat, req.lon)
    sst = float(marine["sst_celsius"])
    wave = float(marine["wave_height_m"])
    current = float(marine["ocean_current_ms"])
    source = marine.get("source", "OPEN_METEO_MARINE_LIVE")
    now_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Real IMBL distance from Haversine geometry
    ring = get_geofence_ring()
    imbl_nm, seg_idx = _nearest_imbl_segment_nm(req.lat, req.lon, ring)
    imbl_nm = round(imbl_nm, 2)

    # Real SST for PFZ calculation:
    # - SST 26-30C = optimal fishing (score 1.0)
    # - SST 30-32C = warm but fishable (score 0.7)
    # - SST > 32C = too warm (score 0.3)
    if 26.0 <= sst <= 30.0:
        pfz_score = 1.0
        pfz_status_en = "optimal fishing conditions"
        pfz_status_ta = "சிறந்த மீன்பிடி சூழல்"
        pfz_verdict = True
    elif 30.0 < sst <= 32.0:
        pfz_score = 0.7
        pfz_status_en = "warm but fishable conditions"
        pfz_status_ta = "வெதுவெதுப்பானது ஆனால் மீன்பிடிக்க ஏற்ற சூழல்"
        pfz_verdict = True
    else:
        pfz_score = 0.3
        pfz_status_en = "too warm for optimal fishing"
        pfz_status_ta = "மீன்பிடிக்க அதிக வெப்பமானது"
        pfz_verdict = False

    # Real wave for safety:
    # - wave < 1.5m = SAFE
    # - wave 1.5-2.5m = CAUTION
    # - wave > 2.5m = CRITICAL
    if wave < 1.5:
        status = "SAFE"
    elif wave <= 2.5:
        status = "CAUTION"
    else:
        status = "CRITICAL"

    vector = RASTER.calculate_safe_vector(
        req.lat, req.lon, PFZ_TARGET_LAT, PFZ_TARGET_LON
    )
    bearing = vector["bearing_degrees"]
    dist_km = vector["distance_km"]
    dist_nm = vector["distance_nm"]

    evidence = [
        f"SST: {sst}C from Open-Meteo Marine Live",
        f"Wave: {wave}m from Open-Meteo Marine Live",
        f"IMBL: {imbl_nm} NM from Haversine geometry",
    ]

    metrics = {
        "sst_celsius": sst,
        "wave_height_m": wave,
        "wave_period_s": marine.get("wave_period_s"),
        "wind_knots": marine.get("wind_knots") or marine.get("wind_speed_knots"),
        "wind_speed_knots": marine.get("wind_speed_knots") or marine.get("wind_knots"),
        "gust_knots": marine.get("gust_knots"),
        "ocean_current_ms": current,
        "wave_direction_deg": marine.get("wave_direction_deg"),
        "swell_height_m": marine.get("swell_height_m"),
        "max_wave_24h": marine.get("max_wave_24h"),
        "pfz_score": pfz_score,
        "pfz_condition": pfz_status_en,
        "pfz_verdict": pfz_verdict,
        "nearest_imbl_distance_nm": imbl_nm,
        "target_lat": PFZ_TARGET_LAT,
        "target_lon": PFZ_TARGET_LON,
        "bearing_degrees": bearing,
        "distance_km": dist_km,
        "distance_nm": dist_nm,
        "data_source": source,
    }

    bearing_vector = {
        "from": [req.lat, req.lon],
        "to": [PFZ_TARGET_LAT, PFZ_TARGET_LON],
        "bearing_degrees": bearing,
        "distance_km": dist_km,
    }

    if status == "CRITICAL":
        advisory_en = (
            f"Critical: wave height is {wave}m, exceeding the 2.5m safe limit. "
            f"Ocean current is {current} m/s. Dangerous sea state — do not venture out to sea today."
        )
        advisory_ta = (
            f"முக்கிய எச்சரிக்கை: அலை உயரம் {wave} மீட்டர் — 2.5 மீட்டர் ஆபத்தான எல்லையைத் தாண்டியது. "
            f"கடல் நீரோட்டம் {current} மீ/வி. கடல் கொந்தளிப்பாக உள்ளதால் இன்று கடலுக்குச் செல்ல வேண்டாம்."
        )
    elif status == "CAUTION":
        advisory_en = (
            f"Caution: wave height is {wave}m (1.5-2.5m caution band) and ocean current is {current} m/s. "
            f"SST is {sst}°C ({pfz_status_en}, PFZ score {pfz_score}). IMBL is {imbl_nm} NM away. "
            f"Proceed with heightened caution if sailing towards PFZ {bearing}° ({dist_nm} NM)."
        )
        advisory_ta = (
            f"எச்சரிக்கை: அலை உயரம் {wave} மீட்டர் (1.5-2.5 மீ எச்சரிக்கை வரம்பு), கடல் நீரோட்டம் {current} மீ/வி. "
            f"SST {sst}°C ({pfz_status_ta}, PFZ மதிப்பு {pfz_score}). எல்லை {imbl_nm} கடல் மைல் தொலைவில் உள்ளது. "
            f"எச்சரிக்கையுடன் செயல்படவும்."
        )
    else:  # SAFE
        advisory_en = (
            f"Safe to navigate: Wave height is calm at {wave}m (< 1.5m safe threshold) with ocean current {current} m/s. "
            f"Sea surface temperature is {sst}°C indicating {pfz_status_en} (PFZ score {pfz_score}). "
            f"Vessel is safely {imbl_nm} NM inside IMBL. Head {bearing}° for {dist_km} km ({dist_nm} NM) to PFZ."
        )
        advisory_ta = (
            f"பாதுகாப்பானது: அலை உயரம் அமைதியாக {wave} மீட்டர் (<1.5 மீ பாதுகாப்பு வரம்பு), கடல் நீரோட்டம் {current} மீ/வி. "
            f"கடல் மேற்பரப்பு வெப்பநிலை {sst}°C ஆக உள்ளதால் {pfz_status_ta} (PFZ மதிப்பு {pfz_score}). "
            f"IMBL எல்லை {imbl_nm} கடல் மைல் தொலைவில் பாதுகாப்பாக உள்ளது. PFZ நோக்கி {bearing}° திசையில் {dist_km} கி.மீ ({dist_nm} NM) செல்லுங்கள்."
        )

    return AgentDecisionResponse(
        status=status,
        alert_level=status,
        agent_name="Fishery & Safety Agent",
        advisory_en=advisory_en,
        advisory_ta=advisory_ta,
        sst_celsius=sst,
        wave_height_m=wave,
        ocean_current_ms=current,
        data_source=source,
        data_timestamp=now_ts,
        evidence=evidence,
        evidence_trace=evidence,
        metrics=metrics,
        bearing_vector=bearing_vector,
    )


# ---------------------------------------------------------------------------
# Agent: Situational Awareness — dynamic contextual fallback (Layer 3).
# ---------------------------------------------------------------------------
def situational_awareness_agent(
    req: UserQueryRequest,
    entities: Optional[dict] = None,
) -> AgentDecisionResponse:
    """Dynamically composed situational advisory from live marine data."""
    marine = get_all_marine_data(req.lat, req.lon)
    sst = float(marine["sst_celsius"])
    wave = float(marine["wave_height_m"])
    current = float(marine["ocean_current_ms"])
    wind = float(marine.get("wind_speed_knots") or marine.get("wind_knots") or 0.0)
    gust = float(marine.get("gust_knots") or 0.0)
    period = float(marine.get("wave_period_s") or 0.0)
    source = marine.get("source", "OPEN_METEO_MARINE_LIVE")
    now_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    port, port_km = _find_nearest_port(req.lat, req.lon)
    ring = get_geofence_ring()
    imbl_nm, _ = _nearest_imbl_segment_nm(req.lat, req.lon, ring)
    imbl_nm = round(imbl_nm, 2)

    # Real SST PFZ score
    if 26.0 <= sst <= 30.0:
        pfz_score = 1.0
        pfz_verdict = True
        pfz_text = "optimal PFZ conditions"
    elif 30.0 < sst <= 32.0:
        pfz_score = 0.7
        pfz_verdict = True
        pfz_text = "warm but fishable conditions"
    else:
        pfz_score = 0.3
        pfz_verdict = False
        pfz_text = "warm conditions"

    # Real wave safety
    if wave > 2.5 or wind >= 25.0:
        status = "CRITICAL"
    elif wave >= 1.5 or wind >= 18.0:
        status = "CAUTION"
    else:
        status = "SAFE"

    port_text = (
        f"closest port {port.port_name} {round(port_km, 1)} km away"
        if port else "no seeded port within range"
    )

    evidence: list[str] = [
        f"SST: {sst}C from Open-Meteo Marine Live",
        f"Wave: {wave}m from Open-Meteo Marine Live",
        f"IMBL: {imbl_nm} NM from Haversine geometry",
        f"Ocean Current: {current} m/s from Open-Meteo Marine Live",
        f"Nearest Port: {port_text}",
    ]

    metrics = {
        "sst_celsius": sst,
        "wave_height_m": wave,
        "ocean_current_ms": current,
        "wave_period_s": period,
        "wind_speed_knots": wind,
        "gust_knots": gust,
        "data_source": source,
        "nearest_imbl_distance_nm": imbl_nm,
        "nearest_port": port.port_name if port else None,
        "nearest_port_distance_km": round(port_km, 1) if port else None,
        "pfz_score": pfz_score,
        "system_ready": True,
    }

    return AgentDecisionResponse(
        status=status,
        alert_level=status,
        agent_name="Situational Awareness Agent",
        advisory_en=(
            f"Situational awareness at {req.lat:.3f}N, {req.lon:.3f}E — sea state: "
            f"wave {wave}m, current {current} m/s. "
            f"Sea surface temperature {sst}°C ({pfz_text}); {port_text}. "
            f"Status: {'CAUTION - monitor conditions' if status == 'CAUTION' else 'CRITICAL - stay ashore' if status == 'CRITICAL' else 'SAFE - standard navigation permitted'}."
        ),
        advisory_ta=(
            f"சூழ்நிலை அறிவிப்பு: {req.lat:.3f}°N, {req.lon:.3f}°E — கடல் நிலை: "
            f"அலை {wave} மீ, நீரோட்டம் {current} மீ/வி. SST {sst}°C; {port_text}. "
            f"நிலை: {'எச்சரிக்கையுடன் செயல்படுங்கள்' if status == 'CAUTION' else 'ஆபத்து — கரையில் இருங்கள்' if status == 'CRITICAL' else 'பாதுகாப்பானது — வழக்கம் போல் செல்லலாம்'}."
        ),
        sst_celsius=sst,
        wave_height_m=wave,
        ocean_current_ms=current,
        data_source=source,
        data_timestamp=now_ts,
        metrics=metrics,
        evidence=evidence,
        evidence_trace=evidence,
    )


# ---------------------------------------------------------------------------
# Intent → agent registry.
# ---------------------------------------------------------------------------
AgentHandler = Callable[[UserQueryRequest, Optional[dict]], AgentDecisionResponse]

AGENT_REGISTRY: dict[str, AgentHandler] = {
    "ukc": port_hydrographic_agent,
    "border": coastal_hazard_agent,
    "fishing": fishery_safety_agent,
    "situational": situational_awareness_agent,
}
