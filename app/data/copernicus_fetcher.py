"""Copernicus Marine fetcher module for VARUNA.

Fetches real-time physical oceanography (salinity, currents) and
biogeochemical data (chlorophyll-a) from Copernicus Marine Service,
using environment variables for service credentials.
"""

from __future__ import annotations

import os
from typing import Optional

from app.data.ocean_fetcher import get_chlorophyll, get_salinity

COPERNICUS_USERNAME = os.environ.get("COPERNICUSMARINE_SERVICE_USERNAME", "")
COPERNICUS_PASSWORD = os.environ.get("COPERNICUSMARINE_SERVICE_PASSWORD", "")

__all__ = ["get_salinity", "get_chlorophyll", "COPERNICUS_USERNAME", "COPERNICUS_PASSWORD"]
