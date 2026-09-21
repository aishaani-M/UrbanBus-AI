"""
UrbanBus Edge AI — Geo Utilities

GPS coordinate utilities, geofencing, and route segment mapping.
"""

import math
from typing import Tuple, Optional, List


def haversine_distance(
    lat1: float, lon1: float,
    lat2: float, lon2: float,
) -> float:
    """Distance in meters between two GPS coordinates."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def is_within_geofence(
    lat: float, lon: float,
    fence_center: Tuple[float, float],
    radius_m: float,
) -> bool:
    """Check if a point is within a circular geofence."""
    dist = haversine_distance(lat, lon, fence_center[0], fence_center[1])
    return dist <= radius_m


def bearing_between(
    lat1: float, lon1: float,
    lat2: float, lon2: float,
) -> float:
    """Calculate bearing (degrees) from point 1 to point 2."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dlambda = math.radians(lon2 - lon1)
    x = math.sin(dlambda) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlambda)
    bearing = math.degrees(math.atan2(x, y))
    return (bearing + 360) % 360


def point_to_route_segment(
    lat: float, lon: float,
    route_points: List[Tuple[float, float]],
    segment_length_m: float = 100.0,
) -> str:
    """
    Map a GPS point to the nearest route segment.
    Returns a segment identifier string.
    """
    if not route_points:
        return "unknown"

    # Find nearest route point
    min_dist = float("inf")
    nearest_idx = 0
    for i, (rlat, rlon) in enumerate(route_points):
        d = haversine_distance(lat, lon, rlat, rlon)
        if d < min_dist:
            min_dist = d
            nearest_idx = i

    # Compute cumulative distance to get segment ID
    cum_distance = 0
    for i in range(1, nearest_idx + 1):
        cum_distance += haversine_distance(
            route_points[i - 1][0], route_points[i - 1][1],
            route_points[i][0], route_points[i][1],
        )

    segment_id = int(cum_distance / segment_length_m)
    return f"seg_{segment_id:04d}"


def estimate_speed_from_gps(
    positions: List[Tuple[float, float, float]],  # (lat, lon, timestamp)
) -> float:
    """
    Estimate speed (km/h) from recent GPS positions.
    positions: list of (lat, lon, timestamp) tuples
    """
    if len(positions) < 2:
        return 0.0

    p1 = positions[-2]
    p2 = positions[-1]

    dist_m = haversine_distance(p1[0], p1[1], p2[0], p2[1])
    dt = p2[2] - p1[2]

    if dt <= 0:
        return 0.0

    speed_ms = dist_m / dt
    return speed_ms * 3.6  # Convert m/s to km/h
