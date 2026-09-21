"""
UrbanBus Edge AI — MQTT Event Publisher

Publishes detection events to MQTT broker with QoS guarantees.
Includes offline buffering for intermittent connectivity.
"""

import json
import time
import threading
from typing import Optional, List
from collections import deque
from loguru import logger

try:
    import paho.mqtt.client as mqtt
except ImportError:
    mqtt = None
    logger.warning("paho-mqtt not installed — event publishing disabled")

from edge.src.events.event_schema import BaseEvent


class EventPublisher:
    """
    MQTT event publisher with connection management and offline buffering.
    """

    def __init__(
        self,
        broker_host: str = "localhost",
        broker_port: int = 1883,
        topic_prefix: str = "urbanbus/events",
        bus_id: str = "TS-001",
        qos: int = 1,
        username: str = "",
        password: str = "",
        keepalive: int = 60,
        reconnect_interval: int = 5,
        max_buffer_size: int = 1000,
    ):
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.topic_prefix = topic_prefix
        self.bus_id = bus_id
        self.qos = qos
        self.keepalive = keepalive
        self.reconnect_interval = reconnect_interval
        self.max_buffer_size = max_buffer_size

        self._client = None
        self._connected = False
        self._buffer = deque(maxlen=max_buffer_size)
        self._lock = threading.Lock()
        self._stats = {
            "published": 0,
            "buffered": 0,
            "dropped": 0,
            "errors": 0,
        }

        if mqtt is not None:
            self._client = mqtt.Client(
                client_id=f"urbanbus-edge-{bus_id}",
                protocol=mqtt.MQTTv311,
            )
            if username:
                self._client.username_pw_set(username, password)
            self._client.on_connect = self._on_connect
            self._client.on_disconnect = self._on_disconnect
            self._client.on_publish = self._on_publish

    def connect(self):
        """Connect to MQTT broker."""
        if self._client is None:
            logger.warning("MQTT client not available — running in buffer-only mode")
            return

        try:
            self._client.connect(
                self.broker_host, self.broker_port, self.keepalive
            )
            self._client.loop_start()
            logger.info(f"MQTT: Connecting to {self.broker_host}:{self.broker_port}")
        except Exception as e:
            logger.error(f"MQTT: Connection failed — {e}")
            self._start_reconnect()

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self._connected = True
            logger.info("MQTT: Connected to broker")
            self._flush_buffer()
        else:
            logger.error(f"MQTT: Connection failed (rc={rc})")

    def _on_disconnect(self, client, userdata, rc):
        self._connected = False
        if rc != 0:
            logger.warning(f"MQTT: Unexpected disconnect (rc={rc}). Will reconnect.")

    def _on_publish(self, client, userdata, mid):
        self._stats["published"] += 1

    def _start_reconnect(self):
        """Start background reconnection attempts."""
        def reconnect_loop():
            while not self._connected:
                try:
                    time.sleep(self.reconnect_interval)
                    if self._client:
                        self._client.reconnect()
                except Exception:
                    pass

        thread = threading.Thread(target=reconnect_loop, daemon=True)
        thread.start()

    def publish(self, event: BaseEvent):
        """
        Publish an event to MQTT. Buffers locally if disconnected.
        """
        topic = f"{self.topic_prefix}/{self.bus_id}/{event.event_type}"
        payload = event.model_dump_json()

        if self._connected and self._client:
            try:
                result = self._client.publish(topic, payload, qos=self.qos)
                if result.rc != mqtt.MQTT_ERR_SUCCESS:
                    self._buffer_event(topic, payload)
            except Exception as e:
                logger.error(f"MQTT publish error: {e}")
                self._buffer_event(topic, payload)
                self._stats["errors"] += 1
        else:
            self._buffer_event(topic, payload)

    def _buffer_event(self, topic: str, payload: str):
        """Store event in local buffer for later transmission."""
        with self._lock:
            if len(self._buffer) >= self.max_buffer_size:
                self._stats["dropped"] += 1
            self._buffer.append((topic, payload, time.time()))
            self._stats["buffered"] += 1

    def _flush_buffer(self):
        """Flush buffered events after reconnection."""
        with self._lock:
            count = len(self._buffer)
            if count == 0:
                return

            logger.info(f"MQTT: Flushing {count} buffered events")
            while self._buffer:
                topic, payload, ts = self._buffer.popleft()
                try:
                    if self._client:
                        self._client.publish(topic, payload, qos=self.qos)
                except Exception:
                    self._buffer.appendleft((topic, payload, ts))
                    break

    def get_stats(self) -> dict:
        """Get publishing statistics."""
        return {
            **self._stats,
            "buffer_size": len(self._buffer),
            "connected": self._connected,
        }

    def disconnect(self):
        """Disconnect from MQTT broker."""
        if self._client:
            self._client.loop_stop()
            self._client.disconnect()
            self._connected = False
        logger.info(f"MQTT: Disconnected. Stats: {self.get_stats()}")
