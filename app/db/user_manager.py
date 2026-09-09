"""User registration, profile management, and personalization for VARUNA.

Manages fisherman profiles, home ports, fishing gear types, language preferences,
and interactive multi-step WhatsApp registration flows using the embedded SQLite database.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

from app.db.database import get_connection

logger = logging.getLogger("varuna.user_manager")

# ---------------------------------------------------------------------------
# Tamil Nadu Major Fishing Ports & Reference Coordinates
# ---------------------------------------------------------------------------
PORT_DATA: dict[str, dict[str, Any]] = {
    "rameswaram": {
        "name": "Rameswaram",
        "name_ta": "ராமேஸ்வரம்",
        "lat": 9.2876,
        "lon": 79.3129,
        "draft": 2.0,
        "channel_depth": 5.0,
    },
    "chennai": {
        "name": "Chennai",
        "name_ta": "சென்னை",
        "lat": 13.0827,
        "lon": 80.2707,
        "draft": 2.5,
        "channel_depth": 15.5,
    },
    "tuticorin": {
        "name": "Tuticorin",
        "name_ta": "தூத்துக்குடி",
        "lat": 8.7642,
        "lon": 78.1348,
        "draft": 2.5,
        "channel_depth": 14.2,
    },
    "thoothukudi": {
        "name": "Thoothukudi",
        "name_ta": "தூத்துக்குடி",
        "lat": 8.7642,
        "lon": 78.1348,
        "draft": 2.5,
        "channel_depth": 14.2,
    },
    "nagapattinam": {
        "name": "Nagapattinam",
        "name_ta": "நாகப்பட்டினம்",
        "lat": 10.7656,
        "lon": 79.8424,
        "draft": 2.2,
        "channel_depth": 6.5,
    },
    "cuddalore": {
        "name": "Cuddalore",
        "name_ta": "கடலூர்",
        "lat": 11.7480,
        "lon": 79.7714,
        "draft": 2.0,
        "channel_depth": 5.0,
    },
    "kanyakumari": {
        "name": "Kanyakumari",
        "name_ta": "கன்னியாகுமரி",
        "lat": 8.0883,
        "lon": 77.5385,
        "draft": 2.2,
        "channel_depth": 7.0,
    },
    "mandapam": {
        "name": "Mandapam",
        "name_ta": "மண்டபம்",
        "lat": 9.2796,
        "lon": 79.1235,
        "draft": 2.0,
        "channel_depth": 4.5,
    },
    "ennore": {
        "name": "Ennore",
        "name_ta": "எண்ணூர்",
        "lat": 13.2000,
        "lon": 80.3200,
        "draft": 2.5,
        "channel_depth": 15.0,
    },
    "poompuhar": {
        "name": "Poompuhar",
        "name_ta": "பூம்புகார்",
        "lat": 11.1444,
        "lon": 79.8556,
        "draft": 2.0,
        "channel_depth": 4.0,
    },
    "pamban": {
        "name": "Pamban",
        "name_ta": "பாம்பன்",
        "lat": 9.2789,
        "lon": 79.2137,
        "draft": 2.0,
        "channel_depth": 4.5,
    },
}

# ---------------------------------------------------------------------------
# Fishing Gear Types & Targeted Species
# ---------------------------------------------------------------------------
GEAR_SPECIES: dict[str, dict[str, str]] = {
    "gillnet": {
        "name_en": "Gillnet",
        "name_ta": "கில்நெட் (வலை)",
        "species_en": "Mackerel, Sardine, Tuna, Pomfret, Hilsa",
        "species_ta": "அயலை (Mackerel), மத்தி (Sardine), சூரை (Tuna), வௌவால் (Pomfret)",
        "tip_en": "Target pelagic surface schooling fish along thermal fronts.",
        "tip_ta": "மேற்பரப்பு நீரோட்டம் மற்றும் வெப்ப விளிம்பு பகுதிகளில் வலை விரிக்கவும்.",
    },
    "trawl": {
        "name_en": "Trawl",
        "name_ta": "டிரால் (இழுவலை)",
        "species_en": "Prawn / Shrimp, Squid, Cuttlefish, Crab, Flatfish",
        "species_ta": "இறால் (Prawn), கணவாய் (Squid), நண்டு (Crab), நாக்கு மீன் (Flatfish)",
        "tip_en": "Operate on soft muddy shelf beds outside reef zones and the 3 NM artisanal belt.",
        "tip_ta": "பவளப்பாறை மற்றும் பாரம்பரிய மீனவர் பகுதிகளை தவிர்த்து இழுவலை வீசவும்.",
    },
    "longline": {
        "name_en": "Longline",
        "name_ta": "தூண்டில் (Longline)",
        "species_en": "Yellowfin Tuna, Seer Fish (Vanjaram), Sailfish, Red Snapper",
        "species_ta": "சூரை (Tuna), வஞ்சிரம் (Seer Fish), மயில் மீன் (Sailfish), செங்கணி (Snapper)",
        "tip_en": "Deploy along 50m-100m shelf breaks where pelagic predators hunt upwelling eddies.",
        "tip_ta": "50-100 மீட்டர் தரைச்சரிவு மற்றும் ஆழ்கடல் சுழல் பகுதிகளில் அதிக பிடிப்பு கிடைக்கும்.",
    },
    "purse seine": {
        "name_en": "Purse Seine",
        "name_ta": "சுற்றுவலை (Purse Seine)",
        "species_en": "Oil Sardine, Indian Mackerel, Anchovy (Nethili)",
        "species_ta": "மத்தி (Oil Sardine), கானாங்கெளுத்தி (Mackerel), நெத்திலி (Anchovy)",
        "tip_en": "Look for surface disturbance and diving seabirds indicating dense shoals.",
        "tip_ta": "பறவைகள் வட்டமிடும் மேற்பரப்பு மீன் கூட்டங்களை சுற்றி வளைக்கவும்.",
    },
}


# ---------------------------------------------------------------------------
# Database Schema Initialization
# ---------------------------------------------------------------------------
def init_user_tables() -> None:
    """Ensure fisherman_profiles and registration_sessions tables exist in SQLite."""
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS fisherman_profiles (
                phone TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                home_port TEXT DEFAULT 'Rameswaram',
                boat_name TEXT DEFAULT '',
                boat_reg_number TEXT DEFAULT '',
                gear_type TEXT DEFAULT 'Gillnet',
                language TEXT DEFAULT 'tamil',
                vessel_lat REAL DEFAULT 9.2876,
                vessel_lon REAL DEFAULT 79.3129,
                vessel_draft REAL DEFAULT 2.0,
                registered_at TEXT NOT NULL,
                last_active TEXT NOT NULL,
                active INTEGER DEFAULT 1
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS registration_sessions (
                phone TEXT PRIMARY KEY,
                step INTEGER DEFAULT 1,
                name TEXT DEFAULT '',
                home_port TEXT DEFAULT '',
                gear_type TEXT DEFAULT '',
                language TEXT DEFAULT '',
                updated_at TEXT NOT NULL
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_profiles_active ON fisherman_profiles (active);")
    logger.info("fisherman_profiles and registration_sessions tables initialized.")


def clean_phone(phone: str) -> str:
    """Normalize phone number to international E.164-like format."""
    raw = (phone or "").replace("whatsapp:", "").strip()
    digits = re.sub(r"[^\d+]", "", raw)
    if digits.startswith("+"):
        return digits
    if len(digits) == 10:
        return f"+91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    return f"+{digits}" if digits else "default"


def resolve_port(port_text: str) -> dict[str, Any]:
    """Resolve user-typed port text (English or Tamil) to canonical port metadata."""
    if not port_text:
        return PORT_DATA["rameswaram"]

    t = port_text.strip().lower()

    # Direct match or alias match
    for key, p in PORT_DATA.items():
        if key in t or p["name"].lower() in t or p["name_ta"] in port_text:
            return p

    # Fuzzy matches for common variations
    if "chen" in t or "சென்" in port_text or "madras" in t:
        return PORT_DATA["chennai"]
    if "tuti" in t or "thoothu" in t or "தூத்" in port_text:
        return PORT_DATA["tuticorin"]
    if "naga" in t or "நாக" in port_text:
        return PORT_DATA["nagapattinam"]
    if "kanya" in t or "குமரி" in port_text:
        return PORT_DATA["kanyakumari"]
    if "cudd" in t or "கடலூ" in port_text:
        return PORT_DATA["cuddalore"]
    if "manda" in t or "மண்ட" in port_text:
        return PORT_DATA["mandapam"]
    if "enno" in t or "எண்ணூ" in port_text:
        return PORT_DATA["ennore"]
    if "pamb" in t or "பாம்ப" in port_text:
        return PORT_DATA["pamban"]
    if "rames" in t or "இராமே" in port_text or "ராமே" in port_text:
        return PORT_DATA["rameswaram"]

    # Fallback default: Rameswaram with user's provided label
    clean_label = port_text.strip().title()
    return {
        "name": clean_label or "Rameswaram",
        "name_ta": clean_label or "ராமேஸ்வரம்",
        "lat": 9.2876,
        "lon": 79.3129,
        "draft": 2.0,
        "channel_depth": 5.0,
    }


def resolve_gear(gear_text: str) -> dict[str, str]:
    """Resolve user-typed gear description to canonical gear configuration."""
    t = (gear_text or "").strip().lower()
    if "trawl" in t or "இழுவலை" in gear_text or "டிரால்" in gear_text or "2" == t:
        return GEAR_SPECIES["trawl"]
    if "longline" in t or "தூண்டில்" in gear_text or "hook" in t or "line" in t or "3" == t:
        return GEAR_SPECIES["longline"]
    if "purse" in t or "சுற்று" in gear_text or "seine" in t or "4" == t:
        return GEAR_SPECIES["purse seine"]
    # Default to Gillnet
    return GEAR_SPECIES["gillnet"]


def resolve_language(lang_text: str) -> str:
    """Normalize language preference: 'tamil', 'english', or 'both'."""
    t = (lang_text or "").strip().lower()
    if "eng" in t or "ஆங்கிலம்" in lang_text or "2" == t:
        return "english"
    if "both" in t or "இரண்டு" in lang_text or "இருமொழி" in lang_text or "3" == t:
        return "both"
    return "tamil"


# ---------------------------------------------------------------------------
# Profile CRUD
# ---------------------------------------------------------------------------
def save_profile(
    phone: str,
    name: str,
    home_port: str = "Rameswaram",
    boat_name: str = "",
    boat_reg_number: str = "",
    gear_type: str = "Gillnet",
    language: str = "tamil",
    vessel_lat: Optional[float] = None,
    vessel_lon: Optional[float] = None,
    vessel_draft: Optional[float] = None,
    active: int = 1,
) -> dict[str, Any]:
    """Create or update a fisherman profile in SQLite."""
    init_user_tables()
    p_num = clean_phone(phone)
    now_iso = datetime.now(timezone.utc).isoformat()

    port_meta = resolve_port(home_port)
    lat = vessel_lat if vessel_lat is not None else port_meta["lat"]
    lon = vessel_lon if vessel_lon is not None else port_meta["lon"]
    draft = vessel_draft if vessel_draft is not None else port_meta["draft"]

    canonical_port = port_meta["name"]
    gear_meta = resolve_gear(gear_type)
    canonical_gear = gear_meta["name_en"]
    canonical_lang = resolve_language(language)

    with get_connection() as conn:
        conn.execute("""
            INSERT INTO fisherman_profiles (
                phone, name, home_port, boat_name, boat_reg_number,
                gear_type, language, vessel_lat, vessel_lon, vessel_draft,
                registered_at, last_active, active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(phone) DO UPDATE SET
                name = excluded.name,
                home_port = excluded.home_port,
                boat_name = CASE WHEN excluded.boat_name != '' THEN excluded.boat_name ELSE fisherman_profiles.boat_name END,
                boat_reg_number = CASE WHEN excluded.boat_reg_number != '' THEN excluded.boat_reg_number ELSE fisherman_profiles.boat_reg_number END,
                gear_type = excluded.gear_type,
                language = excluded.language,
                vessel_lat = excluded.vessel_lat,
                vessel_lon = excluded.vessel_lon,
                vessel_draft = excluded.vessel_draft,
                last_active = excluded.last_active,
                active = excluded.active;
        """, (
            p_num, name, canonical_port, boat_name, boat_reg_number,
            canonical_gear, canonical_lang, lat, lon, draft,
            now_iso, now_iso, active
        ))

        # Also keep legacy fishermen table in sync for backward compatibility
        conn.execute("""
            INSERT INTO fishermen (phone, name, home_port, language, active, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(phone) DO UPDATE SET
                name = excluded.name,
                home_port = excluded.home_port,
                language = excluded.language,
                active = excluded.active;
        """, (p_num, name, canonical_port, canonical_lang, active, now_iso))

    logger.info("Saved fisherman profile for %s (port=%s, gear=%s, lang=%s)", p_num, canonical_port, canonical_gear, canonical_lang)
    return get_profile(p_num) or {}


def get_profile(phone: str) -> Optional[dict[str, Any]]:
    """Fetch profile for phone number if registered."""
    init_user_tables()
    p_num = clean_phone(phone)
    with get_connection() as conn:
        row = conn.execute("""
            SELECT phone, name, home_port, boat_name, boat_reg_number,
                   gear_type, language, vessel_lat, vessel_lon, vessel_draft,
                   registered_at, last_active, active
            FROM fisherman_profiles
            WHERE phone = ?;
        """, (p_num,)).fetchone()
        if not row:
            return None
        return dict(row)


def update_last_active(phone: str) -> None:
    """Touch the last_active timestamp for a user."""
    init_user_tables()
    p_num = clean_phone(phone)
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        conn.execute("UPDATE fisherman_profiles SET last_active = ? WHERE phone = ?", (now_iso, p_num))


def update_location(phone: str, new_port: str) -> tuple[bool, str]:
    """Update user's home port and corresponding coordinates."""
    profile = get_profile(phone)
    if not profile:
        return False, "❌ நீங்கள் இன்னும் பதிவு செய்யவில்லை. *register* என அனுப்பவும்."

    port_meta = resolve_port(new_port)
    now_iso = datetime.now(timezone.utc).isoformat()

    with get_connection() as conn:
        conn.execute("""
            UPDATE fisherman_profiles
            SET home_port = ?, vessel_lat = ?, vessel_lon = ?, vessel_draft = ?, last_active = ?
            WHERE phone = ?
        """, (port_meta["name"], port_meta["lat"], port_meta["lon"], port_meta["draft"], now_iso, clean_phone(phone)))

        conn.execute("""
            UPDATE fishermen
            SET home_port = ?
            WHERE phone = ?
        """, (port_meta["name"], clean_phone(phone)))

    msg = (
        f"📍 *துறைமுகம் மாற்றப்பட்டது / Home Port Updated!*\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"புதிய துறைமுகம்: *{port_meta['name']}* ({port_meta['name_ta']})\n"
        f"அமைவிடம்: {port_meta['lat']:.4f}°N, {port_meta['lon']:.4f}°E\n\n"
        f"இனி உங்கள் கேள்விகள் மற்றும் காலை எச்சரிக்கைகள் {port_meta['name']} அடிப்படையில் கணக்கிடப்படும்."
    )
    return True, msg


def update_gear(phone: str, new_gear: str) -> tuple[bool, str]:
    """Update user's fishing gear type."""
    profile = get_profile(phone)
    if not profile:
        return False, "❌ நீங்கள் இன்னும் பதிவு செய்யவில்லை. *register* என அனுப்பவும்."

    gear_meta = resolve_gear(new_gear)
    now_iso = datetime.now(timezone.utc).isoformat()

    with get_connection() as conn:
        conn.execute("""
            UPDATE fisherman_profiles
            SET gear_type = ?, last_active = ?
            WHERE phone = ?
        """, (gear_meta["name_en"], now_iso, clean_phone(phone)))

    msg = (
        f"⛵ *படகு வகை மாற்றப்பட்டது / Gear Type Updated!*\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"புதிய வகை: *{gear_meta['name_en']}* ({gear_meta['name_ta']})\n"
        f"உகந்த மீன்கள்: {gear_meta['species_ta']}\n\n"
        f"💡 குறிப்பு: {gear_meta['tip_ta']}"
    )
    return True, msg


def toggle_alerts(phone: str, enabled: Optional[bool] = None) -> tuple[bool, str]:
    """Turn daily morning alerts on or off."""
    profile = get_profile(phone)
    if not profile:
        return False, "❌ நீங்கள் இன்னும் பதிவு செய்யவில்லை. *register* என அனுப்பவும்."

    p_num = clean_phone(phone)
    current = bool(profile.get("active", 1))
    new_status = not current if enabled is None else enabled
    now_iso = datetime.now(timezone.utc).isoformat()

    with get_connection() as conn:
        conn.execute("UPDATE fisherman_profiles SET active = ?, last_active = ? WHERE phone = ?", (1 if new_status else 0, now_iso, p_num))
        conn.execute("UPDATE fishermen SET active = ? WHERE phone = ?", (1 if new_status else 0, p_num))

    if new_status:
        msg = (
            "🔔 *காலை கடல் எச்சரிக்கை இயக்கப்பட்டது! (Alerts ON)*\n"
            "தினமும் காலை 5:00 மணிக்கு உங்கள் துறைமுக கடல் அறிக்கை அனுப்பப்படும்.\n\n"
            "Morning 5:00 AM alerts activated."
        )
    else:
        msg = (
            "🔕 *காலை கடல் எச்சரிக்கை நிறுத்தப்பட்டது (Alerts OFF)*\n"
            "காலை எச்சரிக்கை தற்காலிகமாக நிறுத்தப்பட்டுள்ளது. மீண்டும் பெற *my alerts on* என அனுப்பவும்.\n\n"
            "Morning alerts paused. Send *my alerts on* to resume."
        )
    return True, msg


def get_all_active_profiles() -> list[dict[str, Any]]:
    """Fetch all active registered profiles for daily scheduled morning alerts."""
    init_user_tables()
    with get_connection() as conn:
        rows = conn.execute("""
            SELECT phone, name, home_port, boat_name, boat_reg_number,
                   gear_type, language, vessel_lat, vessel_lon, vessel_draft,
                   registered_at, last_active, active
            FROM fisherman_profiles
            WHERE active = 1
            ORDER BY registered_at ASC;
        """).fetchall()
        return [dict(r) for r in rows]


def format_profile_message(profile: dict[str, Any]) -> str:
    """Render a clean profile summary card for WhatsApp."""
    name = profile.get("name") or "Fisherman"
    port = profile.get("home_port") or "Rameswaram"
    gear = profile.get("gear_type") or "Gillnet"
    lang = (profile.get("language") or "tamil").capitalize()
    lat = profile.get("vessel_lat", 9.2876)
    lon = profile.get("vessel_lon", 79.3129)
    status = "இயக்கத்தில் (ON)" if profile.get("active") else "நிறுத்தப்பட்டது (OFF)"

    gear_info = resolve_gear(gear)
    species = gear_info.get("species_ta", "")

    return (
        f"👤 *VARUNA மீனவர் சுயவிவரம் / Profile*\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"• பெயர் / Name: *{name}*\n"
        f"• துறைமுகம் / Port: *{port}* ({lat:.2f}°N, {lon:.2f}°E)\n"
        f"• படகு வகை / Gear: *{gear}*\n"
        f"• மொழி / Language: *{lang}*\n"
        f"• காலை அலர்ட் / Alerts: *{status}*\n"
        f"• முக்கிய மீன்கள்: {species}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"மாற்றங்கள் செய்ய:\n"
        f"• *update location [port]* — துறைமுகம் மாற்ற\n"
        f"• *update gear [gear]* — படகு வகை மாற்ற\n"
        f"• *my alerts off* / *my alerts on* — அலர்ட் கட்டுப்படுத்த"
    )


# ---------------------------------------------------------------------------
# Multi-Step WhatsApp Registration State Machine
# ---------------------------------------------------------------------------
def get_session(phone: str) -> Optional[dict[str, Any]]:
    """Retrieve ongoing registration session for a phone number."""
    init_user_tables()
    p_num = clean_phone(phone)
    with get_connection() as conn:
        row = conn.execute("SELECT phone, step, name, home_port, gear_type, language, updated_at FROM registration_sessions WHERE phone = ?", (p_num,)).fetchone()
        return dict(row) if row else None


def clear_session(phone: str) -> None:
    """Clear registration session."""
    init_user_tables()
    p_num = clean_phone(phone)
    with get_connection() as conn:
        conn.execute("DELETE FROM registration_sessions WHERE phone = ?", (p_num,))


def start_registration(phone: str) -> str:
    """Begin the 4-step registration interview flow."""
    init_user_tables()
    p_num = clean_phone(phone)
    now_iso = datetime.now(timezone.utc).isoformat()

    with get_connection() as conn:
        conn.execute("""
            INSERT INTO registration_sessions (phone, step, name, home_port, gear_type, language, updated_at)
            VALUES (?, 1, '', '', '', '', ?)
            ON CONFLICT(phone) DO UPDATE SET
                step = 1, name = '', home_port = '', gear_type = '', language = '', updated_at = excluded.updated_at;
        """, (p_num, now_iso))

    return "உங்கள் பெயர் என்ன? / What is your name?"


def handle_registration_step(phone: str, user_text: str) -> str:
    """Process user input through the registration state machine."""
    session = get_session(phone)
    if not session:
        return start_registration(phone)

    clean_text = user_text.strip()
    step = int(session.get("step", 1))
    now_iso = datetime.now(timezone.utc).isoformat()

    # Allow cancellation
    if clean_text.lower() in ("cancel", "exit", "stop", "ரத்து", "நிறுத்து"):
        clear_session(phone)
        return "❌ பதிவு ரத்து செய்யப்பட்டது. மீண்டும் பதிவு செய்ய *register* என அனுப்பவும்."

    # ── STEP 1: Name ──
    if step == 1:
        name = clean_text.replace("\n", " ").strip()
        if len(name) < 2:
            return "உங்கள் பெயர் என்ன? / What is your name?"

        with get_connection() as conn:
            conn.execute("UPDATE registration_sessions SET step = 2, name = ?, updated_at = ? WHERE phone = ?", (name, now_iso, clean_phone(phone)))

        return (
            "உங்கள் துறைமுகம்? / Your home port?\n"
            "(Rameswaram/Chennai/Tuticorin/etc)"
        )

    # ── STEP 2: Home Port ──
    if step == 2:
        port_meta = resolve_port(clean_text)
        port_name = port_meta["name"]

        with get_connection() as conn:
            conn.execute("UPDATE registration_sessions SET step = 3, home_port = ?, updated_at = ? WHERE phone = ?", (port_name, now_iso, clean_phone(phone)))

        return (
            "உங்கள் படகு வகை? / Boat gear type?\n"
            "(Gillnet/Trawl/Longline/Purse Seine)"
        )

    # ── STEP 3: Gear Type ──
    if step == 3:
        gear_meta = resolve_gear(clean_text)
        gear_name = gear_meta["name_en"]

        with get_connection() as conn:
            conn.execute("UPDATE registration_sessions SET step = 4, gear_type = ?, updated_at = ? WHERE phone = ?", (gear_name, now_iso, clean_phone(phone)))

        return "மொழி? / Language preference?\n(Tamil/English/Both)"

    # ── STEP 4: Language Preference & Finalization ──
    if step == 4:
        lang = resolve_language(clean_text)
        name = session.get("name") or "Fisherman"
        port = session.get("home_port") or "Rameswaram"
        gear = session.get("gear_type") or "Gillnet"

        # Save profile
        save_profile(
            phone=phone,
            name=name,
            home_port=port,
            gear_type=gear,
            language=lang,
            active=1,
        )
        clear_session(phone)

        return "✅ பதிவு முடிந்தது! VARUNA தினமும் காலை 5 மணிக்கு உங்களுக்கு கடல் நிலை அறிவிப்பு அனுப்பும்."

    # Unknown step reset
    clear_session(phone)
    return start_registration(phone)
