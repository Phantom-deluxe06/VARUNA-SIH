"""Real chlorophyll-a fetcher for VARUNA.

The primary raster channel (NOAA ERDDAP ``nesdisVHNSQ`` / CoastWatch) is
unreachable from Indian networks, so this module pulls chlorophyll-a from
sources that work from India — all free, no API key:

1. **CoastWatch ERDDAP VIIRS monthly chlor_a** — JSON griddap subset around
   the vessel position (``nesdisVHNSQchlaMonthly``).
2. **NASA OceanColour Web (oceandata.sci.gsfc.nasa.gov)** — MODIS L3m monthly
   ``OC/CHL`` file search + direct download, opened with xarray if available.
   NOTE (verified 2026-09): NASA now fronts ``file_search``/``getfile`` with
   an Earthdata Login interstitial, so this source typically yields no
   anonymous listing — the code probes deterministic monthly filenames and
   validates the payload, failing fast to source 3 until NASA relaxes access.
3. **SST-derived estimate** — last resort using a real oceanographic
   relationship: upwelling zones near SST fronts are chlorophyll-rich
   (cooler water => higher surface chlorophyll), warm stratified water => low.

Every source failure is logged and the next source is tried, so callers
always receive a usable dict.
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import requests

logger = logging.getLogger("varuna.chlorophyll")

REQUEST_TIMEOUT_S = 10.0
DOWNLOAD_TIMEOUT_S = 120.0


class ChlorophyllFetcher:
    """Multi-source chlorophyll-a accessor with an SST-derived last resort."""

    SOURCES = [
        # Source 1: ERDDAP VIIRS (different dataset)
        "https://coastwatch.pfeg.noaa.gov/erddap/griddap/nesdisVHNSQchlaMonthly.json",
        # Source 2: Direct NASA file
        "https://oceandata.sci.gsfc.nasa.gov/cgi/getfile/",
    ]

    ERDDAP_VARIABLE = "chlor_a"
    GRID_BOX_DEG = 1.0     # half-width of the subset box around the vessel
    GRID_STRIDE = 0.2      # deg; keeps the JSON payload small

    NASA_FILE_SEARCH = "https://oceandata.sci.gsfc.nasa.gov/api/file_search"
    NASA_CACHE_DIR = Path(__file__).resolve().parent / "satellite"

    def get_chlorophyll(
        self,
        lat: float = 9.9252,
        lon: float = 79.3129,
        sst: Optional[float] = None,
    ) -> dict:
        """Chlorophyll-a (mg/m3) at (lat, lon); never raises, never returns None.

        Tries each source in :data:`SOURCES` order, then falls back to the
        SST-derived oceanographic estimate. ``sst`` may be supplied by callers
        that already fetched Open-Meteo data to avoid a duplicate request.
        """
        for source in self.SOURCES:
            try:
                result = self._fetch_from_source(source, lat, lon)
                if result:
                    return result
            except Exception as exc:
                logger.warning("Chlorophyll source failed (%s): %s", source, exc)
                continue

        # Last resort: estimate from SST.
        return self._estimate_from_sst(lat, lon, sst=sst)

    # ------------------------------------------------------------------
    # Source dispatch
    # ------------------------------------------------------------------
    def _fetch_from_source(self, source: str, lat: float, lon: float) -> Optional[dict]:
        if source.endswith(".json") or "erddap" in source:
            return self._fetch_erddap(source, lat, lon)
        if "oceandata.sci.gsfc.nasa.gov" in source:
            return self._fetch_nasa(lat, lon)
        raise ValueError(f"Unknown chlorophyll source: {source}")

    # ------------------------------------------------------------------
    # Source 1: CoastWatch ERDDAP VIIRS monthly chlor_a (JSON griddap)
    # ------------------------------------------------------------------
    def _fetch_erddap(self, base_url: str, lat: float, lon: float) -> Optional[dict]:
        # Monthly composites: the current month is incomplete, so request the
        # trailing ~3 months and use the latest time slice with valid data.
        first_of_month = datetime.now().replace(day=1)
        end = first_of_month.strftime("%Y-%m-%d")
        start = (first_of_month - timedelta(days=92)).strftime("%Y-%m-%d")

        lat_lo = round(max(-90.0, lat - self.GRID_BOX_DEG), 3)
        lat_hi = round(min(90.0, lat + self.GRID_BOX_DEG), 3)
        lon_lo = round(max(0.0, lon - self.GRID_BOX_DEG), 3)
        lon_hi = round(min(360.0, lon + self.GRID_BOX_DEG), 3)

        query = (
            f"{self.ERDDAP_VARIABLE}[({start}):1:({end})]"
            f"[({lat_lo}):{self._stride_int(lat_lo, lat_hi)}:({lat_hi})]"
            f"[({lon_lo}):{self._stride_int(lon_lo, lon_hi)}:({lon_hi})]"
        )
        resp = requests.get(base_url, params={"query": query}, timeout=REQUEST_TIMEOUT_S)
        resp.raise_for_status()
        return self._parse_erddap_table(resp.json(), lat, lon)

    def _parse_erddap_table(self, payload: dict, lat: float, lon: float) -> Optional[dict]:
        table = payload["table"]
        cols = table["columnNames"]
        idx = {name: i for i, name in enumerate(cols)}
        for required in ("chlor_a", "latitude", "longitude", "time"):
            if required not in idx:
                raise ValueError(f"ERDDAP response missing column '{required}'")

        best: Optional[tuple] = None  # (time, -distance_sq, value, rlat, rlon)
        for row in table.get("rows", []):
            try:
                value = float(row[idx["chlor_a"]])
            except (TypeError, ValueError):
                continue
            if not math.isfinite(value) or value <= 0:
                continue
            rlat = float(row[idx["latitude"]])
            rlon = float(row[idx["longitude"]])
            rtime = str(row[idx["time"]])
            dist_sq = (rlat - lat) ** 2 + (rlon - lon) ** 2
            key = (rtime, -dist_sq)
            if best is None or key > (best[0], -best[1]):
                best = (rtime, dist_sq, value, rlat, rlon)

        if best is None:
            return None

        rtime, _, value, rlat, rlon = best
        return {
            "chl_mg_m3": round(value, 3),
            "source": "NASA_VIIRS_COASTWATCH_ERDDAP",
            "method": "VIIRS monthly chlor_a griddap subset (nearest cell)",
            "grid_lat": round(rlat, 3),
            "grid_lon": round(rlon, 3),
            "obs_time": rtime,
            "confidence": "HIGH",
        }

    @staticmethod
    def _stride_int(lo: float, hi: float) -> int:
        span = max(abs(hi - lo), 0.1)
        return max(1, int(span / ChlorophyllFetcher.GRID_STRIDE))

    # ------------------------------------------------------------------
    # Source 2: NASA OceanColour Web — MODIS L3m monthly OC/CHL file
    # ------------------------------------------------------------------
    def _fetch_nasa(self, lat: float, lon: float) -> Optional[dict]:
        file_url = self._latest_nasa_file_url()
        if not file_url:
            return None

        try:
            import xarray as xr  # heavy import — only needed on this path
        except ImportError as exc:
            raise RuntimeError("xarray unavailable for NASA L3m netCDF") from exc

        nc_path = self._download_nasa_file(file_url)
        ds = xr.open_dataset(nc_path)
        try:
            da = ds["chlor_a"]
            point = da.sel(lat=lat, lon=lon, method="nearest")
            value = float(point.values)
            grid_lat = float(point["lat"].values)
            grid_lon = float(point["lon"].values)
        finally:
            ds.close()

        if not math.isfinite(value) or value <= 0:
            return None

        return {
            "chl_mg_m3": round(value, 3),
            "source": "NASA_OCEANDATA_MODIS_L3M",
            "method": "MODIS monthly L3m chlor_a (nearest grid cell)",
            "grid_lat": round(grid_lat, 3),
            "grid_lon": round(grid_lon, 3),
            "obs_time": nc_path.stem,
            "confidence": "HIGH",
        }

    def _latest_nasa_file_url(self) -> Optional[str]:
        """Newest MODIS monthly OC/CHL L3m download URL (listing or probe)."""
        listed = self._listed_nasa_file_url()
        if listed:
            return listed
        # file_search now serves an Earthdata Login HTML page, so probe the
        # deterministic OB.DAAC monthly filename for recent complete months.
        first_of_month = datetime.now().replace(day=1)
        for months_back in range(1, 4):
            month_start = first_of_month - timedelta(days=30 * months_back)
            month_start = month_start.replace(day=1)
            next_month = (month_start + timedelta(days=32)).replace(day=1)
            start = month_start.strftime("%Y%m%d")
            end = (next_month - timedelta(days=1)).strftime("%Y%m%d")
            candidate = (
                f"AQUA_MODIS.{start}_{end}.L3m.MO.CHL.chlor_a.9km.nc"
            )
            url = f"{self.SOURCES[1]}{candidate}"
            try:
                resp = requests.get(url, timeout=REQUEST_TIMEOUT_S, stream=True)
                try:
                    ctype = resp.headers.get("content-type", "")
                    if resp.status_code == 200 and "html" not in ctype:
                        resp.close()
                        return url
                finally:
                    resp.close()
            except requests.RequestException:
                continue
        return None

    def _listed_nasa_file_url(self) -> Optional[str]:
        """Parse a real file listing (text / JSON / embedded HTML hrefs)."""
        params = {
            "sensor": "MODIS",
            "dtype": "L3m",
            "add_url": 1,
            "period": "MO",
            "std_type": "OC",
            "data_type": "CHL",
        }
        resp = requests.get(self.NASA_FILE_SEARCH, params=params, timeout=REQUEST_TIMEOUT_S)
        resp.raise_for_status()

        urls: list[str] = []
        try:
            data = resp.json()
            if isinstance(data, dict):
                data = data.get("file_search") or data.get("results") or []
            for item in data:
                url = item.get("url") if isinstance(item, dict) else str(item)
                if url:
                    urls.append(url)
        except (ValueError, AttributeError):  # text listing or Earthdata Login HTML page
            import re

            urls = re.findall(r"https?://[^\s\"'<>]+\.nc", resp.text) or [
                line.strip()
                for line in resp.text.splitlines()
                if line.strip().lower().endswith(".nc")
            ]

        nc_urls = [u for u in urls if u.lower().endswith(".nc")]
        return sorted(nc_urls)[-1] if nc_urls else None

    def _download_nasa_file(self, file_url: str) -> Path:
        self.NASA_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        filename = file_url.rsplit("/", 1)[-1] or "nasa_modis_chl_latest.nc"
        nc_path = self.NASA_CACHE_DIR / filename
        if nc_path.exists() and nc_path.stat().st_size > 0:
            return nc_path  # cached from an earlier call
        resp = requests.get(file_url, timeout=DOWNLOAD_TIMEOUT_S)
        resp.raise_for_status()
        ctype = resp.headers.get("content-type", "")
        if "html" in ctype:  # Earthdata Login interstitial, not the dataset
            raise RuntimeError("NASA returned an HTML page instead of netCDF")
        nc_path.write_bytes(resp.content)
        return nc_path

    # ------------------------------------------------------------------
    # Last resort: SST-derived oceanographic estimate
    # ------------------------------------------------------------------
    def _estimate_from_sst(
        self, lat: float, lon: float, sst: Optional[float] = None
    ) -> dict:
        if sst is None:
            from app.data.open_meteo import get_all_marine_data

            marine = get_all_marine_data(lat, lon)
            sst = marine["sst_celsius"]
        sst = float(sst)

        # Real oceanographic relationship:
        # SST 26-28C = upwelling = high chl (1.5-2.5)
        # SST 28-30C = moderate chl (0.5-1.5)
        # SST 30-32C = warm water = low chl (0.1-0.5)
        if sst < 28:
            chl_estimate = 2.1
        elif sst < 30:
            chl_estimate = 1.2
        else:
            chl_estimate = 0.6

        return {
            "chl_mg_m3": chl_estimate,
            "source": "SST_DERIVED_OCEANOGRAPHIC",
            "method": "SST-CHL inverse relationship",
            "sst_used": sst,
            "confidence": "MEDIUM",
        }


_module_fetcher = ChlorophyllFetcher()


def get_chlorophyll(
    lat: float = 9.9252,
    lon: float = 79.3129,
    sst: Optional[float] = None,
) -> dict:
    """Convenience wrapper around a module-level :class:`ChlorophyllFetcher`."""
    return _module_fetcher.get_chlorophyll(lat, lon, sst=sst)