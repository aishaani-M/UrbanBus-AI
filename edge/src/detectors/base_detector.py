"""
UrbanBus Edge AI — Base Detector

Abstract interface for all detection pipelines.
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
import numpy as np


class BaseDetector(ABC):
    """Abstract base class for all detectors."""

    def __init__(self, name: str):
        self.name = name
        self.frame_count = 0
        self.detection_count = 0

    @abstractmethod
    def detect(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Run detection on a frame.
        Returns list of detection dictionaries.
        """
        pass

    @abstractmethod
    def should_run(self, frame_number: int) -> bool:
        """
        Whether to run detection on this frame (for adaptive FPS).
        """
        pass

    def get_stats(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "frames_processed": self.frame_count,
            "detections": self.detection_count,
        }
