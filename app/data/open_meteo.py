"""Live marine weather from the Open-Meteo APIs.

Real-time Open-Meteo Marine and Forecast APIs providing:
- sea_surface_temperature (SST)
- wave_height, wave_period, wave_direction, swell_wave_height, wind_wave_height
- ocean_current_velocity
- 10m wind speed and gusts (knots)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional
import requests

logger = logging.getLogger("varuna.open_meteo")

MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


class LiveDataError(RuntimeError):
    """Raised when live marine weather cannot be retrieved."""


def get_all_marine_data(lat: float = 9.9252, lon: float = 79.3129) -> dict:
    """Fetch real-time comprehensive marine and wind data from Open-Meteo."""
    import requests
    url = "https://marine-api.open-meteo.com/v1/marine"
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": [
            "wave_height",
            "wave_period",
            "sea_surface_temperature", 
            "ocean_current_velocity",
            "wave_direction",
            "swell_wave_height",
            "wind_wave_height"
        ],
        "forecast_days": 2
    }
    r = requests.get(url, params=params, timeout=10)
    data = r.json()
    hourly = data["hourly"]

    # Fetch live 10m wind speed and gusts in knots from Open-Meteo forecast API
    wind_knots = 0.0
    gust_knots = 0.0
    try:
        f_params = {
            "latitude": lat,
            "longitude": lon,
            "current": ["wind_speed_10m", "wind_gusts_10m"],
            "wind_speed_unit": "kn",
        }
        rf = requests.get(FORECAST_URL, params=f_params, timeout=8)
        if rf.status_code == 200:
            f_curr = rf.json().get("current", {})
            wind_knots = round(float(f_curr.get("wind_speed_10m", 0.0) or 0.0), 1)
            gust_knots = round(float(f_curr.get("wind_gusts_10m", 0.0) or 0.0), 1)
    except Exception as exc:
        logger.warning("Forecast wind fetch failed: %s", exc)

    raw_period = hourly.get("wave_period", [None])[0]
    wave_period_s = round(float(raw_period), 2) if raw_period is not None else None

    return {
        "sst_celsius": hourly["sea_surface_temperature"][0],
        "wave_height_m": hourly["wave_height"][0],
        "wave_period_s": wave_period_s,
        "ocean_current_ms": hourly["ocean_current_velocity"][0],
        "wave_direction_deg": hourly["wave_direction"][0],
        "swell_height_m": hourly["swell_wave_height"][0],
        "wind_knots": wind_knots,
        "gust_knots": gust_knots,
        "wind_speed_knots": wind_knots,
        "max_wave_24h": max(hourly["wave_height"][:24]),
        "forecast_waves": hourly["wave_height"][:48],
        "source": "OPEN_METEO_MARINE_LIVE",
        "coordinates": {"lat": lat, "lon": lon}
    }


class OpenMeteoMarine:
    """Thin client returning normalised sea-state dict backed by get_all_marine_data."""

    def get_sea_state(self, lat: float, lon: float) -> dict:
        data = get_all_marine_data(lat, lon)
        return {
            "wave_height_m": data["wave_height_m"],
            "sst_celsius": data["sst_celsius"],
            "ocean_current_ms": data["ocean_current_ms"],
            "wave_direction_deg": data["wave_direction_deg"],
            "swell_height_m": data["swell_height_m"],
            "wind_speed_knots": data["wind_speed_knots"],
            "wind_knots": data["wind_knots"],
            "gust_knots": data["gust_knots"],
            "wave_period_s": data["wave_period_s"],
            "source": data["source"],
            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }

    def get_daily_forecast(self, lat: float, lon: float, day_offset: int = 1) -> dict:
        data = get_all_marine_data(lat, lon)
        forecast_waves = data.get("forecast_waves", [])
        wave_max = max(forecast_waves[24:48]) if len(forecast_waves) >= 48 else data["max_wave_24h"]
        return {
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "wave_height_m": wave_max,
            "wave_period_s": data["wave_period_s"],
            "swell_height_m": data["swell_height_m"],
            "wind_speed_knots": data["wind_speed_knots"],
            "wind_knots": data["wind_knots"],
            "gust_knots": data["gust_knots"],
            "source": data["source"],
            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }


_client = OpenMeteoMarine()


def live_sea_state(lat: float, lon: float) -> dict:
    """Module-level helper for live sea state."""
    return _client.get_sea_state(lat, lon)


def daily_forecast(lat: float, lon: float, day_offset: int = 1) -> dict:
    """Module-level helper for marine forecast."""
    return _client.get_daily_forecast(lat, lon, day_offset)
