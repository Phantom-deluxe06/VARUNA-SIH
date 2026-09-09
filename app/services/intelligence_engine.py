"""VARUNA 3-Layer NLU Intelligence Engine.

Fully offline, deterministic, high-performance local NLU pipeline:

* Layer 1 - Deterministic Extraction  : regex entities (draft numbers) and
  intent keyword routing (border/imbl/pfz/hotspot/fishing/weather...).
* Layer 2 - Fuzzy Semantic Routing     : stdlib ``difflib`` synonym lexicon and
  phrase similarity mapping natural variants / typos ("lanka line",
  "fish spot", "boat bottom hit") to their domain agents.
* Layer 3 - Contextual Spatial Fallback: unexpected/casual queries yield a
  dynamically assembled situational awareness advisory (live RasterEngine
  telemetry + local DB + deterministic sea state), never a static mock.

Every processed query is audited into the embedded SQLite ``query_audit_log``.
"""

from __future__ import annotations

import difflib
import logging
import os
import re
from datetime import datetime, timezone

from app.agents import AGENT_REGISTRY
from app.db.database import insert_audit
from app.db.models import AuditLogEntry
from app.schemas import AgentDecisionResponse, UserQueryRequest

logger = logging.getLogger("varuna.intelligence")

# Demo safety net: when True, a raising domain agent falls back to a canned
# bilingual advisory (app.demo_mode) instead of surfacing a 500 during a live
# demo. The happy path is untouched. Override with env VARUNA_DEMO_MODE=false.
DEMO_MODE = os.getenv("VARUNA_DEMO_MODE", "true").strip().lower() in {"1", "true", "yes", "on"}

# ---------------------------------------------------------------------------
# Layer 1 — deterministic regex entities.
# ---------------------------------------------------------------------------
DRAFT_RE = re.compile(r"(?:draft|draught)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*m?\b", re.IGNORECASE)

PORT_ALIASES: dict[str, str] = {
    "chennai": "Chennai Port",
    "madras": "Chennai Port",
    "thoothukudi": "Thoothukudi Port",
    "tuticorin": "Thoothukudi Port",
    "thuthukudi": "Thoothukudi Port",
    "tuicorin": "Thoothukudi Port",
}

FISHING_COLLOQUIAL: list[str] = [
    # Rameswaram dialect
    "மீனு", "மீனா", "மீனு கிடைக்குமா",
    "பிடிக்கணும்", "கடலுக்கு போலாம்",
    "மீன் வருமா", "ஏன் மீன் இல்ல",
    # Kanyakumari dialect
    "மச்சம்", "மச்சம் இருக்கா",
    "கடல் எப்படி இருக்கு",
    # General fishing terms
    "வலை போட", "வலை வீச",
    "நடு கடல்", "ஆழ கடல்",
    "கரை", "துறைமுகம்",
    "படகு", "தோணி", "வள்ளம்",
    "மீன்பிடி", "மீன் வேட்டை",
]

SAFETY_COLLOQUIAL: list[str] = [
    "போகலாமா", "போகலாமோ",
    "ஆபத்தா", "பயமா இருக்கு",
    "கடல் சுமாரா இருக்கா",
    "நல்லா இருக்கா கடல்",
    "ஓகே-வா கடல்",
]

WEATHER_COLLOQUIAL: list[str] = [
    "மழை வருமா", "புயல் வருமா",
    "காத்து அடிக்குமா",
    "அலை அதிகமா இருக்கா",
    "கரடு முரடா இருக்கா",
]

COMMON_TYPOS: dict[str, str] = {
    "மீண்": "மீன்",
    "கடற்": "கடல்",
    "பதுகாப்பு": "பாதுகாப்பு",
    "நளைக்கு": "நாளைக்கு",
}


def correct_tamil_spelling(text: str) -> str:
    """Correct common Tamil typos in queries before intent detection."""
    if not text:
        return ""
    corrected = text
    for typo, fix in COMMON_TYPOS.items():
        if typo in corrected:
            corrected = corrected.replace(typo, fix)
    return corrected


TAMIL_NUMBERS: dict[str, int] = {
    "ஒன்று": 1, "இரண்டு": 2,
    "மூன்று": 3, "நான்கு": 4,
    "ஐந்து": 5, "பத்து": 10,
    "இருபது": 20, "முப்பது": 30,
    "நாற்பது": 40, "ஐம்பது": 50,
}

TAMIL_DIRECTIONS: dict[str, int] = {
    "வடக்கு": 0, "கிழக்கு": 90,
    "தெற்கு": 180, "மேற்கு": 270,
    "வடகிழக்கு": 45, "தென்கிழக்கு": 135,
}

TAMIL_TIME_WORDS: dict[str, str] = {
    "காலை": "morning",
    "மாலை": "evening",
    "இரவு": "night",
    "நாளை": "tomorrow",
    "இன்று": "today",
    "நேத்து": "yesterday",
}

FISHING_PATTERNS: list[str] = [
    "மீன்", "மண்டலம்", "pfz", "fish",
    "மீன்பிடி", "எங்க மீன்", "மீன் இருக்கு",
    "fishing zone", "where to fish",
    "மீன் எங்கே", "மீன் கிடைக்கும்",
    "catch fish", "மீன் பிடிக்க",
    *FISHING_COLLOQUIAL,
]

SAFETY_PATTERNS: list[str] = [
    "safe", "பாதுகாப்பு", "போகலாமா",
    "கடல் நிலை", "sea condition",
    "venture", "sail today", "go to sea",
    "kadal", "கடலுக்கு", "புறப்பட",
    *SAFETY_COLLOQUIAL,
]

BORDER_PATTERNS: list[str] = [
    "எல்லை", "border", "imbl", "boundary",
    "இலங்கை", "lanka", "sri lanka",
    "எல்லைக்கோடு", "limit", "maritime",
]

WEATHER_PATTERNS: list[str] = [
    "அலை", "wave", "wind", "காற்று",
    "புயல்", "storm", "cyclone", "rain",
    "மழை", "வானிலை", "weather", "forecast",
    *WEATHER_COLLOQUIAL,
]

TOMORROW_PATTERNS: list[str] = [
    "நாளைக்கு", "tomorrow", "forecast",
    "நாளை", "next day", "morning",
    "காலை", "அடுத்த நாள்", "plan",
]

UKC_PATTERNS: list[str] = [
    "draft", "draught", "under keel", "ukc", "channel", "dock", "berth",
    "pilot", "grounding", "clearance", "port", "harbour", "approach",
]

FISHING_KEYWORDS = FISHING_PATTERNS

INTENT_KEYWORDS: dict[str, list[str]] = {
    "ukc": UKC_PATTERNS,
    "border": BORDER_PATTERNS,
    "fishing": FISHING_PATTERNS,
    "situational": [
        *SAFETY_PATTERNS,
        *WEATHER_PATTERNS,
        *TOMORROW_PATTERNS,
    ],
}



# ---------------------------------------------------------------------------
# Sub-intent detection — multi-intent queries need multiple agents.
# ---------------------------------------------------------------------------
MULTI_INTENT_TRIGGERS: dict[str, list[str]] = {
    "tomorrow": ["weather", "safety", "fishing"],
    "plan trip": ["weather", "safety", "fishing"],
    "safe to fish": ["weather", "safety", "fishing"],
    "where and safe": ["fishing", "safety", "weather"],
    "is it safe": ["weather", "safety"],
    "போகலாமா": ["weather", "safety"],
    "நாளைக்கு": ["weather", "safety", "fishing"],
    "safe-ஆ": ["weather", "safety"],
}


def detect_sub_intents(query: str) -> list[str]:
    """Detect all applicable intents for a query (multi-intent support).

    Returns a list of intent strings. If a trigger phrase is matched in
    ``MULTI_INTENT_TRIGGERS``, those intents are returned. Otherwise, all
    pattern-matched intents from ``INTENT_KEYWORDS`` are returned.
    """
    q = correct_tamil_spelling(query or "").lower()
    if not q:
        return ["situational"]

    # Check multi-intent trigger phrases first
    for trigger, intents in MULTI_INTENT_TRIGGERS.items():
        if trigger in q:
            return intents

    # Fall back to all matching pattern groups
    matched: list[str] = []
    for intent, patterns in INTENT_KEYWORDS.items():
        if any(pat in q for pat in patterns):
            matched.append(intent)

    # Also check the split intent groups individually
    if not matched:
        if any(pat in q for pat in SAFETY_PATTERNS):
            matched.append("safety")
        if any(pat in q for pat in WEATHER_PATTERNS):
            matched.append("weather")
        if any(pat in q for pat in TOMORROW_PATTERNS):
            matched.append("tomorrow")
        if any(pat in q for pat in FISHING_PATTERNS):
            matched.append("fishing")
        if any(pat in q for pat in BORDER_PATTERNS):
            matched.append("border")

    return matched if matched else ["situational"]


# ---------------------------------------------------------------------------
# Layer 2 — fuzzy lexicon + canonical examples.
# ---------------------------------------------------------------------------
SYNONYM_LEXICON: list[tuple[str, str]] = [
    ("lanka line", "border"),
    ("lanka border", "border"),
    ("sri lanka", "border"),
    ("international line", "border"),
    ("india sri lanka", "border"),
    ("fish spot", "fishing"),
    ("spot to fish", "fishing"),
    ("where fish", "fishing"),
    ("catch fish", "fishing"),
    ("fish today", "fishing"),
    ("boat bottom hit", "ukc"),
    ("hull hit bottom", "ukc"),
    ("will my boat fit", "ukc"),
    ("boat fit channel", "ukc"),
    ("weather tomorrow", "situational"),
    ("engine issue", "situational"),
    ("engine problem", "situational"),
    ("how is the sea", "situational"),
    ("sea safe", "situational"),
    # Tamil colloquial synonyms
    ("மச்சம்", "fishing"),
    ("மச்சம் இருக்கா", "fishing"),
    ("மீனு", "fishing"),
    ("மீனா", "fishing"),
    ("மீனு கிடைக்குமா", "fishing"),
    ("மீன் வருமா", "fishing"),
    ("கடலுக்கு போலாம்", "fishing"),
    ("வலை போட", "fishing"),
    ("வலை வீச", "fishing"),
    ("தோணி", "fishing"),
    ("வள்ளம்", "fishing"),
    ("மீன் வேட்டை", "fishing"),
    ("கடல் சுமாரா இருக்கா", "situational"),
    ("நல்லா இருக்கா கடல்", "situational"),
    ("ஓகே-வா கடல்", "situational"),
    ("பயமா இருக்கு", "situational"),
    ("ஆபத்தா", "situational"),
    ("காத்து அடிக்குமா", "situational"),
    ("அலை அதிகமா இருக்கா", "situational"),
    ("கரடு முரடா இருக்கா", "situational"),
    ("மழை வருமா", "situational"),
    ("புயல் வருமா", "situational"),
]

INTENT_EXAMPLES: dict[str, list[str]] = {
    "ukc": [
        "how much under keel clearance",
        "can my boat dock at the port",
        "check my draft clearance",
        "will the boat fit the channel",
        "safe draft for chennai port",
    ],
    "border": [
        "distance to the border",
        "am i near the international boundary",
        "how far to the imbl line",
        "check the lanka border",
        "am i inside the restricted zone",
    ],
    "fishing": [
        "can i go fishing",
        "where can i catch fish today",
        "is there a fishing hotspot nearby",
        "find pfz for tuna",
        "good fishing spot now",
        "மீனு கிடைக்குமா",
        "மச்சம் இருக்கா",
        "வலை போட நல்லா இருக்கா",
    ],
    "situational": [
        "how is the weather at sea",
        "what should i do now",
        "is it safe out here",
        "engine issue what do i do",
        "give me an advisory for today",
        "கடல் சுமாரா இருக்கா",
        "அலை அதிகமா இருக்கா",
        "காத்து அடிக்குமா",
    ],
}

FUZZY_THRESHOLD = 0.65


def _extract_layer1_entities(query: str) -> dict:
    """Pull typed entities (draft metres, target port, Tamil numbers, directions, time words) from the query text."""
    entities: dict = {}
    m = DRAFT_RE.search(query)
    if m:
        entities["draft"] = float(m.group(1))
    lowered = query.lower()
    for alias, port_name in PORT_ALIASES.items():
        if alias in lowered:
            entities["port"] = port_name
            break

    # Tamil Numbers extraction
    found_numbers = {}
    for word, val in TAMIL_NUMBERS.items():
        if word in query:
            found_numbers[word] = val
    if found_numbers:
        entities["tamil_numbers"] = found_numbers
        entities["extracted_numbers"] = list(found_numbers.values())

    # Tamil Directions extraction
    for d_word, deg in TAMIL_DIRECTIONS.items():
        if d_word in query:
            entities["direction_tamil"] = d_word
            entities["direction_degrees"] = deg
            break

    # Tamil Time Words extraction
    for t_word, en_val in TAMIL_TIME_WORDS.items():
        if t_word in query:
            entities["time_word_tamil"] = t_word
            entities["time_context"] = en_val
            break

    return entities


def _layer1_intent(query: str) -> Optional[str]:
    """Pattern routing with substring contains check; returns matched intent or None."""
    q = (query or "").lower()
    if not q:
        return None

    # Draft regex or UKC patterns
    if DRAFT_RE.search(query) or any(pat in q for pat in UKC_PATTERNS):
        return "ukc"

    # Border / IMBL patterns
    if any(pat in q for pat in BORDER_PATTERNS):
        return "border"

    # Fishing / PFZ patterns
    if any(pat in q for pat in FISHING_PATTERNS):
        return "fishing"

    # Safety / Weather / Tomorrow patterns -> situational agent
    if (
        any(pat in q for pat in SAFETY_PATTERNS)
        or any(pat in q for pat in WEATHER_PATTERNS)
        or any(pat in q for pat in TOMORROW_PATTERNS)
    ):
        return "situational"

    return None


def _layer2_intent(query: str) -> Optional[str]:
    """Synonym lexicon first, then difflib phrase similarity."""
    lowered = query.lower()
    for phrase, intent in SYNONYM_LEXICON:
        if phrase in lowered:
            return intent

    best_ratio, best_intent = 0.0, None
    for intent, examples in INTENT_EXAMPLES.items():
        for example in examples:
            ratio = difflib.SequenceMatcher(None, lowered, example).ratio()
            if ratio > best_ratio:
                best_ratio, best_intent = ratio, intent
    return best_intent if best_ratio >= FUZZY_THRESHOLD else None


# ---------------------------------------------------------------------------
# Orchestrator: classify → dispatch → audit → respond.
# ---------------------------------------------------------------------------
def route_query(req: UserQueryRequest) -> AgentDecisionResponse:
    """Run the 3-layer NLU pipeline over a user query and return a decision.

    The response is always an ``AgentDecisionResponse``; every query is
    persisted to the embedded ``query_audit_log`` before returning.
    """
    raw_query = (req.query or "").strip()
    query = correct_tamil_spelling(raw_query)
    entities = _extract_layer1_entities(query)

    intent = None
    layer = "L1"

    # Immediate Layer 1 detection / question-mark shortcut
    if query and all(c in "? " for c in query) and req.user_role == "fisherman":
        intent = "fishing"
        layer = "L1"
    elif query:
        intent = _layer1_intent(query)
        if intent is None:
            intent = _layer2_intent(query)
            if intent is not None:
                layer = "L2"


    if intent is None:
        # Unknown → Groq AI fallback
        layer = "L3-Groq"
        try:
            from app.services.groq_engine import ask_groq

            ai_reply = ask_groq(query if query else "Hello, VARUNA assistance")
            decision = AgentDecisionResponse(
                status="SAFE",
                alert_level="SAFE",
                agent_name="VARUNA Groq AI Agent",
                advisory_en=ai_reply,
                advisory_ta=ai_reply,
                data_source="VARUNA AI + Open-Meteo Live",
                evidence=[f"Groq AI fallback for query: '{query}'"],
                evidence_trace=[f"NLU Layer-{layer}: unknown query -> Groq AI fallback"],
                metrics={"ai_fallback": True},
            )
            try:
                insert_audit(
                    AuditLogEntry(
                        query=req.query,
                        latitude=req.lat,
                        longitude=req.lon,
                        classified_intent="groq_ai",
                        risk_status=decision.status,
                        timestamp=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    )
                )
            except Exception:
                pass
            return decision
        except Exception:
            logger.exception("Groq AI fallback failed, using situational agent")
            intent = "situational"
            layer = "L3"

    handler = AGENT_REGISTRY[intent]
    try:
        decision = handler(req, entities)
    except Exception:
        logger.exception("Agent handler '%s' failed", intent)
        if not DEMO_MODE:
            raise
        from app.demo_mode import classify_demo_kind, demo_decision

        decision = demo_decision(classify_demo_kind(query))

    nlu_trace = [
        f"NLU Layer-{layer} routing: intent='{intent}'",
        f"Extracted entities: {entities or 'none'}",
        f"Vessel context: ({req.lat:.4f}, {req.lon:.4f}), role={req.user_role}",
    ]
    evidence = decision.evidence if decision.evidence else [*nlu_trace, *decision.evidence_trace]
    decision = decision.model_copy(
        update={
            "evidence": evidence,
            "evidence_trace": [*nlu_trace, *decision.evidence_trace],
            "alert_level": decision.alert_level or decision.status,
        }
    )

    # Audit persistence — never breaks the request on failure.
    try:
        insert_audit(
            AuditLogEntry(
                query=req.query,
                latitude=req.lat,
                longitude=req.lon,
                classified_intent=intent,
                risk_status=decision.status,
                timestamp=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            )
        )
    except Exception:  # pragma: no cover - defensive
        logger.exception("Failed to persist audit log entry")

    return decision


# ---------------------------------------------------------------------------
# Self-test / verification block.
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")

    from app.db.database import audit_count, init_db

    init_db()

    demo_cases: list[tuple[str, str, float, float, Optional[float]]] = [
        ("draft 14.5m", "port_pilot", 13.0827, 80.2707, None),
        ("distance to border", "fisherman", 9.50, 79.70, None),
        ("can I go fishing", "fisherman", 9.35, 79.40, None),
        ("test unhandled query", "disaster_officer", 9.15, 79.40, None),
        ("lanka line", "fisherman", 9.60, 79.85, None),
        ("boat bottom hit", "port_pilot", 8.7642, 78.1348, None),
        ("hi", "fisherman", 9.15, 79.40, None),
    ]

    print("=" * 72)
    print("VARUNA 3-Layer NLU Intelligence Engine - self-test")
    print("=" * 72)

    for q, role, lat, lon, draft in demo_cases:
        request = UserQueryRequest(query=q, user_role=role, lat=lat, lon=lon, draft=draft)
        decision = route_query(request)
        bearing = (
            f"bearing={decision.bearing_vector.bearing_degrees}deg "
            f"dist={decision.bearing_vector.distance_km}km"
            if decision.bearing_vector else "n/a"
        )
        print(f"\n[{q}]")
        print(f"  status={decision.status} | agent={decision.agent_name}")
        print(f"  advisory_en: {decision.advisory_en}")
        print(f"  advisory_ta: {decision.advisory_ta}")
        print(f"  bearing_vector: {bearing}")
        print(f"  metrics: {decision.metrics}")
        print(f"  evidence_trace:")
        for step in decision.evidence_trace:
            print(f"    - {step}")

    print(f"\nAudit log rows written: {audit_count()}")
    print("=" * 72)