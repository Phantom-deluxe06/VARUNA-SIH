"""VARUNA Tamil advisory engine — deterministic bilingual templates.

Not a machine-translation model: these are curated Tamil templates filled with
the *real* numbers coming from Open-Meteo (waves/wind) and NOAA ERDDAP /
Copernicus (SST/chlorophyll). This keeps safety-critical wording exact and the
response instant and offline-safe.

Covers the five canonical fisherman queries:

    மீன் எங்க இருக்கு        -> pfz
    கடல் safe-ஆ இருக்கா      -> safety
    எல்லை எவ்வளவு தூரம்      -> border
    அலை உயரம் என்ன          -> wave
    நாளைக்கு போகலாமா        -> tomorrow
"""

from __future__ import annotations

from typing import Optional

_KIND_KEYWORDS: dict[str, tuple[str, ...]] = {
    "tomorrow": ("நாளை", "நாளைக்கு", "tomorrow"),
    "border": ("எல்லை", "imbl", "border", "இலங்கை", "lanka"),
    "wave": ("அலை உயரம்", "அலை என்ன", "wave height", "அலை"),
    "pfz": ("மீன் எங்க", "மீன்", "meen", "pfz", "fish", "மீன்பிடி"),
    "safety": ("safe", "பாதுகாப்பு", "பாதுகாப்பா", "கடல் நிலை", "போகலாமா", "safety"),
}


def classify(text: str) -> Optional[str]:
    """Map a raw query to one of the five template kinds (or None)."""
    low = (text or "").strip().lower()
    if not low:
        return None
    for kind in ("tomorrow", "border", "wave", "pfz", "safety"):
        if any(tok in low for tok in _KIND_KEYWORDS[kind]):
            return kind
    return None


def _n(value, digits: int = 1) -> str:
    if value is None:
        return "—"
    try:
        return f"{round(float(value), digits):g}"
    except (TypeError, ValueError):
        return str(value)


def data_line(source_label: str) -> str:
    return f"\n📡 தரவு: {source_label}"


# --------------------------------------------------------------------------- #
# Templates
# --------------------------------------------------------------------------- #
def pfz_advisory(
    *,
    sst: float,
    chl: float,
    bearing: float,
    distance_nm: float,
    is_pfz: bool,
    confidence: Optional[float] = None,
    source_label: str = "NOAA + Open-Meteo",
) -> str:
    verdict = (
        "மீன்பிடிப்புக்கு ஏற்ற சூழல் உள்ளது — அந்த திசையில் செல்லுங்கள்."
        if is_pfz
        else "இப்போது வலுவான மீன் மண்டலம் இல்லை; சூழலைக் கண்காணியுங்கள்."
    )
    conf = f" (நம்பகத்தன்மை {int(round(confidence * 100))}%)" if confidence is not None else ""
    return (
        "🐟 *மீன் மண்டலம் / PFZ*\n"
        f"அருகிலுள்ள மீன் மண்டலம் {_n(distance_nm)} கடல் மைல் தொலைவில், "
        f"{_n(bearing, 0)}° திசையில்.\n"
        f"கடல்பரப்பு வெப்பநிலை {_n(sst, 2)}°C, குளோரோபில் {_n(chl, 2)} mg/m³.\n"
        f"{verdict}{conf}"
        + data_line(source_label)
    )


def safety_advisory(
    *,
    wave: float,
    wind: float,
    gust: Optional[float] = None,
    imbl_nm: Optional[float] = None,
    status: str = "SAFE",
    source_label: str = "NOAA + Open-Meteo",
) -> str:
    head = {
        "SAFE": "✅ கடல் பயணம் பாதுகாப்பானது.",
        "CAUTION": "⚠️ எச்சரிக்கையுடன் செல்லுங்கள்.",
        "CRITICAL": "🛑 அபாயம் — இன்று கடலுக்கு செல்ல வேண்டாம்.",
    }.get(status, "கடல் நிலை தகவல்:")
    gust_txt = f" (சடுதிக் காற்று {_n(gust)})" if gust is not None else ""
    imbl_txt = (
        f"\nஎல்லைக்கோடு {_n(imbl_nm)} கடல் மைல் தொலைவில் — கவனமாக இருங்கள்."
        if imbl_nm is not None and imbl_nm < 5
        else ""
    )
    return (
        "🌊 *கடல் பாதுகாப்பு*\n"
        f"{head}\n"
        f"அலை உயரம் {_n(wave)} மீட்டர், காற்று {_n(wind)} நாட்டிகல் மைல்{gust_txt}."
        f"{imbl_txt}"
        + data_line(source_label)
    )


def border_advisory(
    *,
    imbl_nm: float,
    inside: bool = False,
    status: str = "SAFE",
    source_label: str = "Haversine geometry",
) -> str:
    if inside:
        verdict = "நீங்கள் தடைசெய்யப்பட்ட மண்டலத்தில் உள்ளீர்கள் — உடனே மேற்கு நோக்கி திரும்பவும்!"
    elif status == "CRITICAL" or imbl_nm < 2:
        verdict = "எல்லைக்கு மிக அருகில் — உடனடியாக திசையை மாற்றுங்கள்."
    elif status == "CAUTION" or imbl_nm < 5:
        verdict = "எச்சரிக்கை மண்டலத்தில் — கவனமாக செல்லுங்கள்."
    else:
        verdict = "பாதுகாப்பான தொலைவில் உள்ளீர்கள்."
    return (
        "🚨 *சர்வதேச கடல் எல்லை (IMBL)*\n"
        f"தற்போதைய இடத்திலிருந்து {_n(imbl_nm)} கடல் மைல் தொலைவில்.\n"
        f"{verdict}"
        + data_line(source_label)
    )


def wave_advisory(
    *,
    wave: float,
    period: Optional[float] = None,
    wind: Optional[float] = None,
    source_label: str = "Open-Meteo",
) -> str:
    if wave < 1.0:
        qual = "அமைதியான கடல்."
    elif wave <= 2.0:
        qual = "மிதமான கடல் — சாதாரண முன்னெச்சரிக்கை."
    else:
        qual = "கடினமான கடல் — சிறிய படகுகள் தவிர்க்கவும்."
    period_txt = f" (சுழற்சி {_n(period)} விநாடி)" if period is not None else ""
    wind_txt = f" காற்று {_n(wind)} நாட்டிகல் மைல்." if wind is not None else ""
    return (
        "🌊 *அலை உயரம்*\n"
        f"தற்போது {_n(wave)} மீட்டர்{period_txt}.{wind_txt}\n"
        f"{qual}"
        + data_line(source_label)
    )


def tomorrow_advisory(
    *,
    date: str,
    wave: float,
    wind: Optional[float] = None,
    gust: Optional[float] = None,
    source_label: str = "Open-Meteo forecast",
) -> str:
    safe = wave <= 2.0 and (wind is None or wind < 25.0)
    verdict = (
        "நாளை கடலுக்கு செல்லலாம் — நிலை சாதகமாக உள்ளது."
        if safe
        else "நாளை பயணத்தை தள்ளிவைப்பது நல்லது — கடல் கடினமாக இருக்கும்."
    )
    gust_txt = f" (சடுதி {_n(gust)})" if gust is not None else ""
    wind_txt = f", காற்று {_n(wind)} நாட்டிகல் மைல்{gust_txt}" if wind is not None else ""
    return (
        "📅 *நாளைய கணிப்பு*\n"
        f"{date}: அதிகபட்ச அலை {_n(wave)} மீட்டர்{wind_txt}.\n"
        f"{verdict}"
        + data_line(source_label)
    )


_RENDERERS = {
    "pfz": pfz_advisory,
    "safety": safety_advisory,
    "border": border_advisory,
    "wave": wave_advisory,
    "tomorrow": tomorrow_advisory,
}


def render(kind: str, **data) -> str:
    """Dispatch to the template for ``kind`` (raises KeyError on unknown kind)."""
    return _RENDERERS[kind](**data)
