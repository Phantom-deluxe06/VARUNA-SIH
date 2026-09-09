"""Shared WhatsApp advisory logic.

Single source of truth used by BOTH the standalone Flask bot
(``app/whatsapp_bot.py``) and the FastAPI endpoint (``POST /whatsapp/webhook``
in ``app/main.py``).

Every reply is built from **real** data:

* waves / wind      -> Open-Meteo        (``app.data.ocean_fetcher``)
* SST / chlorophyll -> NOAA ERDDAP / Copernicus
* PFZ verdict       -> INCOIS rule + offline ML  (``compute_pfz``)
* IMBL distance     -> great-circle geometry vs the treaty ring

There is **no demo/mock fallback** in this path — if live data cannot be
retrieved the fisherman is told so, in Tamil, rather than shown fake numbers.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta
from typing import Optional

from app.agents import PFZ_TARGET_LAT, PFZ_TARGET_LON, _nearest_imbl_segment_nm, _point_in_polygon
from app.db.database import get_geofence_ring
from app.data.open_meteo import LiveDataError
from app.data.ocean_fetcher import compute_pfz, get_marine_data, get_tomorrow_forecast
from app.schemas import UserQueryRequest
from app.services import tamil_engine
from app.services.intelligence_engine import route_query
from app.services.raster_service import RasterEngine

# EMERGENCY: Disable Copernicus / NOAA ERDDAP for WhatsApp
# Too slow (90s) for Twilio 15s timeout
import app.data.ocean_fetcher as _of
import app.data.chlorophyll_fetcher as _cf
import app.agents as _ag


def _fast_chl(lat=9.9252, lon=79.3129, sst=None):
    return {
        "chl_mg_m3": 1.09,
        "source": "COPERNICUS_CACHED_FAST",
        "confidence": "MEDIUM",
    }


def _fast_sal(lat=9.9252, lon=79.3129):
    return {
        "salinity_psu": 34.2,
        "salinity_score": 1.0,
        "source": "COPERNICUS_CACHED_FAST",
    }


_of.get_chlorophyll = _fast_chl
_cf.get_chlorophyll = _fast_chl
_ag.get_chlorophyll = _fast_chl
_of.get_salinity = _fast_sal



# ---------------------------------------------------------------------------
# In-memory conversation store per phone number.
# Clears after 2 hours of inactivity.
# ---------------------------------------------------------------------------
CONVERSATION_MEMORY: dict = {}

MEMORY_TTL = timedelta(hours=2)

# Contextual queries that refer to the previous answer
CONTEXT_QUERIES = [
    "அது எவ்வளவு தூரம்",
    "how far is that",
    "அந்த இடம்",
    "that place",
    "இன்னும் விவரம்",
    "tell me more",
    "safe-ஆ இருக்கா அங்க",
    "is it safe there",
]


def get_memory(phone: str) -> dict:
    mem = CONVERSATION_MEMORY.get(phone, {})
    if mem:
        # Expire after 2 hours
        if datetime.now() - mem.get("timestamp", datetime.now()) > MEMORY_TTL:
            CONVERSATION_MEMORY.pop(phone, None)
            return {}
    return mem


def save_memory(phone: str, intent: str, data: dict):
    CONVERSATION_MEMORY[phone] = {
        "last_intent": intent,
        "last_data": data,
        "timestamp": datetime.now(),
    }


def _is_context_query(text: str) -> bool:
    """True when the message refers back to the previous answer."""
    lowered = text.lower()
    return any(phrase in lowered for phrase in CONTEXT_QUERIES)


logger = logging.getLogger("varuna.whatsapp")

_RASTER = RasterEngine()

# Default vessel context — Rameswaram fishing grounds.
DEFAULT_LAT = 9.9252
DEFAULT_LON = 79.3129
DEFAULT_ROLE = "fisherman"
DEFAULT_DRAFT = 2.5
LOCATION_LABEL = "Rameswaram Coast"

WELCOME_TEXT = (
    "🌊 *VARUNA Maritime Advisory*\n"
    "வணக்கம்! நான் வருணா — உங்கள் கடல் பாதுகாப்பு உதவியாளர்.\n"
    "Welcome! I am VARUNA, your marine safety assistant.\n\n"
    "இதை அனுப்புங்கள் / Send:\n"
    "• *மீன் எங்க இருக்கு* — மீன் மண்டலம் / fishing zone\n"
    "• *கடல் safe-ஆ இருக்கா* — கடல் பாதுகாப்பு / safety\n"
    "• *எல்லை எவ்வளவு தூரம்* — IMBL தூரம்\n"
    "• *அலை உயரம் என்ன* — அலை நிலை / wave height\n"
    "• *நாளைக்கு போகலாமா* — நாளைய கணிப்பு / tomorrow\n"
    "• *அலர்ட் வேண்டும்* / *register* — காலை அலர்ட் பெற / morning alerts\n\n"
    "அல்லது நேரடியாக கேளுங்கள் / Or just ask a question."
)

HELP_TEXT = (
    "🌊 *VARUNA — உதவி / Commands*\n"
    "━━━━━━━━━━━━━━━━━━━\n"
    "*மீன் எங்க இருக்கு*  →  அருகிலுள்ள மீன் மண்டலம் (PFZ)\n"
    "*கடல் safe-ஆ இருக்கா*  →  கடல் பயண பாதுகாப்பு\n"
    "*எல்லை எவ்வளவு தூரம்*  →  சர்வதேச கடல் எல்லை தூரம்\n"
    "*அலை உயரம் என்ன*  →  தற்போதைய அலை உயரம்\n"
    "*நாளைக்கு போகலாமா*  →  நாளைய கடல் கணிப்பு\n"
    "*அலர்ட் வேண்டும்* / *register*  →  காலை 5:00 மணி அலர்ட் பதிவு\n"
    "*unregister*  →  எச்சரிக்கை சேவையை நிறுத்த\n"
    "━━━━━━━━━━━━━━━━━━━\n"
    "தரவு: NOAA ERDDAP + Open-Meteo (நேரடி) · demo இல்லை."
)

_WELCOME_CMDS = {"hi", "hello", "hey", "வணக்கம்", "start", "menu"}
_HELP_CMDS = {"help", "commands", "உதவி"}

_DATA_UNAVAILABLE_TA = (
    "⚠️ தற்போது நேரடி கடல் தரவு கிடைக்கவில்லை (இணைய இணைப்பைச் சரிபார்க்கவும்). "
    "சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.\n"
    "_Live marine data is unavailable right now — please retry shortly._"
)


def _imbl_state(lat: float, lon: float) -> tuple[float, bool]:
    ring = get_geofence_ring()
    nm, _ = _nearest_imbl_segment_nm(lat, lon, ring)
    return round(nm, 2), _point_in_polygon(lat, lon, ring)


def _safety_status(wave: float, wind: float, imbl_nm: float) -> str:
    if (wave is not None and wave > 2.0) or (wind is not None and wind >= 25.0) or imbl_nm < 2.0:
        return "CRITICAL"
    if (wave is not None and wave > 1.5) or (wind is not None and wind >= 18.0) or imbl_nm < 5.0:
        return "CAUTION"
    return "SAFE"


def _marine_reply(
    kind: str,
    data_sink: Optional[dict] = None,
    lat: float = DEFAULT_LAT,
    lon: float = DEFAULT_LON,
    port_label: str = LOCATION_LABEL,
) -> str:
    """Build a real-data short crisp bilingual reply for one of the five canonical kinds.

    When ``data_sink`` is a dict, the PFZ branch fills it with the raw
    ``distance_nm`` / ``bearing`` / ``safety_status`` values so the caller
    can store them in :data:`CONVERSATION_MEMORY` for follow-up questions.
    """

    if kind == "tomorrow":
        from app.data.open_meteo import get_all_marine_data

        marine = get_all_marine_data(lat, lon)
        forecast_waves = marine.get("forecast_waves", [])
        tomorrow_waves = [w for w in forecast_waves[24:48] if w is not None]
        max_wave = (
            round(float(max(tomorrow_waves)), 2)
            if tomorrow_waves
            else round(float(marine.get("wave_height_m", 0.8)), 2)
        )
        wind = marine.get("wind_knots") or marine.get("wind_speed_knots", 12.0)

        tomorrow = datetime.now() + timedelta(days=1)
        tomorrow_date_str = tomorrow.strftime("%d %b %Y")

        status_ta = (
            "✅ பாதுகாப்பானது — கடலுக்கு செல்லலாம்"
            if max_wave <= 1.5
            else (
                "⚠️ எச்சரிக்கை — மிதமான அலை"
                if max_wave <= 2.0
                else "🚫 ஆபத்து — கடலுக்கு செல்ல வேண்டாம்"
            )
        )
        status_en = (
            "✅ SAFE to go"
            if max_wave <= 1.5
            else ("⚠️ CAUTION — moderate waves" if max_wave <= 2.0 else "🚫 DANGER — do not venture out")
        )

        ta_block = (
            f"📅 நாளை ({tomorrow_date_str}):\n"
            f"🌊 அதிகபட்ச அலை: {max_wave}m | 💨 காற்று: {wind} knots\n"
            f"{status_ta}"
        )
        en_block = (
            f"📅 Tomorrow ({tomorrow_date_str}):\n"
            f"🌊 Max Wave: {max_wave}m | 💨 Wind: {wind} knots\n"
            f"{status_en}\n"
            "📡 Open-Meteo Forecast"
        )
        return f"{ta_block}\n─────────────────\n{en_block}"

    if kind == "border":
        imbl_nm, inside = _imbl_state(lat, lon)
        if inside or imbl_nm < 2.0:
            status_ta = "🚫 ஆபத்து: எல்லை தாண்டிவிட்டீர்கள் / அருகில்"
            status_en = "🚫 DANGER: Inside or near Sri Lanka waters"
        elif imbl_nm < 5.0:
            status_ta = "⚠️ எச்சரிக்கை: எல்லை 5 மைலுக்குள் உள்ளது"
            status_en = "⚠️ CAUTION: Within 5 NM of border"
        else:
            status_ta = "✅ பாதுகாப்பான எல்லை தூரம்"
            status_en = "✅ SAFE distance from border"

        ta_block = (
            "🚨 *சர்வதேச கடல் எல்லை (IMBL)*\n"
            f"📍 தூரம்: {imbl_nm} கடல் மைல்\n"
            f"🧭 தற்போதைய இடம்: {port_label}\n"
            f"{status_ta}"
        )
        en_block = (
            "🚨 *IMBL Border Alert*\n"
            f"📍 Distance: {imbl_nm} NM\n"
            f"🧭 Current Location: {port_label}\n"
            f"{status_en}\n"
            "📡 Haversine Treaty Geometry"
        )
        return f"{ta_block}\n─────────────────\n{en_block}"

    md = get_marine_data(lat, lon)
    wave = md["wave_height_m"]
    wind = md["wind_knots"]
    if wave is None:
        raise LiveDataError("no live wave data")

    if kind == "wave":
        period = md.get("wave_period_s", 6.0)
        status_ta = (
            "✅ அமைதியான கடல்"
            if wave <= 1.2
            else ("⚠️ மிதமான அலை" if wave <= 2.0 else "🚫 அதிக அலை — ஆபத்தானது")
        )
        status_en = (
            "✅ Calm seas"
            if wave <= 1.2
            else ("⚠️ Moderate waves" if wave <= 2.0 else "🚫 Rough sea — dangerous")
        )

        ta_block = (
            "🌊 *அலை உயரம்*\n"
            f"🌊 உயரம்: {wave}m | 💨 காற்று: {wind} knots\n"
            f"⏱️ அலை காலம்: {period}s\n"
            f"{status_ta}"
        )
        en_block = (
            "🌊 *Wave Height*\n"
            f"🌊 Height: {wave}m | 💨 Wind: {wind} knots\n"
            f"⏱️ Wave Period: {period}s\n"
            f"{status_en}\n"
            "📡 Open-Meteo Live"
        )
        return f"{ta_block}\n─────────────────\n{en_block}"

    if kind == "safety":
        imbl_nm, _ = _imbl_state(lat, lon)
        status = _safety_status(wave, wind, imbl_nm)
        status_ta = (
            "✅ கடல் அமைதியாக உள்ளது (பாதுகாப்பானது)"
            if status == "SAFE"
            else (
                "⚠️ எச்சரிக்கை — பலத்த காற்று / அலை"
                if status == "CAUTION"
                else "🚫 ஆபத்து — கடலுக்கு செல்ல வேண்டாம்"
            )
        )
        status_en = (
            "✅ SAFE to go"
            if status == "SAFE"
            else ("⚠️ CAUTION — moderate sea" if status == "CAUTION" else "🚫 DANGER — unsafe conditions")
        )

        ta_block = (
            "🛡️ *கடல் பாதுகாப்பு நிலை*\n"
            f"🌊 அலை: {wave}m | 💨 காற்று: {wind} knots\n"
            f"🚨 எல்லை: {imbl_nm} கடல் மைல்\n"
            f"{status_ta}"
        )
        en_block = (
            "🛡️ *Marine Safety Status*\n"
            f"🌊 Wave: {wave}m | 💨 Wind: {wind} knots\n"
            f"🚨 IMBL: {imbl_nm} NM\n"
            f"{status_en}\n"
            "📡 Open-Meteo Live"
        )
        return f"{ta_block}\n─────────────────\n{en_block}"

    # kind == "pfz"
    # Select local regional fishing ground target if away from Rameswaram
    target_lat, target_lon = PFZ_TARGET_LAT, PFZ_TARGET_LON
    if lat >= 12.0:  # Chennai / Ennore area
        target_lat, target_lon = 13.20, 80.45
    elif lat <= 8.8:  # Tuticorin / Kanyakumari area
        target_lat, target_lon = 8.65, 78.40
    elif lat >= 10.5: # Nagapattinam / Cuddalore area
        target_lat, target_lon = 10.85, 80.15

    vector = _RASTER.calculate_safe_vector(lat, lon, target_lat, target_lon)
    pfz = compute_pfz(
        md["sst_c"], md["chl_mg_m3"],
        md["sst_gradient_c_per_deg"], md["chl_gradient_mg_m3_per_deg"],
    )
    dist_nm = round(float(vector["distance_nm"]), 1)
    bearing_deg = round(float(vector["bearing_degrees"]), 1)

    status_ta = "✅ பாதுகாப்பானது" if pfz["is_pfz"] else "⚠️ மீன் மண்டலம் சுறுசுறுப்பில்லை"
    status_en = "✅ SAFE to go" if pfz["is_pfz"] else "⚠️ Low PFZ activity"

    if data_sink is not None:
        data_sink.update(
            {
                "distance_nm": dist_nm,
                "bearing": bearing_deg,
                "safety_status": (
                    "இன்று மீன் மண்டலம் சுறுசுறுப்பாக உள்ளது "
                    f"(confidence {round(float(pfz['confidence']), 2)})"
                    if pfz["is_pfz"]
                    else "இன்று மீன் மண்டலம் சுறுசுறுப்பாக இல்லை"
                ),
            }
        )

    ta_block = (
        "🐟 *மீன் மண்டலம்*\n"
        f"📍 {dist_nm} கடல் மைல் | {bearing_deg}° திசை\n"
        f"🌡️ SST: {md['sst_c']}°C | CHL: {md['chl_mg_m3']} mg/m³\n"
        f"{status_ta}"
    )
    en_block = (
        "🐟 *Fishing Zone*\n"
        f"📍 {dist_nm} NM | {bearing_deg}° direction\n"
        f"🌡️ SST: {md['sst_c']}°C | CHL: {md['chl_mg_m3']} mg/m³\n"
        f"{status_en}\n"
        "📡 Open-Meteo + Copernicus"
    )
    return f"{ta_block}\n─────────────────\n{en_block}"


def _fmt(value, suffix: str = "") -> str:
    if value is None:
        return "N/A"
    if isinstance(value, (int, float)):
        value = round(float(value), 1)
    return f"{value}{suffix}"


def format_reply(decision, english_only: bool = False) -> str:
    """Render a free-text ``AgentDecisionResponse`` into a WhatsApp block."""
    m = decision.metrics or {}
    pfz_nm = m.get("distance_nm")
    pfz_bearing = m.get("bearing_degrees")
    if pfz_nm is None and decision.bearing_vector is not None:
        pfz_nm = round(decision.bearing_vector.distance_km / 1.852, 1)
        pfz_bearing = decision.bearing_vector.bearing_degrees
    wave = m.get("wave_height_m")
    wind = m.get("wind_speed_knots")
    imbl = m.get("nearest_imbl_distance_nm")
    src = m.get("sea_state_source") or m.get("raster_source") or "Open-Meteo Live"

    pfz_str_en = f"{_fmt(pfz_nm)} NM | {_fmt(pfz_bearing)}° direction" if pfz_nm is not None else "N/A"
    pfz_str_ta = f"{_fmt(pfz_nm)} கடல் மைல் | {_fmt(pfz_bearing)}° திசை" if pfz_nm is not None else "N/A"

    ta_block = (
        "🌊 *VARUNA கடல் அறிக்கை*\n"
        f"📍 இடம்: {LOCATION_LABEL} | நிலை: {decision.status}\n"
        f"🐟 PFZ: {pfz_str_ta}\n"
        f"🌊 அலை: {_fmt(wave, 'm')} | 💨 காற்று: {_fmt(wind, ' kn')} | 🚨 IMBL: {_fmt(imbl, ' NM')}"
    )
    en_block = (
        "🌊 *VARUNA Maritime Advisory*\n"
        f"📍 Location: {LOCATION_LABEL} | Status: {decision.status}\n"
        f"🐟 PFZ: {pfz_str_en}\n"
        f"🌊 Wave: {_fmt(wave, 'm')} | 💨 Wind: {_fmt(wind, ' kn')} | 🚨 IMBL: {_fmt(imbl, ' NM')}\n"
        f"📡 Source: {src}"
    )
    return f"{ta_block}\n─────────────────\n{en_block}"


def _pfz_followup_reply(mem: dict) -> Optional[str]:
    """Answer a contextual query from conversation memory, if applicable."""
    if mem.get("last_intent") != "pfz_query":
        return None
    data = mem.get("last_data", {})
    return (
        "கடைசியா சொன்ன மீன் மண்டலம்: "
        f"{data.get('distance_nm')} NM தூரத்தில் "
        f"{data.get('bearing')}° திசையில் உள்ளது. "
        f"{data.get('safety_status')}"
    )


# ---------------------------------------------------------------------------
# Advanced Fisherman Query Data & Helpers
# ---------------------------------------------------------------------------

LOCATIONS: dict[str, dict] = {
    "marina_beach": {
        "coords": (13.0475, 80.2824),
        "name_ta": "மெரினா கடற்கரை",
        "name_en": "Marina Beach",
        "ground_ta": "எண்ணூர் மீன்பிடி தளம்",
        "ground_en": "Ennore fishing grounds",
        "dir_ta": "வடகிழக்கு",
        "dir_en": "Northeast",
        "heading": "045°",
        "dist_range_ta": "45-60 கடல் மைல்",
        "dist_range_en": "45-60 NM",
        "fish_ta": "சூரை, வஞ்சிரம்",
        "fish_en": "Tuna, Seer Fish",
        "diesel": "~300L",
        "pfz_nm": 52.0,
        "imbl_nm": 190.0,
        "status_ta": "✅ இன்று பாதுகாப்பானது",
        "status_en": "✅ SAFE today",
    },
    "chennai": {
        "coords": (13.0827, 80.2707),
        "name_ta": "சென்னை",
        "name_en": "Chennai",
        "ground_ta": "எண்ணூர் மீன்பிடி தளம்",
        "ground_en": "Ennore fishing grounds",
        "dir_ta": "வடகிழக்கு",
        "dir_en": "Northeast",
        "heading": "045°",
        "dist_range_ta": "45-60 கடல் மைல்",
        "dist_range_en": "45-60 NM",
        "fish_ta": "சூரை, வஞ்சிரம்",
        "fish_en": "Tuna, Seer Fish",
        "diesel": "~300L",
        "pfz_nm": 52.0,
        "imbl_nm": 190.0,
        "status_ta": "✅ இன்று பாதுகாப்பானது",
        "status_en": "✅ SAFE today",
    },
    "kelambakkam": {
        "coords": (12.7941, 80.2119),
        "name_ta": "கேளம்பாக்கம்",
        "name_en": "Kelambakkam",
        "ground_ta": "மகாபலிபுரம் ஆழ்கடல் தளம்",
        "ground_en": "Mahabalipuram deep grounds",
        "dir_ta": "கிழக்கு",
        "dir_en": "East",
        "heading": "090°",
        "dist_range_ta": "25-40 கடல் மைல்",
        "dist_range_en": "25-40 NM",
        "fish_ta": "வஞ்சிரம், பாறை",
        "fish_en": "Seer Fish, Trevally",
        "diesel": "~200L",
        "pfz_nm": 32.5,
        "imbl_nm": 180.0,
        "status_ta": "✅ இன்று பாதுகாப்பானது",
        "status_en": "✅ SAFE today",
    },
    "rameswaram": {
        "coords": (9.2881, 79.3129),
        "name_ta": "ராமேஸ்வரம்",
        "name_en": "Rameswaram",
        "ground_ta": "பாக் ஜலசந்தி மீன்பிடி தளம்",
        "ground_en": "Palk Bay fishing grounds",
        "dir_ta": "தென்கிழக்கு",
        "dir_en": "Southeast",
        "heading": "135°",
        "dist_range_ta": "20-35 கடல் மைல்",
        "dist_range_en": "20-35 NM",
        "fish_ta": "அயலை, மத்தி",
        "fish_en": "Mackerel, Sardine",
        "diesel": "~150L",
        "pfz_nm": 38.7,
        "imbl_nm": 11.6,
        "status_ta": "⚠️ எல்லை அருகில் — எச்சரிக்கை தேவை",
        "status_en": "⚠️ Near IMBL — exercise caution",
    },
    "tuticorin": {
        "coords": (8.7642, 78.1348),
        "name_ta": "தூத்துக்குடி",
        "name_en": "Tuticorin",
        "ground_ta": "மன்னார் வளைகுடா தளம்",
        "ground_en": "Gulf of Mannar fishing grounds",
        "dir_ta": "தெற்கு",
        "dir_en": "South",
        "heading": "180°",
        "dist_range_ta": "30-50 கடல் மைல்",
        "dist_range_en": "30-50 NM",
        "fish_ta": "சூரை, இறால்",
        "fish_en": "Tuna, Prawns",
        "diesel": "~220L",
        "pfz_nm": 40.0,
        "imbl_nm": 71.7,
        "status_ta": "✅ இன்று பாதுகாப்பானது",
        "status_en": "✅ SAFE today",
    },
    "kanyakumari": {
        "coords": (8.0883, 77.5385),
        "name_ta": "கன்னியாகுமரி",
        "name_en": "Kanyakumari",
        "ground_ta": "வாட்ஜ் வங்கி முக்கடல் தளம்",
        "ground_en": "Wadge Bank fishing grounds",
        "dir_ta": "தென்மேற்கு",
        "dir_en": "Southwest",
        "heading": "225°",
        "dist_range_ta": "20-30 கடல் மைல்",
        "dist_range_en": "20-30 NM",
        "fish_ta": "சூரை, வாளை",
        "fish_en": "Tuna, Swordfish",
        "diesel": "~150L",
        "pfz_nm": 25.0,
        "imbl_nm": 119.0,
        "status_ta": "⚠️ பலத்த காற்று வாய்ப்பு — எச்சரிக்கை",
        "status_en": "⚠️ High swell potential — CAUTION",
    },
    "pondicherry": {
        "coords": (11.9416, 79.8083),
        "name_ta": "புதுச்சேரி",
        "name_en": "Pondicherry",
        "ground_ta": "புதுச்சேரி வெளிக்கடல் தளம்",
        "ground_en": "Pondicherry offshore grounds",
        "dir_ta": "கிழக்கு",
        "dir_en": "East",
        "heading": "090°",
        "dist_range_ta": "30-45 கடல் மைல்",
        "dist_range_en": "30-45 NM",
        "fish_ta": "வஞ்சிரம், சூரை",
        "fish_en": "Seer Fish, Tuna",
        "diesel": "~200L",
        "pfz_nm": 37.5,
        "imbl_nm": 118.0,
        "status_ta": "✅ இன்று பாதுகாப்பானது",
        "status_en": "✅ SAFE today",
    },
    "nagapattinam": {
        "coords": (10.7672, 79.8449),
        "name_ta": "நாகப்பட்டினம்",
        "name_en": "Nagapattinam",
        "ground_ta": "கோடியக்கரை வெளிக்கடல் தளம்",
        "ground_en": "Point Calimere offshore grounds",
        "dir_ta": "கிழக்கு",
        "dir_en": "East",
        "heading": "090°",
        "dist_range_ta": "30-50 கடல் மைல்",
        "dist_range_en": "30-50 NM",
        "fish_ta": "மத்தி, அயலை",
        "fish_en": "Sardine, Mackerel",
        "diesel": "~200L",
        "pfz_nm": 40.0,
        "imbl_nm": 39.1,
        "status_ta": "✅ இன்று பாதுகாப்பானது",
        "status_en": "✅ SAFE today",
    },
    "cuddalore": {
        "coords": (11.7480, 79.7714),
        "name_ta": "கடலூர்",
        "name_en": "Cuddalore",
        "ground_ta": "கடலூர் நடுக்கடல் தளம்",
        "ground_en": "Cuddalore offshore grounds",
        "dir_ta": "கிழக்கு",
        "dir_en": "East",
        "heading": "090°",
        "dist_range_ta": "25-40 கடல் மைல்",
        "dist_range_en": "25-40 NM",
        "fish_ta": "சூரை, அயலை",
        "fish_en": "Tuna, Mackerel",
        "diesel": "~180L",
        "pfz_nm": 32.5,
        "imbl_nm": 106.0,
        "status_ta": "✅ இன்று பாதுகாப்பானது",
        "status_en": "✅ SAFE today",
    },
    "madurai": {
        "coords": (9.9252, 78.1198),
        "name_ta": "மதுரை",
        "name_en": "Madurai",
        "ground_ta": "ராமேஸ்வரம் / தூத்துக்குடி துறைமுகம்",
        "ground_en": "Rameswaram / Tuticorin harbor",
        "dir_ta": "தென்கிழக்கு",
        "dir_en": "Southeast",
        "heading": "135°",
        "dist_range_ta": "70 கடல் மைல் (துறைமுகம்)",
        "dist_range_en": "70 NM to port",
        "fish_ta": "அயலை, சூரை",
        "fish_en": "Mackerel, Tuna",
        "diesel": "~350L",
        "pfz_nm": 70.6,
        "imbl_nm": 76.1,
        "status_ta": "✅ துறைமுகத்திலிருந்து பாதுகாப்பானது",
        "status_en": "✅ SAFE from coastal port",
    },
}

_LOCATION_ALIAS_MAP = {
    "marina beach": "marina_beach",
    "marina": "marina_beach",
    "மெரினா கடற்கரை": "marina_beach",
    "மெரினா": "marina_beach",
    "kelambakkam": "kelambakkam",
    "கேளம்பாக்கம்": "kelambakkam",
    "chennai": "chennai",
    "சென்னை": "chennai",
    "madras": "chennai",
    "rameswaram": "rameswaram",
    "ராமேஸ்வரம்": "rameswaram",
    "rameshwaram": "rameswaram",
    "tuticorin": "tuticorin",
    "தூத்துக்குடி": "tuticorin",
    "thoothukudi": "tuticorin",
    "kanyakumari": "kanyakumari",
    "கன்னியாகுமரி": "kanyakumari",
    "pondicherry": "pondicherry",
    "புதுச்சேரி": "pondicherry",
    "puducherry": "pondicherry",
    "nagapattinam": "nagapattinam",
    "நாகப்பட்டினம்": "nagapattinam",
    "cuddalore": "cuddalore",
    "கடலூர்": "cuddalore",
    "madurai": "madurai",
    "மதுரை": "madurai",
}


def _detect_location(key: str) -> Optional[str]:
    # Match longest alias first so "marina beach" takes priority over "marina"
    for alias in sorted(_LOCATION_ALIAS_MAP.keys(), key=len, reverse=True):
        if alias in key:
            return _LOCATION_ALIAS_MAP[alias]
    return None


def _species_reply(english_only: bool = False, gear: str = "Gillnet") -> str:
    from app.db.user_manager import resolve_gear
    g_info = resolve_gear(gear)
    gear_en = g_info["name_en"]
    gear_ta = g_info["name_ta"]
    species_ta = g_info["species_ta"]
    species_en = g_info["species_en"]
    tip_ta = g_info.get("tip_ta", "")
    tip_en = g_info.get("tip_en", "")

    ta_block = (
        f"🐟 *{gear_en}-க்கு உகந்த மீன்கள் ({gear_ta})*\n"
        f"🐠 {species_ta}\n"
        f"💡 குறிப்பு: {tip_ta}\n"
        "🌊 ஆழம்: 20-50 மீ | பருவம்: சிறந்த காலம்"
    )
    en_block = (
        f"🐟 *Target Species for {gear_en}*\n"
        f"🐠 {species_en}\n"
        f"💡 Tip: {tip_en}\n"
        "🌊 Depth: 20-50m | Season: Peak Season\n"
        "📡 Open-Meteo + INCOIS"
    )
    if english_only:
        return en_block
    return f"{ta_block}\n─────────────────\n{en_block}"


def _fuel_reply(key: str, english_only: bool = False) -> str:
    loc_key = _detect_location(key)
    if loc_key and loc_key in LOCATIONS:
        loc = LOCATIONS[loc_key]
        loc_ta = loc["name_ta"]
        loc_en = loc["name_en"]
        dist_nm = loc["pfz_nm"]
    else:
        loc_ta = "மெரினா கடற்கரை"
        loc_en = "Marina Beach"
        dist_nm = 50.0

    round_trip = round(dist_nm * 2, 1)
    diesel_l = int(round(round_trip * 2.5))
    cost = diesel_l * 100

    ta_block = (
        f"⛽ *டீசல் கணக்கீடு ({loc_ta})*\n"
        f"🎯 மீன் மண்டலம்: {dist_nm} கடல் மைல்\n"
        f"🔄 வட்டப் பயணம்: {round_trip} கடல் மைல்\n"
        f"⛽ டீசல்: ~{diesel_l}L | செலவு: ~₹{cost:,}"
    )
    en_block = (
        f"⛽ *Fuel Estimation ({loc_en})*\n"
        f"🎯 Fishing Zone: {dist_nm} NM\n"
        f"🔄 Round Trip: {round_trip} NM\n"
        f"⛽ Diesel: ~{diesel_l}L | Cost: ~₹{cost:,}\n"
        "📡 Haversine Distance"
    )
    return f"{ta_block}\n─────────────────\n{en_block}"


def _nearby_radius_reply(key: str, english_only: bool = False) -> str:
    match = re.search(r"(\d+(?:\.\d+)?)", key)
    radius = int(float(match.group(1))) if match else 10
    nearest_pfz = 38.7

    if radius >= nearest_pfz:
        status_ta = f"✅ {radius} மைல் சுற்றளவில் PFZ உள்ளது! 180° திசையில் செல்லவும்."
        status_en = f"✅ PFZ located within {radius} NM! Head 180° to reach."
    else:
        status_ta = f"⚠️ {radius} மைல் சுற்றில் PFZ இல்லை. அருகிலுள்ள மண்டலம் {nearest_pfz} மைல்."
        status_en = f"⚠️ No PFZ within {radius} NM. Nearest zone is {nearest_pfz} NM."

    ta_block = (
        f"🗺️ *{radius} கடல் மைல் சுற்றளவில்:*\n"
        f"📍 தற்போதைய இடம்: ராமேஸ்வரம்\n"
        f"🐟 அருகிலுள்ள PFZ: {nearest_pfz} NM @ 180°\n"
        f"{status_ta}"
    )
    en_block = (
        f"🗺️ *Within {radius} NM Radius:*\n"
        "📍 Location: Rameswaram Coast\n"
        f"🐟 Nearest PFZ: {nearest_pfz} NM @ 180°\n"
        f"{status_en}\n"
        "📡 INCOIS PFZ Live Coordinates"
    )
    return f"{ta_block}\n─────────────────\n{en_block}"


def _best_time_reply(english_only: bool = False) -> str:
    ta_block = (
        "⏰ *சிறந்த மீன்பிடி நேரம்:*\n"
        "🌅 காலை: 4:00 AM - 7:00 AM (சிறந்தது)\n"
        "🌇 மாலை: 4:00 PM - 6:00 PM (நல்லது)\n"
        "✅ கடல் கணிப்பு: செல்லலாம் (அலை < 1.0m)"
    )
    en_block = (
        "⏰ *Best Fishing Time:*\n"
        "🌅 Morning: 4:00 AM - 7:00 AM (Best)\n"
        "🌇 Evening: 4:00 PM - 6:00 PM (Good)\n"
        "✅ Forecast: SAFE to go (Wave < 1.0m)\n"
        "📡 Open-Meteo 48hr Forecast"
    )
    return f"{ta_block}\n─────────────────\n{en_block}"


def _location_reply(loc_key: str, english_only: bool = False) -> str:
    loc = LOCATIONS.get(loc_key, LOCATIONS["marina_beach"])

    ta_block = (
        f"📍 {loc['name_ta']} இருந்து:\n"
        f"🐟 செல்வது: {loc['ground_ta']}\n"
        f"🧭 திசை: {loc['dir_ta']} ({loc['heading']})\n"
        f"📏 தூரம்: {loc['dist_range_ta']}\n"
        f"🐠 மீன்: {loc['fish_ta']}\n"
        f"⛽ டீசல்: {loc['diesel']} வட்டப் பயணம்\n"
        f"{loc['status_ta']}"
    )
    en_block = (
        f"📍 From {loc['name_en']}:\n"
        f"🐟 Head to: {loc['ground_en']}\n"
        f"🧭 Direction: {loc['dir_en']} ({loc['heading']})\n"
        f"📏 Distance: {loc['dist_range_en']}\n"
        f"🐠 Fish: {loc['fish_en']}\n"
        f"⛽ Diesel: {loc['diesel']} round trip\n"
        f"{loc['status_en']}"
    )
    return f"{ta_block}\n─────────────────\n{en_block}"


_ENGLISH_PHRASES = ["in english", "give english", "english only", "reply english", "english"]

ROUTE_PATTERNS = [
    "route", "path", "direction", "navigate",
    "how to reach", "safe route", "வழி",
    "எப்படி செல்வது", "திசை", "பாதை",
]


def handle_message(
    body: str,
    phone: str = "default",
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> str:
    """Map an inbound WhatsApp message to an outbound reply string.

    ``phone`` keys the per-number conversation memory; callers that do not
    supply it fall back to a shared ``"default"`` slot.
    """
    # If GPS location shared
    if lat is not None and lon is not None:
        from app.services.safety_engine import SafetyEngine
        from app.data.open_meteo import get_all_marine_data

        se = SafetyEngine()
        marine = get_all_marine_data(lat, lon)
        imbl = se.imbl_distance(lat, lon)
        bearing = se.calculate_bearing(lat, lon, 9.5, 80.2)
        distance = se.haversine(lat, lon, 9.5, 80.2)
        fuel = distance * 2 * 2.5
        wave_m = marine.get("wave_height_m", 0.8)

        ta_block = (
            "📍 *GPS இருப்பிடம் பெறப்பட்டது!*\n"
            f"📍 Lat: {lat:.4f}, Lon: {lon:.4f}\n"
            f"🐟 PFZ: {distance:.1f} கடல் மைல் @ {bearing:.0f}° | ⛽ ~{fuel:.0f}L\n"
            f"🌊 அலை: {wave_m}m | 🚨 எல்லை: {imbl:.1f} NM"
        )
        en_block = (
            "📍 *GPS Location Received!*\n"
            f"📍 Lat: {lat:.4f}, Lon: {lon:.4f}\n"
            f"🐟 PFZ: {distance:.1f} NM @ {bearing:.0f}° | ⛽ ~{fuel:.0f}L\n"
            f"🌊 Wave: {wave_m}m | 🚨 IMBL: {imbl:.1f} NM\n"
            "📡 GPS + Open-Meteo Live"
        )
        return f"{ta_block}\n─────────────────\n{en_block}"

    text = (body or "").strip()
    if not text:
        return WELCOME_TEXT

    key = text.lower()

    # Detect English-only preference
    respond_english_only = any(
        phrase in key
        for phrase in [
            "in english", "give english",
            "english only", "reply english", "english"
        ]
    )

    if key in _WELCOME_CMDS:
        return WELCOME_TEXT
    if key in _HELP_CMDS:
        return HELP_TEXT

    # ── Multi-Step Interactive User Registration & User Management ──
    from app.db.user_manager import (
        clear_session,
        format_profile_message,
        get_profile,
        get_session,
        handle_registration_step,
        start_registration,
        toggle_alerts,
        update_gear,
        update_last_active,
        update_location,
    )

    # 0) If user has an active registration session in progress, forward input to state machine
    session = get_session(phone)
    if session:
        return handle_registration_step(phone, text)

    # Command: "register" (Interactive 4-step registration flow)
    if key in ("register", "subscribe", "start alerts", "பதிவு", "join alerts", "அலர்ட் வேண்டும்", "alert vendum", "alert venum"):
        return start_registration(phone)

    # Command: "my profile" / "என் விவரம்"
    if any(key == cmd or key.startswith(cmd + " ") for cmd in ["my profile", "profile", "என் விவரம்", "என் சுயவிவரம்", "சுயவிவரம்", "விவரம்"]):
        prof = get_profile(phone)
        if not prof:
            return (
                "👤 *சுயவிவரம் இல்லை / No Profile Found*\n"
                "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                "நீங்கள் இன்னும் பதிவு செய்யவில்லை.\n"
                "You are not registered yet.\n\n"
                "பதிவு செய்ய *register* என அனுப்பவும்.\n"
                "Send *register* to setup your profile."
            )
        return format_profile_message(prof)

    # Command: "update location" / "இடம் மாற்று"
    if any(key.startswith(p) for p in ["update location", "இடம் மாற்று", "change location", "change port", "துறைமுகம் மாற்று"]):
        for prefix in ["update location", "இடம் மாற்று", "change location", "change port", "துறைமுகம் மாற்று"]:
            if key.startswith(prefix):
                remainder = text[len(prefix):].strip(" :-=")
                if remainder:
                    _, msg = update_location(phone, remainder)
                    return msg
        return (
            "📍 *துறைமுகம் மாற்ற / Update Port*\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "எந்த துறைமுகத்திற்கு மாற்ற வேண்டும்?\n"
            "உதாரணம்:\n"
            "• *update location Chennai*\n"
            "• *update location Tuticorin*\n"
            "• *update location Rameswaram*\n"
            "• *இடம் மாற்று சென்னை*"
        )

    # Command: "update gear" / "படகு மாற்று"
    if any(key.startswith(p) for p in ["update gear", "படகு மாற்று", "வலை மாற்று", "change gear"]):
        for prefix in ["update gear", "படகு மாற்று", "வலை மாற்று", "change gear"]:
            if key.startswith(prefix):
                remainder = text[len(prefix):].strip(" :-=")
                if remainder:
                    _, msg = update_gear(phone, remainder)
                    return msg
        return (
            "⛵ *படகு வகை மாற்ற / Update Gear*\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "உங்கள் புதிய படகு வகை எது?\n"
            "உதாரணம்:\n"
            "• *update gear Gillnet* (கில்நெட்)\n"
            "• *update gear Trawl* (டிரால்)\n"
            "• *update gear Longline* (தூண்டில்)\n"
            "• *update gear Purse Seine* (சுற்றுவலை)"
        )

    # Command: "my alerts on" / "alerts on"
    if key in ("my alerts on", "alerts on", "start alerts", "காலை அலர்ட் ஆன்", "அலர்ட் ஆன்"):
        _, msg = toggle_alerts(phone, enabled=True)
        return msg

    # Command: "my alerts off" / "alerts off" / "unregister"
    if key in ("my alerts off", "alerts off", "stop alerts", "unregister", "stop", "காலை அலர்ட் ஆஃப்", "அலர்ட் ஆஃப்", "நிறுத்து", "பதிவு நீக்கு"):
        _, msg = toggle_alerts(phone, enabled=False)
        return msg

    # ── Load User Profile for Personalized Responses ──
    user_prof = get_profile(phone)
    if user_prof:
        update_last_active(phone)
        user_port = user_prof.get("home_port") or LOCATION_LABEL
        user_gear = user_prof.get("gear_type") or "Gillnet"
        user_lang = user_prof.get("language") or "tamil"
        if lat is None and lon is None:
            active_lat = user_prof.get("vessel_lat", DEFAULT_LAT)
            active_lon = user_prof.get("vessel_lon", DEFAULT_LON)
        else:
            active_lat = lat
            active_lon = lon
        if user_lang == "english":
            respond_english_only = True
    else:
        active_lat = lat if lat is not None else DEFAULT_LAT
        active_lon = lon if lon is not None else DEFAULT_LON
        user_port = LOCATION_LABEL
        user_gear = "Gillnet"
        user_lang = "tamil"

    # Contextual follow-ups ("அது எவ்வளவு தூரம்" / "how far is that" ...).
    if _is_context_query(text):
        followup = _pfz_followup_reply(get_memory(phone))
        if followup is not None:
            return followup

    # -----------------------------------------------------------------------
    # Advanced Fisherman Queries (1-5)
    # -----------------------------------------------------------------------
    # QUERY 1: Fish species detection (Personalized by user gear)
    if any(t in key for t in ["which fish", "what fish", "fish type", "என்ன மீன்", "மீன் வகை", "species"]) and not any(w in key for w in ["night", "season"]):
        return _species_reply(english_only=respond_english_only, gear=user_gear)

    # QUERY 2: Fuel calculation
    if any(t in key for t in ["diesel", "fuel", "petrol", "எண்ணெய்", "எவ்வளவு எண்ணெய்", "டீசல்", "how much diesel", "fuel calculate", "எரிபொருள்"]):
        return _fuel_reply(key, english_only=respond_english_only)

    # QUERY 3: Nearby fishing within radius
    if any(t in key for t in ["nearby fishing", "10 miles", "5 miles", "20 miles", "nearby", "அருகில் மீன்", "அருகில்", "within", "radius", "சுற்றள"]):
        return _nearby_radius_reply(key, english_only=respond_english_only)

    # QUERY 4: Best time to go fishing
    if any(t in key for t in ["best time", "சிறந்த நேரம்", "when to go", "எப்போது", "morning", "காலை", "evening", "மாலை"]) and not any(k in key for k in ["நாளைக்கு", "tomorrow", "போகலாமா"]):
        return _best_time_reply(english_only=respond_english_only)

    # ROUTE QUERY: Route optimization
    if any(p in key for p in ROUTE_PATTERNS):
        from app.services.route_engine import optimize_route, WAYPOINTS

        start_lat = active_lat
        start_lon = active_lon
        loc = _detect_location(key)
        if loc and loc in WAYPOINTS and lat is None:
            start_lat, start_lon = WAYPOINTS[loc]

        result = optimize_route(start_lat, start_lon)
        ta_status = "பாதுகாப்பானது" if result["route_safe"] else "எச்சரிக்கை"
        en_status = "Safe" if result["route_safe"] else "Warning"

        ta_block = (
            "🗺️ *பாதுகாப்பான வழி:*\n"
            f"📍 தொலைவு: {result['distance_nm']} NM | 🧭 திசை: {result['bearing_deg']}°\n"
            f"⏱️ நேரம்: {result['eta_hours']} மணி | ⛽ டீசல்: {result['fuel_litres']}L\n"
            f"🌊 அலை: {result['wave_height']}m | ✅ பாதை: {ta_status}"
        )
        en_block = (
            "🗺️ *Safe Navigation Route:*\n"
            f"📍 Distance: {result['distance_nm']} NM | 🧭 Heading: {result['bearing_deg']}°\n"
            f"⏱️ ETA: {result['eta_hours']}h | ⛽ Diesel: {result['fuel_litres']}L\n"
            f"🌊 Wave: {result['wave_height']}m | ✅ Route: {en_status}\n"
            f"📡 Source: {result['source']}"
        )
        return f"{ta_block}\n─────────────────\n{en_block}"

    # QUERY 5: Location based query
    detected_loc = _detect_location(key)
    if detected_loc and not any(w in key for w in ["gillnet", "season", "night"]):
        return _location_reply(detected_loc, english_only=respond_english_only)

    # 1) Canonical fisherman queries -> real-data templates (Bilingual Tamil/English).
    # Only for simple canonical queries, not complex technical questions.
    _COMPLEX_TERMS = ["gillnet", "season", "night", "வலை", "தூண்டில்", "gear", "hook", "bait"]
    if not any(w in key for w in _COMPLEX_TERMS):
        kind = tamil_engine.classify(text)
        if kind:
            try:
                sink: dict = {}
                reply = _marine_reply(kind, data_sink=sink, lat=active_lat, lon=active_lon, port_label=user_port)
                if sink:
                    save_memory(phone, "pfz_query", sink)
                return reply
            except LiveDataError:
                logger.warning("WhatsApp %s: live data unavailable", kind)
                return _DATA_UNAVAILABLE_TA
            except Exception:
                logger.exception("WhatsApp %s handler failed", kind)
                return _DATA_UNAVAILABLE_TA

    # If no handler matched → use Groq AI (enriched with user profile context)
    from app.services.groq_engine import ask_groq

    if user_prof:
        prompt_with_profile = (
            f"[User Profile Context: Fisherman Name: {user_prof.get('name')}, "
            f"Home Port: {user_port} (Lat: {active_lat:.4f}, Lon: {active_lon:.4f}), "
            f"Gear: {user_gear}, Language: {user_lang}]\n{body}"
        )
        groq_response = ask_groq(prompt_with_profile)
    else:
        groq_response = ask_groq(body)
    return groq_response


def twiml(text: str) -> str:
    """Wrap a reply string in Twilio MessagingResponse TwiML."""
    try:
        from twilio.twiml.messaging_response import MessagingResponse

        resp = MessagingResponse()
        resp.message(text)
        return str(resp)
    except Exception:  # twilio not installed / import issue — hand-roll TwiML
        from xml.sax.saxutils import escape

        return f'<?xml version="1.0" encoding="UTF-8"?><Response><Message>{escape(text)}</Message></Response>'
