"""
UrbanBus Edge AI — Incident Detector

Detects traffic incidents: hit-and-run, rash driving, wrong-side driving.
Integrates IMU data for collision detection and ANPR for vehicle identification.
"""

import time
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from loguru import logger

from edge.src.detectors.base_detector import BaseDetector
from edge.src.utils.inference_engine import InferenceEngine, OCREngine
from edge.src.tracking.byte_tracker import ByteTracker
from edge.src.utils.frame_processor import crop_roi, enhance_plate_crop


class ANPRPipeline:
    """
    Automatic Number Plate Recognition pipeline.
    Stage 1: Detect license plate region
    Stage 2: Enhance and extract text via OCR
    """

    def __init__(
        self,
        plate_detector: InferenceEngine,
        plate_ocr: OCREngine,
        min_plate_confidence: float = 0.5,
    ):
        self.plate_detector = plate_detector
        self.plate_ocr = plate_ocr
        self.min_plate_confidence = min_plate_confidence

    def extract_plate(
        self,
        frame: np.ndarray,
        vehicle_bbox: Optional[List[int]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Extract license plate from frame or vehicle crop.

        Returns dict with plate_text, confidence, bbox or None.
        """
        # If vehicle bbox given, crop to vehicle region first
        if vehicle_bbox:
            vehicle_crop = crop_roi(frame, vehicle_bbox, padding=0.05)
        else:
            vehicle_crop = frame

        if vehicle_crop.size == 0:
            return None

        # Stage 1: Detect plate region
        plate_detections = self.plate_detector.infer(vehicle_crop)

        if not plate_detections:
            return None

        # Take best plate detection
        best_plate = max(plate_detections, key=lambda d: d["confidence"])

        if best_plate["confidence"] < self.min_plate_confidence:
            return None

        # Stage 2: Crop plate and run OCR
        plate_crop = crop_roi(vehicle_crop, best_plate["bbox"], padding=0.05)

        if plate_crop.size == 0:
            return None

        # Enhance plate image
        enhanced = enhance_plate_crop(plate_crop)

        # Convert back to 3-channel for OCR
        if len(enhanced.shape) == 2:
            enhanced_3ch = np.stack([enhanced] * 3, axis=-1)
        else:
            enhanced_3ch = enhanced

        plate_text, ocr_confidence = self.plate_ocr.recognize(enhanced_3ch)

        if not plate_text or len(plate_text) < 4:
            return None

        # Overall confidence = plate_detection_conf * ocr_conf
        combined_confidence = best_plate["confidence"] * ocr_confidence

        return {
            "plate_text": plate_text,
            "confidence": round(combined_confidence, 4),
            "plate_bbox": best_plate["bbox"],
            "ocr_confidence": round(ocr_confidence, 4),
            "detection_confidence": round(best_plate["confidence"], 4),
        }


class IncidentDetector(BaseDetector):
    """
    Incident detection pipeline for hit-and-run and rash driving.

    Process:
    1. Monitor IMU for sudden acceleration events (potential collision)
    2. Track vehicles in vicinity using ByteTrack
    3. On incident trigger, extract license plates of nearby vehicles
    4. Generate incident event with ANPR data
    """

    def __init__(
        self,
        vehicle_engine: InferenceEngine,
        tracker: ByteTracker,
        anpr_pipeline: ANPRPipeline,
        speed_threshold_kmh: float = 80.0,
        run_every_n_frames: int = 2,
    ):
        super().__init__("incident")
        self.vehicle_engine = vehicle_engine
        self.tracker = tracker
        self.anpr = anpr_pipeline
        self.speed_threshold_kmh = speed_threshold_kmh
        self.run_every_n_frames = run_every_n_frames

        self._incident_cooldown = 0
        self._cooldown_frames = 90  # Don't re-trigger for ~3 seconds

    def should_run(self, frame_number: int) -> bool:
        return frame_number % self.run_every_n_frames == 0

    def detect(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Run vehicle detection for incident monitoring."""
        self.frame_count += 1

        raw_detections = self.vehicle_engine.infer(frame)
        tracked = self.tracker.update(raw_detections)
        self.detection_count += len(tracked)

        # Decrement cooldown
        if self._incident_cooldown > 0:
            self._incident_cooldown -= 1

        return tracked

    def check_incident(
        self,
        frame: np.ndarray,
        tracked_vehicles: List[Dict],
        imu_triggered: bool,
        bus_speed_kmh: float,
    ) -> Optional[Dict[str, Any]]:
        """
        Check for incident conditions and extract ANPR if triggered.

        Returns incident dict or None.
        """
        if self._incident_cooldown > 0:
            return None

        incident_type = None

        # Check for IMU-triggered collision event (hit-and-run candidate)
        if imu_triggered and tracked_vehicles:
            incident_type = "hit_and_run"
            logger.warning("⚠️ IMU collision event detected — triggering ANPR")

        # Check for rash driving (nearby vehicle moving very fast)
        # Estimated from tracker trajectory displacement
        for vehicle in tracked_vehicles:
            trajectory = vehicle.get("trajectory", [])
            if len(trajectory) >= 5:
                # Pixel displacement as proxy for speed
                start = trajectory[-5]
                end = trajectory[-1]
                displacement = np.sqrt(
                    (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2
                )
                # High displacement in few frames = fast moving
                if displacement > 200:  # Tunable threshold
                    incident_type = "rash_driving"

        if incident_type is None:
            return None

        # Set cooldown
        self._incident_cooldown = self._cooldown_frames

        # Run ANPR on the most prominent vehicle
        anpr_result = None
        target_vehicle = None

        if tracked_vehicles:
            # Target the closest/largest vehicle
            target_vehicle = max(
                tracked_vehicles,
                key=lambda v: (v["bbox"][2] - v["bbox"][0]) * (v["bbox"][3] - v["bbox"][1])
            )

            anpr_result = self.anpr.extract_plate(frame, target_vehicle["bbox"])

        incident = {
            "incident_type": incident_type,
            "anpr": anpr_result,
            "vehicle_bbox": target_vehicle["bbox"] if target_vehicle else None,
            "vehicle_class": target_vehicle.get("class_name", "") if target_vehicle else "",
            "vehicle_track_id": target_vehicle.get("track_id") if target_vehicle else None,
            "imu_triggered": imu_triggered,
            "bus_speed_kmh": bus_speed_kmh,
        }

        logger.warning(
            f"🚨 Incident detected: {incident_type} | "
            f"Plate: {anpr_result['plate_text'] if anpr_result else 'N/A'} | "
            f"Confidence: {anpr_result['confidence'] if anpr_result else 0:.0%}"
        )

        return incident
