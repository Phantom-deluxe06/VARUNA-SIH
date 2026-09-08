"""Unified real-time marine data accessor for VARUNA.

``get_marine_data()`` returns one dict combining:
* **SST + marine telemetry** — Open-Meteo Marine Live API.
* **chlorophyll**           — Copernicus Marine (real satellite L4, via saved
  credentials), falling back to ChlorophyllFetcher (CoastWatch ERDDAP VIIRS,
  NASA OceanColour, SST-derived oceanographic last resort); RasterEngine
  remains a final safety net.

``compute_pfz()`` applies the INCOIS-style PFZ rule plus the offline ML classifier.
"""

from __future__ import annotations

import logging
import math
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.data.chlorophyll_fetcher import ChlorophyllFetcher
from app.data.open_meteo import LiveDataError, daily_forecast, get_all_marine_data, live_sea_state
from app.services import raster_service
from app.services.raster_service import RasterEngine

logger = logging.getLogger("varuna.ocean_fetcher")

_RASTER = RasterEngine()
_CHL_FETCHER = ChlorophyllFetcher()


def get_marine_data(lat: float, lon: float) -> dict:
    """Real SST / chlorophyll / wave / wind for a position, with source trail."""
    sources: list[str] = ["Open-Meteo Marine Live"]

    ocean = _RASTER.extract_ocean_data(lat, lon)
    raster_src = ocean.get("source", "satellite")

    marine = get_all_marine_data(lat, lon)
    sst = marine["sst_celsius"]
    wave = marine["wave_height_m"]
    current = marine["ocean_current_ms"]

    # Real satellite chlorophyll: Copernicus first, then the
    # ChlorophyllFetcher chain (ERDDAP VIIRS / NASA / SST-derived), with the
    # raster engine (cached netCDF / synthetic model) as a final safety net.
    chl_info = get_chlorophyll(lat, lon, sst=sst)
    chl = chl_info.get("chl_mg_m3")
    if chl is not None:
        chl_source = chl_info.get("source", "satellite")
        chl_method = chl_info.get("method", "satellite")
        chl_confidence = chl_info.get(
            "confidence", "HIGH" if str(chl_source).startswith("COPERNICUS") else "MEDIUM"
        )
        sources.append(f"CHL: {chl_source}")
    else:
        chl = ocean.get("chlorophyll_mg_m3", 0.8)
        chl_source = raster_src
        chl_method = "raster engine"
        chl_confidence = "LOW"

    data: dict = {
        "lat": lat,
        "lon": lon,
        "sst_c": round(sst, 2),
        "chl_mg_m3": round(chl, 3),
        "chl_source": chl_source,
        "chl_method": chl_method,
        "chl_confidence": chl_confidence,
        "chl_max": chl_info.get("chl_max"),
        "is_high_productivity": bool(
            chl_info.get("is_high_productivity", chl is not None and chl > 0.5)
        ),
        "pfz_chl_score": chl_info.get(
            "pfz_chl_score", min(chl / 0.5, 1.0) if chl else 0.0
        ),
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


def get_chlorophyll(lat: float, lon: float, sst: Optional[float] = None) -> dict:
    """Real Copernicus ocean-colour chlorophyll-a at (lat, lon).

    Primary: Copernicus Marine ``cmems_obs-oc_glo_bgc-plankton_nrt_l4-gapfree-
    multi-4km_P1D`` (daily gap-free L4, ~4 km) over a 4-day window ending now —
    NRT ocean colour lags ~2 days, so this always captures the latest slices
    without pulling the full multi-year time series.

    Fallback: the :class:`~app.data.chlorophyll_fetcher.ChlorophyllFetcher`
    chain (CoastWatch ERDDAP VIIRS -> NASA OceanColour -> SST-derived
    oceanographic estimate), which never raises.
    """
    try:
        return _copernicus_chlorophyll(lat, lon)
    except Exception as exc:
        logger.warning("Copernicus chlorophyll failed (%s); using fallback chain", exc)
    return _CHL_FETCHER.get_chlorophyll(lat, lon, sst=sst)


def _copernicus_chlorophyll(lat: float, lon: float) -> dict:
    """Single Copernicus Marine fetch. Raises on any failure."""
    import copernicusmarine
    import numpy as np

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=4)
    ds = copernicusmarine.open_dataset(
        dataset_id="cmems_obs-oc_glo_bgc-plankton_nrt_l4-gapfree-multi-4km_P1D",
        minimum_latitude=lat - 2,
        maximum_latitude=lat + 2,
        minimum_longitude=lon - 2,
        maximum_longitude=lon + 2,
        start_datetime=start.strftime("%Y-%m-%dT%H:%M:%S"),
        end_datetime=end.strftime("%Y-%m-%dT%H:%M:%S"),
        variables=["CHL"],
    )
    chl = ds["CHL"].values
    chl_mean = float(np.nanmean(chl))
    chl_max = float(np.nanmax(chl))
    if not math.isfinite(chl_mean) or chl_mean <= 0:
        raise ValueError("Copernicus CHL window contained no valid data")

    return {
        "chl_mg_m3": round(chl_mean, 4),
        "chl_max": round(chl_max, 4),
        "is_high_productivity": chl_mean > 0.5,
        "pfz_chl_score": min(chl_mean / 0.5, 1.0),
        "source": "COPERNICUS_OCEANCOLOUR_REAL",
        "method": "Copernicus L4 gapfree daily CHL (4-day window mean)",
        "dataset": "cmems_obs-oc_glo_bgc-plankton_nrt_l4",
    }


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
