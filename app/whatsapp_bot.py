"""VARUNA WhatsApp bot — Twilio webhook (Flask).

Receives inbound WhatsApp messages from the Twilio sandbox, runs them through
the VARUNA intelligence engine in-process (see :mod:`app.whatsapp_core`), and
replies with a bilingual maritime advisory as TwiML.

Run:  ``python -m app.whatsapp_bot``  (or ``python -m app.run_whatsapp``)
"""

from __future__ import annotations

import sys

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except Exception:
        pass

from flask import Flask, Response, request

from app import whatsapp_core

app = Flask(__name__)


@app.get("/whatsapp")
def whatsapp_health() -> str:
    return "VARUNA WhatsApp bot is running. Point the Twilio sandbox webhook here (POST)."


@app.post("/whatsapp")
def whatsapp_webhook() -> Response:
    body = request.values.get("Body", "")
    sender = request.values.get("From", "unknown")
    lat = request.values.get("Latitude")
    lon = request.values.get("Longitude")
    if lat:
        try:
            lat = float(lat)
        except (ValueError, TypeError):
            lat = None
    if lon:
        try:
            lon = float(lon)
        except (ValueError, TypeError):
            lon = None

    num_media = 0
    try:
        num_media = int(request.values.get("NumMedia", 0) or 0)
    except (ValueError, TypeError):
        num_media = 0

    if num_media > 0:
        media_url = request.values.get("MediaUrl0", "")
        media_type = request.values.get("MediaContentType0", "")

        if "audio" in media_type:
            from app.services.voice_engine import transcribe_voice

            transcribed = transcribe_voice(media_url)
            if transcribed and transcribed.strip():
                clean_text = transcribed.strip()
                app.logger.info("WhatsApp voice in from %s: '%s'", sender, clean_text)
                normal_reply = whatsapp_core.handle_message(clean_text, phone=sender, lat=lat, lon=lon)
                reply = f"🎤 கேட்டேன்: {clean_text}\n━━━━━━━━━━━\n{normal_reply}"
            else:
                app.logger.warning("WhatsApp voice transcription failed for %s from %s", sender, media_url)
                reply = (
                    "🎤 குரல் தெளிவாக இல்லை.\n"
                    "தயவுசெய்து மீண்டும் முயற்சிக்கவும்.\n"
                    "Voice not clear. Please try again."
                )
            return Response(whatsapp_core.twiml(reply), mimetype="application/xml")

    app.logger.info("WhatsApp in from %s (lat=%s, lon=%s): %s", sender, lat, lon, body)
    reply = whatsapp_core.handle_message(body, phone=sender, lat=lat, lon=lon)
    return Response(whatsapp_core.twiml(reply), mimetype="application/xml")


def main() -> None:
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)


if __name__ == "__main__":
    main()
