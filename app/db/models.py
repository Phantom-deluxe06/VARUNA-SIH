"""Typed data models for the VARUNA embedded SQLite store."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


def _utcnow_iso() -> str:
    """ISO-8601 UTC timestamp with second precision (deterministic, tz-aware)."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass(frozen=True)
class PortChannel:
    """A port / harbour with its channel hydrographic parameters."""

    id: int
    port_name: str
    latitude: float
    longitude: float
    channel_depth_m: float
    tidal_surge_offset_m: float
    safe_clearance_m: float


@dataclass(frozen=True)
class GeofenceBoundary:
    """A single vertex of a geofence ring (closed polygon)."""

    id: int
    zone_name: str
    vertex_seq: int
    latitude: float
    longitude: float

    @property
    def coordinate(self) -> tuple[float, float]:
        """(lat, lon) tuple consumable by geometry helpers."""
        return (self.latitude, self.longitude)


@dataclass(frozen=True)
class AuditLogEntry:
    """A processed-query audit record persisted to ``query_audit_log``."""

    query: str
    latitude: float
    longitude: float
    classified_intent: str
    risk_status: str
    timestamp: str = field(default_factory=_utcnow_iso)
    id: int | None = None