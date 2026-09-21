"""
UrbanBus Edge AI — Camera Manager

Handles multi-camera stream acquisition with thread-safe frame buffering.
Supports USB/CSI cameras, RTSP streams, and video file inputs.
"""

import cv2
import time
import threading
import numpy as np
from typing import Dict, Optional, Tuple, Any
from loguru import logger


class CameraStream:
    """Individual camera stream handler with threaded capture."""

    def __init__(
        self,
        camera_id: str,
        source: Any,
        resolution: Tuple[int, int] = (1920, 1080),
        fps: int = 30,
    ):
        self.camera_id = camera_id
        self.source = source
        self.resolution = resolution
        self.target_fps = fps
        self.frame = None
        self.frame_count = 0
        self.last_frame_time = 0
        self.is_running = False
        self._lock = threading.Lock()
        self._thread = None
        self._cap = None

    def start(self) -> bool:
        """Open camera and start capture thread."""
        try:
            if isinstance(self.source, str) and (
                self.source.startswith("rtsp://") or
                self.source.startswith("http://")
            ):
                self._cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
            elif isinstance(self.source, str):
                # Video file
                self._cap = cv2.VideoCapture(self.source)
            else:
                # Device index
                self._cap = cv2.VideoCapture(int(self.source))

            if not self._cap.isOpened():
                logger.warning(
                    f"Camera {self.camera_id}: Could not open source {self.source}. "
                    "Running in simulated mode."
                )
                self.is_running = True
                self._thread = threading.Thread(
                    target=self._simulate_loop, daemon=True
                )
                self._thread.start()
                return True

            self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.resolution[0])
            self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.resolution[1])
            self._cap.set(cv2.CAP_PROP_FPS, self.target_fps)

            actual_w = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_h = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            actual_fps = self._cap.get(cv2.CAP_PROP_FPS)

            logger.info(
                f"Camera {self.camera_id}: Opened {self.source} "
                f"@ {actual_w}x{actual_h} {actual_fps:.0f}fps"
            )

            self.is_running = True
            self._thread = threading.Thread(target=self._capture_loop, daemon=True)
            self._thread.start()
            return True

        except Exception as e:
            logger.error(f"Camera {self.camera_id}: Failed to start — {e}")
            return False

    def _capture_loop(self):
        """Continuously read frames from camera."""
        frame_interval = 1.0 / self.target_fps

        while self.is_running:
            ret, frame = self._cap.read()

            if not ret:
                # For video files, loop back
                if isinstance(self.source, str) and not self.source.startswith(("rtsp://", "http://")):
                    self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                logger.warning(f"Camera {self.camera_id}: Frame read failed")
                time.sleep(0.1)
                continue

            with self._lock:
                self.frame = frame
                self.frame_count += 1
                self.last_frame_time = time.time()

            # Rate limit
            time.sleep(max(0, frame_interval - 0.001))

    def _simulate_loop(self):
        """Generate synthetic frames when no camera is available."""
        frame_interval = 1.0 / self.target_fps

        while self.is_running:
            # Create a realistic-looking simulated frame
            frame = np.random.randint(60, 180, (*self.resolution[::-1], 3), dtype=np.uint8)

            # Add some visual elements
            h, w = frame.shape[:2]
            # Road-like horizontal line
            cv2.line(frame, (0, h // 2), (w, h // 2), (100, 100, 100), 3)
            # Timestamp overlay
            ts = time.strftime("%H:%M:%S")
            cv2.putText(
                frame, f"SIM {self.camera_id} {ts}",
                (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2
            )

            with self._lock:
                self.frame = frame
                self.frame_count += 1
                self.last_frame_time = time.time()

            time.sleep(frame_interval)

    def read(self) -> Optional[np.ndarray]:
        """Get the latest frame (thread-safe)."""
        with self._lock:
            if self.frame is not None:
                return self.frame.copy()
        return None

    def stop(self):
        """Stop capture thread and release camera."""
        self.is_running = False
        if self._thread:
            self._thread.join(timeout=3)
        if self._cap and self._cap.isOpened():
            self._cap.release()
        logger.info(f"Camera {self.camera_id}: Stopped ({self.frame_count} frames)")

    @property
    def is_healthy(self) -> bool:
        """Check if camera is producing recent frames."""
        if not self.is_running:
            return False
        return (time.time() - self.last_frame_time) < 5.0


class CameraManager:
    """
    Manages multiple camera streams for a single bus.
    Provides unified interface to read frames from any camera.
    """

    def __init__(self, camera_configs: Dict[str, dict]):
        self.cameras: Dict[str, CameraStream] = {}
        self._configs = camera_configs

    def start_all(self):
        """Initialize and start all configured cameras."""
        for cam_id, cfg in self._configs.items():
            if not cfg.get("enabled", True):
                logger.info(f"Camera {cam_id}: Disabled in config — skipping")
                continue

            stream = CameraStream(
                camera_id=cam_id,
                source=cfg.get("source", 0),
                resolution=tuple(cfg.get("resolution", [1920, 1080])),
                fps=cfg.get("fps", 30),
            )
            if stream.start():
                self.cameras[cam_id] = stream

        logger.info(f"CameraManager: Started {len(self.cameras)} cameras")

    def read_frame(self, camera_id: str) -> Optional[np.ndarray]:
        """Read latest frame from a specific camera."""
        if camera_id in self.cameras:
            return self.cameras[camera_id].read()
        return None

    def read_all_frames(self) -> Dict[str, np.ndarray]:
        """Read latest frames from all active cameras."""
        frames = {}
        for cam_id, stream in self.cameras.items():
            frame = stream.read()
            if frame is not None:
                frames[cam_id] = frame
        return frames

    def get_health_status(self) -> Dict[str, str]:
        """Get health status of all cameras."""
        status = {}
        for cam_id, stream in self.cameras.items():
            if stream.is_healthy:
                status[cam_id] = "ok"
            elif stream.is_running:
                status[cam_id] = "error"
            else:
                status[cam_id] = "offline"

        # Include disabled cameras
        for cam_id in self._configs:
            if cam_id not in status:
                status[cam_id] = "offline"

        return status

    def stop_all(self):
        """Stop all camera streams."""
        for stream in self.cameras.values():
            stream.stop()
        self.cameras.clear()
        logger.info("CameraManager: All cameras stopped")
