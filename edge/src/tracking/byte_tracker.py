"""
UrbanBus Edge AI — ByteTrack Multi-Object Tracker

Implements ByteTrack-style tracking that associates ALL detection boxes,
including low-confidence ones, to maintain robust tracking in crowded scenes.
Uses Kalman filter for state prediction and IoU + Hungarian assignment.
"""

import numpy as np
from typing import List, Dict, Optional, Tuple
from loguru import logger

try:
    from scipy.optimize import linear_sum_assignment
except ImportError:
    linear_sum_assignment = None
    logger.warning("scipy not available — tracking will use greedy assignment")


class KalmanBoxTracker:
    """
    Kalman filter-based bounding box tracker.
    State: [cx, cy, area, aspect_ratio, vx, vy, va]
    """
    _id_counter = 0

    def __init__(self, bbox: List[int], class_name: str = "", confidence: float = 0.0):
        KalmanBoxTracker._id_counter += 1
        self.track_id = KalmanBoxTracker._id_counter
        self.class_name = class_name
        self.confidence = confidence

        # Convert bbox [x1,y1,x2,y2] to state [cx, cy, area, ratio]
        self.state = self._bbox_to_state(bbox)
        self.velocity = np.zeros(3)  # vx, vy, va

        self.hits = 1
        self.age = 0
        self.time_since_update = 0
        self.history = [bbox]
        self.max_history = 90

    @staticmethod
    def _bbox_to_state(bbox: List[int]) -> np.ndarray:
        cx = (bbox[0] + bbox[2]) / 2
        cy = (bbox[1] + bbox[3]) / 2
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        area = w * h
        ratio = w / max(h, 1)
        return np.array([cx, cy, area, ratio], dtype=np.float64)

    @staticmethod
    def _state_to_bbox(state: np.ndarray) -> List[int]:
        cx, cy, area, ratio = state
        w = np.sqrt(max(area * ratio, 1))
        h = max(area / max(w, 1), 1)
        return [
            int(cx - w / 2),
            int(cy - h / 2),
            int(cx + w / 2),
            int(cy + h / 2),
        ]

    def predict(self) -> List[int]:
        """Predict next state using constant velocity model."""
        self.state[:3] += self.velocity
        self.state[2] = max(self.state[2], 1)  # Area > 0
        self.age += 1
        self.time_since_update += 1
        predicted_bbox = self._state_to_bbox(self.state)
        return predicted_bbox

    def update(self, bbox: List[int], class_name: str = "", confidence: float = 0.0):
        """Update state with new detection."""
        new_state = self._bbox_to_state(bbox)

        # Simple velocity update (exponential smoothing)
        alpha = 0.3
        new_velocity = new_state[:3] - self.state[:3]
        self.velocity = alpha * new_velocity + (1 - alpha) * self.velocity

        self.state = new_state
        self.hits += 1
        self.time_since_update = 0
        self.confidence = confidence
        if class_name:
            self.class_name = class_name

        self.history.append(bbox)
        if len(self.history) > self.max_history:
            self.history.pop(0)

    def get_bbox(self) -> List[int]:
        return self._state_to_bbox(self.state)

    def get_trajectory(self) -> List[Tuple[float, float]]:
        """Get center-point trajectory."""
        return [
            ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
            for b in self.history
        ]


def compute_iou_matrix(
    bboxes1: np.ndarray,
    bboxes2: np.ndarray,
) -> np.ndarray:
    """Compute IoU matrix between two sets of bboxes [N, 4] and [M, 4]."""
    x1 = np.maximum(bboxes1[:, 0:1], bboxes2[:, 0:1].T)
    y1 = np.maximum(bboxes1[:, 1:2], bboxes2[:, 1:2].T)
    x2 = np.minimum(bboxes1[:, 2:3], bboxes2[:, 2:3].T)
    y2 = np.minimum(bboxes1[:, 3:4], bboxes2[:, 3:4].T)

    inter = np.maximum(0, x2 - x1) * np.maximum(0, y2 - y1)

    area1 = (bboxes1[:, 2] - bboxes1[:, 0]) * (bboxes1[:, 3] - bboxes1[:, 1])
    area2 = (bboxes2[:, 2] - bboxes2[:, 0]) * (bboxes2[:, 3] - bboxes2[:, 1])

    union = area1[:, np.newaxis] + area2[np.newaxis, :] - inter
    return inter / np.maximum(union, 1e-6)


class ByteTracker:
    """
    ByteTrack multi-object tracker.

    Key insight: Uses ALL detection boxes (including low-confidence ones)
    for association, which prevents tracking gaps in occluded scenarios.

    Process:
    1. Split detections into high-confidence and low-confidence sets
    2. Associate high-confidence detections with existing tracks (first pass)
    3. Associate remaining tracks with low-confidence detections (second pass)
    4. Initialize new tracks from unmatched high-confidence detections
    5. Remove tracks that have been lost too long
    """

    def __init__(
        self,
        max_age: int = 30,
        min_hits: int = 3,
        iou_threshold: float = 0.3,
        high_threshold: float = 0.6,
        low_threshold: float = 0.1,
        max_tracks: int = 200,
    ):
        self.max_age = max_age
        self.min_hits = min_hits
        self.iou_threshold = iou_threshold
        self.high_threshold = high_threshold
        self.low_threshold = low_threshold
        self.max_tracks = max_tracks

        self.tracks: List[KalmanBoxTracker] = []
        self.frame_count = 0

    def update(self, detections: List[Dict]) -> List[Dict]:
        """
        Update tracker with new detections.

        Args:
            detections: List of dicts with 'bbox', 'confidence', 'class_name'

        Returns:
            List of tracked objects with 'track_id', 'bbox', 'class_name', etc.
        """
        self.frame_count += 1

        # Predict new locations for all existing tracks
        for track in self.tracks:
            track.predict()

        if not detections:
            # Remove dead tracks
            self.tracks = [t for t in self.tracks if t.time_since_update <= self.max_age]
            return self._get_active_tracks()

        # Split detections into high and low confidence
        high_dets = [d for d in detections if d["confidence"] >= self.high_threshold]
        low_dets = [d for d in detections if self.low_threshold <= d["confidence"] < self.high_threshold]

        # === First Association: High-confidence detections ===
        matched_h, unmatched_tracks_h, unmatched_dets_h = self._associate(
            self.tracks, high_dets, self.iou_threshold
        )

        # Update matched tracks
        for track_idx, det_idx in matched_h:
            det = high_dets[det_idx]
            self.tracks[track_idx].update(
                det["bbox"], det.get("class_name", ""), det["confidence"]
            )

        # === Second Association: Low-confidence detections with remaining tracks ===
        remaining_tracks = [self.tracks[i] for i in unmatched_tracks_h]

        if remaining_tracks and low_dets:
            matched_l, unmatched_tracks_l, _ = self._associate(
                remaining_tracks, low_dets, self.iou_threshold * 0.8
            )

            for track_idx, det_idx in matched_l:
                det = low_dets[det_idx]
                remaining_tracks[track_idx].update(
                    det["bbox"], det.get("class_name", ""), det["confidence"]
                )

        # === Initialize new tracks from unmatched high-confidence detections ===
        for det_idx in unmatched_dets_h:
            if len(self.tracks) < self.max_tracks:
                det = high_dets[det_idx]
                new_track = KalmanBoxTracker(
                    det["bbox"], det.get("class_name", ""), det["confidence"]
                )
                self.tracks.append(new_track)

        # === Remove dead tracks ===
        self.tracks = [t for t in self.tracks if t.time_since_update <= self.max_age]

        return self._get_active_tracks()

    def _associate(
        self,
        tracks: List[KalmanBoxTracker],
        detections: List[Dict],
        iou_threshold: float,
    ) -> Tuple[List[Tuple[int, int]], List[int], List[int]]:
        """
        Associate detections with tracks using IoU + Hungarian algorithm.
        Returns: (matched_pairs, unmatched_track_indices, unmatched_det_indices)
        """
        if not tracks or not detections:
            return [], list(range(len(tracks))), list(range(len(detections)))

        track_bboxes = np.array([t.get_bbox() for t in tracks], dtype=np.float64)
        det_bboxes = np.array([d["bbox"] for d in detections], dtype=np.float64)

        iou_matrix = compute_iou_matrix(track_bboxes, det_bboxes)
        cost_matrix = 1.0 - iou_matrix

        matched = []
        unmatched_tracks = list(range(len(tracks)))
        unmatched_dets = list(range(len(detections)))

        if linear_sum_assignment is not None:
            # Hungarian algorithm (optimal)
            row_indices, col_indices = linear_sum_assignment(cost_matrix)

            for r, c in zip(row_indices, col_indices):
                if iou_matrix[r, c] >= iou_threshold:
                    matched.append((r, c))
                    if r in unmatched_tracks:
                        unmatched_tracks.remove(r)
                    if c in unmatched_dets:
                        unmatched_dets.remove(c)
        else:
            # Greedy fallback
            while True:
                if iou_matrix.size == 0:
                    break
                max_iou = np.max(iou_matrix)
                if max_iou < iou_threshold:
                    break
                r, c = np.unravel_index(np.argmax(iou_matrix), iou_matrix.shape)
                matched.append((r, c))
                if r in unmatched_tracks:
                    unmatched_tracks.remove(r)
                if c in unmatched_dets:
                    unmatched_dets.remove(c)
                iou_matrix[r, :] = 0
                iou_matrix[:, c] = 0

        return matched, unmatched_tracks, unmatched_dets

    def _get_active_tracks(self) -> List[Dict]:
        """Get list of confirmed active tracks."""
        results = []
        for track in self.tracks:
            if track.hits >= self.min_hits and track.time_since_update == 0:
                results.append({
                    "track_id": track.track_id,
                    "bbox": track.get_bbox(),
                    "class_name": track.class_name,
                    "confidence": track.confidence,
                    "age": track.age,
                    "hits": track.hits,
                    "trajectory": track.get_trajectory()[-20:],  # Last 20 points
                })
        return results

    def get_track_count(self) -> int:
        """Get number of currently active confirmed tracks."""
        return sum(
            1 for t in self.tracks
            if t.hits >= self.min_hits and t.time_since_update <= 5
        )

    def get_vehicle_counts_by_class(self) -> Dict[str, int]:
        """Get count of tracked vehicles by class."""
        counts = {}
        for track in self.tracks:
            if track.hits >= self.min_hits and track.time_since_update <= 5:
                cls = track.class_name or "unknown"
                counts[cls] = counts.get(cls, 0) + 1
        return counts

    def reset(self):
        """Reset all tracks."""
        self.tracks.clear()
        self.frame_count = 0
        KalmanBoxTracker._id_counter = 0
