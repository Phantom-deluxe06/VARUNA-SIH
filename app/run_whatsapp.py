"""Start the VARUNA WhatsApp bot (Flask) on port 5000.

Run from the repo root:  ``python -m app.run_whatsapp``
"""

from __future__ import annotations

import sys

# Windows consoles default to cp1252 - force UTF-8 so Tamil / box-drawing
# characters in logs and advisories never crash the process.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except Exception:
        pass

from app.whatsapp_bot import app

_BANNER = r"""
============================================================
  VARUNA WhatsApp Bot  ->  http://localhost:5000/whatsapp
============================================================

  1. Install ngrok:      https://ngrok.com/download
  2. Expose the bot:     ngrok http 5000
  3. Copy the https URL, e.g.  https://ab12cd34.ngrok-free.app
  4. Twilio Console -> Messaging -> Try it out -> WhatsApp sandbox
     Set "When a message comes in" to:
         https://<ngrok-id>.ngrok-free.app/whatsapp     (HTTP POST)
  5. From your phone, join the sandbox:
         WhatsApp +1 415 523 8886  ->  send "join <sandbox-code>"
  6. Send "hi" to VARUNA.

============================================================
"""


def main() -> None:
    print(_BANNER)
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)


if __name__ == "__main__":
    main()
