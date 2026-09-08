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
    app.logger.info("WhatsApp in from %s: %s", sender, body)
    reply = whatsapp_core.handle_message(body)
    return Response(whatsapp_core.twiml(reply), mimetype="application/xml")


def main() -> None:
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)


if __name__ == "__main__":
    main()
