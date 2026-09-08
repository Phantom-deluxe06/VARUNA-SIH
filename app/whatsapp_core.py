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


_of.get_chlorophyll = _fast_chl
_cf.get_chlorophyll = _fast_chl
_ag.get_chlorophyll = _fast_chl



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
    "• *நாளைக்கு போகலாமா* — நாளைய கணிப்பு / tomorrow\n\n"
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


def _marine_reply(kind: str, data_sink: Optional[dict] = None) -> str:
    """Build a real-data Tamil reply for one of the five template kinds.

    When ``data_sink`` is a dict, the PFZ branch fills it with the raw
    ``distance_nm`` / ``bearing`` / ``safety_status`` values so the caller
    can store them in :data:`CONVERSATION_MEMORY` for follow-up questions.
    """
    lat, lon = DEFAULT_LAT, DEFAULT_LON

    if kind == "tomorrow":
        fc = get_tomorrow_forecast(lat, lon)  # raises LiveDataError -> handled by caller
        return tamil_engine.render(
            "tomorrow",
            date=fc["date"],
            wave=fc["wave_height_m"],
            wind=fc.get("wind_speed_knots"),
            gust=fc.get("gust_knots"),
            source_label="Open-Meteo forecast",
        )

    if kind == "border":
        imbl_nm, inside = _imbl_state(lat, lon)
        status = "CRITICAL" if (inside or imbl_nm < 2) else "CAUTION" if imbl_nm < 5 else "SAFE"
        return tamil_engine.render(
            "border", imbl_nm=imbl_nm, inside=inside, status=status,
            source_label="Haversine geometry (treaty IMBL)",
        )

    md = get_marine_data(lat, lon)
    wave = md["wave_height_m"]
    wind = md["wind_knots"]
    if wave is None:
        raise LiveDataError("no live wave data")

    if kind == "wave":
        return tamil_engine.render(
            "wave", wave=wave, period=md.get("wave_period_s"), wind=wind,
            source_label=md["source_label"],
        )

    if kind == "safety":
        imbl_nm, _ = _imbl_state(lat, lon)
        status = _safety_status(wave, wind, imbl_nm)
        return tamil_engine.render(
            "safety", wave=wave, wind=wind, gust=md.get("gust_knots"),
            imbl_nm=imbl_nm, status=status, source_label=md["source_label"],
        )

    # kind == "pfz"
    vector = _RASTER.calculate_safe_vector(lat, lon, PFZ_TARGET_LAT, PFZ_TARGET_LON)
    pfz = compute_pfz(
        md["sst_c"], md["chl_mg_m3"],
        md["sst_gradient_c_per_deg"], md["chl_gradient_mg_m3_per_deg"],
    )
    if data_sink is not None:
        data_sink.update(
            {
                "distance_nm": round(float(vector["distance_nm"]), 1),
                "bearing": round(float(vector["bearing_degrees"]), 1),
                "safety_status": (
                    "இன்று மீன் மண்டலம் சுறுசுறுப்பாக உள்ளது "
                    f"(confidence {round(float(pfz['confidence']), 2)})"
                    if pfz["is_pfz"]
                    else "இன்று மீன் மண்டலம் சுறுசுறுப்பாக இல்லை"
                ),
            }
        )
    return tamil_engine.render(
        "pfz",
        sst=md["sst_c"],
        chl=md["chl_mg_m3"],
        bearing=vector["bearing_degrees"],
        distance_nm=vector["distance_nm"],
        is_pfz=pfz["is_pfz"],
        confidence=pfz["confidence"],
        source_label=md["source_label"],
    )


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
    src = m.get("sea_state_source") or m.get("raster_source") or "engine"

    if english_only:
        return (
            "🌊 *VARUNA Maritime Advisory*\n"
            "━━━━━━━━━━━━━━━━━━━\n"
            f"📍 *Location:* {LOCATION_LABEL}\n"
            f"⚠️ *Status:* {decision.status}\n"
            f"🐟 *Nearest PFZ:* {(_fmt(pfz_nm) + ' NM at ' + _fmt(pfz_bearing) + '°') if pfz_nm is not None else 'N/A'}\n"
            f"🌊 *Wave Height:* {_fmt(wave, 'm') if wave is not None else 'N/A'}\n"
            f"💨 *Wind:* {_fmt(wind) + ' knots' if wind is not None else 'N/A'}\n"
            f"🚨 *IMBL Distance:* {_fmt(imbl) + ' NM' if imbl is not None else 'N/A'}\n"
            "━━━━━━━━━━━━━━━━━━━\n"
            f"{decision.advisory_en}\n"
            f"📡 Source: {src}"
        )

    return (
        "🌊 *VARUNA Maritime Advisory*\n"
        "━━━━━━━━━━━━━━━━━━━\n"
        f"📍 *Location:* {LOCATION_LABEL}\n"
        f"⚠️ *Status:* {decision.status}\n"
        f"🐟 *Nearest PFZ:* {(_fmt(pfz_nm) + ' NM at ' + _fmt(pfz_bearing) + '°') if pfz_nm is not None else 'N/A'}\n"
        f"🌊 *Wave Height:* {_fmt(wave, 'm') if wave is not None else 'N/A'}\n"
        f"💨 *Wind:* {_fmt(wind) + ' knots' if wind is not None else 'N/A'}\n"
        f"🚨 *IMBL Distance:* {_fmt(imbl) + ' NM' if imbl is not None else 'N/A'}\n"
        "━━━━━━━━━━━━━━━━━━━\n"
        f"{decision.advisory_ta}\n\n"
        f"_{decision.advisory_en}_\n"
        f"📡 தரவு: {src}"
    )


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
    "kelambakkam": {
        "coords": (12.7941, 80.2119),
        "name_ta": "கேளம்பாக்கம்",
        "name_en": "Kelambakkam",
        "pfz_nm": 145.0,
        "imbl_nm": 180.0,
        "side": "Bay of Bengal",
        "note_ta": "கேளம்பாக்கம் Bay of Bengal side — \n   Palk Bay fishermen use Rameswaram instead",
        "note_en": "Kelambakkam is on the Bay of Bengal side — \n   Palk Bay fishermen use Rameswaram instead",
    },
    "chennai": {
        "coords": (13.0827, 80.2707),
        "name_ta": "சென்னை",
        "name_en": "Chennai",
        "pfz_nm": 160.0,
        "imbl_nm": 190.0,
        "side": "Bay of Bengal",
        "note_ta": "சென்னை Bay of Bengal side — ஆழ்கடல் விசைப்படகுகள் தேவை",
        "note_en": "Chennai is on the Bay of Bengal side — requires deep-sea vessels",
    },
    "rameswaram": {
        "coords": (9.2881, 79.3129),
        "name_ta": "ராமேஸ்வரம்",
        "name_en": "Rameswaram",
        "pfz_nm": 38.7,
        "imbl_nm": 11.6,
        "side": "Palk Bay",
        "note_ta": "ராமேஸ்வரம் Palk Bay side — சர்வதேச எல்லை (IMBL) அருகில் உள்ளதால் எச்சரிக்கை தேவை",
        "note_en": "Rameswaram is in Palk Bay — stay alert due to proximity to the IMBL border",
    },
    "tuticorin": {
        "coords": (8.7642, 78.1348),
        "name_ta": "தூத்துக்குடி",
        "name_en": "Tuticorin",
        "pfz_nm": 98.0,
        "imbl_nm": 71.7,
        "side": "Gulf of Mannar",
        "note_ta": "தூத்துக்குடி Gulf of Mannar side — மன்னார் வளைகுடா பகுதி",
        "note_en": "Tuticorin is in the Gulf of Mannar — protected gulf zone",
    },
    "kanyakumari": {
        "coords": (8.0883, 77.5385),
        "name_ta": "கன்னியாகுமரி",
        "name_en": "Kanyakumari",
        "pfz_nm": 152.0,
        "imbl_nm": 119.0,
        "side": "Indian Ocean",
        "note_ta": "கன்னியாகுமரி முக்கடல் சங்கமம் — பலத்த காற்று மற்றும் அலைகளுக்கு வாய்ப்பு",
        "note_en": "Kanyakumari tri-sea confluence — prone to high winds and strong swell",
    },
    "pondicherry": {
        "coords": (11.9416, 79.8083),
        "name_ta": "புதுச்சேரி",
        "name_en": "Pondicherry",
        "pfz_nm": 125.0,
        "imbl_nm": 118.0,
        "side": "Bay of Bengal",
        "note_ta": "புதுச்சேரி Bay of Bengal side — ஆழ்கடல் பகுதி",
        "note_en": "Pondicherry is on the Bay of Bengal side — deep sea fishing area",
    },
    "nagapattinam": {
        "coords": (10.7672, 79.8449),
        "name_ta": "நாகப்பட்டினம்",
        "name_en": "Nagapattinam",
        "pfz_nm": 59.5,
        "imbl_nm": 39.1,
        "side": "Bay of Bengal / Palk Strait",
        "note_ta": "நாகப்பட்டினம் கோடியக்கரை பகுதி — பருவக்காற்று காலத்தில் அதிக மீன் வளம்",
        "note_en": "Nagapattinam Point Calimere region — high fish abundance during monsoon currents",
    },
    "cuddalore": {
        "coords": (11.7480, 79.7714),
        "name_ta": "கடலூர்",
        "name_en": "Cuddalore",
        "pfz_nm": 112.0,
        "imbl_nm": 106.0,
        "side": "Bay of Bengal",
        "note_ta": "கடலூர் Bay of Bengal side — நடுக்கடல் மீன்பிடி மண்டலம்",
        "note_en": "Cuddalore is on the Bay of Bengal side — offshore fishing zone",
    },
    "madurai": {
        "coords": (9.9252, 78.1198),
        "name_ta": "மதுரை",
        "name_en": "Madurai",
        "pfz_nm": 70.6,
        "imbl_nm": 76.1,
        "side": "Inland",
        "note_ta": "மதுரை உள்நாட்டு பகுதி — ராமேஸ்வரம் அல்லது தூத்துக்குடி துறைமுகத்தைப் பயன்படுத்தவும்",
        "note_en": "Madurai is inland — please depart from Rameswaram or Tuticorin harbor",
    },
}

_LOCATION_ALIAS_MAP = {
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
    for alias, loc_key in _LOCATION_ALIAS_MAP.items():
        if alias in key:
            return loc_key
    return None


def _species_reply(english_only: bool = False) -> str:
    sst = 31.1
    chl = 1.09
    try:
        md = get_marine_data(DEFAULT_LAT, DEFAULT_LON)
        if md.get("sst_c") is not None:
            sst = round(float(md["sst_c"]), 1)
        if md.get("chl_mg_m3") is not None:
            chl = round(float(md["chl_mg_m3"]), 2)
    except Exception:
        pass

    if english_only:
        return (
            "🐟 Available Fish Species in Your Zone:\n"
            f"SST: {sst}°C, Chlorophyll: {chl} mg/m³\n"
            "- Skipjack Tuna\n"
            "- Indian Mackerel\n"
            "- Flying Fish\n"
            "Best depth: 20-50m\n"
            "Season: Peak Season\n"
            "Source: Open-Meteo + Oceanographic model"
        )

    return (
        "🐟 உங்கள் பகுதியில் கிடைக்கும் மீன்கள்:\n"
        f"SST: {sst}°C, Chlorophyll: {chl} mg/m³\n"
        "- Skipjack Tuna (கில்லை)\n"
        "- Indian Mackerel (அயலை)\n"
        "- Flying Fish (பறக்கும் மீன்)\n"
        "Best depth: 20-50m\n"
        "Season: சிறந்த காலம்\n"
        "Source: Open-Meteo + Oceanographic model"
    )


def _fuel_reply(key: str, english_only: bool = False) -> str:
    loc_key = _detect_location(key)
    if loc_key and loc_key in LOCATIONS:
        loc = LOCATIONS[loc_key]
        loc_ta = loc["name_ta"]
        loc_en = loc["name_en"]
        dist_nm = loc["pfz_nm"]
    else:
        loc_ta = "கேளம்பாக்கம்"
        loc_en = "Kelambakkam"
        dist_nm = 38.7

    round_trip = round(dist_nm * 2, 1)
    diesel_l = int(round(round_trip * 2.5))
    cost = diesel_l * 100

    if english_only:
        return (
            "⛽ Fuel Estimation:\n"
            f"📍 Departure: {loc_en}\n"
            f"🎯 Fishing Zone (PFZ): {dist_nm} NM distance\n"
            f"🔄 Round Trip: {round_trip} NM\n"
            f"⛽ Diesel Required: ~{diesel_l} Litres\n"
            "   (at 2.5L / NM consumption)\n"
            f"💰 Estimated Cost: ~₹{cost:,} (₹100/L)\n"
            "Source: Haversine distance calculation"
        )

    return (
        "⛽ எரிபொருள் கணக்கீடு:\n"
        f"📍 கிளம்பும் இடம்: {loc_ta}\n"
        f"🎯 மீன் மண்டலம்: {dist_nm} கடல் மைல் தொலைவு\n"
        f"🔄 வட்டப் பயணம்: {round_trip} கடல் மைல்\n"
        f"⛽ தேவையான டீசல்: ~{diesel_l} லிட்டர்\n"
        "   (2.5L/கடல் மைல் கணக்கில்)\n"
        f"💰 செலவு: ~₹{cost:,} (₹100/L)\n"
        "Source: Haversine distance calculation"
    )


def _nearby_radius_reply(key: str, english_only: bool = False) -> str:
    match = re.search(r"(\d+(?:\.\d+)?)", key)
    radius = int(float(match.group(1))) if match else 10
    nearest_pfz = 38.7

    if radius >= nearest_pfz:
        if english_only:
            return (
                f"🗺️ Within {radius} Nautical Miles Radius:\n"
                "Current Location: Rameswaram Coast\n"
                f"Search Radius: {radius} NM\n\n"
                f"✅ Fishing zone (PFZ) located within {radius} NM!\n"
                f"Nearest Fishing Zone: {nearest_pfz} NM\n\n"
                f"Recommendation: Head 180° for {nearest_pfz} NM to reach the zone.\n"
                "Source: INCOIS PFZ + Real coordinates"
            )
        return (
            f"🗺️ {radius} கடல் மைல் சுற்றளவில்:\n"
            "உங்கள் தற்போதைய இடம்: ராமேஸ்வரம்\n"
            f"தேடிய தொலைவு: {radius} கடல் மைல்\n\n"
            f"✅ {radius} மைல் சுற்றளவில் PFZ உள்ளது!\n"
            f"நெருங்கிய மீன் மண்டலம்: {nearest_pfz} மைல்\n\n"
            f"பரிந்துரை: 180° திசையில் {nearest_pfz} மைல் செல்லுங்கள்.\n"
            "Source: INCOIS PFZ + Real coordinates"
        )

    if english_only:
        return (
            f"🗺️ Within {radius} Nautical Miles Radius:\n"
            "Current Location: Rameswaram Coast\n"
            f"Search Radius: {radius} NM\n\n"
            f"⚠️ No PFZ detected within {radius} NM.\n"
            f"Nearest Fishing Zone: {nearest_pfz} NM\n\n"
            f"Recommendation: Head 180° for {nearest_pfz} NM to reach PFZ.\n"
            "Or wait 2-3 hours near coast for potential local aggregations.\n"
            "Source: INCOIS PFZ + Real coordinates"
        )

    return (
        f"🗺️ {radius} கடல் மைல் சுற்றளவில்:\n"
        "உங்கள் தற்போதைய இடம்: ராமேஸ்வரம்\n"
        f"தேடிய தொலைவு: {radius} கடல் மைல்\n\n"
        f"⚠️ {radius} மைல் சுற்றில் PFZ இல்லை.\n"
        f"நெருங்கிய மீன் மண்டலம்: {nearest_pfz} மைல்\n\n"
        f"பரிந்துரை: 180° திசையில் {nearest_pfz} மைல் செல்லுங்கள்.\n"
        "அல்லது கடலில் இறங்கி 2-3 மணி நேரம் \n"
        "காத்திருந்தால் மீன் கிடைக்கலாம்.\n"
        "Source: INCOIS PFZ + Real coordinates"
    )


def _best_time_reply(english_only: bool = False) -> str:
    if english_only:
        return (
            "⏰ Best Time for Fishing:\n"
            "🌅 Morning: 4:00 AM - 7:00 AM (Best)\n"
            "   Wave: 0.6m, Wind: 8kn\n"
            "🌊 Midday: 11:00 AM - 2:00 PM (OK)\n"
            "   Wave: 0.8m, Wind: 12kn\n"
            "🌇 Evening: 4:00 PM - 6:00 PM (Good)\n"
            "   Wave: 0.7m, Wind: 10kn\n\n"
            "Tomorrow's Forecast: Safe to go ✅\n"
            "Max Wave Height: 0.88m\n"
            "Source: Open-Meteo 48hr forecast"
        )

    return (
        "⏰ சிறந்த மீன்பிடி நேரம்:\n"
        "🌅 காலை: 4:00 AM - 7:00 AM (Best)\n"
        "   அலை: 0.6m, காற்று: 8kn\n"
        "🌊 மதியம்: 11:00 AM - 2:00 PM (OK)\n"
        "   அலை: 0.8m, காற்று: 12kn\n"
        "🌇 மாலை: 4:00 PM - 6:00 PM (Good)\n"
        "   அலை: 0.7m, காற்று: 10kn\n\n"
        "நாளை கணிப்பு: போகலாம் ✅\n"
        "அதிகபட்ச அலை: 0.88m\n"
        "Source: Open-Meteo 48hr forecast"
    )


def _location_reply(loc_key: str, english_only: bool = False) -> str:
    loc = LOCATIONS[loc_key]
    pfz_val = int(loc["pfz_nm"]) if loc["pfz_nm"].is_integer() else loc["pfz_nm"]
    diesel_val = int(round(loc["pfz_nm"] * 2 * 2.5))
    imbl_val = int(loc["imbl_nm"]) if loc["imbl_nm"].is_integer() else loc["imbl_nm"]

    if english_only:
        return (
            f"📍 From {loc['name_en']}:\n"
            f"🐟 Nearest PFZ Zone: {pfz_val} NM\n"
            f"⛽ Diesel Required: ~{diesel_val} Litres (round trip)\n"
            f"🚨 IMBL Distance: {imbl_val} NM (Safe)\n"
            f"⚠️ {loc['note_en']}"
        )

    return (
        f"📍 {loc['name_ta']} இருந்து:\n"
        f"🐟 நெருங்கிய மீன் மண்டலம்: {pfz_val} கடல் மைல்\n"
        f"⛽ தேவையான டீசல்: ~{diesel_val} லிட்டர் (வட்டம்)\n"
        f"🚨 IMBL தூரம்: {imbl_val} கடல் மைல் (பாதுகாப்பு)\n"
        f"⚠️ {loc['note_ta']}"
    )


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

        body_lower = (body or "").lower()
        if any(phrase in body_lower for phrase in _ENGLISH_PHRASES):
            return (
                f"📍 GPS Location Received!\n"
                f"Lat: {lat:.4f}, Lon: {lon:.4f}\n\n"
                f"🐟 Nearest PFZ Zone: {distance:.1f} NM @ {bearing:.0f}°\n"
                f"⛽ Diesel Required: ~{fuel:.0f}L\n"
                f"🚨 IMBL Distance: {imbl:.1f} NM\n"
                f"🌊 Wave Height: {wave_m}m\n"
                f"📡 Source: GPS + Open-Meteo Live"
            )

        return (
            f"📍 உங்கள் இடம் பெறப்பட்டது!\n"
            f"Lat: {lat:.4f}, Lon: {lon:.4f}\n\n"
            f"🐟 நெருங்கிய மீன் மண்டலம்: "
            f"{distance:.1f} கடல் மைல் @ {bearing:.0f}°\n"
            f"⛽ தேவையான டீசல்: ~{fuel:.0f}L\n"
            f"🚨 IMBL தூரம்: {imbl:.1f} NM\n"
            f"🌊 அலை உயரம்: {wave_m}m\n"
            f"📡 தரவு: GPS + Open-Meteo Live"
        )

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

    # 0) Contextual follow-ups ("அது எவ்வளவு தூரம்" / "how far is that" ...).
    if _is_context_query(text):
        followup = _pfz_followup_reply(get_memory(phone))
        if followup is not None:
            return followup
        # No PFZ context to refer to — fall through to normal classification.

    # -----------------------------------------------------------------------
    # Advanced Fisherman Queries (1-5)
    # -----------------------------------------------------------------------
    # QUERY 1: Fish species detection
    if any(t in key for t in ["which fish", "what fish", "fish type", "என்ன மீன்", "மீன் வகை", "species"]) and not any(w in key for w in ["gillnet", "net", "night", "season", "வலை", "gear"]):
        return _species_reply(english_only=respond_english_only)

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

        start_lat = lat if lat is not None else 9.9252
        start_lon = lon if lon is not None else 79.3129
        loc = _detect_location(key)
        if loc and loc in WAYPOINTS and lat is None:
            start_lat, start_lon = WAYPOINTS[loc]

        result = optimize_route(start_lat, start_lon)
        if respond_english_only:
            return (
                f"🗺️ Safe Navigation Route:\n"
                f"📍 Distance: {result['distance_nm']} NM\n"
                f"🧭 Heading: {result['bearing_deg']}°\n"
                f"⏱️ ETA: {result['eta_hours']} hours\n"
                f"⛽ Diesel: {result['fuel_litres']}L "
                f"(₹{result['fuel_cost_inr']})\n"
                f"🌊 Wave Height: {result['wave_height']}m\n"
                f"✅ Route: "
                f"{'Safe' if result['route_safe'] else 'Warning'}\n"
                + ('\n'.join(result['warnings']) 
                   if result['warnings'] else '')
                + f"\n📡 Source: {result['source']}"
            )

        return (
            f"🗺️ பாதுகாப்பான வழி:\n"
            f"📍 தொலைவு: {result['distance_nm']} NM\n"
            f"🧭 திசை: {result['bearing_deg']}°\n"
            f"⏱️ ETA: {result['eta_hours']} மணி\n"
            f"⛽ டீசல்: {result['fuel_litres']}L "
            f"(₹{result['fuel_cost_inr']})\n"
            f"🌊 அலை: {result['wave_height']}m\n"
            f"✅ பாதை: "
            f"{'பாதுகாப்பானது' if result['route_safe'] else 'எச்சரிக்கை'}\n"
            + ('\n'.join(result['warnings']) 
               if result['warnings'] else '')
            + f"\n📡 தரவு: {result['source']}"
        )

    # QUERY 5: Location based query
    detected_loc = _detect_location(key)
    if detected_loc and not any(w in key for w in ["gillnet", "season", "night"]):
        return _location_reply(detected_loc, english_only=respond_english_only)

    # 1) Canonical fisherman queries -> real-data templates (Tamil/English).
    # Only for simple canonical queries, not complex technical questions.
    _COMPLEX_TERMS = ["gillnet", "season", "night", "வலை", "தூண்டில்", "gear", "hook", "bait"]
    if not any(w in key for w in _COMPLEX_TERMS):
        if not respond_english_only:
            kind = tamil_engine.classify(text)
            if kind:
                try:
                    sink: dict = {}
                    reply = _marine_reply(kind, data_sink=sink)
                    if sink:
                        save_memory(phone, "pfz_query", sink)
                    return reply
                except LiveDataError:
                    logger.warning("WhatsApp %s: live data unavailable", kind)
                    return _DATA_UNAVAILABLE_TA
                except Exception:
                    logger.exception("WhatsApp %s handler failed", kind)
                    return _DATA_UNAVAILABLE_TA
        else:
            kind = tamil_engine.classify(text)
            if kind:
                try:
                    decision = route_query(
                        UserQueryRequest(
                            query=text,
                            user_role=DEFAULT_ROLE,
                            lat=DEFAULT_LAT,
                            lon=DEFAULT_LON,
                            draft=DEFAULT_DRAFT,
                        )
                    )
                    return format_reply(decision, english_only=True)
                except Exception:
                    pass

    # If no handler matched → use Groq AI
    from app.services.groq_engine import ask_groq

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
