"""Shared WhatsApp advisory logic.

Single source of truth used by BOTH the standalone Flask bot
(``app/whatsapp_bot.py``) and the FastAPI endpoint
(``POST /whatsapp/webhook`` in ``app/main.py``).  It calls the VARUNA
intelligence engine in-process (no HTTP hop) and formats a clean bilingual
WhatsApp reply.
"""

from __future__ import annotations

import logging

from app.schemas import UserQueryRequest
from app.services.intelligence_engine import route_query

logger = logging.getLogger("varuna.whatsapp")

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
    "• *pfz* / *மீன்* — மீன் பிடிக்கும் இடம் / fishing zone\n"
    "• *safe* / *பாதுகாப்பு* — கடல் நிலை / safety check\n"
    "• *border* / *எல்லை* — எல்லைக்கோடு தூரம் / IMBL check\n"
    "• *help* / *உதவி* — உதவி பட்டியல்\n\n"
    "அல்லது நேரடியாக கேளுங்கள் / Or just ask a question."
)

HELP_TEXT = (
    "🌊 *VARUNA — உதவி / Commands*\n"
    "━━━━━━━━━━━━━━━━━━━\n"
    "*pfz* அல்லது *மீன்*  →  அருகில் உள்ள மீன் மண்டலம்\n"
    "*safe* அல்லது *பாதுகாப்பு*  →  கடல் பயண பாதுகாப்பு\n"
    "*border* அல்லது *எல்லை*  →  சர்வதேச கடல் எல்லை தூரம்\n"
    "*hi* அல்லது *வணக்கம்*  →  தொடக்க செய்தி\n"
    "━━━━━━━━━━━━━━━━━━━\n"
    "எந்த கேள்வியையும் தமிழில் அல்லது ஆங்கிலத்தில் அனுப்பலாம்.\n"
    "You can send any question in Tamil or English."
)

_WELCOME_CMDS = {"hi", "hello", "hey", "வணக்கம்", "start"}
_HELP_CMDS = {"help", "menu", "உதவி"}
_COMMAND_QUERIES = {
    "pfz": "Where is the best fishing zone today?",
    "மீன்": "Where is the best fishing zone today?",
    "fish": "Where is the best fishing zone today?",
    "safe": "Is it safe to sail right now?",
    "safety": "Is it safe to sail right now?",
    "பாதுகாப்பு": "Is it safe to sail right now?",
    "border": "How far am I from the maritime border IMBL?",
    "எல்லை": "How far am I from the maritime border IMBL?",
}


def _fmt(value, suffix: str = "") -> str:
    if value is None:
        return "N/A"
    if isinstance(value, (int, float)):
        value = round(float(value), 1)
    return f"{value}{suffix}"


def format_reply(decision) -> str:
    """Render an ``AgentDecisionResponse`` into the WhatsApp advisory block."""
    m = decision.metrics or {}

    pfz_nm = m.get("distance_nm")
    pfz_bearing = m.get("bearing_degrees")
    if pfz_nm is None and decision.bearing_vector is not None:
        pfz_nm = round(decision.bearing_vector.distance_km / 1.852, 1)
        pfz_bearing = decision.bearing_vector.bearing_degrees

    pfz_line = (
        f"{_fmt(pfz_nm)} NM at {_fmt(pfz_bearing)}°"
        if pfz_nm is not None
        else "N/A"
    )
    wave = m.get("wave_height_m")
    wind = m.get("wind_speed_knots")
    imbl = m.get("nearest_imbl_distance_nm")

    return (
        "🌊 *VARUNA Maritime Advisory*\n"
        "━━━━━━━━━━━━━━━━━━━\n"
        f"📍 *Location:* {LOCATION_LABEL}\n"
        f"⚠️ *Status:* {decision.status}\n"
        f"🐟 *Nearest PFZ:* {pfz_line}\n"
        f"🌊 *Wave Height:* {_fmt(wave, 'm') if wave is not None else 'N/A'}\n"
        f"💨 *Wind:* {_fmt(wind) + ' knots' if wind is not None else 'N/A'}\n"
        f"🚨 *IMBL Distance:* {_fmt(imbl) + ' NM' if imbl is not None else 'N/A'}\n"
        "━━━━━━━━━━━━━━━━━━━\n"
        f"{decision.advisory_ta}\n\n"
        f"_{decision.advisory_en}_"
    )


def handle_message(body: str) -> str:
    """Map an inbound WhatsApp message to an outbound reply string."""
    text = (body or "").strip()
    if not text:
        return WELCOME_TEXT

    key = text.lower()
    if key in _WELCOME_CMDS:
        return WELCOME_TEXT
    if key in _HELP_CMDS:
        return HELP_TEXT

    query = _COMMAND_QUERIES.get(key, text)

    try:
        decision = route_query(
            UserQueryRequest(
                query=query,
                user_role=DEFAULT_ROLE,
                lat=DEFAULT_LAT,
                lon=DEFAULT_LON,
                draft=DEFAULT_DRAFT,
            )
        )
        return format_reply(decision)
    except Exception:  # pragma: no cover - last-resort guard
        logger.exception("WhatsApp query failed")
        from app.demo_mode import classify_demo_kind, demo_decision

        return format_reply(demo_decision(classify_demo_kind(query)))


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
