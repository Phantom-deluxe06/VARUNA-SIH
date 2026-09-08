"""VARUNA SafetyEngine — geometry and IMBL safety utilities.

Wraps the core Haversine / cross-track / bearing calculations and the
embedded SQLite geofence ring into a reusable engine consumed by the
LangGraph orchestration layer.
"""

from __future__ import annotations

import math
from typing import Optional

from app.db.database import get_geofence_ring

EARTH_RADIUS_KM = 6371.0088
KM_PER_NM = 1.852
_NAUTICAL_EARTH_RADIUS = EARTH_RADIUS_KM / KM_PER_NM  # ≈ 3440.065 NM


class SafetyEngine:
    """Stateless geometry engine for IMBL boundary and navigation safety."""

    # ── Haversine distance ─────────────────────────────────────────────
    @staticmethod
    def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Great-circle distance between two points in nautical miles."""
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlam = math.radians(lon2 - lon1)
        a = (
            math.sin(dphi / 2.0) ** 2
            + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0) ** 2
        )
        return _NAUTICAL_EARTH_RADIUS * 2.0 * math.atan2(
            math.sqrt(a), math.sqrt(max(0.0, 1.0 - a))
        )

    # ── Forward azimuth / bearing ──────────────────────────────────────
    @staticmethod
    def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Forward azimuth (degrees, 0-360 clockwise from north)."""
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dlam = math.radians(lon2 - lon1)
        y = math.sin(dlam) * math.cos(phi2)
        x = (
            math.cos(phi1) * math.sin(phi2)
            - math.sin(phi1) * math.cos(phi2) * math.cos(dlam)
        )
        bearing = math.degrees(math.atan2(y, x))
        return (bearing + 360) % 360

    # ── Cross-track distance to a segment ──────────────────────────────
    @staticmethod
    def _central_angle_rad(phi1: float, lam1: float, phi2: float, lam2: float) -> float:
        dphi = phi2 - phi1
        dlam = lam2 - lam1
        a = (
            math.sin(dphi / 2.0) ** 2
            + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0) ** 2
        )
        return 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))

    @staticmethod
    def _bearing_rad(phi1: float, lam1: float, phi2: float, lam2: float) -> float:
        dlam = lam2 - lam1
        y = math.sin(dlam) * math.cos(phi2)
        x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlam)
        return math.atan2(y, x)

    def _cross_track_distance_nm(
        self,
        lat: float, lon: float,
        seg_a: tuple[float, float],
        seg_b: tuple[float, float],
    ) -> float:
        """Perpendicular great-circle distance (NM) from point to segment a→b."""
        r_nm = _NAUTICAL_EARTH_RADIUS
        phi_p, lam_p = math.radians(lat), math.radians(lon)
        phi_a, lam_a = math.radians(seg_a[0]), math.radians(seg_a[1])
        phi_b, lam_b = math.radians(seg_b[0]), math.radians(seg_b[1])

        d13 = self._central_angle_rad(phi_p, lam_p, phi_a, lam_a)
        theta12 = self._bearing_rad(phi_a, lam_a, phi_b, lam_b)
        theta13 = self._bearing_rad(phi_a, lam_a, phi_p, lam_p)
        delta_theta = theta13 - theta12

        x_track = math.asin(
            max(-1.0, min(1.0, math.sin(d13) * math.sin(delta_theta)))
        ) * r_nm

        denom = max(1e-12, math.cos(x_track / r_nm))
        a_track = math.acos(max(-1.0, min(1.0, math.cos(d13) / denom))) * r_nm
        if delta_theta < 0.0:
            a_track = -a_track

        seg_len = self._central_angle_rad(phi_a, lam_a, phi_b, lam_b) * r_nm
        if a_track < 0.0:
            return abs(d13 * r_nm)
        if a_track > seg_len:
            d2b = self._central_angle_rad(phi_p, lam_p, phi_b, lam_b) * r_nm
            return abs(d2b)
        return abs(x_track)

    # ── IMBL distance (nautical miles) ─────────────────────────────────
    def imbl_distance(self, lat: float, lon: float) -> float:
        """Minimum distance (NM) from position to the IMBL boundary ring."""
        ring = get_geofence_ring()
        if not ring:
            return 999.0  # No ring data → safe fallback
        best_nm = math.inf
        n = len(ring)
        for i in range(n):
            d = self._cross_track_distance_nm(lat, lon, ring[i], ring[(i + 1) % n])
            if d < best_nm:
                best_nm = d
        return best_nm
