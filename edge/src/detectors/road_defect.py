"""
UrbanBus Edge AI — Road Defect Detector

Detects potholes, cracks, waterlogging, missing dividers, damaged signboards, etc.
Includes spatial deduplication to avoid re-reporting the same defect.
"""

import time
import math
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from loguru import logger

from edge.src.detectors.base_detector import BaseDetector
from edge.src.utils.inference_engine import InferenceEngine
from edge.src.events.event_schema import classify_severity


class SpatialDeduplicator:
    """
    Prevents re-reporting the same road defect within a spatial/temporal window.
    Uses GPS coordinates and timestamps to track recently reported defects.
    """

    def __init__(self, radius_m: float = 15.0, window_s: float = 30.0):
        self.radius_m = radius_m
        self.window_s = window_s
        self._recent: List[Dict] = []

    @staticmethod
    def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Distance in meters between two GPS coordinates."""
        R = 6371000  # Earth radius in meters
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)
        a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    def is_duplicate(
        self,
        class_name: str,
        lat: float,
        lon: float,
        timestamp: float,
    ) -> bool:
        """Check if this detection is a duplicate of a recent one."""
        # Prune expired entries
        self._recent = [
            r for r in self._recent
            if (timestamp - r["timestamp"]) < self.window_s
        ]

        for r in self._recent:
            if r["class_name"] != class_name:
                continue
            dist = self.haversine_distance(lat, lon, r["lat"], r["lon"])
            if dist < self.radius_m:
                return True

        return False

    def register(self, class_name: str, lat: float, lon: float, timestamp: float):
        """Register a new detection to prevent future duplicates."""
        self._recent.append({
            "class_name": class_name,
            "lat": lat,
            "lon": lon,
            "timestamp": timestamp,
        })


class RoadDefectDetector(BaseDetector):
    """
    Road defect detection pipeline.
    Runs YOLO on front/side camera frames to detect road infrastructure issues.
    """

    def __init__(
        self,
        engine: InferenceEngine,
        dedup_radius_m: float = 15.0,
        dedup_window_s: float = 30.0,
        run_every_n_frames: int = 3,
    ):
        super().__init__("road_defect")
        self.engine = engine
        self.dedup = SpatialDeduplicator(dedup_radius_m, dedup_window_s)
        self.run_every_n_frames = run_every_n_frames

    def should_run(self, frame_number: int) -> bool:
        return frame_number % self.run_every_n_frames == 0

    def detect(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Run road defect detection on frame."""
        self.frame_count += 1
        detections = self.engine.infer(frame)
        self.detection_count += len(detections)

        # Add severity classification
        for det in detections:
            det["severity"] = classify_severity(det["class_name"], det["confidence"])

        return detections

    def filter_duplicates(
        self,
        detections: List[Dict],
        lat: float,
        lon: float,
    ) -> List[Dict]:
        """Filter out spatially duplicate detections."""
        unique = []
        now = time.time()

        for det in detections:
            if not self.dedup.is_duplicate(det["class_name"], lat, lon, now):
                self.dedup.register(det["class_name"], lat, lon, now)
                unique.append(det)

        filtered = len(detections) - len(unique)
        if filtered > 0:
            logger.debug(f"RoadDefect: Filtered {filtered} duplicate detections")

        return unique
