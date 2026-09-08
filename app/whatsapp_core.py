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


def format_reply(decision) -> str:
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


def handle_message(body: str, phone: str = "default") -> str:
    """Map an inbound WhatsApp message to an outbound reply string.

    ``phone`` keys the per-number conversation memory; callers that do not
    supply it fall back to a shared ``"default"`` slot.
    """
    text = (body or "").strip()
    if not text:
        return WELCOME_TEXT

    key = text.lower()
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

    # 1) Canonical fisherman queries -> real-data Tamil templates (no demo).
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

    # 2) Free-text -> full NLU engine (still real data; no demo fallback here).
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
        metrics = decision.metrics or {}
        response_data = {
            "distance_nm": metrics.get("distance_nm"),
            "bearing": metrics.get("bearing_degrees"),
            "safety_status": decision.status,
        }
        save_memory(phone, decision.agent_name, response_data)
        return format_reply(decision)
    except Exception:
        logger.exception("WhatsApp free-text query failed")
        return _DATA_UNAVAILABLE_TA


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
