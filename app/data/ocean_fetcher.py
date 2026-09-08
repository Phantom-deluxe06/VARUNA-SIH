"""Unified real-time marine data accessor for VARUNA.

``get_marine_data()`` returns one dict combining:

* **SST + chlorophyll**  — Copernicus Marine ``OCEANCOLOUR_*_BGC_L4`` when
  credentials are configured (primary), otherwise NOAA CoastWatch ERDDAP via
  :class:`app.services.raster_service.RasterEngine` (fallback, always available,
  key-less). A deterministic synthetic model is the last resort inside
  RasterEngine itself.
* **waves + wind**       — Open-Meteo marine + forecast APIs (key-less).

``compute_pfz()`` applies the INCOIS-style PFZ rule (shared thresholds from
``raster_service``) plus the offline ML classifier when its artefact is present.

No demo/mock values are produced here — every field is traceable to a source
string in the returned ``sources`` list.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Optional

from app.data.open_meteo import LiveDataError, daily_forecast, live_sea_state
from app.services import raster_service
from app.services.raster_service import RasterEngine

logger = logging.getLogger("varuna.ocean_fetcher")

_RASTER = RasterEngine()

# Copernicus Marine — https://marine.copernicus.eu
# Product: OCEANCOLOUR_IND_BGC_L4_NRT / variable CHL. Requires a (free) CMEMS
# account: set COPERNICUSMARINE_SERVICE_USERNAME / _PASSWORD and
# ``pip install copernicusmarine``. Dormant otherwise — ERDDAP takes over.
COPERNICUS_DATASET_ID = os.getenv(
    "COPERNICUS_CHL_DATASET_ID", "cmems_obs-oc_glo_bgc-plankton_nrt_l4-gapfree-multi_P1D"
)


def _copernicus_chl(lat: float, lon: float) -> Optional[float]:
    """Primary chlorophyll source. Returns None unless CMEMS is fully configured."""
    if not (
        os.getenv("COPERNICUSMARINE_SERVICE_USERNAME")
        and os.getenv("COPERNICUSMARINE_SERVICE_PASSWORD")
    ):
        return None
    try:
        import copernicusmarine  # type: ignore

        ds = copernicusmarine.open_dataset(
            dataset_id=COPERNICUS_DATASET_ID,
            variables=["CHL"],
            minimum_longitude=lon - 0.1,
            maximum_longitude=lon + 0.1,
            minimum_latitude=lat - 0.1,
            maximum_latitude=lat + 0.1,
        )
        value = float(ds["CHL"].isel(time=-1).sel(latitude=lat, longitude=lon, method="nearest").values)
        ds.close()
        if value == value:  # not NaN
            return round(value, 3)
    except Exception as exc:  # pragma: no cover - opt-in path
        logger.warning("Copernicus chlorophyll unavailable, using ERDDAP: %s", exc)
    return None


def get_marine_data(lat: float, lon: float) -> dict:
    """Real SST / chlorophyll / wave / wind for a position, with source trail."""
    sources: list[str] = []

    ocean = _RASTER.extract_ocean_data(lat, lon)
    raster_src = ocean.get("source", "synthetic_model")
    chl = ocean["chlorophyll_mg_m3"]

    cop_chl = _copernicus_chl(lat, lon)
    if cop_chl is not None:
        chl = cop_chl
        sources.append("Copernicus Marine (CHL)")
        sources.append(f"ERDDAP ({raster_src}) [SST]")
    elif raster_src.startswith("satellite") or raster_src.startswith("netcdf"):
        sources.append(f"NOAA ERDDAP ({raster_src})")
    else:
        sources.append("synthetic ocean model")

    data: dict = {
        "lat": lat,
        "lon": lon,
        "sst_c": round(ocean["sst_celsius"], 2),
        "chl_mg_m3": round(chl, 3),
        "sst_gradient_c_per_deg": round(ocean.get("sst_gradient_c_per_deg", 0.0), 4),
        "chl_gradient_mg_m3_per_deg": round(ocean.get("chl_gradient_mg_m3_per_deg", 0.0), 4),
        "raster_source": raster_src,
        "wave_height_m": None,
        "wave_period_s": None,
        "wind_knots": None,
        "gust_knots": None,
        "wind_dir_deg": None,
        "sea_state_source": None,
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }

    try:
        sea = live_sea_state(lat, lon)
        data.update(
            wave_height_m=sea["wave_height_m"],
            wave_period_s=sea["wave_period_s"],
            wind_knots=sea["wind_speed_knots"],
            gust_knots=sea["gust_knots"],
            wind_dir_deg=sea.get("wind_direction_deg"),
            sea_state_source=sea["source"],
        )
        sources.append("Open-Meteo (waves/wind)")
    except LiveDataError as exc:
        logger.info("Open-Meteo unavailable: %s", exc)
        data["sea_state_source"] = "unavailable"

    data["sources"] = sources
    data["source_label"] = _source_label(sources)
    return data


def _source_label(sources: list[str]) -> str:
    parts = []
    if any("Copernicus" in s for s in sources):
        parts.append("Copernicus")
    if any("ERDDAP" in s or "NOAA" in s for s in sources):
        parts.append("NOAA")
    if any("synthetic" in s for s in sources):
        parts.append("model")
    if any("Open-Meteo" in s for s in sources):
        parts.append("Open-Meteo")
    return " + ".join(dict.fromkeys(parts)) or "model"


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
        and raster_service.PFZ_SST_MIN_C <= sst <= raster_service.PFZ_SST_MAX_C
        and sst_gradient > raster_service.PFZ_GRADIENT_THRESHOLD_C
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
