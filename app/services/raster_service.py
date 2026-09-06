"""
VARUNA Satellite Earth Observation & Raster Engine
==================================================

Ingests multi-dimensional satellite NetCDF (.nc) datasets, slices Sea Surface
Temperature (SST) and Chlorophyll-a grids, computes thermal fronts to identify
Potential Fishing Zones (PFZ), and computes safe compass navigation vectors
using spherical trigonometry (forward azimuth / Haversine great-circle
distance).

Design contract
---------------
* Zero external-database dependencies; the module is fully decoupled and is
  importable on its own.
* Public methods return plain ``dict`` payloads (schema-validated by Pydantic
  v2 models internally), so FastAPI handlers / LangGraph agents never touch
  xarray objects.
* The ``xarray`` / ``netCDF4`` scientific stack is imported lazily. Real NetCDF
  ingestion requires those packages, but the deterministic synthetic ocean
  model and all navigation math are pure ``math``, so the rest of the VARUNA
  app can always import this module and always fail back gracefully.

PFZ rule (INCOIS-style fishing-grounds advisory)
------------------------------------------------
A PFZ hotspot occurs when Chlorophyll-a is in [0.2, 2.0] mg/m3 AND SST is in
[26.0, 30.5] degC AND the adjacent thermal gradient dSST exceeds 0.5 degC.
"""

from __future__ import annotations

import logging
import math
import sys
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Optional scientific raster stack. Imported lazily (guarded) on purpose so the
# module stays importable in environments without xarray / netCDF4.
# ---------------------------------------------------------------------------
try:
    import numpy as np
    import xarray as xr

    _HAS_RASTER_STACK = True
except ImportError:  # pragma: no cover - depends on deployment environment
    np = None  # type: ignore[assignment]
    xr = None  # type: ignore[assignment]
    _HAS_RASTER_STACK = False

logger = logging.getLogger("varuna.raster")

# ---------------------------------------------------------------------------
# Constants --- single source of truth for the PFZ / navigation logic.
# ---------------------------------------------------------------------------
PFZ_CHLOROPHYLL_MIN_MG_M3 = 0.2
PFZ_CHLOROPHYLL_MAX_MG_M3 = 2.0
PFZ_SST_MIN_C = 26.0
PFZ_SST_MAX_C = 30.5
PFZ_GRADIENT_THRESHOLD_C = 0.5

# Decimal-degree offset used to sample the "adjacent" thermal cell. 0.25 deg is
# ~25 km at the Palk Bay / Coromandel latitude band --- a typical EO footprint.
GRADIENT_STEP_DEG = 0.25

# --- Live satellite ingestion (NOAA CoastWatch ERDDAP downloads) -----------
LIVE_SAT_DIR = Path(__file__).resolve().parent.parent / "data" / "satellite"
LIVE_SST_RASTER = LIVE_SAT_DIR / "latest_sst.nc"
LIVE_CHL_RASTER = LIVE_SAT_DIR / "latest_chl.nc"
GRADIENT_WINDOW_DEG = 1.0   # neighbourhood half-width for |grad| computation

# Deterministic synthetic ocean model centred on coastal Tamil Nadu
# (9.28 deg N, 79.31 deg E) --- matches the app's canonical PFZ anchor.
SYNTHETIC_CENTER_LAT = 9.28
SYNTHETIC_CENTER_LON = 79.31
SYNTHETIC_SST_BASE_C = 28.4
SYNTHETIC_SST_AMP_C = 1.6
SYNTHETIC_FRONT_SLOPE = 0.10   # sharp thermal front width (deg)
SYNTHETIC_CHL_BASE = 0.16      # offshore baseline chl a (mg/m3)
SYNTHETIC_CHL_AMP = 1.35       # coastal bloom amplitude (mg/m3)
SYNTHETIC_CHL_DECAY = 0.35     # coastal decay length scale (deg)

# Geodesy
EARTH_RADIUS_KM = 6371.0088    # IUGG mean Earth radius (km)
KM_PER_NM = 1.852              # international nautical mile
KELVIN_OFFSET_C = 273.15
# ---------------------------------------------------------------------------
# Internal Pydantic v2 payloads.
# ---------------------------------------------------------------------------
class OceanSnapshot(BaseModel):
    """Validated payload returned by :meth:`RasterEngine.extract_ocean_data`."""

    sst_celsius: float = Field(
        ..., ge=-2.0, le=45.0,
        description="Sea Surface Temperature in degrees Celsius",
    )
    chlorophyll_mg_m3: float = Field(
        ..., ge=0.0, description="Chlorophyll-a concentration in mg/m3",
    )
    is_pfz_gradient: bool = Field(
        ..., description="True when the cell is a thermal-front PFZ hotspot",
    )
    source: str = Field(
        ...,
        description="'satellite:<files>' for live NOAA rasters, 'netcdf:<file>' for explicit ingests, 'synthetic_model' as last resort",
    )


    sst_gradient_c_per_deg: float = Field(
        0.0, ge=0.0,
        description="Thermal front magnitude |grad SST| (degC per degree)",
    )
    chl_gradient_mg_m3_per_deg: float = Field(
        0.0, ge=0.0,
        description="Chlorophyll front magnitude |grad chl| (mg/m3 per degree)",
    )
    ml_is_pfz: Optional[bool] = Field(
        None,
        description="Offline ML classifier verdict (None when the model is unavailable)",
    )
    ml_confidence: Optional[float] = Field(
        None, ge=0.0, le=1.0,
        description="ML predicted-probability confidence in [0, 1] (None when unavailable)",
    )

class SafeVector(BaseModel):
    """Validated payload returned by :meth:`RasterEngine.calculate_safe_vector`."""

    bearing_degrees: float = Field(
        ..., ge=0.0, le=360.0,
        description="Forward azimuth compass bearing, 0-360 deg clockwise from true north",
    )
    distance_km: float = Field(..., ge=0.0, description="Great-circle distance in kilometres")
    distance_nm: float = Field(..., ge=0.0, description="Great-circle distance in nautical miles")


# ---------------------------------------------------------------------------
# Module-level NetCDF helpers.
# ---------------------------------------------------------------------------
def _normalise_dataset_coords(ds):
    """Rename common latitude/longitude coordinate aliases to ``lat``/``lon``."""
    rename = {}
    for name in list(ds.coords):
        alias = str(name).lower()
        if alias == "latitude":
            rename[name] = "lat"
        elif alias in {"longitude", "long"}:
            rename[name] = "lon"
    return ds.rename(rename) if rename else ds


def _first_available_var(ds, candidates):
    """Return the first dataset variable matching (case-insensitively) any candidate."""
    pool = {str(name).lower(): name for name in ds.variables}
    for alias in candidates:
        hit = pool.get(str(alias).lower())
        if hit is not None:
            return hit
    return None


SST_VAR_CANDIDATES = ("sst", "analysed_sst", "sea_surface_temperature", "crw_sst", "temp")
CHL_VAR_CANDIDATES = ("chlorophyll", "chlor_a", "chla", "chlorophyll_a")


def _live_satellites_present() -> bool:
    """True when both live NOAA rasters are downloaded and non-empty."""
    return (
        LIVE_SST_RASTER.exists()
        and LIVE_CHL_RASTER.exists()
        and LIVE_SST_RASTER.stat().st_size > 0
        and LIVE_CHL_RASTER.stat().st_size > 0
    )


def _predict_pfz_ml(sst_c: float, chl: float, sst_grad: float, chl_grad: float):
    """
    Bridge to the offline ML predictor (``app.ml.predictor``).

    Imported lazily so the raster module stays decoupled; degrades to
    ``(None, None)`` when the model artefact or scikit-learn is missing.
    """
    try:
        from app.ml.predictor import predict_pfz
    except Exception:
        return None, None
    try:
        flag, confidence = predict_pfz(sst_c, chl, sst_grad, chl_grad)
        return flag, (confidence if confidence > 0.0 else None)
    except Exception as exc:
        logger.warning("PFZ ML inference failed: %s", exc)
        return None, None
# ---------------------------------------------------------------------------
# RasterEngine
# ---------------------------------------------------------------------------
class RasterEngine:
    """
    Satellite EO & Raster Engine for VARUNA.

    Responsibilities
    -----------------
    1. ``extract_ocean_data`` --- slice SST / Chlorophyll-a grids from a NetCDF
       dataset (or a deterministic synthetic model) and evaluate the thermal
       front / PFZ hotspot rule.
    2. ``calculate_safe_vector`` --- forward azimuth (compass bearing) and
       great-circle distance (Haversine) between two geographic points.

    The engine holds no state; every method is side-effect free and thread-safe.
    """

    # -- Validation / synthetic model ------------------------------------------

    @staticmethod
    def _validate_coordinates(lat: float, lon: float) -> None:
        """Reject non-finite or out-of-range geographic coordinates."""
        if not math.isfinite(lat) or not (-90.0 <= lat <= 90.0):
            raise ValueError(f"latitude {lat!r} out of range [-90, 90]")
        if not math.isfinite(lon) or not (-180.0 <= lon <= 180.0):
            raise ValueError(f"longitude {lon!r} out of range [-180, 180]")

    @staticmethod
    def _synthetic_sst(lat: float, lon: float) -> float:
        """Deterministic SST field: sharp NE-SW thermal front through 9.28N/79.31E."""
        delta_lat = lat - SYNTHETIC_CENTER_LAT
        delta_lon = lon - SYNTHETIC_CENTER_LON
        front = math.tanh((0.8 * delta_lon + 0.6 * delta_lat) / SYNTHETIC_FRONT_SLOPE)
        return SYNTHETIC_SST_BASE_C + SYNTHETIC_SST_AMP_C * front

    @staticmethod
    def _synthetic_chlorophyll(lat: float, lon: float) -> float:
        """Deterministic chl-a field: coastal bloom decaying with offshore radius."""
        delta_lat = lat - SYNTHETIC_CENTER_LAT
        delta_lon = lon - SYNTHETIC_CENTER_LON
        radius = math.hypot(delta_lat, delta_lon)
        return SYNTHETIC_CHL_BASE + SYNTHETIC_CHL_AMP * math.exp(-radius / SYNTHETIC_CHL_DECAY)

    @staticmethod
    def _sanitise_ocean_values(sst_celsius: float, chlorophyll_mg_m3: float) -> tuple[float, float]:
        """Enforce finite, physically plausible values; raise ValueError otherwise."""
        if not (math.isfinite(sst_celsius) and math.isfinite(chlorophyll_mg_m3)):
            raise ValueError("dataset contains non-finite SST / chlorophyll-a values")
        if not (-2.0 <= sst_celsius <= 45.0):
            raise ValueError(f"SST {sst_celsius} degC is outside the physically plausible range")
        return sst_celsius, max(0.0, chlorophyll_mg_m3)

    @staticmethod
    def _gradient_of(fn, lat: float, lon: float, step: float = GRADIENT_STEP_DEG) -> float:
        """Max absolute delta of ``fn`` between the centre cell and its 4 adjacent cells."""
        centre = fn(lat, lon)
        return max(
            abs(fn(n_lat, n_lon) - centre)
            for n_lat, n_lon in (
                (lat + step, lon),
                (lat - step, lon),
                (lat, lon + step),
                (lat, lon - step),
            )
        )

    def _synthetic_point(self, lat: float, lon: float) -> tuple[float, float, float]:
        """(sst_celsius, chlorophyll_mg_m3, thermal_gradient_delta_sst)."""
        sst_c = self._synthetic_sst(lat, lon)
        chl = self._synthetic_chlorophyll(lat, lon)
        gradient = self._gradient_of(self._synthetic_sst, lat, lon)
        sst_c, chl = self._sanitise_ocean_values(sst_c, chl)
        return sst_c, chl, gradient
# -- NetCDF ingestion -------------------------------------------------------

    def _read_netcdf_point(self, lat: float, lon: float, file_path: str) -> tuple[float, float, float]:
        """
        Open ``file_path`` and extract the nearest-cell SST / chl-a plus the
        adjacent thermal gradient. Raises on any failure; the caller falls back.
        """
        with xr.open_dataset(file_path) as ds:
            ds = _normalise_dataset_coords(ds)

            # Collapse multi-dimensional time and any residual size-1 dims.
            for dim in ("time", "t", "time_counter"):
                if dim in ds.sizes and ds.sizes[dim] > 1:
                    ds = ds.isel({dim: -1})
            for dim in [d for d in ds.sizes if d not in ("lat", "lon") and ds.sizes[d] == 1]:
                ds = ds.isel({dim: 0})

            sst_var = _first_available_var(ds, SST_VAR_CANDIDATES)
            if sst_var is None:
                raise KeyError("no SST variable found")
            chl_var = _first_available_var(ds, CHL_VAR_CANDIDATES)
            if chl_var is None:
                raise KeyError("no chlorophyll variable found")

            # Nearest-cell extraction exactly per spec: ds.sel(lat=, lon=, method='nearest').
            sst_c = float(ds.sel(lat=lat, lon=lon, method="nearest")[sst_var].item())
            if sst_c > 100.0:  # Kelvin auto-detection -> Celsius
                sst_c -= KELVIN_OFFSET_C

            # Adjacent-cell thermal gradient (4-connected neighbourhood; dSST > 0.5 degC).
            sst_neighbour_values = []
            for n_lat, n_lon in (
                (lat + GRADIENT_STEP_DEG, lon),
                (lat - GRADIENT_STEP_DEG, lon),
                (lat, lon + GRADIENT_STEP_DEG),
                (lat, lon - GRADIENT_STEP_DEG),
            ):
                try:
                    n_val = float(ds.sel(lat=n_lat, lon=n_lon, method="nearest")[sst_var].item())
                except Exception:
                    continue
                if math.isfinite(n_val):
                    sst_neighbour_values.append(n_val)
            gradient = (
                max(abs(v - sst_c) for v in sst_neighbour_values)
                if sst_neighbour_values and math.isfinite(sst_c)
                else 0.0
            )

            chl = float(ds.sel(lat=lat, lon=lon, method="nearest")[chl_var].item())
        sst_c, chl = self._sanitise_ocean_values(sst_c, chl)
        return sst_c, chl, gradient
# -- Public API -------------------------------------------------------------

    def _read_live_satellite(self, lat: float, lon: float) -> dict:
        """
        Slice the live NOAA CoastWatch rasters (``latest_sst.nc`` /
        ``latest_chl.nc``) at the grid cell nearest to (lat, lon) and compute
        the spatial front magnitudes

            grad(SST) = sqrt((dSST/dlat)^2 + (dSST/dlon)^2)  [degC/degree]
            grad(chl) = sqrt((dchl/dlat)^2 + (dchl/dlon)^2)  [mg/m3/degree]

        via central differences over a +/- GRADIENT_WINDOW_DEG neighbourhood.
        Raises when either raster is missing/unreadable so the caller can
        fall back to the synthetic model.
        """
        sst_ds = xr.open_dataset(LIVE_SST_RASTER)
        try:
            sst_ds = _normalise_dataset_coords(sst_ds)
            if "time" in sst_ds.dims:
                sst_ds = sst_ds.isel(time=-1)
            sst_var = _first_available_var(sst_ds, SST_VAR_CANDIDATES)
            if sst_var is None:
                raise ValueError(f"no SST variable found in {LIVE_SST_RASTER.name}")
            sst_c, sst_grad = self._sample_with_gradient(
                sst_ds, sst_var, lat, lon, to_celsius=True,
            )
        finally:
            sst_ds.close()

        chl_ds = xr.open_dataset(LIVE_CHL_RASTER)
        try:
            chl_ds = _normalise_dataset_coords(chl_ds)
            if "time" in chl_ds.dims:
                chl_ds = chl_ds.isel(time=-1)
            if "altitude" in chl_ds.dims:
                chl_ds = chl_ds.isel(altitude=0)
            chl_var = _first_available_var(chl_ds, CHL_VAR_CANDIDATES)
            if chl_var is None:
                raise ValueError(f"no chlorophyll variable found in {LIVE_CHL_RASTER.name}")
            chl, chl_grad = self._sample_with_gradient(chl_ds, chl_var, lat, lon)
        finally:
            chl_ds.close()

        return {
            "sst_c": sst_c,
            "chl": chl,
            "sst_grad": sst_grad,
            "chl_grad": chl_grad,
            "source": f"satellite:{LIVE_SST_RASTER.name}+{LIVE_CHL_RASTER.name}",
        }

    @staticmethod
    def _sample_with_gradient(ds, var: str, lat: float, lon: float, to_celsius: bool = False):
        """Nearest-cell value + |grad| magnitude at (lat, lon) over a window."""
        lat_vals = np.asarray(ds["lat"].values, dtype=float)
        lon_vals = np.asarray(ds["lon"].values, dtype=float)
        lo, hi = lat - GRADIENT_WINDOW_DEG, lat + GRADIENT_WINDOW_DEG
        lat_slice = slice(lo, hi) if lat_vals[0] <= lat_vals[-1] else slice(hi, lo)
        lo, hi = lon - GRADIENT_WINDOW_DEG, lon + GRADIENT_WINDOW_DEG
        lon_slice = slice(lo, hi) if lon_vals[0] <= lon_vals[-1] else slice(hi, lo)
        window = ds.sel(lat=lat_slice, lon=lon_slice)[var]
        while window.ndim > 2:
            window = window.isel({window.dims[0]: 0}, drop=True)
        values = np.asarray(window.values, dtype=float)
        w_lat = np.asarray(window["lat"].values, dtype=float)
        w_lon = np.asarray(window["lon"].values, dtype=float)
        if values.ndim != 2 or values.shape[0] < 2 or values.shape[1] < 2:
            raise ValueError("insufficient grid coverage for gradient computation")
        value = float(ds.sel(lat=lat, lon=lon, method="nearest")[var].values)
        if to_celsius and value > 100.0:
            value -= KELVIN_OFFSET_C
        fill = float(np.nanmean(values))
        if not math.isfinite(fill):
            raise ValueError("satellite window is fully masked")
        if not math.isfinite(value):
            # Nearest cell masked (land / cloud edge) - impute with the window
            # mean so real satellite ingestion degrades gracefully.
            value = fill
        filled = np.where(np.isfinite(values), values, fill)
        i_lat = int(np.argmin(np.abs(w_lat - lat)))
        i_lon = int(np.argmin(np.abs(w_lon - lon)))
        grad_lat, grad_lon = np.gradient(filled, w_lat, w_lon)
        magnitude = float(np.hypot(grad_lat[i_lat, i_lon], grad_lon[i_lat, i_lon]))
        return value, (magnitude if math.isfinite(magnitude) else 0.0)

    def extract_ocean_data(
        self,
        lat: float,
        lon: float,
        file_path: Optional[str] = None,
    ) -> dict:
        """
        Extract SST / Chlorophyll-a at the nearest grid cell to (lat, lon).

        * If ``file_path`` is provided (and the xarray / netCDF4 stack is
          available), the NetCDF dataset is opened and sliced with
          ``ds.sel(lat=lat, lon=lon, method='nearest')``.
        * If ``file_path`` is ``None`` or ingestion fails for any reason, a
          deterministic synthetic ocean model centred on coastal Tamil Nadu
          (9.28N, 79.31E) is used so downstream agents never break.

        Returns:
            {
                "sst_celsius": float,          # degC
                "chlorophyll_mg_m3": float,    # mg/m3
                "is_pfz_gradient": bool,       # thermal-front PFZ hotspot
                "source": str,                 # "netcdf:<name>" | "synthetic_model"
            }
        """
        self._validate_coordinates(lat, lon)

        self._validate_coordinates(lat, lon)

        sst_c: Optional[float] = None
        chl: Optional[float] = None
        gradient = 0.0
        sst_grad = 0.0
        chl_grad = 0.0
        source = "synthetic_model"

        # 1) Explicit single-file ingest (highest priority).
        if file_path is not None and _HAS_RASTER_STACK:
            try:
                sst_c, chl, gradient = self._read_netcdf_point(lat, lon, file_path)
                sst_grad = gradient
                source = f"netcdf:{Path(file_path).name}"
            except Exception as exc:
                logger.warning(
                    "NetCDF ingestion failed for '%s' (%s); trying the live "
                    "satellite rasters next.",
                    file_path, exc,
                )

        # 2) Live satellite rasters downloaded by app.services.data_fetcher.
        if sst_c is None and _HAS_RASTER_STACK and _live_satellites_present():
            try:
                snapshot = self._read_live_satellite(lat, lon)
                sst_c = snapshot["sst_c"]
                chl = snapshot["chl"]
                sst_grad = snapshot["sst_grad"]
                chl_grad = snapshot["chl_grad"]
                gradient = sst_grad
                source = snapshot["source"]
            except Exception as exc:
                logger.warning(
                    "Live satellite raster ingestion failed (%s); falling back "
                    "to the synthetic ocean model.",
                    exc,
                )

        # 3) Deterministic synthetic model - LAST RESORT only.
        if sst_c is None:
            logger.warning(
                "No live satellite rasters available; using the deterministic "
                "synthetic ocean model as the last-resort fallback."
            )
            sst_c, chl, gradient = self._synthetic_point(lat, lon)
            sst_grad = gradient
            source = "synthetic_model"

        sst_c, chl = self._sanitise_ocean_values(sst_c, chl)
        rule_pfz = self._evaluate_pfz(sst_c, chl, gradient)
        ml_flag, ml_conf = _predict_pfz_ml(sst_c, chl, sst_grad, chl_grad)

        return OceanSnapshot(
            sst_celsius=float(sst_c),
            chlorophyll_mg_m3=float(chl),
            is_pfz_gradient=rule_pfz,
            source=source,
            sst_gradient_c_per_deg=round(float(sst_grad), 4),
            chl_gradient_mg_m3_per_deg=round(float(chl_grad), 4),
            ml_is_pfz=ml_flag,
            ml_confidence=ml_conf,
        ).model_dump()

    @staticmethod
    def _evaluate_pfz(sst_celsius: float, chlorophyll_mg_m3: float, delta_sst: float) -> bool:
        """
        INCOIS-style PFZ decision.

        A hotspot is flagged when chl-a is in [0.2, 2.0] mg/m3, SST is in
        [26.0, 30.5] degC and the adjacent thermal gradient exceeds 0.5 degC.
        """
        return (
            PFZ_CHLOROPHYLL_MIN_MG_M3 <= chlorophyll_mg_m3 <= PFZ_CHLOROPHYLL_MAX_MG_M3
            and PFZ_SST_MIN_C <= sst_celsius <= PFZ_SST_MAX_C
            and delta_sst > PFZ_GRADIENT_THRESHOLD_C
        )

    def calculate_safe_vector(
        self,
        curr_lat: float,
        curr_lon: float,
        target_lat: float,
        target_lon: float,
    ) -> dict:
        """
        Safe compass navigation vector: forward azimuth + Haversine distance.

        Returns:
            {
                "bearing_degrees": float,  # 0-360, clockwise from true north
                "distance_km": float,      # kilometres (great-circle)
                "distance_nm": float,      # nautical miles (great-circle)
            }
        """
        self._validate_coordinates(curr_lat, curr_lon)
        self._validate_coordinates(target_lat, target_lon)

        lat1 = math.radians(curr_lat)
        lon1 = math.radians(curr_lon)
        lat2 = math.radians(target_lat)
        lon2 = math.radians(target_lon)
        delta_lon = lon2 - lon1

        # Forward azimuth (compass bearing) from spherical trigonometry.
        x_component = math.sin(delta_lon) * math.cos(lat2)
        y_component = (
            math.cos(lat1) * math.sin(lat2)
            - math.sin(lat1) * math.cos(lat2) * math.cos(delta_lon)
        )
        bearing_degrees = (math.degrees(math.atan2(x_component, y_component)) + 360.0) % 360.0

        # Haversine great-circle distance.
        delta_lat = lat2 - lat1
        hav_a = (
            math.sin(delta_lat / 2.0) ** 2
            + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2.0) ** 2
        )
        central_angle = 2.0 * math.atan2(
            math.sqrt(hav_a),
            math.sqrt(max(0.0, 1.0 - hav_a)),
        )
        distance_km = EARTH_RADIUS_KM * central_angle
        distance_nm = distance_km / KM_PER_NM

        return SafeVector(
            bearing_degrees=round(bearing_degrees, 2),
            distance_km=round(distance_km, 2),
            distance_nm=round(distance_nm, 2),
        ).model_dump()


# ---------------------------------------------------------------------------
# Self-test / verification block.
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")

    engine = RasterEngine()
    print("=" * 64)
    print("VARUNA Raster & Satellite EO Engine --- self-test")
    print("=" * 64)

    # Optional real NetCDF file path for local verification (e.g. python app/services/raster_service.py data.nc)
    nc_file = sys.argv[1] if len(sys.argv) > 1 else None

    demo_points = [
        ("Sample PFZ (9.35N, 79.40E)", 9.35, 79.40, True),
        ("Hotspot anchor (9.28N, 79.31E)", 9.28, 79.31, True),
        ("Offshore open water (11.50N, 82.50E)", 11.50, 82.50, False),
    ]

    for label, d_lat, d_lon, expected in demo_points:
        ocean = engine.extract_ocean_data(d_lat, d_lon, file_path=nc_file)
        print(f"\n[{label}]")
        print(f"  SST            : {ocean['sst_celsius']:.2f} degC")
        print(f"  Chlorophyll-a  : {ocean['chlorophyll_mg_m3']:.3f} mg/m3")
        print(f"  PFZ rule   : {ocean['is_pfz_gradient']}  ")
        print(f"  Source         : {ocean['source']}")
        if ocean.get("ml_is_pfz") is not None:
            print(f"  ML PFZ         : {ocean["ml_is_pfz"]}  (confidence {ocean["ml_confidence"]:.3f})")
        print(f"  |grad SST|     : {ocean["sst_gradient_c_per_deg"]:.4f} degC/deg")

    print("\n[Compass navigation vector --- sample vessel (9.35N, 79.40E) -> PFZ anchor (9.28N, 79.31E)]")
    vector = engine.calculate_safe_vector(9.35, 79.40, 9.28, 79.31)
    print(f"  Bearing        : {vector['bearing_degrees']:.2f} deg (compass, 0-360)")
    print(f"  Distance       : {vector['distance_km']:.2f} km / {vector['distance_nm']:.2f} NM")
    print("=" * 64)
