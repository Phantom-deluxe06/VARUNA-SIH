@echo off
REM Start the full VARUNA stack. Run from the repo root.
echo Starting VARUNA Maritime Intelligence Platform...
echo.

start "VARUNA API" cmd /k "uvicorn app.main:app --reload --port 8000"
start "VARUNA WhatsApp" cmd /k "python -m app.run_whatsapp"
start "VARUNA Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo VARUNA is online!
echo   Dashboard:     http://localhost:3000
echo   API Docs:      http://localhost:8000/docs
echo   WhatsApp Bot:  http://localhost:5000/whatsapp
echo.
echo Expose the bot with:  ngrok http 5000
echo Then set the Twilio sandbox webhook to https://[ngrok-url]/whatsapp
echo.
pause
