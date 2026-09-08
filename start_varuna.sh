#!/bin/bash
# Start the full VARUNA stack. Run from the repo root.
set -m
echo "🌊 Starting VARUNA Maritime Intelligence Platform..."
echo ""

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "Starting FastAPI backend on port 8000..."
uvicorn app.main:app --reload --port 8000 &

echo "Starting WhatsApp bot on port 5000..."
python -m app.run_whatsapp &

echo "Starting Next.js frontend on port 3000..."
( cd frontend && npm run dev ) &

echo ""
echo "✅ VARUNA is online!"
echo "🌐 Dashboard:      http://localhost:3000"
echo "⚡ API Docs:       http://localhost:8000/docs"
echo "📱 WhatsApp Bot:   http://localhost:5000/whatsapp"
echo ""
echo "Expose the bot:   ngrok http 5000"
echo "Twilio webhook:   https://<ngrok-url>/whatsapp"
echo ""
echo "Press Ctrl+C to stop all services."
wait
