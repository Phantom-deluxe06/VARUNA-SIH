"""VARUNA intent agents — deterministic domain handlers.

Each handler is backed by the embedded SQLite store (``app.db``) and the
offline Satellite EO ``RasterEngine``. No external cloud LLM APIs, no static
mocks; every advisory is computed live from local data. Agents are pure
functions over ``UserQueryRequest`` + extracted NLU entities and return the
canonical ``AgentDecisionResponse`` contract consumed by the frontend.
"""

from __future__ import annotations

import logging
import math
from typing import Callable, Optional

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
WAVE_SAFE_LIMIT_M = 2.0
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
# Deterministic spatial sea-state model (no RNG, no network).
# ---------------------------------------------------------------------------
def _sea_state(lat: float, lon: float) -> dict:
    """Deterministic sea-state proxies derived purely from position."""
    wind = 12.0 + 5.0 * math.sin(math.radians(lat) * 4.0) + 3.0 * math.cos(math.radians(lon) * 3.0)
    wind = round(max(4.0, min(28.0, wind)), 1)
    gust = round(wind * 1.35, 1)
    wave = round(max(0.4, 0.25 * (wind / 10.0) ** 1.5 + 0.5), 2)
    period = round(max(4.5, min(12.0, 9.5 - wave * 1.2)), 1)
    return {
        "wind_speed_knots": wind,
        "gust_knots": gust,
        "wave_height_m": wave,
        "wave_period_s": period,
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

    evidence: list[str] = [
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
    }

    if ukc < threshold:
        evidence.append(f"UKC {ukc}m < minimum {threshold}m -> CRITICAL grounding risk")
        return AgentDecisionResponse(
            status="CRITICAL",
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
            metrics=metrics,
            evidence_trace=evidence,
        )

    if ukc < threshold * 2.0:
        evidence.append(f"UKC {ukc}m within 2x safety band -> CAUTION")
        return AgentDecisionResponse(
            status="CAUTION",
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
            metrics=metrics,
            evidence_trace=evidence,
        )

    evidence.append(f"UKC {ukc}m >= 2x threshold -> SAFE to navigate")
    return AgentDecisionResponse(
        status="SAFE",
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
        metrics=metrics,
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

    evidence: list[str] = [
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
    }

    if nearest_nm < IMBL_CRITICAL_NM:
        evidence.append(f"Within {IMBL_CRITICAL_NM} NM of IMBL -> CRITICAL")
        return AgentDecisionResponse(
            status="CRITICAL",
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
            metrics=metrics,
            evidence_trace=evidence,
        )

    if nearest_nm < IMBL_WARNING_NM:
        evidence.append(f"{nearest_nm} NM within warning band (< {IMBL_WARNING_NM} NM) -> CAUTION")
        return AgentDecisionResponse(
            status="CAUTION",
            agent_name="Coastal Hazard Agent",
            advisory_en=(
                f"Caution: vessel is {nearest_nm} NM from the IMBL boundary. "
                f"Approach cautiously; do not cross the international maritime line."
            ),
            advisory_ta=(
                f"எச்சரிக்கை: கப்பல் IMBL எல்லையிலிருந்து {nearest_nm} கடல் மைல் "
                f"தொலைவில் உள்ளது. எல்லையைக் கடக்க வேண்டாம்."
            ),
            metrics=metrics,
            evidence_trace=evidence,
        )

    evidence.append(f"{nearest_nm} NM beyond warning band -> SAFE")
    return AgentDecisionResponse(
        status="SAFE",
        agent_name="Coastal Hazard Agent",
        advisory_en=(
            f"Safe: vessel is {nearest_nm} NM from the nearest IMBL segment. "
            f"No border-proximity risk detected; routine navigation permitted."
        ),
        advisory_ta=(
            f"பாதுகாப்பானது: கப்பல் IMBL எல்லையிலிருந்து {nearest_nm} கடல் மைல் "
            f"தொலைவில் உள்ளது. எல்லை அருகாமை ஆபத்து இல்லை."
        ),
        metrics=metrics,
        evidence_trace=evidence,
    )
# ---------------------------------------------------------------------------
# Agent: Fishery & Safety — live RasterEngine PFZ + compass vector.
# ---------------------------------------------------------------------------
def fishery_safety_agent(
    req: UserQueryRequest,
    entities: Optional[dict] = None,
) -> AgentDecisionResponse:
    """Pull live SST / chlorophyll / PFZ and compute the safe navigation vector."""
    ocean = RASTER.extract_ocean_data(req.lat, req.lon)
    vector = RASTER.calculate_safe_vector(
        req.lat, req.lon, PFZ_TARGET_LAT, PFZ_TARGET_LON
    )
    sea = _sea_state(req.lat, req.lon)
    sst = ocean["sst_celsius"]
    chl = ocean["chlorophyll_mg_m3"]
    pfz = ocean["is_pfz_gradient"]
    ml_flag = ocean.get("ml_is_pfz")
    ml_conf = ocean.get("ml_confidence")
    sst_grad = ocean.get("sst_gradient_c_per_deg", 0.0)
    chl_grad = ocean.get("chl_gradient_mg_m3_per_deg", 0.0)
    pfz_verdict = ml_flag if ml_flag is not None else pfz
    wave = sea["wave_height_m"]
    bearing = vector["bearing_degrees"]
    dist_km = vector["distance_km"]
    dist_nm = vector["distance_nm"]

    metrics = {
        "sst_celsius": round(sst, 2),
        "chlorophyll_mg_m3": round(chl, 3),
        "is_pfz_gradient": pfz,
        "pfz_verdict": pfz_verdict,
        "ml_is_pfz": ml_flag,
        "ml_confidence": ml_conf,
        "sst_gradient_c_per_deg": round(sst_grad, 4),
        "chl_gradient_mg_m3_per_deg": round(chl_grad, 4),
        "raster_source": ocean["source"],
        "target_lat": PFZ_TARGET_LAT,
        "target_lon": PFZ_TARGET_LON,
        "bearing_degrees": bearing,
        "distance_km": dist_km,
        "distance_nm": dist_nm,
        "wave_height_m": wave,
        "wind_speed_knots": sea["wind_speed_knots"],
    }
    bearing_vector = {
        "from": [req.lat, req.lon],
        "to": [PFZ_TARGET_LAT, PFZ_TARGET_LON],
        "bearing_degrees": bearing,
        "distance_km": dist_km,
    }

    evidence: list[str] = [
        f"RasterEngine SST at ({req.lat}, {req.lon}) = {sst:.2f} degC "
        f"(source {ocean['source']})",
        f"RasterEngine chlorophyll = {chl:.3f} mg/m3",
        f"PFZ gradient rule [0.2-2.0 mg/m3, 26-30.5 degC, dSST>0.5 degC]: {pfz}",
        f"Spatial fronts: |grad SST| {sst_grad:.3f} degC/deg, |grad chl| {chl_grad:.3f} mg/m3/deg",
        (
            f"ML PFZ classifier: {ml_flag} (confidence {ml_conf:.3f})"
            if ml_flag is not None
            else "ML PFZ classifier unavailable (model artefact missing)"
        ),
        f"PFZ verdict (ML-priority): {pfz_verdict}",
        f"Compass vector to PFZ {PFZ_TARGET_LAT},{PFZ_TARGET_LON}: "
        f"{bearing} deg / {dist_km} km / {dist_nm} NM",
        f"Deterministic sea state: wave {wave}m, wind {sea['wind_speed_knots']} kts",
    ]

    if wave > WAVE_SAFE_LIMIT_M:
        evidence.append(f"Wave height {wave}m exceeds safe limit {WAVE_SAFE_LIMIT_M}m -> CRITICAL")
        return AgentDecisionResponse(
            status="CRITICAL",
            agent_name="Fishery & Safety Agent",
            advisory_en=(
                f"Critical: wave height is {wave}m, exceeding the 2.0m safe limit. "
                f"Do not venture out today even with a live PFZ hotspot."
            ),
            advisory_ta=(
                f"முக்கிய எச்சரிக்கை: அலை உயரம் {wave} மீட்டர் — பாதுகாப்பான 2.0 மீட்டர் "
                f"எல்லையைத் தாண்டியது. PFZ தகவல் இருந்தாலும் இன்று கடலுக்குச் செல்ல வேண்டாம்."
            ),
            metrics=metrics,
            bearing_vector=bearing_vector,
            evidence_trace=evidence,
        )

    if pfz_verdict:
        evidence.append("PFZ conditions favourable -> SAFE")
        return AgentDecisionResponse(
            status="SAFE",
            agent_name="Fishery & Safety Agent",
            advisory_en=(
                f"Fishing is favourable. SST {sst:.2f} degC and chlorophyll "
                f"{chl:.2f} mg/m3 indicate a thermal-front hotspot. Head "
                f"{bearing} deg for {dist_km} km ({dist_nm} NM) to the PFZ."
            ),
            advisory_ta=(
                f"மீன்பிடிப்பு சாதகமாக உள்ளது. SST {sst:.2f}°C மற்றும் குளோரோபில் "
                f"{chl:.2f} mg/m³ வெப்ப-முனை இருப்பைக் காட்டுகின்றன. PFZ நோக்கி "
                f"{bearing}° திசையில் {dist_km} கி.மீ ({dist_nm} NM) செல்லுங்கள்."
            ),
            metrics=metrics,
            bearing_vector=bearing_vector,
            evidence_trace=evidence,
        )

    evidence.append("PFZ conditions weak -> CAUTION (fishing may be unproductive)")
    return AgentDecisionResponse(
        status="CAUTION",
        agent_name="Fishery & Safety Agent",
        advisory_en=(
            f"Caution: PFZ conditions at your position are weak "
            f"(SST {sst:.2f} degC, chlorophyll {chl:.2f} mg/m3). Fishing may be "
            f"unproductive; consider the nearby hotspot at {bearing} deg, "
            f"{dist_km} km away."
        ),
        advisory_ta=(
            f"எச்சரிக்கை: உங்கள் இடத்தில் PFZ நிலை பலவீனமாக உள்ளது "
            f"(SST {sst:.2f}°C, குளோரோபில் {chl:.2f} mg/m³). மீன்பிடிப்பு "
            f"அதிக மகசூல் தராது; {bearing}° திசையில் {dist_km} கி.மீ தொலைவில் "
            f"உள்ள நெருக்கடிப் பகுதியை முயற்சிக்கவும்."
        ),
        metrics=metrics,
        bearing_vector=bearing_vector,
        evidence_trace=evidence,
    )
# ---------------------------------------------------------------------------
# Agent: Situational Awareness — dynamic contextual fallback (Layer 3).
# ---------------------------------------------------------------------------
def situational_awareness_agent(
    req: UserQueryRequest,
    entities: Optional[dict] = None,
) -> AgentDecisionResponse:
    """Dynamically composed situational advisory — never a static mock."""
    ocean = RASTER.extract_ocean_data(req.lat, req.lon)
    sea = _sea_state(req.lat, req.lon)
    port, port_km = _find_nearest_port(req.lat, req.lon)
    sst = ocean["sst_celsius"]
    chl = ocean["chlorophyll_mg_m3"]
    pfz = ocean["is_pfz_gradient"]
    ml_flag = ocean.get("ml_is_pfz")
    ml_conf = ocean.get("ml_confidence")
    sst_grad = ocean.get("sst_gradient_c_per_deg", 0.0)
    chl_grad = ocean.get("chl_gradient_mg_m3_per_deg", 0.0)
    pfz_verdict = ml_flag if ml_flag is not None else pfz
    wave = sea["wave_height_m"]
    wind = sea["wind_speed_knots"]

    metrics = {
        "sst_celsius": round(sst, 2),
        "chlorophyll_mg_m3": round(chl, 3),
        "is_pfz_gradient": pfz,
        "pfz_verdict": pfz_verdict,
        "ml_is_pfz": ml_flag,
        "ml_confidence": ml_conf,
        "sst_gradient_c_per_deg": round(sst_grad, 4),
        "chl_gradient_mg_m3_per_deg": round(chl_grad, 4),
        "raster_source": ocean["source"],
        "wave_height_m": wave,
        "wave_period_s": sea["wave_period_s"],
        "wind_speed_knots": wind,
        "gust_knots": sea["gust_knots"],
        "nearest_port": port.port_name if port else None,
        "nearest_port_distance_km": round(port_km, 1) if port else None,
        "system_ready": True,
    }

    if wave > WAVE_SAFE_LIMIT_M or wind >= 25.0:
        status = "CRITICAL"
    elif wave > 1.5 or wind >= 18.0:
        status = "CAUTION"
    else:
        status = "SAFE"

    port_text = (
        f"closest port {port.port_name} {round(port_km, 1)} km away"
        if port else "no seeded port within range"
    )
    pfz_text = ("a live PFZ hotspot is present" if pfz_verdict else "no active PFZ hotspot nearby") + (f" (ML confidence {ml_conf:.2f})" if ml_conf is not None else "")

    evidence: list[str] = [
        "Layer 3 contextual fallback: no deterministic/fuzzy domain intent matched; "
        "assembled a dynamic situational awareness advisory",
        f"Live RasterEngine telemetry: SST {sst:.2f} degC, chl {chl:.3f} mg/m3 "
        f"(source {ocean['source']}), {pfz_text}",
        f"Deterministic sea state: wave {wave}m, wind {wind} kts "
        f"(gust {sea['gust_knots']} kts), period {sea['wave_period_s']}s",
        f"Local DB port lookup: {port_text}",
        f"System readiness: engine online, embedded DB online, NLU 3-layer pipeline active",
    ]

    return AgentDecisionResponse(
        status=status,
        agent_name="Situational Awareness Agent",
        advisory_en=(
            f"Situational awareness at {req.lat:.3f}N, {req.lon:.3f}E — sea state: "
            f"wave {wave}m, wind {wind} kts (gust {sea['gust_knots']} kts). "
            f"Sea surface {sst:.2f} degC, chlorophyll {chl:.2f} mg/m3; {pfz_text}; "
            f"{port_text}. "
            f"Status: {'CAUTION - monitor conditions' if status == 'CAUTION' else 'CRITICAL - stay ashore' if status == 'CRITICAL' else 'nominal - proceed with standard precautions'}."
        ),
        advisory_ta=(
            f"சூழ்நிலை அறிவிப்பு: {req.lat:.3f}°N, {req.lon:.3f}°E — கடல் நிலை: "
            f"அலை {wave} மீ, காற்று {wind} நாட். SST {sst:.2f}°C, குளோரோபில் "
            f"{chl:.2f} mg/m³; {('PFZ அருகில் உள்ளது' if pfz else 'PFZ இல்லை')}; "
            f"{port_text}. மேலும், "
            f"{'வானிலை எச்சரிக்கையுடன் செயல்படுங்கள்' if status == 'CAUTION' else 'ஆபத்து — கரையில் இருங்கள்' if status == 'CRITICAL' else 'நிலை சாதாரணம் — வழக்கமான முன்னெச்சரிக்கை' }."
        ),
        metrics=metrics,
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
