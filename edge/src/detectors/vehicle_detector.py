"""
UrbanBus Edge AI — Vehicle Detector

Detects and classifies vehicles, integrates with ByteTrack for counting,
and estimates traffic density per road segment.
"""

import time
from typing import List, Dict, Any
import numpy as np
from loguru import logger

from edge.src.detectors.base_detector import BaseDetector
from edge.src.utils.inference_engine import InferenceEngine
from edge.src.tracking.byte_tracker import ByteTracker
from edge.src.events.event_schema import VehicleCounts, classify_density_level


class VehicleDetector(BaseDetector):
    """
    Vehicle detection + classification + density estimation pipeline.
    Uses YOLO for detection and ByteTrack for unique vehicle counting.
    """

    def __init__(
        self,
        engine: InferenceEngine,
        tracker: ByteTracker,
        reporting_interval_s: float = 30.0,
        run_every_n_frames: int = 2,
    ):
        super().__init__("vehicle")
        self.engine = engine
        self.tracker = tracker
        self.reporting_interval_s = reporting_interval_s
        self.run_every_n_frames = run_every_n_frames

        self._last_report_time = time.time()
        self._cumulative_counts: Dict[str, int] = {}
        self._segment_samples = 0

    def should_run(self, frame_number: int) -> bool:
        return frame_number % self.run_every_n_frames == 0

    def detect(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Run vehicle detection and tracking."""
        self.frame_count += 1

        # Run YOLO inference
        raw_detections = self.engine.infer(frame)
        self.detection_count += len(raw_detections)

        # Update tracker
        tracked_objects = self.tracker.update(raw_detections)

        # Accumulate class counts for density reporting
        for obj in tracked_objects:
            cls = obj.get("class_name", "unknown")
            self._cumulative_counts[cls] = self._cumulative_counts.get(cls, 0) + 1
        self._segment_samples += 1

        return tracked_objects

    def should_report_density(self) -> bool:
        """Check if enough time has passed for a density report."""
        return (time.time() - self._last_report_time) >= self.reporting_interval_s

    def get_density_report(self) -> Dict[str, Any]:
        """
        Generate a density report from accumulated counts.
        Averages counts over the reporting window.
        """
        if self._segment_samples == 0:
            return None

        # Average counts over samples
        avg_counts = {
            k: max(1, v // self._segment_samples)
            for k, v in self._cumulative_counts.items()
        }

        vehicle_counts = VehicleCounts(
            car=avg_counts.get("car", 0),
            truck=avg_counts.get("truck", 0),
            bus=avg_counts.get("bus", 0),
            two_wheeler=avg_counts.get("two_wheeler", 0),
            auto_rickshaw=avg_counts.get("auto_rickshaw", 0),
            bicycle=avg_counts.get("bicycle", 0),
            emergency_vehicle=avg_counts.get("emergency_vehicle", 0),
        )
        vehicle_counts.total = sum([
            vehicle_counts.car, vehicle_counts.truck, vehicle_counts.bus,
            vehicle_counts.two_wheeler, vehicle_counts.auto_rickshaw,
            vehicle_counts.bicycle, vehicle_counts.emergency_vehicle,
        ])

        density_level = classify_density_level(vehicle_counts.total)

        # Reset accumulators
        self._cumulative_counts.clear()
        self._segment_samples = 0
        self._last_report_time = time.time()

        return {
            "vehicle_counts": vehicle_counts,
            "density_level": density_level,
            "active_tracks": self.tracker.get_track_count(),
        }

    def get_current_track_count(self) -> int:
        return self.tracker.get_track_count()
