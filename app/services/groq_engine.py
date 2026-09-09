import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")


def get_groq_client() -> Groq:
    key = os.environ.get("GROQ_API_KEY", GROQ_API_KEY)
    if not key:
        raise ValueError("GROQ_API_KEY environment variable is not set")
    return Groq(api_key=key)


VARUNA_SYSTEM_PROMPT = """You are VARUNA, 
an AI marine safety assistant for Indian 
fishermen in Tamil Nadu.

Current real-time data:
- Sea Surface Temperature: 31.1°C
- Wave Height: 0.78m
- Wind Speed: 12.1 knots  
- Chlorophyll: 1.09 mg/m³
- IMBL Distance: 11.57 NM (safe)
- Nearest PFZ: 38.7 NM at 180°
- Location: Bay of Bengal, Rameswaram coast

You answer questions about:
- Fish species and where to catch them
- Fishing gear recommendations
- Fuel/diesel calculations
- Weather and sea safety
- Fishing regulations and boundaries
- Best fishing times and seasons
- Marine navigation advice

Always reply in this format:
Tamil response first (3-4 lines max)
Then: ─────────────────
Then: English response (3-4 lines max)
Keep total under 150 words.

Rules:
- Always reply in the exact bilingual format above
- Max 5 lines per language. No long paragraphs
- Always use the real-time data above
- Give practical, actionable advice
- Always mention data source at end
- Never give wrong safety information
- For IMBL/border questions always warn

When user mentions a location and asks where to fish:
1. Acknowledge their location
2. Give specific fishing ground name
3. Give compass heading direction (e.g. Northeast 045°)
4. Give nautical miles distance
5. Mention what fish species to expect
6. Give diesel calculation
7. State safety status

Known Tamil Nadu fishing grounds:
- Marina Beach/Chennai/Ennore → Northeast (045°) 45-60 NM → Ennore fishing grounds → Tuna, Seer Fish
- Rameswaram → Southeast (135°) 20-40 NM → Palk Bay → Mackerel, Sardine
- Tuticorin → South (180°) 30-50 NM → Gulf of Mannar → Tuna, Prawns
- Nagapattinam → East (090°) 30-50 NM → Bay of Bengal → Sardine, Mackerel
- Kanyakumari → Southwest (225°) 20-30 NM → Indian Ocean → Tuna, Swordfish
"""


def ask_groq(user_message: str) -> str:
    try:
        client = get_groq_client()
        # Get fresh real data
        from app.data.open_meteo import get_all_marine_data

        marine = get_all_marine_data(9.9252, 79.3129)
        sst = marine.get("sst_celsius", 31.1)
        wave = marine.get("wave_height_m", 0.78)
        wind = marine.get("wind_knots", 12.1)

        # Update system prompt with live data
        system = (
            VARUNA_SYSTEM_PROMPT.replace("31.1°C", f"{sst}°C")
            .replace("0.78m", f"{wave}m")
            .replace("12.1 knots", f"{wind} knots")
        )

        try:
            response = client.chat.completions.create(
                model="qwen/qwen3.6-27b",
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_message},
                ],
                reasoning_effort="none",
                max_tokens=300,
                temperature=0.3,
            )
        except Exception:
            response = client.chat.completions.create(
                model="llama3-8b-8192",
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_message},
                ],
                max_tokens=300,
                temperature=0.3,
            )

        answer = response.choices[0].message.content
        return answer + "\n\n📡 தரவு: VARUNA AI + Open-Meteo Live"

    except Exception as e:
        return (
            "⚠️ VARUNA AI தற்போது கிடைக்கவில்லை. "
            "மீண்டும் முயற்சிக்கவும்.\n"
            f"Error: {str(e)}"
        )
