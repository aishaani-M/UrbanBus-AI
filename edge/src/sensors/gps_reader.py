"""
UrbanBus Edge AI — GPS Reader

Reads GPS coordinates from serial NMEA device or simulates bus movement.
"""

import time
import threading
import math
import random
from typing import Optional, Dict, Any
from dataclasses import dataclass, field
from loguru import logger


@dataclass
class GPSPosition:
    """GPS fix data."""
    latitude: float = 0.0
    longitude: float = 0.0
    altitude: float = 0.0
    speed_kmh: float = 0.0
    heading: float = 0.0
    satellites: int = 0
    fix_quality: int = 0
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "lat": round(self.latitude, 6),
            "lon": round(self.longitude, 6),
            "altitude": round(self.altitude, 1),
            "speed_kmh": round(self.speed_kmh, 1),
            "heading": round(self.heading, 1),
            "satellites": self.satellites,
        }


class GPSReader:
    """
    GPS reader with serial NMEA and simulated modes.
    Simulated mode generates realistic bus movement along Hyderabad routes.
    """

    def __init__(
        self,
        port: str = "/dev/ttyUSB0",
        baud_rate: int = 9600,
        mode: str = "simulated",
    ):
        self.port = port
        self.baud_rate = baud_rate
        self.mode = mode
        self._position = GPSPosition()
        self._lock = threading.Lock()
        self._running = False
        self._thread = None
        self._serial = None

        # Simulated route waypoints (Hyderabad bus route)
        self._waypoints = [
            (17.4400, 78.3489),  # Miyapur
            (17.4350, 78.3680),  # JNTU
            (17.4380, 78.3880),  # Kukatpally
            (17.4370, 78.4180),  # KPHB
            (17.4350, 78.4400),  # Ameerpet
            (17.4280, 78.4550),  # Begumpet
            (17.4340, 78.5020),  # Secunderabad
            (17.4050, 78.4860),  # Koti
            (17.3850, 78.4740),  # Abids
            (17.3580, 78.4740),  # Charminar
        ]
        self._waypoint_idx = 0
        self._segment_progress = 0.0

    def start(self):
        """Start GPS reading thread."""
        if self.mode == "serial":
            self._start_serial()
        else:
            self._start_simulated()

    def _start_serial(self):
        """Start reading from serial NMEA GPS device."""
        try:
            import serial
            import pynmea2

            self._serial = serial.Serial(self.port, self.baud_rate, timeout=1)
            self._running = True
            self._thread = threading.Thread(target=self._serial_loop, daemon=True)
            self._thread.start()
            logger.info(f"GPS: Serial reader started on {self.port}")
        except Exception as e:
            logger.error(f"GPS: Serial failed ({e}). Falling back to simulated.")
            self._start_simulated()

    def _serial_loop(self):
        """Read NMEA sentences from serial port."""
        import pynmea2

        while self._running:
            try:
                line = self._serial.readline().decode("ascii", errors="replace").strip()
                if line.startswith("$GPRMC") or line.startswith("$GPGGA"):
                    msg = pynmea2.parse(line)
                    with self._lock:
                        if hasattr(msg, "latitude"):
                            self._position.latitude = msg.latitude
                            self._position.longitude = msg.longitude
                        if hasattr(msg, "altitude"):
                            self._position.altitude = float(msg.altitude or 0)
                        if hasattr(msg, "spd_over_grnd"):
                            self._position.speed_kmh = float(msg.spd_over_grnd or 0) * 1.852
                        if hasattr(msg, "true_course"):
                            self._position.heading = float(msg.true_course or 0)
                        if hasattr(msg, "num_sats"):
                            self._position.satellites = int(msg.num_sats or 0)
                        self._position.timestamp = time.time()
            except Exception:
                pass

    def _start_simulated(self):
        """Start simulated GPS movement."""
        self._running = True
        with self._lock:
            wp = self._waypoints[0]
            self._position.latitude = wp[0]
            self._position.longitude = wp[1]
            self._position.altitude = 540.0
            self._position.satellites = 12
            self._position.fix_quality = 1

        self._thread = threading.Thread(target=self._simulated_loop, daemon=True)
        self._thread.start()
        logger.info("GPS: Simulated mode started (Hyderabad route)")

    def _simulated_loop(self):
        """Simulate realistic bus movement along waypoints."""
        while self._running:
            wp_current = self._waypoints[self._waypoint_idx]
            wp_next = self._waypoints[(self._waypoint_idx + 1) % len(self._waypoints)]

            # Interpolate between waypoints
            self._segment_progress += random.uniform(0.005, 0.02)

            if self._segment_progress >= 1.0:
                self._segment_progress = 0.0
                self._waypoint_idx = (self._waypoint_idx + 1) % len(self._waypoints)
                wp_current = self._waypoints[self._waypoint_idx]
                wp_next = self._waypoints[(self._waypoint_idx + 1) % len(self._waypoints)]

            t = self._segment_progress
            lat = wp_current[0] + (wp_next[0] - wp_current[0]) * t + random.gauss(0, 0.0001)
            lon = wp_current[1] + (wp_next[1] - wp_current[1]) * t + random.gauss(0, 0.0001)

            # Compute heading
            dlat = wp_next[0] - wp_current[0]
            dlon = wp_next[1] - wp_current[1]
            heading = math.degrees(math.atan2(dlon, dlat)) % 360

            # Simulate speed (slower at stops)
            speed = random.uniform(15, 40)
            if self._segment_progress < 0.1 or self._segment_progress > 0.9:
                speed = random.uniform(0, 15)  # Near stops

            with self._lock:
                self._position.latitude = lat
                self._position.longitude = lon
                self._position.speed_kmh = speed
                self._position.heading = heading + random.gauss(0, 2)
                self._position.altitude = 540.0 + random.gauss(0, 2)
                self._position.timestamp = time.time()

            time.sleep(1.0)

    def get_position(self) -> GPSPosition:
        """Get current GPS position (thread-safe)."""
        with self._lock:
            return GPSPosition(
                latitude=self._position.latitude,
                longitude=self._position.longitude,
                altitude=self._position.altitude,
                speed_kmh=self._position.speed_kmh,
                heading=self._position.heading,
                satellites=self._position.satellites,
                fix_quality=self._position.fix_quality,
                timestamp=self._position.timestamp,
            )

    def stop(self):
        """Stop GPS reader."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=3)
        if self._serial:
            self._serial.close()
        logger.info("GPS: Stopped")
