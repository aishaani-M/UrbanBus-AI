"""
UrbanBus Edge AI — IMU Reader

Reads acceleration and gyroscope data from IMU sensor.
Used for detecting road roughness, sudden braking, and collision events.
"""

import time
import threading
import random
import math
from typing import Optional, Dict, Any
from dataclasses import dataclass, field
from loguru import logger


@dataclass
class IMUData:
    """IMU sensor reading."""
    accel_x: float = 0.0  # G-force
    accel_y: float = 0.0
    accel_z: float = 1.0  # 1G at rest (gravity)
    gyro_x: float = 0.0   # degrees/sec
    gyro_y: float = 0.0
    gyro_z: float = 0.0
    total_accel: float = 1.0  # Magnitude
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "accel": {
                "x": round(self.accel_x, 4),
                "y": round(self.accel_y, 4),
                "z": round(self.accel_z, 4),
                "total": round(self.total_accel, 4),
            },
            "gyro": {
                "x": round(self.gyro_x, 2),
                "y": round(self.gyro_y, 2),
                "z": round(self.gyro_z, 2),
            },
        }


class IMUReader:
    """
    IMU sensor reader with serial and simulated modes.
    Detects sudden acceleration events (potential collisions, potholes).
    """

    def __init__(
        self,
        port: str = "/dev/ttyUSB1",
        baud_rate: int = 115200,
        mode: str = "simulated",
        update_rate_hz: int = 50,
    ):
        self.port = port
        self.baud_rate = baud_rate
        self.mode = mode
        self.update_rate_hz = update_rate_hz
        self._data = IMUData()
        self._lock = threading.Lock()
        self._running = False
        self._thread = None

        # Event detection
        self._accel_history = []
        self._max_history = 200
        self._event_callbacks = []

    def start(self):
        """Start IMU reading."""
        self._running = True
        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()
        logger.info(f"IMU: Started in {self.mode} mode @ {self.update_rate_hz}Hz")

    def _read_loop(self):
        """Main reading loop (simulated mode)."""
        interval = 1.0 / self.update_rate_hz

        while self._running:
            if self.mode == "simulated":
                self._simulate_reading()
            else:
                self._serial_reading()
            time.sleep(interval)

    def _simulate_reading(self):
        """Generate simulated IMU data with occasional events."""
        # Normal driving: small vibrations
        ax = random.gauss(0, 0.05)
        ay = random.gauss(0, 0.05)
        az = 1.0 + random.gauss(0, 0.02)
        gx = random.gauss(0, 2)
        gy = random.gauss(0, 2)
        gz = random.gauss(0, 5)

        # Occasional road roughness / pothole (1% chance per reading)
        if random.random() < 0.01:
            az += random.uniform(0.5, 2.0) * random.choice([-1, 1])
            ay += random.uniform(0.2, 0.8) * random.choice([-1, 1])

        # Occasional hard braking (0.2% chance)
        if random.random() < 0.002:
            ax = random.uniform(-3.0, -1.5)
            logger.debug("IMU: Simulated hard braking event")

        total = math.sqrt(ax**2 + ay**2 + az**2)

        with self._lock:
            self._data = IMUData(
                accel_x=ax, accel_y=ay, accel_z=az,
                gyro_x=gx, gyro_y=gy, gyro_z=gz,
                total_accel=total,
                timestamp=time.time(),
            )

        self._accel_history.append(total)
        if len(self._accel_history) > self._max_history:
            self._accel_history.pop(0)

    def _serial_reading(self):
        """Read from serial IMU device (placeholder)."""
        # In production, parse raw IMU bytes (e.g., MPU6050, BNO055)
        self._simulate_reading()

    def get_data(self) -> IMUData:
        """Get current IMU data (thread-safe)."""
        with self._lock:
            return IMUData(
                accel_x=self._data.accel_x,
                accel_y=self._data.accel_y,
                accel_z=self._data.accel_z,
                gyro_x=self._data.gyro_x,
                gyro_y=self._data.gyro_y,
                gyro_z=self._data.gyro_z,
                total_accel=self._data.total_accel,
                timestamp=self._data.timestamp,
            )

    def detect_sudden_event(self, threshold_g: float = 2.5) -> bool:
        """
        Check if a sudden acceleration event occurred.
        Uses deviation from recent baseline.
        """
        with self._lock:
            total = self._data.total_accel

        if len(self._accel_history) < 10:
            return False

        baseline = sum(self._accel_history[-20:]) / min(20, len(self._accel_history))
        deviation = abs(total - baseline)

        return deviation > threshold_g

    def get_road_roughness(self, window: int = 50) -> float:
        """
        Estimate road roughness from recent acceleration variance.
        Returns 0.0 (smooth) to 1.0 (very rough).
        """
        if len(self._accel_history) < window:
            return 0.0

        recent = self._accel_history[-window:]
        variance = sum((x - sum(recent) / len(recent)) ** 2 for x in recent) / len(recent)

        # Normalize: variance of ~0.01 = smooth, ~0.5+ = very rough
        roughness = min(1.0, variance / 0.5)
        return round(roughness, 3)

    def stop(self):
        """Stop IMU reader."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=3)
        logger.info("IMU: Stopped")
