import json
import math
from pathlib import Path
from typing import Callable

from app.schemas import AgentDecisionResponse, UserQueryRequest

MOCK_DATA_PATH = Path(__file__).resolve().parent.parent / "mock_data" / "sample_marine_data.json"


def _load_mock_data() -> dict:
    with open(MOCK_DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


MOCK = _load_mock_data()


def fishery_safety_agent(req: UserQueryRequest) -> AgentDecisionResponse:
    weather = MOCK["coastal_weather"]
    hotspot = MOCK["fishery_hotspot"]
    evidence: list[str] = []
    metrics: dict = {
        "wave_height_m": weather["wave_height_m"],
        "wave_period_s": weather["wave_period_s"],
        "wind_speed_knots": weather["wind_speed_knots"],
        "gust_knots": weather["gust_knots"],
    }
    evidence.append(f"Coastal weather loaded: wave={weather['wave_height_m']}m, wind={weather['wind_speed_knots']}kts")
    evidence.append(f"Hotspot acquired: {hotspot['species']} at {hotspot['target_lat']},{hotspot['target_lon']}")

    if weather["wave_height_m"] > 2.0:
        evidence.append(f"Wave height {weather['wave_height_m']}m exceeds safe limit of 2.0m")
        return AgentDecisionResponse(
            active_agent="Fishery & Safety Agent",
            status="CRITICAL",
            advisory_tamil="கடலுக்கு செல்ல வேண்டாம்",
            advisory_english="Do not venture into the sea. Wave height exceeds the safe limit of 2.0m.",
            metrics=metrics,
            evidence_trace=evidence,
        )

    evidence.append(f"Wave height {weather['wave_height_m']}m is within safe limit; computing 1-click compass route")
    metrics.update(
        {
            "target_lat": hotspot["target_lat"],
            "target_lon": hotspot["target_lon"],
            "bearing_degrees": hotspot["bearing_degrees"],
            "distance_km": hotspot["distance_km"],
            "species": hotspot["species"],
        }
    )
    return AgentDecisionResponse(
        active_agent="Fishery & Safety Agent",
        status="SAFE",
        advisory_tamil=(
            f"கடல் நிலை பாதுகாப்பானது. {hotspot['species']} மீன் பிடிக்க {hotspot['distance_km']} கி.மீ. "
            f"தூரத்தில், {hotspot['bearing_degrees']}° திசையில் செல்லுங்கள்."
        ),
        advisory_english=(
            f"Sea conditions are safe. Head {hotspot['bearing_degrees']}° (compass) for "
            f"{hotspot['distance_km']} km to reach the {hotspot['species']} hotspot."
        ),
        metrics=metrics,
        evidence_trace=evidence,
    )


def port_hydrographic_agent(req: UserQueryRequest) -> AgentDecisionResponse:
    port = MOCK["port_chennai"]
    draft = req.draft if req.draft is not None else 12.0
    ukc = round(port["channel_depth_m"] + port["current_tide_m"] - draft, 2)
    evidence: list[str] = []
    metrics: dict = {
        "channel_depth_m": port["channel_depth_m"],
        "current_tide_m": port["current_tide_m"],
        "user_draft_m": draft,
        "ukc_m": ukc,
        "threshold_min_ukc_m": port["threshold_min_ukc_m"],
    }
    evidence.append(
        f"UKC computed: {port['channel_depth_m']}m depth + {port['current_tide_m']}m tide - {draft}m draft = {ukc}m"
    )

    if ukc < port["threshold_min_ukc_m"]:
        evidence.append(
            f"UKC {ukc}m is below minimum threshold {port['threshold_min_ukc_m']}m: grounding risk"
        )
        return AgentDecisionResponse(
            active_agent="Port & Hydrographic Agent",
            status="CRITICAL",
            advisory_tamil="அபாயம்! ஆழம் போதவில்லை. இப்போது துறைமுகத்திற்குள் நுழையாதீர்கள்.",
            advisory_english=(
                f"Grounding risk: Under Keel Clearance {ukc}m is below the minimum required "
                f"{port['threshold_min_ukc_m']}m. Do not enter the channel."
            ),
            metrics=metrics,
            evidence_trace=evidence,
        )

    evidence.append(
        f"UKC {ukc}m satisfies minimum threshold {port['threshold_min_ukc_m']}m; clearing for docking window"
    )
    docking_window = "Next 3 hours (tide rising)"
    metrics["docking_window"] = docking_window
    return AgentDecisionResponse(
        active_agent="Port & Hydrographic Agent",
        status="SAFE",
        advisory_tamil=f"பாதுகாப்பான UKC {ukc}மீ. துறைமுகத்திற்குள் நுழையலாம். நேரம்: {docking_window}.",
        advisory_english=f"Safe UKC of {ukc}m. Cleared to enter channel. Docking window: {docking_window}.",
        metrics=metrics,
        evidence_trace=evidence,
    )


def coastal_hazard_agent(req: UserQueryRequest) -> AgentDecisionResponse:
    weather = MOCK["coastal_weather"]
    imbl = MOCK["imbl_palk_bay"]
    evidence: list[str] = []

    def _point_in_polygon(lat: float, lon: float, polygon: list) -> bool:
        num = len(polygon)
        j = num - 1
        inside = False
        for i in range(num):
            xi, yi = polygon[i][0], polygon[i][1]
            xj, yj = polygon[j][0], polygon[j][1]
            if (yi > lon) != (yj > lon):
                intersect_lat = xi + (lon - yi) * (xj - xi) / (yj - yi)
                if lat < intersect_lat:
                    inside = not inside
            j = i
        return inside

    wind_component = min(weather["wind_speed_knots"] / 34.0, 1.0) * 50
    wave_component = min(weather["wave_height_m"] / 4.0, 1.0) * 50
    risk_score = round(wind_component + wave_component, 1)
    evidence.append(
        f"Wind component: {weather['wind_speed_knots']}kts/34kts -> {wind_component:.1f}/50"
    )
    evidence.append(
        f"Wave component: {weather['wave_height_m']}m/4.0m -> {wave_component:.1f}/50"
    )
    evidence.append(f"Compound Risk Score: {risk_score}/100")

    in_imbl = _point_in_polygon(req.lat, req.lon, imbl["polygon_coordinates"])
    evidence.append(
        f"IMBL Palk Bay zone check: user at {req.lat},{req.lon} "
        f"{'INSIDE' if in_imbl else 'OUTSIDE'} restricted polygon"
    )

    metrics = {
        "compound_risk_score": risk_score,
        "wind_speed_knots": weather["wind_speed_knots"],
        "gust_knots": weather["gust_knots"],
        "wave_height_m": weather["wave_height_m"],
        "imbl_palk_bay": in_imbl,
    }

    if risk_score >= 70:
        status = "CRITICAL"
        advisory_tamil = "மிக உயர்ந்த கடல் ஆபத்து! கடலோர பகுதியிலிருந்து விலகியிருங்கள்."
        advisory_english = "Critical compound hazard. Evacuate and avoid all coastal activity."
    elif risk_score >= 40:
        status = "CAUTION"
        advisory_tamil = "எச்சரிக்கை! கடலில் கடுமையான காற்று. கரையிலேயே இருங்கள்."
        advisory_english = "Caution: rough sea conditions. Remain ashore and monitor updates."
    else:
        status = "SAFE"
        advisory_tamil = "கடல் நிலை சாதாரணம். எச்சரிக்கையுடன் செயல்படுங்கள்."
        advisory_english = "Sea state is normal. Proceed with standard precautions."

    if in_imbl:
        evidence.append("Advisory escalated: vessel inside IMBL Palk Bay restricted zone")
        advisory_english = "IMBL Palk Bay restricted zone detected. " + advisory_english

    return AgentDecisionResponse(
        active_agent="Coastal Hazard Agent",
        status=status,
        advisory_tamil=advisory_tamil,
        advisory_english=advisory_english,
        metrics=metrics,
        evidence_trace=evidence,
    )


AGENT_REGISTRY: dict[str, Callable[[UserQueryRequest], AgentDecisionResponse]] = {
    "fisherman": fishery_safety_agent,
    "port_pilot": port_hydrographic_agent,
    "disaster_officer": coastal_hazard_agent,
}

ROLE_KEYWORDS: dict[str, list[str]] = {
    "fisherman": ["fish", "fishing", "hotspot", "tuna", "mackerel", "compass", "meen"],
    "port_pilot": ["port", "docking", "ukc", "channel", "berth", "pilot", "grounding"],
    "disaster_officer": ["hazard", "storm", "risk", "cyclone", "imbl", "palk", "disaster", "evacuate"],
}


def route_to_agent(req: UserQueryRequest) -> AgentDecisionResponse:
    q = req.query.lower()
    best_role = req.user_role
    best_score = 0
    for role, keywords in ROLE_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in q)
        if score > best_score:
            best_score = score
            best_role = role
    return AGENT_REGISTRY[best_role](req)
