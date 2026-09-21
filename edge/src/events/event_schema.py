"""
UrbanBus Edge AI — Event Schemas

Pydantic models for all event types published to MQTT.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class GPSData(BaseModel):
    """GPS position data."""
    lat: float
    lon: float
    altitude: float = 0.0
    speed_kmh: float = 0.0
    heading: float = 0.0

class DetectionData(BaseModel):
    """Single detection result."""
    class_name: str
    confidence: float
    bbox: List[int]  # [x1, y1, x2, y2]
    severity: Optional[str] = None  # critical, high, medium, low

class ANPRData(BaseModel):
    """ANPR (license plate) result."""
    plate_text: str
    confidence: float
    bbox: Optional[List[int]] = None

class VehicleCounts(BaseModel):
    """Vehicle density counts by class."""
    car: int = 0
    truck: int = 0
    bus: int = 0
    two_wheeler: int = 0
    auto_rickshaw: int = 0
    bicycle: int = 0
    emergency_vehicle: int = 0
    total: int = 0

class EventMetadata(BaseModel):
    """Edge processing metadata."""
    route_id: str = ""
    route_number: str = ""
    edge_model_version: str = "1.0.0"
    inference_time_ms: float = 0.0
    camera_id: str = ""
    frame_number: int = 0


# === Main Event Types ===

class BaseEvent(BaseModel):
    """Base event that all events inherit from."""
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    bus_id: str
    event_type: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    gps: GPSData
    metadata: EventMetadata = Field(default_factory=EventMetadata)
    thumbnail: Optional[str] = None  # Base64 JPEG

class RoadDefectEvent(BaseEvent):
    """Road defect detection event (pothole, crack, waterlogging, etc.)."""
    event_type: str = "road_defect"
    detection: DetectionData

class VehicleDensityEvent(BaseEvent):
    """Vehicle density estimation event."""
    event_type: str = "vehicle_density"
    vehicle_counts: VehicleCounts
    density_level: str = "normal"  # low, normal, high, critical
    route_segment: str = ""

class PedestrianAlertEvent(BaseEvent):
    """Pedestrian safety alert (school children, crosswalk hazard)."""
    event_type: str = "pedestrian_alert"
    detection: DetectionData
    pedestrian_count: int = 0
    risk_level: str = "medium"  # low, medium, high, critical

class IncidentEvent(BaseEvent):
    """Traffic incident event (hit-and-run, rash driving, etc.)."""
    event_type: str = "incident"
    incident_type: str  # hit_and_run, rash_driving, wrong_side, signal_violation
    detection: Optional[DetectionData] = None
    anpr: Optional[ANPRData] = None
    vehicle_type: str = ""
    speed_estimate_kmh: float = 0.0
    imu_trigger: bool = False

class BusStatusEvent(BaseEvent):
    """Periodic bus status heartbeat."""
    event_type: str = "bus_status"
    status: str = "active"  # active, idle, error
    camera_health: Dict[str, str] = {}  # cam_id -> ok/error/offline
    edge_metrics: Dict[str, float] = {}  # cpu_temp, gpu_temp, etc.
    uptime_hours: float = 0.0


def classify_severity(class_name: str, confidence: float) -> str:
    """
    Classify detection severity based on type and confidence.
    """
    critical_classes = {"missing_divider", "waterlogging", "missing_zebra_crossing"}
    high_classes = {"pothole", "damaged_road", "missing_signboard"}

    if class_name in critical_classes and confidence > 0.7:
        return "critical"
    elif class_name in critical_classes:
        return "high"
    elif class_name in high_classes and confidence > 0.8:
        return "high"
    elif class_name in high_classes:
        return "medium"
    elif confidence > 0.8:
        return "medium"
    else:
        return "low"


def classify_density_level(total_vehicles: int) -> str:
    """Classify traffic density level from total vehicle count."""
    if total_vehicles >= 50:
        return "critical"
    elif total_vehicles >= 30:
        return "high"
    elif total_vehicles >= 10:
        return "normal"
    else:
        return "low"
