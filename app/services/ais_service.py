"""AISStream WebSocket ingestion and in-memory vessel lookup."""

import asyncio
import inspect
import json
import logging
import math
import os
from collections.abc import Awaitable, Callable
from typing import Any

import websockets

try:
    from pyais import decode
except ImportError:
    decode = None

LOGGER = logging.getLogger(__name__)

AIS_STREAM_URL = "wss://stream.aisstream.io/v0/stream"
BOUNDING_BOXES = [[[8.0, 78.0], [14.0, 84.0]]]

VesselCallback = Callable[[dict[str, Any]], Awaitable[None] | None]
_latest_vessels: dict[str, dict[str, Any]] = {}


def _first_value(source: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in source and source[key] is not None:
            return source[key]
    return None


def _as_float(value: Any) -> float | None:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def _normalise_record(record: dict[str, Any], metadata: dict[str, Any] | None = None) -> dict[str, Any] | None:
    metadata = metadata or {}
    mmsi = _first_value(record, "mmsi", "MMSI") or _first_value(metadata, "mmsi", "MMSI")
    latitude = _as_float(_first_value(record, "latitude", "Latitude", "lat"))
    longitude = _as_float(_first_value(record, "longitude", "Longitude", "lon", "lng"))
    if mmsi is None or latitude is None or longitude is None:
        return None

    return {
        "mmsi": str(mmsi),
        "ship_name": str(
            _first_value(record, "ship_name", "ShipName", "shipname", "name")
            or _first_value(metadata, "ship_name", "ShipName", "shipname")
            or "UNKNOWN"
        ).strip(),
        "latitude": latitude,
        "longitude": longitude,
        "speed_knots": _as_float(_first_value(record, "speed_knots", "Sog", "sog")),
        "true_heading": _as_float(
            _first_value(record, "true_heading", "TrueHeading", "heading")
        ),
    }


def parse_ais_message(message: str | bytes | dict[str, Any]) -> dict[str, Any] | None:
    """Parse an AISStream JSON envelope or a single NMEA AIS sentence."""
    if isinstance(message, dict):
        payload = message
    else:
        text = message.decode("utf-8") if isinstance(message, bytes) else message
        text = text.strip()
        if text.startswith("{"):
            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                return None
        elif text.startswith(("!AIVDM", "!AIVDO")):
            if decode is None:
                return None
            try:
                return _normalise_record(decode(text).asdict())
            except (ValueError, IndexError, TypeError):
                return None
        else:
            return None

    metadata = payload.get("MetaData", payload.get("metadata", {})) or {}
    message_body = payload.get("Message", payload.get("message", payload)) or {}
    position = message_body.get("PositionReport", message_body.get("position_report", message_body))
    if not isinstance(position, dict):
        return None
    return _normalise_record(position, metadata)


def _store_vessel(vessel: dict[str, Any]) -> dict[str, Any]:
    existing = _latest_vessels.get(vessel["mmsi"], {})
    existing.update({key: value for key, value in vessel.items() if value is not None})
    _latest_vessels[vessel["mmsi"]] = existing
    return existing.copy()


class AISService:
    """Reconnectable AISStream client intended to run as an independent task."""

    def __init__(
        self,
        api_key: str | None = None,
        on_vessel: VesselCallback | None = None,
        initial_backoff: float = 1.0,
        max_backoff: float = 60.0,
    ) -> None:
        self.api_key = api_key or os.getenv("AISSTREAM_API_KEY")
        self.on_vessel = on_vessel
        self.initial_backoff = initial_backoff
        self.max_backoff = max_backoff

    async def run_forever(self) -> None:
        """Connect, ingest messages, and reconnect with exponential backoff."""
        backoff = self.initial_backoff
        while True:
            try:
                async with websockets.connect(AIS_STREAM_URL) as websocket:
                    await websocket.send(
                        json.dumps({"APIKey": self.api_key, "BoundingBoxes": BOUNDING_BOXES})
                    )
                    backoff = self.initial_backoff
                    async for raw_message in websocket:
                        vessel = parse_ais_message(raw_message)
                        if vessel is None:
                            continue
                        stored_vessel = _store_vessel(vessel)
                        if self.on_vessel is not None:
                            result = self.on_vessel(stored_vessel)
                            if inspect.isawaitable(result):
                                await result
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                LOGGER.warning("AIS WebSocket disconnected: %s; retrying in %.1fs", exc, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, self.max_backoff)


async def get_live_vessels_in_radius(
    center_lat: float, center_lon: float, radius_km: float
) -> list[dict[str, Any]]:
    """Return the latest vessels within ``radius_km`` of a coordinate."""
    if radius_km < 0:
        raise ValueError("radius_km must be non-negative")

    earth_radius_km = 6371.0
    center_lat_radians = math.radians(center_lat)
    matching_vessels = []
    for vessel in _latest_vessels.values():
        latitude_radians = math.radians(vessel["latitude"])
        delta_lat = latitude_radians - center_lat_radians
        delta_lon = math.radians(vessel["longitude"] - center_lon)
        haversine = (
            math.sin(delta_lat / 2) ** 2
            + math.cos(center_lat_radians)
            * math.cos(latitude_radians)
            * math.sin(delta_lon / 2) ** 2
        )
        distance_km = earth_radius_km * 2 * math.asin(math.sqrt(haversine))
        if distance_km <= radius_km:
            matching_vessels.append(vessel.copy())
    return matching_vessels