"""VARUNA Real-Time Satellite Data Ingestion Engine.

Downloads live Indian Ocean satellite rasters (SST + Chlorophyll-a) covering
coastal Tamil Nadu / Palk Bay / Bay of Bengal from the open NOAA CoastWatch
ERDDAP service and stores them under ``app/data/satellite/``.

Datasets (NOAA CoastWatch ERDDAP griddap, no API key required):
* SST        : ``NOAA_DHW``        -> variable ``CRW_SST`` (degC)
* Chlorophyll: ``nesdisVHNSQchlaDaily`` -> variable ``chlor_a`` (mg/m3)

Note: ERDDAP griddap uses the pseudo-index ``(last)`` for the most recent
time step. The ``(latest)`` keyword seen in older documents is NOT valid and
returns HTTP 400 (verified live against coastwatch.pfeg.noaa.gov).

The fetcher is restart-safe:
* atomic writes (download to ``*.tmp`` then ``os.replace``)
* exponential-backoff retry with hard socket timeouts
* freshness check -- files older than ``MAX_FILE_AGE_HOURS`` are refreshed
"""

from __future__ import annotations

import logging
import os
import socket
import time
import urllib.request
from pathlib import Path

logger = logging.getLogger("varuna.data_fetcher")

# ---------------------------------------------------------------------------
# Configuration.
# ---------------------------------------------------------------------------
BASE_URL = "https://coastwatch.pfeg.noaa.gov/erddap/griddap"

# Bounding box: Lat 8.0N..12.0N, Lon 78.0E..82.0E (Palk Bay / Coromandel).
LAT_LO, LAT_HI = 8.0, 12.0
LON_LO, LON_HI = 78.0, 82.0

SST_DATASET = "NOAA_DHW"
SST_VARIABLE = "CRW_SST"
CHL_DATASET = "nesdisVHNSQchlaDaily"
CHL_VARIABLE = "chlor_a"

SST_URL = (
    f"{BASE_URL}/{SST_DATASET}.nc?{SST_VARIABLE}[(last)]"
    f"[({LAT_LO}):({LAT_HI})][({LON_LO}):({LON_HI})]"
)
CHL_URL = (
    f"{BASE_URL}/{CHL_DATASET}.nc?{CHL_VARIABLE}[(last)][(0.0)]"
    f"[({LAT_LO}):({LAT_HI})][({LON_LO}):({LON_HI})]"
)

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "satellite"
SST_FILE = DATA_DIR / "latest_sst.nc"
CHL_FILE = DATA_DIR / "latest_chl.nc"

MAX_FILE_AGE_HOURS = 12.0      # refresh cadence for daily satellite composites
DOWNLOAD_TIMEOUT_S = 60.0      # hard socket timeout per attempt
DOWNLOAD_ATTEMPTS = 3          # retry attempts per dataset
BACKOFF_BASE_S = 2.0           # exponential backoff base

_HTTP_HEADERS = {"User-Agent": "VARUNA-MOS/3.1 (offline-first marine intelligence)"}


class DataFetchError(RuntimeError):
    """Raised when a satellite dataset cannot be retrieved after all retries."""


# ---------------------------------------------------------------------------
# Core fetcher.
# ---------------------------------------------------------------------------
def _file_age_hours(path: Path) -> float | None:
    """Age of a file in hours, or None when it does not exist."""
    if not path.exists() or path.stat().st_size == 0:
        return None
    return (time.time() - path.stat().st_mtime) / 3600.0


def is_data_available() -> bool:
    """True when both live satellite rasters are present on disk."""
    return SST_FILE.exists() and CHL_FILE.exists() and SST_FILE.stat().st_size > 0 and CHL_FILE.stat().st_size > 0


def data_age_hours() -> float | None:
    """Age (hours) of the freshest downloaded raster, None when absent."""
    ages = [
        age
        for age in (_file_age_hours(SST_FILE), _file_age_hours(CHL_FILE))
        if age is not None
    ]
    return min(ages) if ages else None


def fetch_netcdf(
    url: str,
    dest: Path,
    *,
    attempts: int = DOWNLOAD_ATTEMPTS,
    timeout_s: float = DOWNLOAD_TIMEOUT_S,
) -> Path:
    """
    Download an ERDDAP griddap NetCDF subset to ``dest`` atomically.

    Retries with exponential backoff on network errors / HTTP 5xx. Raises
    :class:`DataFetchError` after ``attempts`` consecutive failures.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    last_error: Exception | None = None

    for attempt in range(1, attempts + 1):
        try:
            socket.setdefaulttimeout(timeout_s)
            request = urllib.request.Request(url, headers=_HTTP_HEADERS)
            with urllib.request.urlopen(request) as response, open(tmp, "wb") as handle:
                handle.write(response.read())
            if tmp.stat().st_size == 0:
                raise DataFetchError("ERDDAP returned an empty payload")
            os.replace(tmp, dest)  # atomic publish
            logger.info("Downloaded %s (%d bytes) -> %s", url, dest.stat().st_size, dest.name)
            return dest
        except Exception as exc:  # noqa: BLE001 - retries on any network failure
            last_error = exc
            wait_s = BACKOFF_BASE_S * (2 ** (attempt - 1))
            logger.warning(
                "Satellite fetch attempt %d/%d failed (%s: %s); retrying in %.1fs",
                attempt, attempts, type(exc).__name__, exc, wait_s,
            )
            time.sleep(wait_s)
        finally:
            if tmp.exists():
                try:
                    tmp.unlink()
                except OSError:
                    pass

    raise DataFetchError(f"Failed to download {url} after {attempts} attempts: {last_error}")


def fetch_all(force: bool = False) -> dict:
    """
    Ensure both live rasters are on disk and fresh.

    Parameters
    ----------
    force:
        Re-download even when the local files are within ``MAX_FILE_AGE_HOURS``.

    Returns
    -------
    dict with per-dataset status consumed by startup hooks / diagnostics.
    """
    results: dict = {"sst": {"path": str(SST_FILE)}, "chl": {"path": str(CHL_FILE)}}

    age = _file_age_hours(SST_FILE)
    if force or age is None or age > MAX_FILE_AGE_HOURS:
        try:
            fetch_netcdf(SST_URL, SST_FILE)
            results["sst"]["ok"] = True
        except DataFetchError as exc:
            logger.error("SST ingestion failed: %s", exc)
            results["sst"]["ok"] = False
            results["sst"]["error"] = str(exc)
    else:
        results["sst"]["ok"] = True
        results["sst"]["cached"] = True

    age = _file_age_hours(CHL_FILE)
    if force or age is None or age > MAX_FILE_AGE_HOURS:
        try:
            fetch_netcdf(CHL_URL, CHL_FILE)
            results["chl"]["ok"] = True
        except DataFetchError as exc:
            logger.error("Chlorophyll ingestion failed: %s", exc)
            results["chl"]["ok"] = False
            results["chl"]["error"] = str(exc)
    else:
        results["chl"]["ok"] = True
        results["chl"]["cached"] = True

    return results


# ---------------------------------------------------------------------------
# CLI entry point: python -m app.services.data_fetcher
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys

    logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
    print("=" * 64)
    print("VARUNA Real-Time Satellite Ingestion (NOAA CoastWatch ERDDAP)")
    print("=" * 64)
    print(f"SST URL : {SST_URL}")
    print(f"CHL URL : {CHL_URL}")
    force = "--force" in sys.argv
    outcome = fetch_all(force=force)
    for key, info in outcome.items():
        state = "OK" if info.get("ok") else "FAILED"
        cached = " (cached, fresh)" if info.get("cached") else ""
        err = f" :: {info['error']}" if info.get("error") else ""
        print(f"  {key:>4}: {state}{cached}{err}  [{info['path']}]")

    if is_data_available():
        try:
            import xarray as xr

            for label, path in (("SST", SST_FILE), ("CHL", CHL_FILE)):
                ds = xr.open_dataset(path)
                var = list(ds.data_vars)[0]
                age_h = data_age_hours()
                print(
                    f"  {label}: {var} grid {dict(ds.sizes)} | "
                    f"range [{float(ds[var].min()):.3f}, {float(ds[var].max()):.3f}] | "
                    f"file age {age_h:.1f}h"
                )
                ds.close()
        except Exception as exc:  # noqa: BLE001 - diagnostic only
            print(f"  (dataset inspection skipped: {exc})")
    print("=" * 64)
