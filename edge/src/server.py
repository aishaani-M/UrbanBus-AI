"""
UrbanBus Edge AI — Demo WebSocket Server

FastAPI server that simulates the edge processing pipeline and broadcasts
live events to connected React frontend clients via WebSocket.

Reuses existing GPS/IMU simulators and Pydantic event schemas.
No ONNX models, cameras, or CUDA needed.

Usage:
    python -m edge.src.server
"""

import asyncio
import json
import math
import random
import time
import uuid
import sys
from datetime import datetime, timezone
from typing import Dict, List, Set, Any, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from loguru import logger
from pydantic import BaseModel

# Configure logging
logger.remove()
logger.add(
    sys.stderr,
    level="INFO",
    format="<green>{time:HH:mm:ss}</green> | <level>{level:<7}</level> | {message}",
)

# ═══════════════════════════════════════════════════════════════════════
# Simulated Sensors (lightweight, no hardware dependencies)
# ═══════════════════════════════════════════════════════════════════════

# Hyderabad bus route waypoints (shared across buses with offsets)
HYDERABAD_ROUTES = [
    # Route 1: Miyapur → Charminar
    [
        (17.4400, 78.3489), (17.4350, 78.3680), (17.4380, 78.3880),
        (17.4370, 78.4180), (17.4350, 78.4400), (17.4280, 78.4550),
        (17.4340, 78.5020), (17.4050, 78.4860), (17.3850, 78.4740),
        (17.3580, 78.4740),
    ],
    # Route 2: Secunderabad → Mehdipatnam
    [
        (17.4340, 78.5020), (17.4280, 78.4770), (17.4200, 78.4600),
        (17.4100, 78.4500), (17.3950, 78.4430), (17.3940, 78.4410),
        (17.3900, 78.4350), (17.3850, 78.4300), (17.3800, 78.4280),
        (17.3950, 78.4430),
    ],
    # Route 3: Kukatpally → LB Nagar
    [
        (17.4950, 78.3990), (17.4750, 78.4100), (17.4550, 78.4250),
        (17.4380, 78.4400), (17.4200, 78.4550), (17.4050, 78.4700),
        (17.3900, 78.4850), (17.3750, 78.5050), (17.3600, 78.5200),
        (17.3480, 78.5480),
    ],
]

AREAS = [
    "Ameerpet", "Begumpet", "Banjara Hills", "Jubilee Hills", "Kukatpally",
    "Miyapur", "Secunderabad", "Koti", "Charminar", "Mehdipatnam",
    "Dilsukhnagar", "LB Nagar", "Uppal", "ECIL", "Tarnaka",
    "Madhapur", "Gachibowli", "Hitech City", "Kondapur", "Tolichowki",
]

ROUTE_NAMES = [
    {"id": "RT-001", "number": "10K", "name": "Secunderabad – Koti"},
    {"id": "RT-002", "number": "5V", "name": "JNTU – Charminar"},
    {"id": "RT-003", "number": "216", "name": "Miyapur – LB Nagar"},
]

# Detection classes from edge_config.yaml
ROAD_DEFECT_CLASSES = {
    0: "pothole", 1: "crack", 2: "damaged_road", 3: "missing_divider",
    4: "missing_zebra_crossing", 5: "damaged_signboard", 6: "missing_signboard",
    7: "waterlogging",
}

VEHICLE_CLASSES = {
    0: "car", 1: "truck", 2: "bus", 3: "two_wheeler",
    4: "auto_rickshaw", 5: "bicycle", 6: "emergency_vehicle",
}

PEDESTRIAN_CLASSES = {0: "person", 1: "child", 2: "school_child", 3: "cyclist"}

INCIDENT_TYPES = ["hit_and_run", "rash_driving", "wrong_side", "signal_violation"]

PLATE_PREFIXES = ["TS09", "TS07", "TS08", "AP39", "AP37", "TS10", "TS11", "KA05"]

SEVERITY_MAP = {
    "pothole": "high", "crack": "low", "damaged_road": "medium",
    "missing_divider": "critical", "missing_zebra_crossing": "high",
    "damaged_signboard": "medium", "missing_signboard": "high",
    "waterlogging": "critical",
}

DEFECT_LABELS = {
    "pothole": "Pothole Detected", "crack": "Road Crack Found",
    "damaged_road": "Damaged Road Surface", "missing_divider": "Missing Road Divider",
    "missing_zebra_crossing": "Missing Zebra Crossing",
    "damaged_signboard": "Damaged Signboard", "missing_signboard": "Missing Signboard",
    "waterlogging": "Waterlogging Detected",
}

DEFECT_ICONS = {
    "pothole": "🕳️", "crack": "⚡", "damaged_road": "🛣️",
    "missing_divider": "🚧", "missing_zebra_crossing": "🦓",
    "damaged_signboard": "⚠️", "missing_signboard": "🪧",
    "waterlogging": "🌊",
}

INCIDENT_LABELS = {
    "hit_and_run": "Hit & Run Alert", "rash_driving": "Rash Driving Detected",
    "wrong_side": "Wrong Side Driving", "signal_violation": "Signal Violation",
}

INCIDENT_ICONS = {
    "hit_and_run": "💥", "rash_driving": "🚗", "wrong_side": "↩️",
    "signal_violation": "🚦",
}


def generate_plate() -> str:
    """Generate a realistic Indian license plate."""
    prefix = random.choice(PLATE_PREFIXES)
    letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    mid = random.choice(letters) + random.choice(letters)
    num = str(random.randint(1000, 9999))
    return f"{prefix}{mid}{num}"


def classify_severity(class_name: str, confidence: float) -> str:
    """Classify detection severity based on type and confidence."""
    base = SEVERITY_MAP.get(class_name, "medium")
    if confidence > 0.85 and base in ("high", "critical"):
        return "critical"
    if confidence > 0.75 and base == "medium":
        return "high"
    return base


def get_area_for_position(lat: float, lon: float) -> str:
    """Get approximate area name for GPS position."""
    # Simple mapping based on longitude bands across Hyderabad
    if lon < 78.38:
        return random.choice(["Miyapur", "Kukatpally"])
    elif lon < 78.42:
        return random.choice(["KPHB", "Kukatpally", "Kondapur"])
    elif lon < 78.45:
        return random.choice(["Ameerpet", "Begumpet", "Banjara Hills"])
    elif lon < 78.48:
        return random.choice(["Secunderabad", "Tarnaka", "Koti"])
    elif lon < 78.52:
        return random.choice(["Uppal", "Dilsukhnagar", "LB Nagar"])
    else:
        return random.choice(AREAS)


class BusSimulator:
    """Simulates a single bus moving along a route with sensors."""

    def __init__(self, bus_id: str, route_index: int):
        self.bus_id = bus_id
        self.route_index = route_index
        self.waypoints = HYDERABAD_ROUTES[route_index % len(HYDERABAD_ROUTES)]
        self.route_info = ROUTE_NAMES[route_index % len(ROUTE_NAMES)]
        self.waypoint_idx = random.randint(0, len(self.waypoints) - 1)
        self.segment_progress = random.random()

        # Current state
        self.lat = self.waypoints[self.waypoint_idx][0]
        self.lon = self.waypoints[self.waypoint_idx][1]
        self.speed_kmh = 0.0
        self.heading = 0.0
        self.altitude = 540.0

        # Camera health
        self.camera_health = {
            "front": "ok", "rear": "ok", "left": "ok", "right": "ok"
        }

        # Metrics
        self.start_time = time.time()
        self.frame_count = 0

    def update_position(self):
        """Advance bus along route."""
        wp_current = self.waypoints[self.waypoint_idx]
        wp_next = self.waypoints[(self.waypoint_idx + 1) % len(self.waypoints)]

        self.segment_progress += random.uniform(0.008, 0.025)

        if self.segment_progress >= 1.0:
            self.segment_progress = 0.0
            self.waypoint_idx = (self.waypoint_idx + 1) % len(self.waypoints)
            wp_current = self.waypoints[self.waypoint_idx]
            wp_next = self.waypoints[(self.waypoint_idx + 1) % len(self.waypoints)]

        t = self.segment_progress
        self.lat = wp_current[0] + (wp_next[0] - wp_current[0]) * t + random.gauss(0, 0.0001)
        self.lon = wp_current[1] + (wp_next[1] - wp_current[1]) * t + random.gauss(0, 0.0001)

        # Heading
        dlat = wp_next[0] - wp_current[0]
        dlon = wp_next[1] - wp_current[1]
        self.heading = math.degrees(math.atan2(dlon, dlat)) % 360

        # Speed (slower near stops)
        if self.segment_progress < 0.1 or self.segment_progress > 0.9:
            self.speed_kmh = random.uniform(0, 15)
        else:
            self.speed_kmh = random.uniform(15, 45)

        self.altitude = 540.0 + random.gauss(0, 2)
        self.frame_count += 1

        # Randomly degrade a camera (rare)
        if random.random() < 0.002:
            cam = random.choice(["front", "rear", "left", "right"])
            self.camera_health[cam] = random.choice(["error", "ok", "ok"])

    def get_gps_dict(self) -> dict:
        return {
            "lat": round(self.lat, 6),
            "lon": round(self.lon, 6),
            "altitude": round(self.altitude, 1),
            "speed_kmh": round(self.speed_kmh, 1),
            "heading": round(self.heading, 1),
        }

    def get_position_update(self) -> dict:
        """Generate a bus position update for the frontend."""
        return {
            "type": "bus_position",
            "busId": self.bus_id,
            "position": {
                "lat": round(self.lat, 6),
                "lng": round(self.lon, 6),
            },
            "speed": round(self.speed_kmh),
            "heading": round(self.heading),
            "routeNumber": self.route_info["number"],
            "routeName": self.route_info["name"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


# ═══════════════════════════════════════════════════════════════════════
# Event Generators
# ═══════════════════════════════════════════════════════════════════════

def generate_road_defect_event(bus: BusSimulator) -> dict:
    """Generate a road defect detection event."""
    class_id = random.choice(list(ROAD_DEFECT_CLASSES.keys()))
    class_name = ROAD_DEFECT_CLASSES[class_id]
    confidence = round(random.uniform(0.55, 0.97), 2)
    severity = classify_severity(class_name, confidence)

    return {
        "event_id": str(uuid.uuid4()),
        "event_type": "road_defect",
        "bus_id": bus.bus_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "gps": bus.get_gps_dict(),
        "detection": {
            "class_name": class_name,
            "confidence": confidence,
            "bbox": [
                random.randint(100, 500),
                random.randint(200, 600),
                random.randint(550, 900),
                random.randint(650, 1000),
            ],
            "severity": severity,
        },
        "metadata": {
            "route_id": bus.route_info["id"],
            "route_number": bus.route_info["number"],
            "edge_model_version": "1.0.0",
            "inference_time_ms": round(random.uniform(12, 38), 1),
            "camera_id": random.choice(["front_cam", "left_cam", "right_cam"]),
            "frame_number": bus.frame_count,
        },
        # Frontend-specific fields
        "label": DEFECT_LABELS.get(class_name, class_name),
        "icon": DEFECT_ICONS.get(class_name, "📍"),
        "severity_display": severity,
        "area": get_area_for_position(bus.lat, bus.lon),
    }


def generate_incident_event(bus: BusSimulator) -> dict:
    """Generate a traffic incident event."""
    incident_type = random.choice(INCIDENT_TYPES)
    plate = generate_plate()

    return {
        "event_id": str(uuid.uuid4()),
        "event_type": "incident",
        "bus_id": bus.bus_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "gps": bus.get_gps_dict(),
        "incident_type": incident_type,
        "anpr": {
            "plate_text": plate,
            "confidence": round(random.uniform(0.6, 0.95), 2),
        },
        "vehicle_type": random.choice(["car", "truck", "two_wheeler", "auto_rickshaw"]),
        "speed_estimate_kmh": round(random.uniform(40, 110)),
        "imu_trigger": random.random() < 0.3,
        "metadata": {
            "route_id": bus.route_info["id"],
            "route_number": bus.route_info["number"],
            "edge_model_version": "1.0.0",
            "inference_time_ms": round(random.uniform(15, 45), 1),
            "camera_id": random.choice(["front_cam", "rear_cam"]),
            "frame_number": bus.frame_count,
        },
        # Frontend-specific fields
        "label": INCIDENT_LABELS.get(incident_type, incident_type),
        "icon": INCIDENT_ICONS.get(incident_type, "🚨"),
        "severity_display": "critical",
        "area": get_area_for_position(bus.lat, bus.lon),
    }


def generate_pedestrian_event(bus: BusSimulator) -> dict:
    """Generate a pedestrian safety alert."""
    class_id = random.choice(list(PEDESTRIAN_CLASSES.keys()))
    class_name = PEDESTRIAN_CLASSES[class_id]
    risk_level = random.choice(["medium", "high", "critical"])
    confidence = round(random.uniform(0.6, 0.96), 2)

    labels = {
        "person": "Pedestrian in Path", "child": "Child Near Road",
        "school_child": "School Children Crossing", "cyclist": "Cyclist Hazard",
    }
    icons = {"person": "🚶", "child": "👶", "school_child": "🎒", "cyclist": "🚴"}

    return {
        "event_id": str(uuid.uuid4()),
        "event_type": "pedestrian_alert",
        "bus_id": bus.bus_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "gps": bus.get_gps_dict(),
        "detection": {
            "class_name": class_name,
            "confidence": confidence,
            "bbox": [
                random.randint(200, 600),
                random.randint(100, 400),
                random.randint(650, 900),
                random.randint(500, 900),
            ],
        },
        "pedestrian_count": random.randint(1, 8),
        "risk_level": risk_level,
        "metadata": {
            "route_id": bus.route_info["id"],
            "route_number": bus.route_info["number"],
            "edge_model_version": "1.0.0",
            "inference_time_ms": round(random.uniform(10, 30), 1),
            "camera_id": random.choice(["front_cam", "left_cam"]),
            "frame_number": bus.frame_count,
        },
        # Frontend-specific fields
        "label": labels.get(class_name, "Pedestrian Alert"),
        "icon": icons.get(class_name, "🚶"),
        "severity_display": risk_level,
        "area": get_area_for_position(bus.lat, bus.lon),
    }


def generate_density_event(bus: BusSimulator) -> dict:
    """Generate a vehicle density estimation event."""
    hour = datetime.now().hour
    is_peak = (8 <= hour <= 10) or (17 <= hour <= 20)

    car = random.randint(15 if is_peak else 3, 80 if is_peak else 25)
    truck = random.randint(0, 8 if is_peak else 3)
    bus_count = random.randint(1, 12 if is_peak else 5)
    two_wheeler = random.randint(10 if is_peak else 2, 60 if is_peak else 20)
    auto = random.randint(5 if is_peak else 1, 25 if is_peak else 10)
    total = car + truck + bus_count + two_wheeler + auto

    if total >= 50:
        density_level = "critical"
    elif total >= 30:
        density_level = "high"
    elif total >= 10:
        density_level = "normal"
    else:
        density_level = "low"

    return {
        "event_id": str(uuid.uuid4()),
        "event_type": "vehicle_density",
        "bus_id": bus.bus_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "gps": bus.get_gps_dict(),
        "vehicle_counts": {
            "car": car, "truck": truck, "bus": bus_count,
            "two_wheeler": two_wheeler, "auto_rickshaw": auto,
            "total": total,
        },
        "density_level": density_level,
        "metadata": {
            "route_id": bus.route_info["id"],
            "route_number": bus.route_info["number"],
            "edge_model_version": "1.0.0",
            "camera_id": "front_cam",
            "frame_number": bus.frame_count,
        },
        # Frontend-specific fields
        "label": f"Traffic Density: {density_level.title()}",
        "icon": "🚗" if density_level != "critical" else "🛑",
        "severity_display": density_level if density_level != "normal" else "low",
        "area": get_area_for_position(bus.lat, bus.lon),
    }


def generate_bus_status_event(bus: BusSimulator) -> dict:
    """Generate a bus status heartbeat event."""
    uptime = time.time() - bus.start_time
    return {
        "event_id": str(uuid.uuid4()),
        "event_type": "bus_status",
        "bus_id": bus.bus_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "gps": bus.get_gps_dict(),
        "status": "active",
        "camera_health": bus.camera_health,
        "edge_metrics": {
            "frames_processed": bus.frame_count,
            "uptime_s": round(uptime, 1),
            "cpu_temp": round(random.uniform(48, 68), 1),
            "gpu_temp": round(random.uniform(52, 75), 1),
            "inference_latency_ms": round(random.uniform(15, 40), 1),
            "road_roughness": round(random.uniform(0.0, 0.4), 3),
        },
        "uptime_hours": round(uptime / 3600, 2),
        "metadata": {
            "route_id": bus.route_info["id"],
            "route_number": bus.route_info["number"],
            "edge_model_version": "1.0.0",
        },
    }


def generate_random_event(bus: BusSimulator) -> dict:
    """Generate a random event from any type with weighted probability."""
    r = random.random()
    if r < 0.35:
        return generate_road_defect_event(bus)
    elif r < 0.55:
        return generate_density_event(bus)
    elif r < 0.75:
        return generate_pedestrian_event(bus)
    elif r < 0.90:
        return generate_incident_event(bus)
    else:
        return generate_bus_status_event(bus)


# ═══════════════════════════════════════════════════════════════════════
# FastAPI Application
# ═══════════════════════════════════════════════════════════════════════

app = FastAPI(title="UrbanBus Edge Demo Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state
buses: List[BusSimulator] = [
    BusSimulator("TS-001", 0),
    BusSimulator("TS-002", 1),
    BusSimulator("TS-003", 2),
]
connected_clients: Set[WebSocket] = set()
event_stats = {"total_events": 0, "critical_alerts": 0, "active_detections": 0}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "buses": len(buses),
        "clients": len(connected_clients),
        "stats": event_stats,
    }


@app.get("/api/buses")
async def get_buses():
    """Get current state of all simulated buses."""
    return [
        {
            "id": bus.bus_id,
            "routeNumber": bus.route_info["number"],
            "routeName": bus.route_info["name"],
            "position": {"lat": round(bus.lat, 6), "lng": round(bus.lon, 6)},
            "speed": round(bus.speed_kmh),
            "heading": round(bus.heading),
            "status": "active",
            "cameraHealth": bus.camera_health,
        }
        for bus in buses
    ]


async def broadcast(message: dict):
    """Send a message to all connected WebSocket clients."""
    if not connected_clients:
        return

    payload = json.dumps(message)
    disconnected = set()

    for ws in connected_clients:
        try:
            await ws.send_text(payload)
        except Exception:
            disconnected.add(ws)

    connected_clients.difference_update(disconnected)


async def event_loop():
    """Main event generation loop. Runs continuously in background."""
    logger.info("🚌 Event generation loop started")

    while True:
        # Update all bus positions
        for bus in buses:
            bus.update_position()

        # Send position updates for all buses
        for bus in buses:
            await broadcast(bus.get_position_update())

        # Generate 1-2 detection events per cycle (from random buses)
        n_events = random.randint(1, 2)
        for _ in range(n_events):
            bus = random.choice(buses)
            event = generate_random_event(bus)
            await broadcast(event)

            event_stats["total_events"] += 1
            severity = event.get("severity_display", event.get("detection", {}).get("severity", ""))
            if severity == "critical":
                event_stats["critical_alerts"] += 1
            event_stats["active_detections"] += 1

        # Log stats periodically
        if event_stats["total_events"] % 50 == 0 and event_stats["total_events"] > 0:
            logger.info(
                f"📊 Events: {event_stats['total_events']} | "
                f"Clients: {len(connected_clients)} | "
                f"Critical: {event_stats['critical_alerts']}"
            )

        # Wait 2-4 seconds between cycles
        await asyncio.sleep(random.uniform(2.0, 4.0))


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time event streaming."""
    await websocket.accept()
    connected_clients.add(websocket)

    client_id = f"{websocket.client.host}:{websocket.client.port}"
    logger.info(f"✅ Client connected: {client_id} ({len(connected_clients)} total)")

    # Send initial state: current bus positions
    for bus in buses:
        try:
            await websocket.send_text(json.dumps(bus.get_position_update()))
        except Exception:
            pass

    # Send a welcome message
    try:
        await websocket.send_text(json.dumps({
            "type": "connection_status",
            "status": "connected",
            "server": "UrbanBus Edge Demo",
            "buses": len(buses),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }))
    except Exception:
        pass

    try:
        # Keep connection alive — listen for pings/messages from client
        while True:
            data = await websocket.receive_text()
            # Handle client messages (e.g., ping)
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({
                        "type": "pong",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }))
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        connected_clients.discard(websocket)
        logger.info(f"❌ Client disconnected: {client_id} ({len(connected_clients)} remaining)")
    except Exception as e:
        connected_clients.discard(websocket)
        logger.warning(f"Client error: {client_id} — {e}")


@app.on_event("startup")
async def startup():
    """Start the background event generation loop on server start."""
    logger.info("═══════════════════════════════════════════")
    logger.info("  UrbanBus Edge Demo Server")
    logger.info(f"  Simulating {len(buses)} buses")
    logger.info("  WebSocket: wss://urbanbus-ai.onrender.com/ws")
    logger.info("═══════════════════════════════════════════")
    asyncio.create_task(event_loop())


if __name__ == "__main__":
    uvicorn.run(
        "edge.src.server:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info",
    )
