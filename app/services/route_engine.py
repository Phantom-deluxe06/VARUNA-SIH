import math
from app.services.safety_engine import SafetyEngine
from app.data.open_meteo import get_all_marine_data

se = SafetyEngine()

WAYPOINTS = {
    "chennai":      (13.0827, 80.2707),
    "kelambakkam":  (12.7941, 80.2119),
    "pondicherry":  (11.9416, 79.8083),
    "cuddalore":    (11.7480, 79.7714),
    "nagapattinam": (10.7672, 79.8449),
    "rameswaram":   (9.2881,  79.3129),
    "tuticorin":    (8.7642,  78.1348),
    "kanyakumari":  (8.0883,  77.5385),
}

PFZ_TARGET = (9.5, 80.2)


def optimize_route(start_lat, start_lon,
                   destination_lat=None,
                   destination_lon=None) -> dict:

    marine = get_all_marine_data(start_lat, start_lon)
    wave = marine.get("wave_height_m", 0)
    wind = marine.get("wind_knots", 0)

    dest_lat = destination_lat or PFZ_TARGET[0]
    dest_lon = destination_lon or PFZ_TARGET[1]

    # Direct route
    direct_dist = se.haversine(
        start_lat, start_lon, dest_lat, dest_lon
    )
    direct_bearing = se.calculate_bearing(
        start_lat, start_lon, dest_lat, dest_lon
    )

    # Check IMBL safety along route
    mid_lat = (start_lat + dest_lat) / 2
    mid_lon = (start_lon + dest_lon) / 2
    imbl_at_mid = se.imbl_distance(mid_lat, mid_lon)

    # Safety assessment
    route_safe = (
        wave < 2.5 and
        wind < 30 and
        imbl_at_mid > 5
    )

    # Fuel calculation
    fuel_litres = direct_dist * 2 * 2.5
    fuel_cost = fuel_litres * 100

    # ETA at 8 knots average speed
    eta_hours = direct_dist / 8

    # Waypoints to avoid bad weather
    waypoints = []
    if wave > 1.5:
        waypoints.append(
            f"⚠️ High waves ({wave}m) — hug coastline"
        )
    if imbl_at_mid < 10:
        waypoints.append(
            f"🚨 IMBL proximity — adjust heading west"
        )

    return {
        "start": (start_lat, start_lon),
        "destination": (dest_lat, dest_lon),
        "distance_nm": round(direct_dist, 1),
        "bearing_deg": round(direct_bearing, 0),
        "eta_hours": round(eta_hours, 1),
        "fuel_litres": round(fuel_litres, 0),
        "fuel_cost_inr": round(fuel_cost, 0),
        "route_safe": route_safe,
        "wave_height": wave,
        "wind_knots": wind,
        "imbl_clearance": round(imbl_at_mid, 1),
        "warnings": waypoints,
        "source": "VARUNA Route Engine + Open-Meteo",
    }
