"""VARUNA Proactive Morning Alert & Emergency Weather Monitor.

Uses APScheduler to run:
1. Daily at 5:00 AM IST:
   - Fetches live Open-Meteo marine data + tomorrow's forecast + IMBL distance + PFZ status.
   - Generates bilingual Tamil + English advisory.
   - Broadcasts to all registered fishermen via Twilio WhatsApp API.

2. Every 30 minutes:
   - Evaluates if wave height > 2.5m or cyclone/extreme gust conditions exist.
   - If CRITICAL, broadcasts an immediate emergency storm alert to all registered users.

3. SQLite persistence:
   - Table `fishermen` (phone, name, home_port, language, active, created_at).

4. WhatsApp command handlers:
   - "register" -> register for alerts (English)
   - "unregister" -> unsubscribe from alerts
   - "அலர்ட் வேண்டும்" -> register for alerts (Tamil)
"""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.data.open_meteo import get_all_marine_data
from app.db.database import get_connection
from app.services.safety_engine import SafetyEngine

logger = logging.getLogger("varuna.scheduler")

# Canonical Rameswaram reference coordinates
RAMESWARAM_LAT = 9.9252
RAMESWARAM_LON = 79.3129
PFZ_TARGET_LAT = 9.28
PFZ_TARGET_LON = 79.31

IST_ZONE = ZoneInfo("Asia/Kolkata")

# Global scheduler instance
_scheduler: Optional[BackgroundScheduler] = None

# Track last critical broadcast to avoid spamming every 30m if conditions persist
_last_critical_broadcast_time: Optional[datetime] = None
CRITICAL_ALERT_COOLDOWN_HOURS = 2


# ══════════════════════════════════════════════════════════════════════════════
# 1. DATABASE SCHEMA & DAO FOR FISHERMEN
# ══════════════════════════════════════════════════════════════════════════════
def init_fishermen_table() -> None:
    """Ensure the fishermen table exists in the embedded SQLite database."""
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS fishermen (
                phone TEXT PRIMARY KEY,
                name TEXT,
                home_port TEXT DEFAULT 'Rameswaram',
                language TEXT DEFAULT 'tamil',
                active INTEGER DEFAULT 1,
                created_at TEXT NOT NULL
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_fishermen_active ON fishermen (active);")
    logger.info("Fishermen SQLite table initialized.")


def _clean_phone_number(phone: str) -> str:
    """Normalize phone number to digits with leading plus if international."""
    raw = (phone or "").replace("whatsapp:", "").strip()
    digits = re.sub(r"[^\d+]", "", raw)
    if digits.startswith("+"):
        return digits
    if len(digits) == 10:
        return f"+91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    return f"+{digits}" if digits else ""


def register_fisherman(
    phone: str,
    name: str = "Fisherman",
    home_port: str = "Rameswaram",
    language: str = "tamil",
) -> bool:
    """Register or re-activate a fisherman phone number for proactive alerts."""
    init_fishermen_table()
    clean_phone = _clean_phone_number(phone)
    if not clean_phone or len(clean_phone) < 8:
        logger.warning("Invalid phone number for registration: %s", phone)
        return False

    now_iso = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO fishermen (phone, name, home_port, language, active, created_at)
            VALUES (?, ?, ?, ?, 1, ?)
            ON CONFLICT(phone) DO UPDATE SET
                active = 1,
                language = excluded.language,
                name = CASE WHEN excluded.name != 'Fisherman' THEN excluded.name ELSE fishermen.name END,
                home_port = CASE WHEN excluded.home_port != 'Rameswaram' THEN excluded.home_port ELSE fishermen.home_port END
        """, (clean_phone, name, home_port, language, now_iso))

    logger.info("Fisherman registered successfully: %s (lang=%s)", clean_phone, language)
    return True


def unregister_fisherman(phone: str) -> bool:
    """Unsubscribe a fisherman from proactive alerts (sets active = 0)."""
    init_fishermen_table()
    clean_phone = _clean_phone_number(phone)
    if not clean_phone:
        return False

    with get_connection() as conn:
        cur = conn.execute("UPDATE fishermen SET active = 0 WHERE phone = ?", (clean_phone,))
        affected = cur.rowcount

    logger.info("Fisherman unregistered: %s (rows affected=%d)", clean_phone, affected)
    return True


def get_registered_fishermen(active_only: bool = True) -> list[dict]:
    """Retrieve list of registered fishermen."""
    init_fishermen_table()
    query = "SELECT phone, name, home_port, language, active, created_at FROM fishermen"
    if active_only:
        query += " WHERE active = 1"
    query += " ORDER BY created_at DESC"

    with get_connection() as conn:
        rows = conn.execute(query).fetchall()
        return [
            {
                "phone": r["phone"],
                "name": r["name"],
                "home_port": r["home_port"],
                "language": r["language"],
                "active": bool(r["active"]),
                "created_at": r["created_at"],
            }
            for r in rows
        ]


def get_registered_count(active_only: bool = True) -> int:
    """Return the total number of registered fishermen."""
    init_fishermen_table()
    query = "SELECT COUNT(*) FROM fishermen"
    if active_only:
        query += " WHERE active = 1"

    with get_connection() as conn:
        return int(conn.execute(query).fetchone()[0])


# ══════════════════════════════════════════════════════════════════════════════
# 2. TWILIO WHATSAPP MESSAGING
# ══════════════════════════════════════════════════════════════════════════════
def send_whatsapp_message(to_phone: str, body: str) -> bool:
    """Send a WhatsApp message via Twilio REST Client."""
    account_sid = os.getenv("TWILIO_ACCOUNT_SID") or os.getenv("TWILIO_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN") or os.getenv("TWILIO_TOKEN")
    from_number = (
        os.getenv("TWILIO_WHATSAPP_FROM")
        or os.getenv("TWILIO_WHATSAPP_NUMBER")
        or "whatsapp:+14155238886"
    )

    clean_phone = _clean_phone_number(to_phone)
    if not clean_phone:
        return False

    to_whatsapp = f"whatsapp:{clean_phone}"

    if not account_sid or not auth_token:
        logger.warning(
            "Twilio credentials not set (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN). WhatsApp to %s simulated:\n%s",
            to_whatsapp, body[:150]
        )
        return False

    try:
        from twilio.rest import Client
        client = Client(account_sid, auth_token)
        msg = client.messages.create(
            from_=from_number,
            to=to_whatsapp,
            body=body,
        )
        logger.info("WhatsApp message sent to %s, SID: %s", to_whatsapp, msg.sid)
        return True
    except Exception as exc:
        logger.error("Twilio send failed for %s: %s", to_whatsapp, exc)
        return False


def broadcast_to_registered(body: str) -> int:
    """Send an advisory or alert to all active registered fishermen. Returns sent count."""
    fishermen = get_registered_fishermen(active_only=True)
    if not fishermen:
        logger.info("No active registered fishermen to broadcast to.")
        return 0

    sent = 0
    for f in fishermen:
        phone = f["phone"]
        if send_whatsapp_message(phone, body):
            sent += 1
    logger.info("Broadcast completed: %d/%d messages delivered.", sent, len(fishermen))
    return sent


# ══════════════════════════════════════════════════════════════════════════════
# 3. ADVISORY & HAZARD GENERATORS
# ══════════════════════════════════════════════════════════════════════════════
def generate_morning_advisory(lat: float = RAMESWARAM_LAT, lon: float = RAMESWARAM_LON) -> str:
    """Fetch live Open-Meteo marine data and format bilingual morning advisory."""
    se = SafetyEngine()

    # 1. Fetch live marine data
    marine = get_all_marine_data(lat, lon)
    wave = float(marine.get("wave_height_m", 0.6) or 0.6)
    wind = float(marine.get("wind_knots", marine.get("wind_speed_knots", 8.0)) or 8.0)
    gust = float(marine.get("gust_knots", 0) or 0)
    sst = float(marine.get("sst_celsius", 31.0) or 31.0)

    # 2. Derive tomorrow's forecast
    forecast_waves = marine.get("forecast_waves", [])
    if len(forecast_waves) >= 48:
        tomorrow_wave = max(forecast_waves[24:48])
    else:
        tomorrow_wave = marine.get("max_wave_24h", wave)

    # 3. Calculate calmest 3-hour window
    best_time_str = "காலை 06:00 - 09:00 IST / 06:00-09:00 IST"
    if forecast_waves and len(forecast_waves) >= 24:
        min_w = float("inf")
        best_hr = 0
        for i in range(min(len(forecast_waves), 24) - 2):
            avg = sum(forecast_waves[i:i + 3]) / 3
            if avg < min_w:
                min_w = avg
                best_hr = i
        ist_hr = (best_hr + 5) % 24
        end_ist = (ist_hr + 3) % 24
        best_time_str = f"{ist_hr:02d}:00-{end_ist:02d}:00 IST (~{min_w:.1f}m)"

    # 4. Sea condition classification
    if wave < 0.5 and wind < 10:
        cond_en, cond_ta = "EXCELLENT", "மிக நல்ல நிலை"
    elif wave < 1.0 and wind < 15:
        cond_en, cond_ta = "GOOD", "நல்ல நிலை"
    elif wave < 1.5 and wind < 20:
        cond_en, cond_ta = "FAIR", "ஏற்றுக்கொள்ளக்கூடிய நிலை"
    elif wave < 2.5 and wind < 30:
        cond_en, cond_ta = "POOR", "மோசமான நிலை"
    else:
        cond_en, cond_ta = "DANGEROUS", "ஆபத்தான நிலை"

    # 5. IMBL distance & bearing to PFZ target
    imbl_nm = se.imbl_distance(lat, lon)
    imbl_status = "CRITICAL" if imbl_nm < 2 else "CAUTION" if imbl_nm < 5 else "SAFE"
    imbl_status_ta = "ஆபத்து" if imbl_nm < 2 else "எச்சரிக்கை" if imbl_nm < 5 else "பாதுகாப்பானது"

    pfz_bearing = se.calculate_bearing(lat, lon, PFZ_TARGET_LAT, PFZ_TARGET_LON)
    pfz_dist = se.haversine(lat, lon, PFZ_TARGET_LAT, PFZ_TARGET_LON)
    fuel_liters = round(pfz_dist * 2 * 2.5, 0)

    # 6. Recommendation
    if wave > 2.5 or wind > 30 or imbl_nm < 2:
        rec_en = "🚨 DO NOT venture out to sea."
        rec_ta = "🚨 கடலுக்குச் செல்ல வேண்டாம்."
    elif wave > 1.5 or wind > 20 or imbl_nm < 5:
        rec_en = "⚠️ Exercise caution. Stay close to shore."
        rec_ta = "⚠️ எச்சரிக்கையுடன் செல்லவும். கரைக்கு அருகில் இருக்கவும்."
    else:
        rec_en = "✅ Safe to go fishing."
        rec_ta = "✅ கடலுக்குச் செல்லலாம்."

    now_ist = datetime.now(IST_ZONE).strftime("%d-%m-%Y | 05:00 AM")

    advisory = (
        f"🌅 *VARUNA காலை கடல் அறிக்கை / MORNING ADVISORY*\n"
        f"📅 {now_ist} | 📍 Rameswaram Coast\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"🌊 *வானிலை & கடல் நிலை / Weather & Sea Condition*: {cond_ta} ({cond_en})\n"
        f"• அலை / Wave: {wave:.2f}m | காற்று / Wind: {wind:.1f}kn\n"
        f"{f'• காற்று வேகம் / Gust: {gust:.1f}kn\n' if gust > wind else ''}"
        f"• சிறந்த நேரம் / Best Window: {best_time_str}\n"
        f"• நாளை அலை / Tomorrow Wave: ~{tomorrow_wave:.2f}m\n\n"
        f"🐟 *மீன்பிடி மண்டலம் / PFZ Zone*:\n"
        f"• தூரம்: {pfz_dist:.1f} NM @ {pfz_bearing:.0f}° திசை\n"
        f"• டீசல் மதிப்பீடு: ~{fuel_liters:.0f}L (round trip)\n\n"
        f"🚨 *எல்லை / IMBL*: {imbl_nm:.1f} NM — {imbl_status_ta} ({imbl_status})\n"
        f"🌡️ SST: {sst:.1f}°C\n\n"
        f"📋 *பரிந்துரை / Advice*:\n"
        f"{rec_ta}\n"
        f"{rec_en}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"📡 நேரடி தரவு: Open-Meteo Marine Live + Copernicus\n"
        f"தகவலுக்கு: *help* அல்லது *unregister* என அனுப்பவும்."
    )
    return advisory


def check_critical_weather(lat: float = RAMESWARAM_LAT, lon: float = RAMESWARAM_LON) -> tuple[bool, str]:
    """Check if sea condition is CRITICAL (wave > 2.5m or cyclone/extreme gust risk)."""
    try:
        marine = get_all_marine_data(lat, lon)
        wave = float(marine.get("wave_height_m", 0) or 0)
        wind = float(marine.get("wind_knots", marine.get("wind_speed_knots", 0)) or 0)
        gust = float(marine.get("gust_knots", 0) or 0)

        cyclone_risk = False
        cyclone_level = "NONE"

        # Cyclone / Severe storm detection proxy
        if wind > 0:
            gust_ratio = gust / wind if wind > 0 else 0
            if gust > 40 or (gust_ratio > 1.8 and wind > 20):
                cyclone_risk = True
                cyclone_level = "HIGH (புயல் எச்சரிக்கை)"
            elif gust > 30 or (gust_ratio > 1.5 and wind > 18):
                cyclone_level = "MODERATE (கடுமையான காற்று)"

        is_critical = (wave > 2.5) or (wind > 32) or cyclone_risk

        if not is_critical:
            return False, ""

        now_ist = datetime.now(IST_ZONE).strftime("%I:%M %p IST")
        alert_msg = (
            f"🚨 *VARUNA அவசர எச்சரிக்கை / CRITICAL STORM ALERT* 🚨\n"
            f"⏰ நேரம்: {now_ist} | 📍 Rameswaram / Palk Bay\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"⚠️ கடல் நிலை மிக ஆபத்தானது! Sea conditions are dangerous!\n\n"
            f"🌊 அலை உயரம் / Wave: *{wave:.2f}m* (அபாய வரம்பு > 2.5m)\n"
            f"💨 காற்று வேகம் / Wind: *{wind:.1f}kn* | Gust: *{gust:.1f}kn*\n"
            f"🌪️ புயல் நிலை / Storm Risk: *{cyclone_level}*\n\n"
            f"⛔ *எச்சரிக்கை / DANGER:*\n"
            f"• கடலுக்குச் செல்ல வேண்டாம்! DO NOT VENTURE OUT TO SEA!\n"
            f"• கடலில் உள்ள படகுகள் உடனடியாக கரை திரும்பவும்.\n"
            f"  Vessels at sea must return to port immediately.\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"📡 நேரடி வானிலை கண்காணிப்பு: Open-Meteo Live"
        )
        return True, alert_msg
    except Exception as exc:
        logger.error("Critical weather check failed: %s", exc)
        return False, ""


# ══════════════════════════════════════════════════════════════════════════════
# 4. SCHEDULED JOBS
# ══════════════════════════════════════════════════════════════════════════════
def run_morning_alerts() -> None:
    """Daily 5:00 AM IST scheduled job."""
    logger.info("Executing daily 5:00 AM IST morning marine advisory job...")
    try:
        advisory = generate_morning_advisory()
        sent = broadcast_to_registered(advisory)
        logger.info("Daily morning advisory completed. Sent to %d fishermen.", sent)
    except Exception as exc:
        logger.exception("Error in morning advisory scheduled job: %s", exc)


def run_hazard_monitor() -> None:
    """30-minute interval hazard monitor."""
    global _last_critical_broadcast_time
    logger.debug("Running 30-minute critical weather monitor...")
    try:
        is_critical, alert_msg = check_critical_weather()
        if not is_critical:
            return

        now = datetime.now(timezone.utc)
        # Check cooldown to prevent flooding subscribers every 30m
        if _last_critical_broadcast_time is not None:
            hours_since = (now - _last_critical_broadcast_time).total_seconds() / 3600
            if hours_since < CRITICAL_ALERT_COOLDOWN_HOURS:
                logger.info("Critical conditions persist, skipping duplicate broadcast (cooldown %.1fh remaining).",
                            CRITICAL_ALERT_COOLDOWN_HOURS - hours_since)
                return

        logger.warning("CRITICAL weather conditions detected! Broadcasting alert to fishermen...")
        sent = broadcast_to_registered(alert_msg)
        _last_critical_broadcast_time = now
        logger.warning("Critical weather alert broadcast to %d fishermen.", sent)
    except Exception as exc:
        logger.exception("Error in hazard monitor scheduled job: %s", exc)


# ══════════════════════════════════════════════════════════════════════════════
# 5. SCHEDULER LIFECYCLE CONTROLS
# ══════════════════════════════════════════════════════════════════════════════
def start_scheduler() -> BackgroundScheduler:
    """Start the APScheduler background thread with morning and hazard jobs."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        logger.info("Scheduler already running.")
        return _scheduler

    init_fishermen_table()

    _scheduler = BackgroundScheduler(timezone=IST_ZONE)

    # Job 1: Every day at 5:00 AM IST
    _scheduler.add_job(
        run_morning_alerts,
        trigger=CronTrigger(hour=5, minute=0, timezone=IST_ZONE),
        id="varuna_morning_alert",
        name="Daily 5:00 AM IST Morning Advisory",
        replace_existing=True,
    )

    # Job 2: Every 30 minutes
    _scheduler.add_job(
        run_hazard_monitor,
        trigger=IntervalTrigger(minutes=30),
        id="varuna_hazard_monitor",
        name="30-minute Hazard Monitor",
        replace_existing=True,
    )

    _scheduler.start()
    logger.info("APScheduler started with jobs: %s", [j.name for j in _scheduler.get_jobs()])
    return _scheduler


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped.")
        _scheduler = None
