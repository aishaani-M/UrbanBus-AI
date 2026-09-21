"""
UrbanBus Edge AI — Main Orchestrator

Central entry point that coordinates all cameras, detectors, sensors,
and event publishing for a single bus.
"""

import time
import sys
import signal
import yaml
from pathlib import Path
from typing import Dict, Any
from loguru import logger

# Configure logging
logger.remove()
logger.add(sys.stderr, level="INFO", format="<green>{time:HH:mm:ss}</green> | <level>{level:<7}</level> | {message}")
logger.add("output/edge_{time}.log", rotation="50 MB", retention="7 days", level="DEBUG")

from edge.src.camera_manager import CameraManager
from edge.src.sensors.gps_reader import GPSReader
from edge.src.sensors.imu_reader import IMUReader
from edge.src.utils.inference_engine import InferenceEngine, OCREngine
from edge.src.utils.frame_processor import generate_thumbnail, draw_detections
from edge.src.tracking.byte_tracker import ByteTracker
from edge.src.detectors.road_defect import RoadDefectDetector
from edge.src.detectors.vehicle_detector import VehicleDetector
from edge.src.detectors.pedestrian_detector import PedestrianDetector
from edge.src.detectors.incident_detector import IncidentDetector, ANPRPipeline
from edge.src.events.event_schema import (
    RoadDefectEvent, VehicleDensityEvent, PedestrianAlertEvent,
    IncidentEvent, BusStatusEvent, GPSData, DetectionData,
    ANPRData, EventMetadata,
)
from edge.src.events.event_publisher import EventPublisher


class EdgeOrchestrator:
    """
    Main orchestrator for the UrbanBus edge processing system.

    Coordinates:
    - Multi-camera frame acquisition
    - GPS + IMU sensor reading
    - Road defect detection (front/side cameras)
    - Vehicle detection + density estimation (front/rear cameras)
    - Pedestrian safety monitoring (front/side cameras)
    - Incident detection with ANPR (all cameras)
    - Event publishing via MQTT
    """

    def __init__(self, config_path: str = "config/edge_config.yaml"):
        self.config = self._load_config(config_path)
        self.bus_id = self.config["system"]["bus_id"]
        self.device = self.config["system"].get("device", "cuda")
        self.running = False

        # Frame counter
        self._frame_count = 0
        self._start_time = 0
        self._status_interval = 60  # Report status every 60 seconds
        self._last_status_time = 0

        # Components (initialized in setup())
        self.camera_manager = None
        self.gps = None
        self.imu = None
        self.publisher = None

        # Detectors
        self.road_defect_detector = None
        self.vehicle_detector = None
        self.pedestrian_detector = None
        self.incident_detector = None

        # Tracking
        self.vehicle_tracker = None
        self.incident_tracker = None

    def _load_config(self, path: str) -> dict:
        """Load YAML configuration."""
        config_path = Path(path)
        if not config_path.exists():
            # Try relative to edge/ directory
            config_path = Path(__file__).parent.parent / path
        if not config_path.exists():
            logger.warning(f"Config not found at {path}, using defaults")
            return self._default_config()

        with open(config_path) as f:
            config = yaml.safe_load(f)
        logger.info(f"Loaded config from {config_path}")
        return config

    def _default_config(self) -> dict:
        """Minimal default configuration."""
        return {
            "system": {"bus_id": "TS-001", "device": "cuda", "log_level": "INFO"},
            "cameras": {
                "front": {"source": 0, "resolution": [1280, 720], "fps": 15, "enabled": True,
                          "pipelines": ["road_defect", "vehicle", "pedestrian", "incident"]},
            },
            "models": {
                "road_defect": {"path": "./models/road_defect.onnx", "input_size": [640, 640],
                                "confidence_threshold": 0.45, "nms_threshold": 0.5,
                                "classes": {0: "pothole", 1: "crack", 2: "damaged_road", 3: "waterlogging"}},
                "vehicle": {"path": "./models/vehicle.onnx", "input_size": [640, 640],
                            "confidence_threshold": 0.4, "nms_threshold": 0.45,
                            "classes": {0: "car", 1: "truck", 2: "bus", 3: "two_wheeler", 4: "auto_rickshaw"}},
                "pedestrian": {"path": "./models/pedestrian.onnx", "input_size": [640, 640],
                               "confidence_threshold": 0.5, "nms_threshold": 0.5,
                               "classes": {0: "person", 1: "child", 2: "school_child"}},
                "plate_detector": {"path": "./models/plate_detector.onnx", "input_size": [640, 640],
                                   "confidence_threshold": 0.55, "nms_threshold": 0.4},
                "plate_ocr": {"path": "./models/plate_ocr.onnx", "input_height": 48, "input_width": 168},
            },
            "tracking": {"max_age": 30, "min_hits": 3, "iou_threshold": 0.3,
                         "high_threshold": 0.6, "low_threshold": 0.1},
            "deduplication": {"spatial_radius_m": 15.0, "temporal_window_s": 30.0},
            "density_estimation": {"reporting_interval_s": 30},
            "incident_detection": {"imu_accel_threshold": 2.5, "speed_threshold_kmh": 80.0},
            "sensors": {
                "gps": {"mode": "simulated"},
                "imu": {"mode": "simulated"},
            },
            "mqtt": {"broker_host": "localhost", "broker_port": 1883,
                     "topic_prefix": "urbanbus/events", "qos": 1},
            "edge_optimization": {"thumbnail_quality": 75, "thumbnail_max_dim": 320},
        }

    def setup(self):
        """Initialize all components."""
        logger.info(f"═══════════════════════════════════════════")
        logger.info(f"  UrbanBus Edge AI — Bus {self.bus_id}")
        logger.info(f"  Device: {self.device}")
        logger.info(f"═══════════════════════════════════════════")

        # === Sensors ===
        gps_cfg = self.config.get("sensors", {}).get("gps", {})
        self.gps = GPSReader(mode=gps_cfg.get("mode", "simulated"))
        self.gps.start()

        imu_cfg = self.config.get("sensors", {}).get("imu", {})
        self.imu = IMUReader(mode=imu_cfg.get("mode", "simulated"))
        self.imu.start()

        # === Cameras ===
        self.camera_manager = CameraManager(self.config.get("cameras", {}))
        self.camera_manager.start_all()

        # === Models ===
        models_cfg = self.config.get("models", {})
        tracking_cfg = self.config.get("tracking", {})

        # Road defect engine
        rd_cfg = models_cfg.get("road_defect", {})
        rd_engine = InferenceEngine(
            model_path=rd_cfg.get("path", ""),
            input_size=tuple(rd_cfg.get("input_size", [640, 640])),
            confidence_threshold=rd_cfg.get("confidence_threshold", 0.45),
            nms_threshold=rd_cfg.get("nms_threshold", 0.5),
            classes=rd_cfg.get("classes", {}),
            device=self.device,
        )

        dedup_cfg = self.config.get("deduplication", {})
        self.road_defect_detector = RoadDefectDetector(
            engine=rd_engine,
            dedup_radius_m=dedup_cfg.get("spatial_radius_m", 15.0),
            dedup_window_s=dedup_cfg.get("temporal_window_s", 30.0),
        )

        # Vehicle engine + tracker
        veh_cfg = models_cfg.get("vehicle", {})
        veh_engine = InferenceEngine(
            model_path=veh_cfg.get("path", ""),
            input_size=tuple(veh_cfg.get("input_size", [640, 640])),
            confidence_threshold=veh_cfg.get("confidence_threshold", 0.4),
            nms_threshold=veh_cfg.get("nms_threshold", 0.45),
            classes=veh_cfg.get("classes", {}),
            device=self.device,
        )
        self.vehicle_tracker = ByteTracker(
            max_age=tracking_cfg.get("max_age", 30),
            min_hits=tracking_cfg.get("min_hits", 3),
            iou_threshold=tracking_cfg.get("iou_threshold", 0.3),
            high_threshold=tracking_cfg.get("high_threshold", 0.6),
            low_threshold=tracking_cfg.get("low_threshold", 0.1),
        )

        density_cfg = self.config.get("density_estimation", {})
        self.vehicle_detector = VehicleDetector(
            engine=veh_engine,
            tracker=self.vehicle_tracker,
            reporting_interval_s=density_cfg.get("reporting_interval_s", 30),
        )

        # Pedestrian engine
        ped_cfg = models_cfg.get("pedestrian", {})
        ped_engine = InferenceEngine(
            model_path=ped_cfg.get("path", ""),
            input_size=tuple(ped_cfg.get("input_size", [640, 640])),
            confidence_threshold=ped_cfg.get("confidence_threshold", 0.5),
            nms_threshold=ped_cfg.get("nms_threshold", 0.5),
            classes=ped_cfg.get("classes", {}),
            device=self.device,
        )
        self.pedestrian_detector = PedestrianDetector(engine=ped_engine)

        # Incident engine (reuses vehicle engine) + ANPR
        self.incident_tracker = ByteTracker(
            max_age=tracking_cfg.get("max_age", 30),
            min_hits=tracking_cfg.get("min_hits", 3),
        )

        plate_det_cfg = models_cfg.get("plate_detector", {})
        plate_detector = InferenceEngine(
            model_path=plate_det_cfg.get("path", ""),
            input_size=tuple(plate_det_cfg.get("input_size", [640, 640])),
            confidence_threshold=plate_det_cfg.get("confidence_threshold", 0.55),
            device=self.device,
        )

        plate_ocr_cfg = models_cfg.get("plate_ocr", {})
        plate_ocr = OCREngine(
            model_path=plate_ocr_cfg.get("path", ""),
            input_height=plate_ocr_cfg.get("input_height", 48),
            input_width=plate_ocr_cfg.get("input_width", 168),
            device=self.device,
        )

        anpr = ANPRPipeline(plate_detector, plate_ocr)
        inc_cfg = self.config.get("incident_detection", {})
        self.incident_detector = IncidentDetector(
            vehicle_engine=veh_engine,
            tracker=self.incident_tracker,
            anpr_pipeline=anpr,
            speed_threshold_kmh=inc_cfg.get("speed_threshold_kmh", 80.0),
        )

        # === MQTT Publisher ===
        mqtt_cfg = self.config.get("mqtt", {})
        self.publisher = EventPublisher(
            broker_host=mqtt_cfg.get("broker_host", "localhost"),
            broker_port=mqtt_cfg.get("broker_port", 1883),
            topic_prefix=mqtt_cfg.get("topic_prefix", "urbanbus/events"),
            bus_id=self.bus_id,
            qos=mqtt_cfg.get("qos", 1),
            max_buffer_size=mqtt_cfg.get("max_buffer_size", 1000),
        )
        self.publisher.connect()

        logger.info("✅ All components initialized")

    def run(self):
        """Main processing loop."""
        self.running = True
        self._start_time = time.time()
        self._last_status_time = time.time()

        # Register signal handlers
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

        logger.info("🚌 Edge processing started")
        opt_cfg = self.config.get("edge_optimization", {})

        try:
            while self.running:
                self._frame_count += 1
                loop_start = time.perf_counter()

                # Get sensor data
                gps_pos = self.gps.get_position()
                imu_data = self.imu.get_data()

                gps_data = GPSData(
                    lat=gps_pos.latitude,
                    lon=gps_pos.longitude,
                    altitude=gps_pos.altitude,
                    speed_kmh=gps_pos.speed_kmh,
                    heading=gps_pos.heading,
                )

                # Read frames from all cameras
                frames = self.camera_manager.read_all_frames()

                for cam_id, frame in frames.items():
                    cam_cfg = self.config.get("cameras", {}).get(cam_id, {})
                    pipelines = cam_cfg.get("pipelines", [])

                    base_metadata = EventMetadata(
                        camera_id=cam_id,
                        frame_number=self._frame_count,
                        edge_model_version="1.0.0",
                    )

                    # --- Road Defect Detection ---
                    if "road_defect" in pipelines and self.road_defect_detector.should_run(self._frame_count):
                        defects = self.road_defect_detector.detect(frame)
                        defects = self.road_defect_detector.filter_duplicates(
                            defects, gps_pos.latitude, gps_pos.longitude
                        )

                        for defect in defects:
                            thumbnail = generate_thumbnail(
                                frame, opt_cfg.get("thumbnail_max_dim", 320),
                                opt_cfg.get("thumbnail_quality", 75),
                            )
                            event = RoadDefectEvent(
                                bus_id=self.bus_id,
                                gps=gps_data,
                                detection=DetectionData(
                                    class_name=defect["class_name"],
                                    confidence=defect["confidence"],
                                    bbox=defect["bbox"],
                                    severity=defect.get("severity", "medium"),
                                ),
                                metadata=base_metadata,
                                thumbnail=thumbnail,
                            )
                            self.publisher.publish(event)

                    # --- Vehicle Detection & Density ---
                    if "vehicle" in pipelines and self.vehicle_detector.should_run(self._frame_count):
                        self.vehicle_detector.detect(frame)

                        if self.vehicle_detector.should_report_density():
                            density = self.vehicle_detector.get_density_report()
                            if density:
                                event = VehicleDensityEvent(
                                    bus_id=self.bus_id,
                                    gps=gps_data,
                                    vehicle_counts=density["vehicle_counts"],
                                    density_level=density["density_level"],
                                    metadata=base_metadata,
                                )
                                self.publisher.publish(event)

                    # --- Pedestrian Safety ---
                    if "pedestrian" in pipelines and self.pedestrian_detector.should_run(self._frame_count):
                        ped_detections = self.pedestrian_detector.detect(frame)
                        risk = self.pedestrian_detector.assess_risk(ped_detections, frame.shape)

                        if risk["alert"]:
                            # Use the most concerning detection
                            best_det = max(ped_detections, key=lambda d: d["confidence"]) if ped_detections else None
                            event = PedestrianAlertEvent(
                                bus_id=self.bus_id,
                                gps=gps_data,
                                detection=DetectionData(
                                    class_name=best_det["class_name"] if best_det else "person",
                                    confidence=best_det["confidence"] if best_det else 0.5,
                                    bbox=best_det["bbox"] if best_det else [0, 0, 0, 0],
                                ) if best_det else DetectionData(
                                    class_name="person", confidence=0.5, bbox=[0, 0, 0, 0],
                                ),
                                pedestrian_count=risk["pedestrian_count"],
                                risk_level=risk["risk_level"],
                                metadata=base_metadata,
                            )
                            self.publisher.publish(event)

                    # --- Incident Detection ---
                    if "incident" in pipelines and self.incident_detector.should_run(self._frame_count):
                        tracked = self.incident_detector.detect(frame)

                        imu_triggered = self.imu.detect_sudden_event(
                            self.config.get("incident_detection", {}).get("imu_accel_threshold", 2.5)
                        )

                        incident = self.incident_detector.check_incident(
                            frame, tracked, imu_triggered, gps_pos.speed_kmh
                        )

                        if incident:
                            thumbnail = generate_thumbnail(frame)
                            anpr_data = None
                            if incident.get("anpr"):
                                anpr_data = ANPRData(
                                    plate_text=incident["anpr"]["plate_text"],
                                    confidence=incident["anpr"]["confidence"],
                                )

                            event = IncidentEvent(
                                bus_id=self.bus_id,
                                gps=gps_data,
                                incident_type=incident["incident_type"],
                                anpr=anpr_data,
                                vehicle_type=incident.get("vehicle_class", ""),
                                speed_estimate_kmh=gps_pos.speed_kmh,
                                imu_trigger=incident.get("imu_triggered", False),
                                metadata=base_metadata,
                                thumbnail=thumbnail,
                            )
                            self.publisher.publish(event)

                # --- Periodic Bus Status ---
                if (time.time() - self._last_status_time) >= self._status_interval:
                    self._publish_status(gps_data)
                    self._last_status_time = time.time()

                # Frame rate control
                elapsed = time.perf_counter() - loop_start
                target_interval = 1.0 / 15  # ~15 FPS processing rate
                sleep_time = max(0, target_interval - elapsed)
                if sleep_time > 0:
                    time.sleep(sleep_time)

                # Log stats periodically
                if self._frame_count % 300 == 0:
                    fps = self._frame_count / max(1, time.time() - self._start_time)
                    mqtt_stats = self.publisher.get_stats()
                    logger.info(
                        f"📊 Frame {self._frame_count} | "
                        f"FPS: {fps:.1f} | "
                        f"MQTT: {mqtt_stats['published']} sent, {mqtt_stats['buffer_size']} buffered"
                    )

        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        finally:
            self.shutdown()

    def _publish_status(self, gps_data: GPSData):
        """Publish periodic bus status heartbeat."""
        event = BusStatusEvent(
            bus_id=self.bus_id,
            gps=gps_data,
            status="active",
            camera_health=self.camera_manager.get_health_status(),
            edge_metrics={
                "frames_processed": self._frame_count,
                "uptime_s": time.time() - self._start_time,
                "road_roughness": self.imu.get_road_roughness(),
            },
            uptime_hours=(time.time() - self._start_time) / 3600,
        )
        self.publisher.publish(event)

    def _signal_handler(self, signum, frame):
        """Handle shutdown signals."""
        logger.info(f"Signal {signum} received — shutting down")
        self.running = False

    def shutdown(self):
        """Clean shutdown of all components."""
        logger.info("Shutting down edge system...")
        self.running = False

        if self.camera_manager:
            self.camera_manager.stop_all()
        if self.gps:
            self.gps.stop()
        if self.imu:
            self.imu.stop()
        if self.publisher:
            self.publisher.disconnect()

        uptime = time.time() - self._start_time if self._start_time else 0
        logger.info(
            f"✅ Shutdown complete | "
            f"Uptime: {uptime / 60:.1f} min | "
            f"Frames: {self._frame_count}"
        )


def main():
    """Entry point for edge AI system."""
    import argparse

    parser = argparse.ArgumentParser(description="UrbanBus Edge AI System")
    parser.add_argument(
        "--config", type=str,
        default="config/edge_config.yaml",
        help="Path to configuration file",
    )
    args = parser.parse_args()

    orchestrator = EdgeOrchestrator(config_path=args.config)
    orchestrator.setup()
    orchestrator.run()


if __name__ == "__main__":
    main()
