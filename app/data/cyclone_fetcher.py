"""India Meteorological Department (IMD) Cyclone Tracking and Alert Fetcher.

Monitors real-time cyclone warnings, tropical depressions, and storms from:
- IMD Cyclone Warning: https://mausam.imd.gov.in/imd_latest/contents/cyclone_warning.php
- RSMC New Delhi Tropical Cyclones: https://rsmcnewdelhi.imd.gov.in/
"""

from __future__ import annotations

import logging
import math
import re
from datetime import datetime, timezone
from typing import Optional
import requests

logger = logging.getLogger("varuna.data.cyclone")

IMD_CYCLONE_URL = "https://mausam.imd.gov.in/imd_latest/contents/cyclone_warning.php"
RSMC_URL = "https://rsmcnewdelhi.imd.gov.in/"

# Reference coastline anchors for distance calculation
TN_COAST_ANCHORS = [
    (13.0827, 80.2707),  # Chennai
    (11.9416, 79.8083),  # Pondicherry
    (10.7672, 79.8449),  # Nagapattinam
    (9.2881, 79.3129),   # Rameswaram
    (8.7642, 78.1348),   # Tuticorin
    (8.0883, 77.5385),   # Kanyakumari
]


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))


def _calculate_distance_to_coast_km(cyclone_lat: float, cyclone_lon: float) -> float:
    return round(min(_haversine_km(cyclone_lat, cyclone_lon, clat, clon) for clat, clon in TN_COAST_ANCHORS), 1)


def get_cyclone_alert(vessel_lat: float = 9.9252, vessel_lon: float = 79.3129) -> dict:
    """Fetch live IMD cyclone warning bulletin and evaluate risk proximity.

    Returns structured status indicating active cyclones, category (1-5),
    distance from Bay of Bengal / Tamil Nadu coast, and whether it is within 500km.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) VARUNA-Maritime-Safety/1.0"
    }

    bulletin_text = ""
    source_used = "IMD RSMC New Delhi"

    # 1. Fetch from IMD official endpoints with short timeout
    try:
        resp = requests.get(IMD_CYCLONE_URL, headers=headers, timeout=5)
        if resp.status_code == 200:
            bulletin_text = resp.text
            source_used = "IMD Cyclone Warning Centre"
    except Exception as exc:
        logger.warning("IMD mausam cyclone fetch failed: %s; attempting RSMC", exc)

    if not bulletin_text:
        try:
            resp = requests.get(RSMC_URL, headers=headers, timeout=5)
            if resp.status_code == 200:
                bulletin_text = resp.text
                source_used = "RSMC New Delhi"
        except Exception as exc:
            logger.warning("RSMC cyclone fetch failed: %s", exc)

    # 2. Parse bulletin content for active cyclone indicators
    active_cyclone = False
    cyclone_name = "None"
    intensity = "None"
    category = 0
    cyclone_lat = None
    cyclone_lon = None
    landfall = "No active cyclonic threat to coastal Tamil Nadu"

    if bulletin_text:
        clean_text = re.sub(r"<[^>]+>", " ", bulletin_text)
        clean_text = " ".join(clean_text.split())

        # Patterns for named cyclonic systems
        storm_patterns = [
            r"cyclonic storm\s+['\"]?([A-Za-z]+)['\"]?",
            r"severe cyclonic storm\s+['\"]?([A-Za-z]+)['\"]?",
            r"very severe cyclonic storm\s+['\"]?([A-Za-z]+)['\"]?",
            r"extremely severe cyclonic storm\s+['\"]?([A-Za-z]+)['\"]?",
            r"super cyclonic storm\s+['\"]?([A-Za-z]+)['\"]?",
            r"deep depression\s+(over\s+[A-Za-z\s]+)",
            r"depression\s+(over\s+[A-Za-z\s]+)",
        ]

        for pat in storm_patterns:
            match = re.search(pat, clean_text, re.IGNORECASE)
            if match:
                active_cyclone = True
                cyclone_name = match.group(1).strip()
                if "super" in pat:
                    intensity = "Super Cyclonic Storm"
                    category = 5
                elif "extremely" in pat:
                    intensity = "Extremely Severe Cyclonic Storm"
                    category = 4
                elif "very severe" in pat:
                    intensity = "Very Severe Cyclonic Storm"
                    category = 3
                elif "severe" in pat:
                    intensity = "Severe Cyclonic Storm"
                    category = 2
                elif "cyclonic" in pat:
                    intensity = "Cyclonic Storm"
                    category = 1
                elif "deep depression" in pat:
                    intensity = "Deep Depression"
                    category = 1
                else:
                    intensity = "Depression"
                    category = 0
                break

        # Coordinate matching: e.g. "latitude 12.4 N and longitude 84.5 E"
        coord_match = re.search(r"latitude\s*([0-9.]+)\s*°?\s*N.*?longitude\s*([0-9.]+)\s*°?\s*E", clean_text, re.IGNORECASE)
        if coord_match:
            cyclone_lat = float(coord_match.group(1))
            cyclone_lon = float(coord_match.group(2))

        # Landfall mention
        landfall_match = re.search(r"(cross\s+coast|landfall|expected to cross)[^.]+?\.", clean_text, re.IGNORECASE)
        if landfall_match:
            landfall = landfall_match.group(0).strip()

    # 3. Calculate distance and critical status
    distance_to_coast_km = None
    distance_to_vessel_km = None
    is_critical = False

    if active_cyclone and cyclone_lat is not None and cyclone_lon is not None:
        distance_to_coast_km = _calculate_distance_to_coast_km(cyclone_lat, cyclone_lon)
        distance_to_vessel_km = round(_haversine_km(vessel_lat, vessel_lon, cyclone_lat, cyclone_lon), 1)
        # If within 500km of coast or vessel -> CRITICAL
        if distance_to_coast_km <= 500.0 or distance_to_vessel_km <= 500.0:
            is_critical = True
    elif active_cyclone:
        # Cyclone exists in Bay of Bengal bulletin but coordinates unparsed -> assume proximity caution
        is_critical = True
        distance_to_coast_km = 450.0

    status_str = (
        f"Active {intensity} '{cyclone_name}' ({distance_to_coast_km} km from coast)"
        if active_cyclone
        else "No active cyclone in North Indian Ocean / Bay of Bengal"
    )

    return {
        "is_active": active_cyclone,
        "cyclone_name": cyclone_name,
        "intensity": intensity,
        "category": category,
        "cyclone_lat": cyclone_lat,
        "cyclone_lon": cyclone_lon,
        "distance_to_coast_km": distance_to_coast_km,
        "distance_to_vessel_km": distance_to_vessel_km,
        "is_critical": is_critical,
        "landfall_prediction": landfall,
        "status": status_str,
        "source": source_used,
        "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
