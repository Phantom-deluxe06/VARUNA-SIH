"""Live marine weather from the Open-Meteo APIs.

Free, key-less, CORS-open. Two endpoints are combined:

* ``marine-api.open-meteo.com/v1/marine``  -> wave height / period / direction,
  wind-wave and swell components (ECMWF WAM / GFS-Wave).
* ``api.open-meteo.com/v1/forecast``       -> 10 m wind speed / direction / gusts.

Only the Python standard library is used (mirrors ``app/services/data_fetcher``),
so no new dependency is introduced. Results are cached in-process for a few
minutes so the 30 s dashboard poll and repeated agent calls do not hammer the
service. Any failure raises ``LiveDataError`` so the caller can fall back to the
deterministic model.
"""

from __future__ import annotations

import json
import logging
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

logger = logging.getLogger("varuna.open_meteo")

MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

_CACHE_TTL_S = 600.0
_TIMEOUT_S = 8.0
_cache: dict[tuple[float, float], tuple[float, dict]] = {}


class LiveDataError(RuntimeError):
    """Raised when live marine weather cannot be retrieved."""


def _get_json(url: str, params: dict) -> dict:
    query = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{url}?{query}", headers={"User-Agent": "VARUNA/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
            if resp.status != 200:
                raise LiveDataError(f"{url} -> HTTP {resp.status}")
            return json.loads(resp.read().decode("utf-8"))
    except LiveDataError:
        raise
    except Exception as exc:  # URLError, timeout, JSON, ...
        raise LiveDataError(f"{url} failed: {exc}") from exc


class OpenMeteoMarine:
    """Thin client that returns a normalised sea-state dict."""

    def get_sea_state(self, lat: float, lon: float) -> dict:
        key = (round(lat, 2), round(lon, 2))
        now = time.monotonic()
        cached = _cache.get(key)
        if cached and now - cached[0] < _CACHE_TTL_S:
            return cached[1]

        marine = _get_json(
            MARINE_URL,
            {
                "latitude": lat,
                "longitude": lon,
                "current": "wave_height,wave_period,wave_direction,wind_wave_height,swell_wave_height",
            },
        )
        wind = _get_json(
            FORECAST_URL,
            {
                "latitude": lat,
                "longitude": lon,
                "current": "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
                "wind_speed_unit": "kn",
            },
        )

        m = marine.get("current") or {}
        w = wind.get("current") or {}
        if m.get("wave_height") is None:
            raise LiveDataError("Open-Meteo returned no wave_height")

        wave = float(m["wave_height"])
        period = m.get("wave_period")
        wind_kn = w.get("wind_speed_10m")
        gust_kn = w.get("wind_gusts_10m")

        result = {
            "wave_height_m": round(wave, 2),
            "wave_period_s": round(float(period), 1) if period is not None else round(max(4.5, 9.5 - wave * 1.2), 1),
            "wind_speed_knots": round(float(wind_kn), 1) if wind_kn is not None else 0.0,
            "gust_knots": round(float(gust_kn), 1) if gust_kn is not None else 0.0,
            "wind_direction_deg": w.get("wind_direction_10m"),
            "wave_direction_deg": m.get("wave_direction"),
            "swell_height_m": m.get("swell_wave_height"),
            "wind_wave_height_m": m.get("wind_wave_height"),
            "source": "open-meteo",
            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        _cache[key] = (now, result)
        return result


    def get_daily_forecast(self, lat: float, lon: float, day_offset: int = 1) -> dict:
        """Daily max wave / wind for ``today + day_offset`` (default: tomorrow)."""
        marine = _get_json(
            MARINE_URL,
            {
                "latitude": lat,
                "longitude": lon,
                "daily": "wave_height_max,wave_period_max,swell_wave_height_max",
                "forecast_days": max(2, day_offset + 1),
                "timezone": "auto",
            },
        )
        wind = _get_json(
            FORECAST_URL,
            {
                "latitude": lat,
                "longitude": lon,
                "daily": "wind_speed_10m_max,wind_gusts_10m_max",
                "wind_speed_unit": "kn",
                "forecast_days": max(2, day_offset + 1),
                "timezone": "auto",
            },
        )
        md = marine.get("daily") or {}
        wd = wind.get("daily") or {}
        times = md.get("time") or []
        if day_offset >= len(times):
            raise LiveDataError(f"Open-Meteo daily has no day+{day_offset}")

        def _at(series: list, i: int):
            return series[i] if series and i < len(series) else None

        wave = _at(md.get("wave_height_max"), day_offset)
        if wave is None:
            raise LiveDataError("Open-Meteo daily returned no wave_height_max")
        return {
            "date": times[day_offset],
            "wave_height_m": round(float(wave), 2),
            "wave_period_s": round(float(_at(md.get("wave_period_max"), day_offset) or 0.0), 1) or None,
            "swell_height_m": _at(md.get("swell_wave_height_max"), day_offset),
            "wind_speed_knots": round(float(_at(wd.get("wind_speed_10m_max"), day_offset) or 0.0), 1) or None,
            "gust_knots": round(float(_at(wd.get("wind_gusts_10m_max"), day_offset) or 0.0), 1) or None,
            "source": "open-meteo",
            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }


_client = OpenMeteoMarine()


def live_sea_state(lat: float, lon: float) -> dict:
    """Module-level helper; raises :class:`LiveDataError` on any failure."""
    return _client.get_sea_state(lat, lon)


def daily_forecast(lat: float, lon: float, day_offset: int = 1) -> dict:
    """Module-level helper; raises :class:`LiveDataError` on any failure."""
    return _client.get_daily_forecast(lat, lon, day_offset)
