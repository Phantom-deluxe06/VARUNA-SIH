"""Embedded SQLite layer for VARUNA — zero external server dependencies.

Creates and seeds ``varuna.db`` (at ``app/db/varuna.db``) on startup:

* ``ports_channels``      — port names, channel depths (Chennai 15.5 m,
  Thoothukudi 14.2 m), tidal surge offsets and safe-clearance thresholds (1.5 m).
* ``geofence_boundaries`` — official Palk Bay IMBL ring, vertex-normalised
  rows: [(10.08, 79.86), (9.98, 79.58), (9.67, 79.38), (9.16, 79.53), (9.00, 79.32)].
* ``query_audit_log``     — every processed query: UTC timestamp, raw query,
  latitude/longitude, classified intent and calculated risk status.

All access is via typed DAO functions; each call opens its own short-lived
WAL-mode connection (safe for FastAPI threadpool concurrency).
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Optional

from app.db.models import AuditLogEntry, GeofenceBoundary, PortChannel

DB_DIR = Path(__file__).resolve().parent
DB_PATH = DB_DIR / "varuna.db"

# ---------------------------------------------------------------------------
# Reference seed data.
# ---------------------------------------------------------------------------
# (port_name, latitude, longitude, channel_depth_m, tidal_surge_offset_m, safe_clearance_m)
PORTS_CHANNELS_SEED: list[tuple[str, float, float, float, float, float]] = [
    ("Chennai Port", 13.0827, 80.2707, 15.5, 1.2, 1.5),
    ("Thoothukudi Port", 8.7642, 78.1348, 14.2, 0.8, 1.5),
]

# Official Palk Bay International Maritime Boundary Line (lat, lon) ring.
IMBL_RING: list[tuple[float, float]] = [
    (10.08, 79.86),
    (9.98, 79.58),
    (9.67, 79.38),
    (9.16, 79.53),
    (9.00, 79.32),
]

IMBL_ZONE_NAME = "IMBL_PALK_BAY"

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS ports_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    port_name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    channel_depth_m REAL NOT NULL,
    tidal_surge_offset_m REAL NOT NULL,
    safe_clearance_m REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS geofence_boundaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zone_name TEXT NOT NULL,
    vertex_seq INTEGER NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    UNIQUE (zone_name, vertex_seq)
);

CREATE TABLE IF NOT EXISTS query_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    query TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    classified_intent TEXT NOT NULL,
    risk_status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON query_audit_log (timestamp);
"""


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    """Short-lived committed connection; rolls back on error."""
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Initialisation / seeding.
# ---------------------------------------------------------------------------
def init_db() -> None:
    """Create tables and seed reference data. Idempotent and startup-safe."""
    with get_connection() as conn:
        conn.executescript(_SCHEMA_SQL)
        _seed_ports(conn)
        _seed_geofence(conn)


def _table_empty(conn: sqlite3.Connection, table: str) -> bool:
    count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    return int(count) == 0


def _seed_ports(conn: sqlite3.Connection) -> None:
    if not _table_empty(conn, "ports_channels"):
        return
    conn.executemany(
        """
        INSERT INTO ports_channels
            (port_name, latitude, longitude, channel_depth_m,
             tidal_surge_offset_m, safe_clearance_m)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        PORTS_CHANNELS_SEED,
    )


def _seed_geofence(conn: sqlite3.Connection) -> None:
    if not _table_empty(conn, "geofence_boundaries"):
        return
    conn.executemany(
        """
        INSERT INTO geofence_boundaries (zone_name, vertex_seq, latitude, longitude)
        VALUES (?, ?, ?, ?)
        """,
        [(IMBL_ZONE_NAME, i, lat, lon) for i, (lat, lon) in enumerate(IMBL_RING)],
    )
# ---------------------------------------------------------------------------
# Row mappers.
# ---------------------------------------------------------------------------
def _row_to_port(row: sqlite3.Row) -> PortChannel:
    return PortChannel(
        id=int(row["id"]),
        port_name=str(row["port_name"]),
        latitude=float(row["latitude"]),
        longitude=float(row["longitude"]),
        channel_depth_m=float(row["channel_depth_m"]),
        tidal_surge_offset_m=float(row["tidal_surge_offset_m"]),
        safe_clearance_m=float(row["safe_clearance_m"]),
    )


def _row_to_audit(row: sqlite3.Row) -> AuditLogEntry:
    return AuditLogEntry(
        id=int(row["id"]),
        timestamp=str(row["timestamp"]),
        query=str(row["query"]),
        latitude=float(row["latitude"]),
        longitude=float(row["longitude"]),
        classified_intent=str(row["classified_intent"]),
        risk_status=str(row["risk_status"]),
    )


# ---------------------------------------------------------------------------
# DAO — ports_channels.
# ---------------------------------------------------------------------------
def list_ports() -> list[PortChannel]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM ports_channels ORDER BY port_name").fetchall()
    return [_row_to_port(r) for r in rows]


def get_port_by_name(name: str) -> Optional[PortChannel]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM ports_channels WHERE LOWER(port_name) = LOWER(?)",
            (name,),
        ).fetchone()
    return _row_to_port(row) if row else None


def get_geofence_ring(zone_name: str = IMBL_ZONE_NAME) -> list[tuple[float, float]]:
    """Return the ordered (lat, lon) ring for a geofence zone (closed polygon)."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT latitude, longitude FROM geofence_boundaries
            WHERE zone_name = ?
            ORDER BY vertex_seq
            """,
            (zone_name,),
        ).fetchall()
    return [(float(r["latitude"]), float(r["longitude"])) for r in rows]


def get_geofence_vertices(zone_name: str = IMBL_ZONE_NAME) -> list[GeofenceBoundary]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM geofence_boundaries
            WHERE zone_name = ?
            ORDER BY vertex_seq
            """,
            (zone_name,),
        ).fetchall()
    return [
        GeofenceBoundary(
            id=int(r["id"]),
            zone_name=str(r["zone_name"]),
            vertex_seq=int(r["vertex_seq"]),
            latitude=float(r["latitude"]),
            longitude=float(r["longitude"]),
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# DAO — query_audit_log.
# ---------------------------------------------------------------------------
def insert_audit(entry: AuditLogEntry) -> int:
    """Persist a processed-query audit record; returns the new row id."""
    with get_connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO query_audit_log
                (timestamp, query, latitude, longitude, classified_intent, risk_status)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                entry.timestamp,
                entry.query,
                entry.latitude,
                entry.longitude,
                entry.classified_intent,
                entry.risk_status,
            ),
        )
        return int(cur.lastrowid)


def recent_audit(limit: int = 10) -> list[AuditLogEntry]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM query_audit_log
            ORDER BY id DESC
            LIMIT ?
            """,
            (int(limit),),
        ).fetchall()
    return [_row_to_audit(r) for r in rows]


def audit_count() -> int:
    with get_connection() as conn:
        return int(conn.execute("SELECT COUNT(*) FROM query_audit_log").fetchone()[0])