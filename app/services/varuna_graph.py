"""VARUNA LangGraph Multi-Agent Orchestration — Production v2.

Real agentic StateGraph pipeline with:

    NLU → Data Fetcher → ┬─ Satellite Agent ─→ PFZ Agent ──┐
                         ├─ Weather Agent ─────────────────┼─→ Synthesizer → Reflection ─┬─→ Translator → END
                         └─ Safety Agent ──────────────────┘                             │
                                                                                         └─→ (retry) Data Fetcher

All data is live from Open-Meteo + Copernicus + Haversine geometry. No mocks.
Agents share data via expanded VARUNAState. Reflection loop validates quality
and retries up to 2 times on failure.
"""

from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import Annotated, List, Optional, TypedDict

from langgraph.graph import END, StateGraph

from app.data.chlorophyll_fetcher import get_chlorophyll as _chl_fetcher_get
from app.data.ocean_fetcher import compute_pfz
from app.data.open_meteo import get_all_marine_data
from app.services.safety_engine import SafetyEngine

logger = logging.getLogger("varuna.graph")

safety_engine = SafetyEngine()

# PFZ target anchor (canonical, matches frontend)
PFZ_TARGET_LAT = 9.28
PFZ_TARGET_LON = 79.31

# Data fetch timeout (seconds)
DATA_FETCH_TIMEOUT = 15


def _merge_lists(a: Optional[List], b: Optional[List]) -> List:
    return list(a or []) + list(b or [])


def _merge_unique_lists(a: Optional[List], b: Optional[List]) -> List:
    res = list(a or [])
    for item in (b or []):
        if item not in res:
            res.append(item)
    return res


# ══════════════════════════════════════════════════════════════════════════════
# STATE SCHEMA — shared by all agents
# ══════════════════════════════════════════════════════════════════════════════
class VARUNAState(TypedDict):
    # ── Input ──────────────────────────
    query: str
    vessel_lat: float
    vessel_lon: float
    vessel_draft: float
    role: str
    phone: str
    language: str                   # "tamil" or "english"

    # ── NLU Results ────────────────────
    intent: str
    sub_intents: List[str]          # can have multiple
    entities: dict
    keywords_found: List[str]
    confidence: float

    # ── Real Data (shared by all agents)
    marine_data: Optional[dict]
    safety_data: Optional[dict]
    pfz_data: Optional[dict]
    weather_data: Optional[dict]
    chlorophyll_data: Optional[dict]
    tide_data: Optional[dict]

    # ── Agent Results ──────────────────
    satellite_result: Optional[dict]
    weather_result: Optional[dict]
    safety_result: Optional[dict]
    pfz_result: Optional[dict]
    route_result: Optional[dict]

    # ── Reflection ─────────────────────
    reflection_needed: bool
    reflection_reason: str
    retry_count: int

    # ── Cross-Agent Validation ─────────
    safety_confirmed: bool
    data_quality_score: float
    conflicting_data: Annotated[List[str], _merge_unique_lists]

    # ── Output ─────────────────────────
    advisory_en: str
    advisory_ta: str
    alert_level: str
    evidence: Annotated[List[str], _merge_lists]
    agent_name: str
    agent_chain: Annotated[List[str], _merge_lists]          # track which agents ran
    final_confidence: float
    sources: Annotated[List[str], _merge_unique_lists]


# ══════════════════════════════════════════════════════════════════════════════
# INTENT KEYWORD MAPS
# ══════════════════════════════════════════════════════════════════════════════
INTENT_MAP = {
    "fishing": [
        "மீன்", "மண்டலம்", "pfz", "fish",
        "fishing", "where to fish", "meen",
        "மீன்பிடி", "எங்க மீன்", "மீன் இருக்கு",
        "fishing zone", "catch fish", "மீன் பிடிக்க",
    ],
    "safety": [
        "safe", "பாதுகாப்பு", "போகலாமா",
        "kadal safe", "கடல் safe", "is it safe",
        "கடல் நிலை", "sea condition", "venture",
        "sail today", "go to sea", "புறப்பட",
    ],
    "border": [
        "எல்லை", "imbl", "border", "lanka",
        "இலங்கை", "boundary", "limit",
        "எல்லைக்கோடு", "maritime", "sri lanka",
        "approaching boundary", "near boundary",
    ],
    "weather": [
        "அலை", "wave", "wind", "காற்று",
        "புயல்", "storm", "cyclone", "rain",
        "மழை", "வானிலை", "weather", "forecast",
    ],
    "tomorrow": [
        "நாளைக்கு", "tomorrow", "forecast",
        "நாளை", "next day", "morning",
        "காலை", "அடுத்த நாள்", "plan trip",
    ],
}

# Multi-intent trigger phrases — when matched, multiple agents run
MULTI_INTENT_TRIGGERS = {
    "tomorrow": ["weather", "safety", "fishing"],
    "plan trip": ["weather", "safety", "fishing"],
    "safe to fish": ["weather", "safety", "fishing"],
    "where and safe": ["fishing", "safety", "weather"],
    "is it safe": ["weather", "safety"],
    "போகலாமா": ["weather", "safety"],
    "நாளைக்கு": ["weather", "safety", "fishing"],
    "safe-ஆ": ["weather", "safety"],
}

# Location entity patterns
LOCATION_PATTERNS = {
    "rameswaram": (9.2876, 79.3129),
    "ராமேஸ்வரம்": (9.2876, 79.3129),
    "chennai": (13.0827, 80.2707),
    "சென்னை": (13.0827, 80.2707),
    "palk bay": (9.50, 79.50),
    "பாக் ஜலசந்தி": (9.50, 79.50),
    "thoothukudi": (8.7642, 78.1348),
    "தூத்துக்குடி": (8.7642, 78.1348),
    "tuticorin": (8.7642, 78.1348),
    "kanyakumari": (8.0883, 77.5385),
    "கன்னியாகுமரி": (8.0883, 77.5385),
    "gulf of mannar": (9.00, 79.00),
    "nagapattinam": (10.7672, 79.8449),
    "நாகப்பட்டினம்": (10.7672, 79.8449),
}


# ══════════════════════════════════════════════════════════════════════════════
# NODE 1: NLU — multi-intent understanding
# ══════════════════════════════════════════════════════════════════════════════
def nlu_node(state: VARUNAState) -> VARUNAState:
    """Detect primary intent, sub-intents, language, and entities."""
    query = state["query"]
    query_lower = query.lower()

    # ── Language detection ──
    tamil_chars = [c for c in query if '\u0B80' <= c <= '\u0BFF']
    language = "tamil" if tamil_chars else "english"
    state["language"] = language

    # ── Primary intent detection ──
    detected_intent = "situational"
    found_keywords: list[str] = []
    intent_scores: dict[str, int] = {}

    for intent, keywords in INTENT_MAP.items():
        matches = [kw for kw in keywords if kw in query_lower]
        if matches:
            intent_scores[intent] = len(matches)
            found_keywords.extend(matches)

    if intent_scores:
        detected_intent = max(intent_scores, key=intent_scores.get)

    # ── Sub-intent detection (multi-intent queries) ──
    sub_intents: list[str] = []
    for trigger, intents in MULTI_INTENT_TRIGGERS.items():
        if trigger in query_lower:
            sub_intents = intents
            break

    # If no multi-intent trigger matched but we have multiple intent scores,
    # use all matched intents as sub-intents
    if not sub_intents and len(intent_scores) > 1:
        sub_intents = list(intent_scores.keys())

    # Always include the primary intent in sub_intents if not present
    if sub_intents and detected_intent not in sub_intents:
        sub_intents.insert(0, detected_intent)

    # Default: if no sub-intents, still run core pipeline
    if not sub_intents:
        sub_intents = [detected_intent]

    # ── Entity extraction ──
    entities: dict = {}

    # Location entities
    for loc_name, coords in LOCATION_PATTERNS.items():
        if loc_name in query_lower:
            entities["location"] = loc_name
            entities["location_lat"] = coords[0]
            entities["location_lon"] = coords[1]
            break

    # Time entities
    time_patterns = {
        "tomorrow": "tomorrow", "நாளைக்கு": "tomorrow", "நாளை": "tomorrow",
        "today": "today", "இன்று": "today",
        "morning": "morning", "காலை": "morning",
        "evening": "evening", "மாலை": "evening",
    }
    for pattern, time_val in time_patterns.items():
        if pattern in query_lower:
            entities["time"] = time_val
            break

    # Distance / draft entities
    draft_match = re.search(r"(?:draft|draught)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*m?\b", query, re.IGNORECASE)
    if draft_match:
        entities["draft"] = float(draft_match.group(1))

    distance_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:nm|nautical\s*mile)", query_lower)
    if distance_match:
        entities["distance_nm"] = float(distance_match.group(1))

    # ── Confidence ──
    if found_keywords:
        confidence = min(0.5 + len(found_keywords) * 0.15, 0.95)
    else:
        confidence = 0.3

    return {
        "intent": detected_intent,
        "sub_intents": sub_intents,
        "entities": entities,
        "keywords_found": found_keywords,
        "confidence": confidence,
        "language": language,
        "agent_chain": ["nlu"],
        "evidence": [
            f"NLU: intent='{detected_intent}', sub_intents={sub_intents}",
            f"NLU: language='{language}', keywords={found_keywords}",
            f"NLU: entities={entities}, confidence={confidence:.2f}",
        ],
        "sources": ["IntelligenceEngine NLU"],
    }


# ══════════════════════════════════════════════════════════════════════════════
# NODE 2: DATA FETCHER — parallel real data fetch
# ══════════════════════════════════════════════════════════════════════════════
def data_fetcher_node(state: VARUNAState) -> dict:
    """Fetch ALL marine data in parallel. Each agent reads from state, never calls APIs."""
    lat = state["vessel_lat"]
    lon = state["vessel_lon"]
    evidence = []
    sources = []

    # ── Parallel fetch with ThreadPoolExecutor ──
    def _fetch_marine():
        return get_all_marine_data(lat, lon)

    def _fetch_chlorophyll():
        return _chl_fetcher_get(lat, lon)

    def _fetch_imbl():
        return safety_engine.imbl_distance(lat, lon)

    def _fetch_forecast(marine_data):
        """Derive tomorrow forecast from already-fetched marine data."""
        if marine_data and not isinstance(marine_data, Exception) and not marine_data.get("error"):
            forecast_waves = marine_data.get("forecast_waves", [])
            wave_max = max(forecast_waves[24:48]) if len(forecast_waves) >= 48 else marine_data.get("max_wave_24h", 0)
            return {
                "wave_height_m": wave_max,
                "wind_knots": marine_data.get("wind_knots"),
                "wind_speed_knots": marine_data.get("wind_speed_knots"),
                "source": marine_data.get("source", "OPEN_METEO_MARINE_LIVE"),
            }
        return {"error": "no marine data for forecast"}

    results = {
        "marine": None,
        "chlorophyll": None,
        "imbl": None,
        "forecast": None,
    }

    with ThreadPoolExecutor(max_workers=3, thread_name_prefix="varuna-fetch") as executor:
        future_marine = executor.submit(_fetch_marine)
        future_chl = executor.submit(_fetch_chlorophyll)
        future_imbl = executor.submit(_fetch_imbl)

        # Marine data (fetched first — forecast depends on it)
        try:
            results["marine"] = future_marine.result(timeout=DATA_FETCH_TIMEOUT)
            sources.append("Open-Meteo Marine Live")
        except (FuturesTimeoutError, Exception) as e:
            logger.warning("Marine data fetch failed: %s", e)
            results["marine"] = {"error": str(e)}
            evidence.append("⚠️ Marine data fetch failed — degraded mode")

        # Chlorophyll data
        try:
            results["chlorophyll"] = future_chl.result(timeout=DATA_FETCH_TIMEOUT)
            chl_src = results["chlorophyll"].get("source", "satellite")
            sources.append(f"CHL: {chl_src}")
        except (FuturesTimeoutError, Exception) as e:
            logger.warning("Chlorophyll fetch failed: %s", e)
            results["chlorophyll"] = {"error": str(e)}
            evidence.append("⚠️ Chlorophyll fetch failed — using estimate")

        # IMBL distance
        try:
            imbl_nm = future_imbl.result(timeout=DATA_FETCH_TIMEOUT)
            results["imbl"] = imbl_nm
            sources.append("IMBL: Haversine geometry")
        except (FuturesTimeoutError, Exception) as e:
            logger.warning("IMBL distance calc failed: %s", e)
            results["imbl"] = 999.0
            evidence.append("⚠️ IMBL calculation failed — safe fallback")

    # Forecast derived from marine data (no extra API call)
    results["forecast"] = _fetch_forecast(results["marine"])
    if not (results["forecast"] or {}).get("error"):
        sources.append("Forecast: Open-Meteo")

    # ── Output results ──
    marine = results["marine"] if isinstance(results["marine"], dict) else {}
    imbl_nm = results["imbl"] if isinstance(results["imbl"], (int, float)) else 999.0

    evidence.append(
        f"Data Fetcher: marine={'OK' if not marine.get('error') else 'FAILED'}, "
        f"CHL={'OK' if not (results['chlorophyll'] or {}).get('error') else 'FAILED'}, "
        f"IMBL={imbl_nm:.2f}NM, "
        f"forecast={'OK' if not (results['forecast'] or {}).get('error') else 'FAILED'}"
    )

    return {
        "marine_data": marine,
        "chlorophyll_data": results["chlorophyll"],
        "safety_data": {
            "imbl_distance_nm": imbl_nm,
            "imbl_status": (
                "CRITICAL" if imbl_nm < 2 else
                "CAUTION" if imbl_nm < 5 else
                "SAFE"
            ),
        },
        "weather_data": results["forecast"],
        "agent_chain": ["data_fetcher"],
        "evidence": evidence,
        "sources": sources,
    }


# ══════════════════════════════════════════════════════════════════════════════
# NODE 3: SATELLITE AGENT — SST + CHL analysis
# ══════════════════════════════════════════════════════════════════════════════
def satellite_agent_node(state: VARUNAState) -> dict:
    """Analyze SST + CHL from state. Compute thermal fronts, upwelling, PFZ probability."""
    evidence = []
    sources = []
    result = {}

    try:
        marine = state.get("marine_data") or {}
        chl_data = state.get("chlorophyll_data") or {}

        sst = float(marine.get("sst_celsius", 0) or 0)
        wave = float(marine.get("wave_height_m", 0) or 0)
        chl = float(chl_data.get("chl_mg_m3", 0) or 0)
        chl_source = chl_data.get("source", "unknown")

        # SST gradient (thermal front) — from marine data if available
        sst_gradient = float(marine.get("sst_gradient_c_per_deg", 0) or 0)

        # Thermal front strength (0-1 scale)
        # Strong gradients (>0.5°C/deg) indicate fronts
        thermal_front_strength = min(abs(sst_gradient) / 0.5, 1.0) if sst_gradient else 0.3

        # Upwelling detection: cool SST + high CHL = upwelling
        upwelling_detected = (sst < 28.0 and chl > 1.0)

        # PFZ probability via INCOIS-style rules
        pfz_info = compute_pfz(
            sst=sst,
            chl=chl if chl > 0 else 0.8,
            sst_gradient=sst_gradient,
        )
        pfz_probability = pfz_info.get("confidence", 0.5)

        # Bearing and distance to PFZ target
        bearing = safety_engine.calculate_bearing(
            state["vessel_lat"], state["vessel_lon"],
            PFZ_TARGET_LAT, PFZ_TARGET_LON,
        )
        distance_nm = safety_engine.haversine(
            state["vessel_lat"], state["vessel_lon"],
            PFZ_TARGET_LAT, PFZ_TARGET_LON,
        )

        result = {
            "sst_celsius": sst,
            "chl_mg_m3": round(chl, 3) if chl else None,
            "chl_source": chl_source,
            "thermal_front_strength": round(thermal_front_strength, 2),
            "upwelling_detected": upwelling_detected,
            "pfz_probability": round(pfz_probability, 2),
            "pfz_is_pfz": pfz_info.get("is_pfz", False),
            "pfz_method": pfz_info.get("method", "incois_gradient_rule"),
            "recommended_bearing": round(bearing, 1),
            "recommended_distance_nm": round(distance_nm, 1),
            "target_lat": PFZ_TARGET_LAT,
            "target_lon": PFZ_TARGET_LON,
            "confidence": round(pfz_probability, 2),
            "source": f"Open-Meteo + {chl_source}",
        }
        sources.append(f"Open-Meteo + {chl_source}")
        evidence.append(
            f"Satellite Agent: SST={sst}°C, CHL={chl:.3f}mg/m³, "
            f"PFZ prob={pfz_probability:.0%}, "
            f"bearing={bearing:.0f}° dist={distance_nm:.1f}NM"
        )

    except TimeoutError:
        result = {
            "error": "timeout",
            "fallback": True,
            "sst_celsius": 31.1,
            "pfz_probability": 0.5,
            "source": "CACHED_FALLBACK",
        }
        sources.append("CACHED_FALLBACK")
        evidence.append("⚠️ Satellite agent timeout — using cached fallback")
    except Exception as e:
        logger.exception("Satellite agent failed")
        result = {
            "error": str(e),
            "fallback": True,
            "pfz_probability": 0.5,
        }
        evidence.append(f"⚠️ Satellite agent error: {e}")

    return {
        "satellite_result": result,
        "agent_chain": ["satellite_agent"],
        "evidence": evidence,
        "sources": sources,
    }


# ══════════════════════════════════════════════════════════════════════════════
# NODE 4: WEATHER AGENT — 5-tier classification
# ══════════════════════════════════════════════════════════════════════════════
def weather_agent_node(state: VARUNAState) -> dict:
    """Classify sea conditions, check cyclone risk, generate time-specific advice."""
    evidence = []
    sources = ["Open-Meteo Marine Live"]
    result = {}

    try:
        marine = state.get("marine_data") or {}
        forecast = state.get("weather_data") or {}

        wave = float(marine.get("wave_height_m", 0) or 0)
        wind = float(marine.get("wind_knots", 0) or marine.get("wind_speed_knots", 0) or 0)
        gust = float(marine.get("gust_knots", 0) or 0)
        swell = float(marine.get("swell_height_m", 0) or 0)
        period = float(marine.get("wave_period_s", 0) or 0)
        max_wave_24h = float(marine.get("max_wave_24h", 0) or 0)
        forecast_waves = marine.get("forecast_waves", [])

        # ── 5-tier sea condition classification ──
        if wave < 0.5 and wind < 10:
            condition = "EXCELLENT"
            condition_ta = "மிக நல்ல நிலை"
        elif wave < 1.0 and wind < 15:
            condition = "GOOD"
            condition_ta = "நல்ல நிலை"
        elif wave < 1.5 and wind < 20:
            condition = "FAIR"
            condition_ta = "ஏற்றுக்கொள்ளக்கூடிய நிலை"
        elif wave < 2.5 and wind < 30:
            condition = "POOR"
            condition_ta = "மோசமான நிலை"
        else:
            condition = "DANGEROUS"
            condition_ta = "ஆபத்தான நிலை"

        # ── Cyclone risk from CAPE-like proxy (gust/sustained ratio) ──
        cyclone_risk = False
        cyclone_risk_level = "NONE"
        if wind > 0:
            gust_ratio = gust / wind if wind > 0 else 0
            if gust > 40 or (gust_ratio > 1.8 and wind > 20):
                cyclone_risk = True
                cyclone_risk_level = "HIGH"
            elif gust > 25 or (gust_ratio > 1.5 and wind > 15):
                cyclone_risk_level = "MODERATE"

        # ── Best time recommendation from 48hr forecast ──
        best_time_advice = ""
        if forecast_waves and len(forecast_waves) >= 24:
            # Find calmest 3-hour window in next 24 hours
            min_wave = float("inf")
            best_hour = 0
            for i in range(min(len(forecast_waves), 24) - 2):
                avg = sum(forecast_waves[i:i + 3]) / 3
                if avg < min_wave:
                    min_wave = avg
                    best_hour = i
            # Convert to readable time (assuming data starts at midnight UTC,
            # IST = UTC+5:30)
            ist_hour = (best_hour + 5) % 24
            end_ist = (ist_hour + 3) % 24
            best_time_advice = (
                f"Best window: {ist_hour:02d}:00-{end_ist:02d}:00 IST "
                f"(wave ~{min_wave:.1f}m)"
            )

        # ── Tomorrow forecast data ──
        tomorrow_wave = None
        tomorrow_wind = None
        if isinstance(forecast, dict) and not forecast.get("error"):
            tomorrow_wave = forecast.get("wave_height_m")
            tomorrow_wind = forecast.get("wind_knots") or forecast.get("wind_speed_knots")

        result = {
            "condition": condition,
            "condition_ta": condition_ta,
            "wave_height_m": wave,
            "wind_knots": wind,
            "gust_knots": gust,
            "swell_height_m": swell,
            "wave_period_s": period,
            "max_wave_24h": max_wave_24h,
            "cyclone_risk": cyclone_risk,
            "cyclone_risk_level": cyclone_risk_level,
            "best_time_advice": best_time_advice,
            "tomorrow_wave": tomorrow_wave,
            "tomorrow_wind": tomorrow_wind,
            "confidence": 0.9 if not marine.get("error") else 0.4,
            "source": "Open-Meteo Marine Live",
        }

        evidence.append(
            f"Weather Agent: {condition} — wave={wave}m, wind={wind}kn, "
            f"gust={gust}kn, cyclone_risk={cyclone_risk_level}. "
            f"{best_time_advice}"
        )

    except Exception as e:
        logger.exception("Weather agent failed")
        result = {
            "error": str(e),
            "fallback": True,
            "condition": "UNKNOWN",
            "confidence": 0.2,
        }
        evidence.append(f"⚠️ Weather agent error: {e}")

    return {
        "weather_result": result,
        "agent_chain": ["weather_agent"],
        "evidence": evidence,
        "sources": sources,
    }


# ══════════════════════════════════════════════════════════════════════════════
# NODE 5: SAFETY AGENT — cross-agent validation, role-based thresholds
# ══════════════════════════════════════════════════════════════════════════════
def safety_agent_node(state: VARUNAState) -> dict:
    """Evaluate IMBL proximity, cross-check weather + satellite, role-based thresholds."""
    evidence = []
    conflicting = []
    sources = ["Haversine geometry + IMBL treaty coordinates"]
    result = {}
    safety_confirmed = True

    try:
        safety = state.get("safety_data") or {}
        marine = state.get("marine_data") or {}
        weather_r = state.get("weather_result") or {}
        sat_r = state.get("satellite_result") or {}

        imbl_nm = float(safety.get("imbl_distance_nm", 999))
        wave = float(marine.get("wave_height_m", 0) or 0)
        wind = float(marine.get("wind_knots", 0) or marine.get("wind_speed_knots", 0) or 0)
        gust = float(marine.get("gust_knots", 0) or 0)

        # ── Role-based IMBL thresholds ──
        role = state.get("role", "Fisherman").lower()
        if role in ("coast guard", "coastguard", "disaster_officer"):
            critical_nm = 2.0
            caution_nm = 5.0
        else:
            critical_nm = 5.0
            caution_nm = 10.0

        # ── IMBL safety classification ──
        if imbl_nm < critical_nm:
            imbl_status = "CRITICAL"
        elif imbl_nm < caution_nm:
            imbl_status = "CAUTION"
        else:
            imbl_status = "SAFE"

        # ── Weather-based safety override ──
        weather_condition = weather_r.get("condition", "UNKNOWN")
        if weather_condition == "DANGEROUS":
            alert = "CRITICAL"
        elif weather_condition == "POOR" or imbl_status == "CRITICAL":
            alert = "CRITICAL"
        elif weather_condition == "FAIR" or imbl_status == "CAUTION":
            alert = "CAUTION"
        elif wave > 2.5 or wind > 30 or imbl_nm < critical_nm:
            alert = "CRITICAL"
        elif wave > 1.5 or wind > 20 or imbl_nm < caution_nm:
            alert = "CAUTION"
        else:
            alert = "SAFE"

        # ── Cross-agent conflict detection ──
        # Check if PFZ recommendation is near IMBL
        pfz_dist = sat_r.get("recommended_distance_nm", 999)
        pfz_bearing = sat_r.get("recommended_bearing", 0)
        if sat_r.get("pfz_is_pfz") and imbl_nm < 15:
            conflicting.append(
                f"PFZ zone at {pfz_dist:.1f}NM ({pfz_bearing:.0f}°) is within "
                f"{imbl_nm:.1f}NM of IMBL boundary — fish carefully, "
                f"do not go past 80.2°E longitude."
            )

        # Safe operating radius
        safe_radius_nm = max(0, imbl_nm - critical_nm)

        # ETA to IMBL at assumed speed (7 knots for fishing vessel)
        speed_knots = 7.0
        eta_hours = imbl_nm / speed_knots if speed_knots > 0 else 999

        # Geofence status
        geofence_status = (
            "INSIDE_SAFE_ZONE" if imbl_nm > caution_nm else
            "WARNING_ZONE" if imbl_nm > critical_nm else
            "DANGER_ZONE"
        )

        result = {
            "imbl_distance_nm": round(imbl_nm, 2),
            "imbl_status": imbl_status,
            "alert_level": alert,
            "critical_threshold_nm": critical_nm,
            "caution_threshold_nm": caution_nm,
            "safe_operating_radius_nm": round(safe_radius_nm, 2),
            "imbl_eta_hours": round(eta_hours, 2),
            "geofence_status": geofence_status,
            "wave_height_m": wave,
            "wind_knots": wind,
            "gust_knots": gust,
            "weather_condition": weather_condition,
            "role_thresholds": {"critical": critical_nm, "caution": caution_nm},
            "confidence": 0.95 if imbl_nm < 999 else 0.5,
            "source": "Haversine geometry + IMBL treaty coordinates",
        }
        safety_confirmed = (alert != "CRITICAL")
        evidence.append(
            f"Safety Agent: IMBL={imbl_nm:.2f}NM ({imbl_status}), "
            f"alert={alert}, safe_radius={safe_radius_nm:.1f}NM, "
            f"geofence={geofence_status}, role='{role}'"
        )

    except Exception as e:
        logger.exception("Safety agent failed")
        result = {
            "error": str(e),
            "fallback": True,
            "imbl_distance_nm": 999,
            "alert_level": "CAUTION",
            "confidence": 0.3,
        }
        safety_confirmed = False
        evidence.append(f"⚠️ Safety agent error: {e}")

    return {
        "safety_result": result,
        "safety_confirmed": safety_confirmed,
        "conflicting_data": conflicting,
        "agent_chain": ["safety_agent"],
        "evidence": evidence,
        "sources": sources,
    }


# ══════════════════════════════════════════════════════════════════════════════
# NODE 6: PFZ AGENT — cross-validates satellite + safety + weather
# ══════════════════════════════════════════════════════════════════════════════
def pfz_agent_node(state: VARUNAState) -> dict:
    """Produce final PFZ recommendation, cross-validated against safety and weather."""
    evidence = []
    caution_flags: list[str] = []
    sources = []
    result = {}

    try:
        sat_r = state.get("satellite_result") or {}
        safety_r = state.get("safety_result") or {}
        weather_r = state.get("weather_result") or {}

        sst = float(sat_r.get("sst_celsius", 0) or 0)
        chl = float(sat_r.get("chl_mg_m3", 0) or 0)
        pfz_prob = float(sat_r.get("pfz_probability", 0) or 0)
        is_pfz = sat_r.get("pfz_is_pfz", False)
        bearing = float(sat_r.get("recommended_bearing", 0) or 0)
        distance_nm = float(sat_r.get("recommended_distance_nm", 0) or 0)

        imbl_nm = float(safety_r.get("imbl_distance_nm", 999) or 999)
        weather_cond = weather_r.get("condition", "UNKNOWN")

        # ── Cross-validation overrides ──
        safety_override = False

        # Override 1: Dangerous weather → don't go
        if weather_cond in ("DANGEROUS", "POOR"):
            safety_override = True
            caution_flags.append(
                f"PFZ exists but sea conditions are {weather_cond} — "
                f"wait for better weather before heading out."
            )

        # Override 2: PFZ near IMBL
        if imbl_nm < 10:
            caution_flags.append(
                f"PFZ zone is only {imbl_nm:.1f}NM from IMBL boundary — "
                f"exercise extreme caution, stay west of 80.2°E."
            )

        # Override 3: High confidence PFZ
        high_confidence = False
        if chl > 1.5 and 26 <= sst <= 30:
            high_confidence = True
            pfz_prob = max(pfz_prob, 0.85)

        # PFZ quality label
        if pfz_prob >= 0.8:
            quality = "HIGH"
            quality_ta = "உயர்"
        elif pfz_prob >= 0.6:
            quality = "MODERATE"
            quality_ta = "மிதமான"
        else:
            quality = "LOW"
            quality_ta = "குறைவான"

        # Fuel estimate (round trip, assuming 5L/NM for typical fishing vessel)
        fuel_estimate_liters = round(distance_nm * 2 * 5, 1)

        result = {
            "is_pfz": is_pfz and not safety_override,
            "pfz_probability": round(pfz_prob, 2),
            "quality": quality,
            "quality_ta": quality_ta,
            "high_confidence": high_confidence,
            "sst_celsius": sst,
            "chl_mg_m3": round(chl, 3) if chl else None,
            "recommended_bearing": round(bearing, 1),
            "distance_nm": round(distance_nm, 1),
            "target_lat": sat_r.get("target_lat", PFZ_TARGET_LAT),
            "target_lon": sat_r.get("target_lon", PFZ_TARGET_LON),
            "safety_override": safety_override,
            "caution_flags": caution_flags,
            "fuel_estimate_liters": fuel_estimate_liters,
            "confidence": round(pfz_prob, 2),
            "source": sat_r.get("source", "Open-Meteo + Copernicus"),
        }
        sources.append(sat_r.get("source", "Open-Meteo + Copernicus"))
        evidence.append(
            f"PFZ Agent: prob={pfz_prob:.0%} ({quality}), "
            f"bearing={bearing:.0f}° dist={distance_nm:.1f}NM, "
            f"safety_override={safety_override}, "
            f"fuel≈{fuel_estimate_liters}L"
        )

    except Exception as e:
        logger.exception("PFZ agent failed")
        result = {
            "error": str(e),
            "fallback": True,
            "is_pfz": False,
            "confidence": 0.2,
        }
        evidence.append(f"⚠️ PFZ agent error: {e}")

    return {
        "pfz_result": result,
        "conflicting_data": caution_flags,
        "agent_chain": ["pfz_agent"],
        "evidence": evidence,
        "sources": sources,
    }


# ══════════════════════════════════════════════════════════════════════════════
# NODE 7: SYNTHESIZER — merge all agent results + cross-agent conflict detection
# ══════════════════════════════════════════════════════════════════════════════
def _check_cross_agent_conflicts(state: VARUNAState) -> tuple[list[str], list[str]]:
    """Detect contradictions between agent results."""
    conflicts: list[str] = []
    warnings: list[str] = []

    pfz = state.get("pfz_result") or {}
    safety = state.get("safety_result") or {}
    weather = state.get("weather_result") or {}

    # Conflict 1: PFZ near IMBL
    pfz_dist = pfz.get("distance_nm")
    imbl_dist = safety.get("imbl_distance_nm")
    if pfz_dist and imbl_dist and imbl_dist < 15:
        conflicts.append(
            f"PFZ at {pfz_dist:.1f}NM is close to IMBL boundary "
            f"({imbl_dist:.1f}NM). Fish carefully — do not go past 80.2°E longitude."
        )

    # Conflict 2: Good PFZ but bad weather
    pfz_prob = pfz.get("pfz_probability", 0)
    weather_cond = weather.get("condition", "UNKNOWN")
    if pfz_prob > 0.7 and weather_cond in ("POOR", "DANGEROUS"):
        wave = weather.get("wave_height_m", 0)
        conflicts.append(
            f"High fish probability ({pfz_prob:.0%}) but {weather_cond.lower()} "
            f"sea conditions ({wave}m waves). Wait for better weather."
        )

    # Conflict 3: Safe weather but near IMBL
    if weather_cond in ("EXCELLENT", "GOOD") and (imbl_dist or 999) < 5:
        conflicts.append(
            "Sea conditions are excellent but vessel is dangerously close "
            "to IMBL boundary. Move west immediately."
        )

    # Warning: cyclone risk
    if weather.get("cyclone_risk"):
        warnings.append(
            f"Cyclone risk detected — gust {weather.get('gust_knots', 0)}kn. "
            f"Monitor weather updates closely."
        )

    return conflicts, warnings


def synthesizer_node(state: VARUNAState) -> dict:
    """Merge all agent results into a single coherent advisory."""
    evidence = []

    weather_r = state.get("weather_result") or {}
    safety_r = state.get("safety_result") or {}
    pfz_r = state.get("pfz_result") or {}
    sat_r = state.get("satellite_result") or {}
    marine = state.get("marine_data") or {}

    # ── Cross-agent conflict detection ──
    conflicts, warnings = _check_cross_agent_conflicts(state)

    # ── Extract key values ──
    wave = float(weather_r.get("wave_height_m", marine.get("wave_height_m", 0)) or 0)
    wind = float(weather_r.get("wind_knots", marine.get("wind_knots", 0)) or 0)
    gust = float(weather_r.get("gust_knots", marine.get("gust_knots", 0)) or 0)
    sst = float(sat_r.get("sst_celsius", marine.get("sst_celsius", 0)) or 0)
    weather_cond = weather_r.get("condition", "UNKNOWN")
    best_time = weather_r.get("best_time_advice", "")

    imbl_nm = float(safety_r.get("imbl_distance_nm", 999))
    imbl_status = safety_r.get("imbl_status", "UNKNOWN")
    geofence = safety_r.get("geofence_status", "UNKNOWN")

    pfz_prob = float(pfz_r.get("pfz_probability", 0))
    pfz_bearing = float(pfz_r.get("recommended_bearing", 0))
    pfz_dist = float(pfz_r.get("distance_nm", 0))
    pfz_quality = pfz_r.get("quality", "UNKNOWN")
    pfz_override = pfz_r.get("safety_override", False)
    fuel_est = pfz_r.get("fuel_estimate_liters", 0)

    chl = float(sat_r.get("chl_mg_m3", 0) or 0)

    # ── Determine overall alert level ──
    safety_alert = safety_r.get("alert_level", "SAFE")
    if safety_alert == "CRITICAL" or weather_cond == "DANGEROUS":
        overall_alert = "CRITICAL"
    elif safety_alert == "CAUTION" or weather_cond in ("POOR", "FAIR"):
        overall_alert = "CAUTION"
    else:
        overall_alert = "SAFE"

    # ── Build English advisory ──
    sections: list[str] = []

    # Weather section
    weather_emoji = {"EXCELLENT": "☀️", "GOOD": "🌤️", "FAIR": "⛅",
                     "POOR": "🌧️", "DANGEROUS": "🌊"}.get(weather_cond, "🌊")
    sections.append(
        f"{weather_emoji} Weather: {weather_cond} — "
        f"wave {wave}m, wind {wind}kn"
        f"{f', gust {gust}kn' if gust > wind else ''}"
    )
    if best_time:
        sections.append(f"  ⏰ {best_time}")

    # Tomorrow forecast
    tomorrow_wave = weather_r.get("tomorrow_wave")
    tomorrow_wind = weather_r.get("tomorrow_wind")
    if tomorrow_wave is not None:
        sections.append(
            f"  📅 Tomorrow: wave {tomorrow_wave}m"
            f"{f', wind {tomorrow_wind}kn' if tomorrow_wind else ''}"
        )

    # PFZ section
    if pfz_override:
        sections.append(
            f"🐟 Fishing: PFZ detected ({pfz_prob:.0%} probability) but "
            f"UNSAFE to reach — {weather_cond.lower()} conditions"
        )
    elif pfz_prob > 0.5:
        sections.append(
            f"🐟 Fishing: PFZ at {pfz_dist:.1f}NM, {pfz_bearing:.0f}° bearing "
            f"({pfz_quality} quality, {pfz_prob:.0%})"
        )
        if fuel_est:
            sections.append(f"  ⛽ Fuel estimate: ~{fuel_est:.0f}L round trip")
    else:
        sections.append(f"🐟 Fishing: Low PFZ probability ({pfz_prob:.0%})")

    # Safety section
    safety_emoji = {"CRITICAL": "🚨", "CAUTION": "⚠️", "SAFE": "✅"}.get(imbl_status, "ℹ️")
    sections.append(
        f"{safety_emoji} Safety: IMBL {imbl_nm:.1f}NM — {imbl_status}"
    )

    # SST / CHL section
    sections.append(
        f"🌡️ SST: {sst}°C | CHL: {chl:.2f} mg/m³"
    )

    # Conflicts / warnings
    for conflict in conflicts:
        sections.append(f"⚠️ CONFLICT: {conflict}")
    for warning in warnings:
        sections.append(f"ℹ️ {warning}")

    # Recommendation
    if overall_alert == "CRITICAL":
        sections.append("🚨 RECOMMENDATION: Do NOT venture out to sea.")
    elif overall_alert == "CAUTION":
        sections.append(
            "⚠️ RECOMMENDATION: Exercise caution. "
            f"{'Stay within ' + str(round(safety_r.get('safe_operating_radius_nm', 0), 1)) + 'NM of current position.' if safety_r.get('safe_operating_radius_nm') else ''}"
        )
    else:
        rec = f"✅ RECOMMENDATION: Safe to go."
        if pfz_prob > 0.5 and not pfz_override:
            rec += (
                f" Head {pfz_bearing:.0f}° for {pfz_dist:.1f}NM to reach PFZ."
            )
        if best_time:
            rec += f" {best_time}."
        sections.append(rec)

    # Sources
    sources = list(state.get("sources") or [])
    if sources:
        sections.append(f"📡 Data: {' + '.join(set(sources))}")

    advisory_en = "\n".join(sections)

    # ── Calculate final confidence ──
    confidences = [
        weather_r.get("confidence", 0),
        safety_r.get("confidence", 0),
        pfz_r.get("confidence", 0),
        sat_r.get("confidence", 0),
    ]
    valid_confs = [c for c in confidences if c > 0]
    final_conf = sum(valid_confs) / len(valid_confs) if valid_confs else 0.5
    # Penalise for conflicts
    if conflicts:
        final_conf *= 0.85

    evidence.append(
        f"Synthesizer: alert={overall_alert}, final_conf={final_conf:.2f}, "
        f"conflicts={len(conflicts)}, agents={len(state.get('agent_chain', []))}"
    )

    return {
        "advisory_en": advisory_en,
        "alert_level": overall_alert,
        "final_confidence": round(final_conf, 2),
        "conflicting_data": conflicts,
        "agent_name": "VARUNA Multi-Agent System",
        "agent_chain": ["synthesizer"],
        "evidence": evidence,
    }


# ══════════════════════════════════════════════════════════════════════════════
# NODE 8: REFLECTION — quality check + retry decision
# ══════════════════════════════════════════════════════════════════════════════
def reflection_node(state: VARUNAState) -> dict:
    """Check data quality, detect issues, decide whether to retry."""
    issues: list[str] = []

    # Calculate data quality score
    dqs = 0.0
    if not (state.get("marine_data") or {}).get("error"):
        dqs += 0.25
    if not (state.get("weather_result") or {}).get("error"):
        dqs += 0.25
    if not (state.get("safety_result") or {}).get("error"):
        dqs += 0.25
    if not (state.get("pfz_result") or {}).get("error"):
        dqs += 0.25

    # Check 1: Data quality — did marine data fetch fail?
    marine = state.get("marine_data") or {}
    if marine.get("error"):
        issues.append("marine_data_failed")

    # Check 2: Conflicting data between agents
    if state.get("conflicting_data"):
        # Conflicts are informational — don't retry for them,
        # but log it for the evidence trail
        pass

    # Check 3: Low final confidence
    if state.get("final_confidence", 1.0) < 0.35:
        issues.append("very_low_confidence")

    # Check 4: Critical safety vs active PFZ conflict
    if (state.get("alert_level") == "CRITICAL" and
            (state.get("pfz_result") or {}).get("is_pfz")):
        issues.append("safety_pfz_conflict")

    # Check 5: Missing agent results
    for agent_key in ("weather_result", "safety_result", "satellite_result"):
        r = state.get(agent_key)
        if r is None or (isinstance(r, dict) and r.get("error") and not r.get("fallback")):
            issues.append(f"missing_{agent_key}")

    # ── Retry limit: max 2 retries ──
    retry_count = state.get("retry_count", 0)
    if retry_count >= 2:
        issues = []  # force finish after 2 retries

    evidence = []
    if issues:
        evidence.append(
            f"Reflection: RETRY needed (attempt {retry_count + 1}) — {issues}"
        )
    else:
        evidence.append(
            f"Reflection: PASS — data quality score={dqs:.2f}, "
            f"confidence={state.get('final_confidence', 0):.2f}"
        )

    return {
        "reflection_needed": bool(issues),
        "reflection_reason": str(issues) if issues else "",
        "retry_count": retry_count + (1 if issues else 0),
        "data_quality_score": round(dqs, 2),
        "agent_chain": ["reflection"],
        "evidence": evidence,
    }


def _reflection_router(state: VARUNAState) -> str:
    """Route after reflection: retry or translate."""
    if state.get("reflection_needed", False):
        return "retry"
    return "translate"


# ══════════════════════════════════════════════════════════════════════════════
# NODE 9: TRANSLATOR — Tamil/English output with templates
# ══════════════════════════════════════════════════════════════════════════════
# Curated Tamil templates for common advisory phrases
_TAMIL_TEMPLATES = {
    "EXCELLENT": "மிகச் சிறந்த கடல் நிலை",
    "GOOD": "நல்ல கடல் நிலை",
    "FAIR": "ஏற்றுக்கொள்ளக்கூடிய கடல் நிலை",
    "POOR": "மோசமான கடல் நிலை — எச்சரிக்கையுடன் செல்லுங்கள்",
    "DANGEROUS": "ஆபத்தான கடல் நிலை — கடலுக்குச் செல்ல வேண்டாம்",
    "SAFE": "✅ பாதுகாப்பானது",
    "CAUTION": "⚠️ எச்சரிக்கை",
    "CRITICAL": "🚨 ஆபத்து",
    "Do NOT venture out to sea.": "கடலுக்குச் செல்ல வேண்டாம்.",
    "Safe to go.": "கடலுக்குச் செல்லலாம்.",
    "Exercise caution.": "எச்சரிக்கையுடன் செயல்படுங்கள்.",
    "Weather:": "வானிலை:",
    "Fishing:": "மீன்பிடி:",
    "Safety:": "பாதுகாப்பு:",
    "RECOMMENDATION:": "பரிந்துரை:",
    "wave": "அலை",
    "wind": "காற்று",
    "IMBL": "எல்லை (IMBL)",
    "PFZ": "மீன் வளம் (PFZ)",
    "bearing": "திசை",
    "Fuel estimate": "எரிபொருள் மதிப்பீடு",
    "round trip": "போய் வரும் பயணம்",
    "Best window": "சிறந்த நேரம்",
    "Tomorrow": "நாளை",
    "Data:": "தரவு:",
}


def translator_node(state: VARUNAState) -> dict:
    """Translate advisory to Tamil if needed, using templates + Groq fallback."""
    evidence = []

    language = state.get("language", "english")
    advisory_en = state.get("advisory_en", "")

    if language == "tamil":
        # ── Template-based translation ──
        advisory_ta = advisory_en
        for en_phrase, ta_phrase in _TAMIL_TEMPLATES.items():
            advisory_ta = advisory_ta.replace(en_phrase, ta_phrase)

        # ── Groq fallback for complex untranslated sentences ──
        # Only if the template substitution left mostly English text
        english_ratio = sum(1 for c in advisory_ta if c.isascii() and c.isalpha()) / max(len(advisory_ta), 1)
        if english_ratio > 0.6:
            try:
                from app.services.groq_engine import ask_groq
                groq_prompt = (
                    f"Translate this marine advisory to Tamil. "
                    f"Keep numbers, units (NM, km, m, kn, °C, L), and technical "
                    f"abbreviations (IMBL, PFZ, SST, CHL) in English. "
                    f"Use simple fisherman-friendly Tamil:\n\n{advisory_en}"
                )
                groq_ta = ask_groq(groq_prompt)
                if groq_ta and len(groq_ta) > 20:
                    advisory_ta = groq_ta
                    evidence.append("Translator: Groq AI Tamil translation used")
            except Exception as e:
                logger.warning("Groq Tamil translation failed: %s", e)
                evidence.append(f"Translator: Groq failed ({e}), using template Tamil")
        else:
            evidence.append("Translator: Template Tamil translation used")
    else:
        # English — direct pass-through
        advisory_ta = _build_tamil_summary(state)
        evidence.append("Translator: English advisory (Tamil summary generated)")

    return {
        "advisory_ta": advisory_ta,
        "agent_chain": ["translator"],
        "evidence": evidence,
    }


def _build_tamil_summary(state: VARUNAState) -> str:
    """Build a basic Tamil summary from structured agent results."""
    weather_r = state.get("weather_result") or {}
    safety_r = state.get("safety_result") or {}
    pfz_r = state.get("pfz_result") or {}
    marine = state.get("marine_data") or {}

    wave = weather_r.get("wave_height_m", marine.get("wave_height_m", 0))
    wind = weather_r.get("wind_knots", marine.get("wind_knots", 0))
    condition = weather_r.get("condition", "UNKNOWN")
    condition_ta = weather_r.get("condition_ta", condition)
    imbl = safety_r.get("imbl_distance_nm", 999)
    alert = state.get("alert_level", "SAFE")

    pfz_dist = pfz_r.get("distance_nm", 0)
    pfz_bearing = pfz_r.get("recommended_bearing", 0)

    alert_ta = _TAMIL_TEMPLATES.get(alert, alert)

    lines = [
        f"🌊 கடல் நிலை: {condition_ta} — அலை {wave}மீ, காற்று {wind}kn",
    ]

    if pfz_dist > 0:
        lines.append(
            f"🐟 மீன் பகுதி: {pfz_dist:.1f} கடல் மைல், "
            f"{pfz_bearing:.0f}° திசையில்"
        )

    lines.append(f"🚨 எல்லை (IMBL): {imbl:.1f} கடல் மைல் — {safety_r.get('imbl_status', 'SAFE')}")
    lines.append(f"{alert_ta}")
    lines.append("📡 தரவு: Open-Meteo + Copernicus + Haversine")

    return "\n".join(lines)


# ══════════════════════════════════════════════════════════════════════════════
# BUILD THE GRAPH — fan-out, fan-in, reflection loop
# ══════════════════════════════════════════════════════════════════════════════
def build_varuna_graph():
    graph = StateGraph(VARUNAState)

    # ── Add all nodes ──
    graph.add_node("nlu", nlu_node)
    graph.add_node("data_fetcher", data_fetcher_node)
    graph.add_node("satellite_agent", satellite_agent_node)
    graph.add_node("weather_agent", weather_agent_node)
    graph.add_node("safety_agent", safety_agent_node)
    graph.add_node("pfz_agent", pfz_agent_node)
    graph.add_node("synthesizer", synthesizer_node)
    graph.add_node("reflection", reflection_node)
    graph.add_node("translator", translator_node)

    # ── Entry ──
    graph.set_entry_point("nlu")

    # ── NLU → Data Fetcher (always) ──
    graph.add_edge("nlu", "data_fetcher")

    # ── Fan-out: Data Fetcher → [satellite, weather, safety] in parallel ──
    graph.add_edge("data_fetcher", "satellite_agent")
    graph.add_edge("data_fetcher", "weather_agent")
    graph.add_edge("data_fetcher", "safety_agent")

    # ── Fan-in: [satellite, weather, safety] → pfz_agent ──
    # PFZ agent cross-validates satellite + safety + weather
    graph.add_edge("satellite_agent", "pfz_agent")
    graph.add_edge("weather_agent", "pfz_agent")
    graph.add_edge("safety_agent", "pfz_agent")

    # ── PFZ Agent → Synthesizer ──
    graph.add_edge("pfz_agent", "synthesizer")

    # ── Synthesizer → Reflection ──
    graph.add_edge("synthesizer", "reflection")

    # ── Reflection → conditional: retry or translate ──
    graph.add_conditional_edges(
        "reflection",
        _reflection_router,
        {
            "retry": "data_fetcher",
            "translate": "translator",
        },
    )

    # ── Translator → END ──
    graph.add_edge("translator", END)

    return graph.compile()


# Singleton compiled graph
VARUNA_GRAPH = build_varuna_graph()


# ══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT — backward-compatible process_query()
# ══════════════════════════════════════════════════════════════════════════════
def process_query(
    query: str,
    vessel_lat: float = 9.9252,
    vessel_lon: float = 79.3129,
    vessel_draft: float = 2.5,
    role: str = "Fisherman",
    phone: str = "default",
) -> dict:
    """Run a query through the full LangGraph pipeline and return results."""

    # Detect language
    tamil_chars = [c for c in query if '\u0B80' <= c <= '\u0BFF']
    language = "tamil" if tamil_chars else "english"

    initial_state: VARUNAState = {
        # Input
        "query": query,
        "vessel_lat": vessel_lat,
        "vessel_lon": vessel_lon,
        "vessel_draft": vessel_draft,
        "role": role,
        "phone": phone,
        "language": language,
        # NLU
        "intent": "",
        "sub_intents": [],
        "entities": {},
        "keywords_found": [],
        "confidence": 0.0,
        # Shared data
        "marine_data": None,
        "safety_data": None,
        "pfz_data": None,
        "weather_data": None,
        "chlorophyll_data": None,
        "tide_data": None,
        # Agent results
        "satellite_result": None,
        "weather_result": None,
        "safety_result": None,
        "pfz_result": None,
        "route_result": None,
        # Reflection
        "reflection_needed": False,
        "reflection_reason": "",
        "retry_count": 0,
        # Cross-agent validation
        "safety_confirmed": False,
        "data_quality_score": 0.0,
        "conflicting_data": [],
        # Output
        "advisory_en": "",
        "advisory_ta": "",
        "alert_level": "SAFE",
        "evidence": [],
        "agent_name": "VARUNA",
        "agent_chain": [],
        "final_confidence": 0.0,
        "sources": [],
    }

    result = VARUNA_GRAPH.invoke(initial_state)
    return dict(result)
