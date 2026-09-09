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

Rules:
- Always use the real-time data above
- Give practical, actionable advice
- Keep answers under 200 words
- If asked in Tamil, reply in Tamil
- If asked in English, reply in English
- Always mention data source at end
- Never give wrong safety information
- For IMBL/border questions always warn

When user mentions a location and asks where to fish:
1. Acknowledge their location
2. Give specific compass heading direction
3. Give nautical miles distance
4. Name the fishing ground
5. Mention what fish species to expect
6. Give safety warning if near IMBL

Known Tamil Nadu fishing grounds:
- Chennai/Ennore → Northeast 40-60NM → Bay of Bengal → Tuna, Seer Fish
- Rameswaram → Southeast 20-40NM → Palk Bay → Mackerel, Sardine
- Tuticorin → South 30-50NM → Gulf of Mannar → Tuna, Prawns
- Nagapattinam → East 30-50NM → Bay of Bengal → Sardine, Mackerel
- Kanyakumari → Southwest 20-30NM → Indian Ocean → Tuna, Swordfish
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
