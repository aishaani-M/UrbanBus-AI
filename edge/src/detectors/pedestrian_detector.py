"""
UrbanBus Edge AI — Pedestrian Safety Detector

Detects vulnerable pedestrians, especially school children near roads.
Generates alerts when pedestrians are in hazardous positions.
"""

from typing import List, Dict, Any
import numpy as np
from loguru import logger

from edge.src.detectors.base_detector import BaseDetector
from edge.src.utils.inference_engine import InferenceEngine


class PedestrianDetector(BaseDetector):
    """
    Pedestrian safety detection pipeline.
    Triggers alerts for:
    - School children crossing roads
    - Pedestrians in crosswalk danger zones
    - High pedestrian density near roadway
    """

    def __init__(
        self,
        engine: InferenceEngine,
        danger_zone_ratio: float = 0.6,
        min_pedestrians_for_alert: int = 2,
        run_every_n_frames: int = 3,
    ):
        super().__init__("pedestrian")
        self.engine = engine
        self.danger_zone_ratio = danger_zone_ratio
        self.min_pedestrians_for_alert = min_pedestrians_for_alert
        self.run_every_n_frames = run_every_n_frames

    def should_run(self, frame_number: int) -> bool:
        return frame_number % self.run_every_n_frames == 0

    def detect(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Run pedestrian detection."""
        self.frame_count += 1
        detections = self.engine.infer(frame)
        self.detection_count += len(detections)
        return detections

    def assess_risk(
        self,
        detections: List[Dict],
        frame_shape: tuple,
    ) -> Dict[str, Any]:
        """
        Assess pedestrian safety risk based on detection positions.

        Risk factors:
        - Pedestrians in lower portion of frame (closer to bus)
        - School children detected
        - Multiple pedestrians in danger zone
        """
        if not detections:
            return {"risk_level": "none", "pedestrian_count": 0, "alert": False}

        h, w = frame_shape[:2]
        danger_y = int(h * self.danger_zone_ratio)

        danger_pedestrians = 0
        school_children = 0

        for det in detections:
            bbox = det["bbox"]
            center_y = (bbox[1] + bbox[3]) / 2

            # Check if pedestrian is in danger zone (lower portion of frame)
            if center_y > danger_y:
                danger_pedestrians += 1

            # Count school children specifically
            if det.get("class_name") in ("child", "school_child"):
                school_children += 1

        # Determine risk level
        if school_children > 0 and danger_pedestrians > 0:
            risk_level = "critical"
        elif danger_pedestrians >= 3:
            risk_level = "high"
        elif danger_pedestrians >= 1:
            risk_level = "medium"
        elif len(detections) >= self.min_pedestrians_for_alert:
            risk_level = "low"
        else:
            risk_level = "none"

        should_alert = risk_level in ("critical", "high")

        return {
            "risk_level": risk_level,
            "pedestrian_count": len(detections),
            "danger_zone_count": danger_pedestrians,
            "school_children": school_children,
            "alert": should_alert,
        }
