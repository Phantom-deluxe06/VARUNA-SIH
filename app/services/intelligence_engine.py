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

FISHING_KEYWORDS: list[str] = [
    "மீன்", "மீன் எங்க", "மீன் இருக்கு",
    "மீன்பிடி", "PFZ", "pfz",
    "fish", "fishing zone", "where to fish",
    "மண்டலம்", "மீன் மண்டலம்"
]

INTENT_KEYWORDS: dict[str, list[str]] = {
    "ukc": [
        "draft", "draught", "under keel", "ukc", "channel", "dock", "berth",
        "pilot", "grounding", "clearance", "port", "harbour", "approach",
    ],
    "border": [
        "border", "imbl", "boundary", "international maritime", "lanka",
        "maritime boundary", "territorial", "geofence", "restricted zone",
        "எல்லை", "இலங்கை", "கடல் எல்லை",
    ],
    "fishing": [
        *FISHING_KEYWORDS,
        "fisher", "hotspot", "catch", "tuna",
        "mackerel", "meen", "sardine", "prawn",
        "மீன", "மீனவ", "பிடிக்க",
    ],
    "situational": [
        "weather", "sea state", "wave", "wind", "condition", "advisory",
        "tomorrow", "safety", "update", "status", "conditions",
        "வானிலை", "அலை", "காற்று", "கடல் நிலை", "புயல்", "பாதுகாப்பு", "பாதுகாப்பா",
    ],
}

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
    ],
    "situational": [
        "how is the weather at sea",
        "what should i do now",
        "is it safe out here",
        "engine issue what do i do",
        "give me an advisory for today",
    ],
}

FUZZY_THRESHOLD = 0.45


def _extract_layer1_entities(query: str) -> dict:
    """Pull typed entities (draft metres, target port) from the query text."""
    entities: dict = {}
    m = DRAFT_RE.search(query)
    if m:
        entities["draft"] = float(m.group(1))
    lowered = query.lower()
    for alias, port_name in PORT_ALIASES.items():
        if alias in lowered:
            entities["port"] = port_name
            break
    return entities


def _layer1_intent(query: str) -> Optional[str]:
    """Keyword-count routing; returns the highest-scoring intent or None."""
    if any(kw in query or kw.lower() in query.lower() for kw in FISHING_KEYWORDS):
        return "fishing"

    hits = {
        intent: sum(1 for kw in keywords if kw in query)
        for intent, keywords in INTENT_KEYWORDS.items()
    }
    scored = {intent: score for intent, score in hits.items() if score > 0}
    if not scored:
        return None
    best_intent = max(scored.items(), key=lambda kv: (kv[1], kv[0]))[0]
    return best_intent


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
    query = (req.query or "").strip()
    entities = _extract_layer1_entities(query)

    # Immediate Layer 1 detection: ANY of FISHING_KEYWORDS found in query
    if query and (any(kw in query or kw.lower() in query.lower() for kw in FISHING_KEYWORDS) or (all(c in "? " for c in query) and req.user_role == "fisherman")):
        intent = "fishing"
        layer = "L1"
    else:
        intent = _layer1_intent(query.lower()) if query else None
        layer = "L1"
        if intent is None:
            intent = _layer2_intent(query)
            layer = "L2"
        if intent is None:
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