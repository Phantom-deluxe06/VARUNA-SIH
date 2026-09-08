"""Unified real-time marine data accessor for VARUNA.

``get_marine_data()`` returns one dict combining:
* **SST + marine telemetry** — Open-Meteo Marine Live API.
* **chlorophyll**           — NOAA CoastWatch ERDDAP via RasterEngine.

``compute_pfz()`` applies the INCOIS-style PFZ rule plus the offline ML classifier.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Optional

from app.data.open_meteo import LiveDataError, daily_forecast, get_all_marine_data, live_sea_state
from app.services import raster_service
from app.services.raster_service import RasterEngine

logger = logging.getLogger("varuna.ocean_fetcher")

_RASTER = RasterEngine()


def get_marine_data(lat: float, lon: float) -> dict:
    """Real SST / chlorophyll / wave / wind for a position, with source trail."""
    sources: list[str] = ["Open-Meteo Marine Live"]

    ocean = _RASTER.extract_ocean_data(lat, lon)
    raster_src = ocean.get("source", "satellite")
    chl = ocean.get("chlorophyll_mg_m3", 0.8)

    marine = get_all_marine_data(lat, lon)
    sst = marine["sst_celsius"]
    wave = marine["wave_height_m"]
    current = marine["ocean_current_ms"]

    data: dict = {
        "lat": lat,
        "lon": lon,
        "sst_c": round(sst, 2),
        "chl_mg_m3": round(chl, 3),
        "sst_gradient_c_per_deg": round(ocean.get("sst_gradient_c_per_deg", 0.0), 4),
        "chl_gradient_mg_m3_per_deg": round(ocean.get("chl_gradient_mg_m3_per_deg", 0.0), 4),
        "raster_source": raster_src,
        "wave_height_m": wave,
        "wave_period_s": marine.get("wave_period_s"),
        "wind_knots": marine.get("wind_knots") or marine.get("wind_speed_knots"),
        "gust_knots": marine.get("gust_knots"),
        "wind_dir_deg": None,
        "ocean_current_ms": current,
        "sea_state_source": marine["source"],
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sources": sources,
        "source_label": "Open-Meteo Marine Live",
    }

    return data


def compute_pfz(
    sst: float,
    chl: float,
    sst_gradient: float = 0.0,
    chl_gradient: float = 0.0,
    distance_to_shore_km: float = 10.0,
) -> dict:
    """INCOIS-style PFZ verdict for a real SST/chlorophyll reading."""
    rule = (
        raster_service.PFZ_CHLOROPHYLL_MIN_MG_M3 <= chl <= raster_service.PFZ_CHLOROPHYLL_MAX_MG_M3
        and 26.0 <= sst <= 32.0
    )

    ml_is_pfz: Optional[bool] = None
    ml_conf: Optional[float] = None
    try:
        from app.ml.predictor import predict_pfz

        ml_is_pfz, ml_conf = predict_pfz(sst, chl, sst_gradient, chl_gradient, distance_to_shore_km)
    except Exception:  # pragma: no cover - model optional
        logger.debug("ML PFZ classifier unavailable", exc_info=True)

    verdict = ml_is_pfz if ml_is_pfz is not None else rule
    method = "ml_model" if ml_is_pfz is not None else "incois_gradient_rule"
    confidence = ml_conf if ml_conf is not None else (0.85 if rule else 0.55)
    return {
        "is_pfz": bool(verdict),
        "rule_verdict": bool(rule),
        "ml_is_pfz": ml_is_pfz,
        "ml_confidence": ml_conf,
        "confidence": round(float(confidence), 2),
        "method": method,
    }


def get_tomorrow_forecast(lat: float, lon: float) -> dict:
    """Open-Meteo daily-max wave / wind for tomorrow. Raises LiveDataError."""
    return daily_forecast(lat, lon, day_offset=1)
