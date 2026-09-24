import { useState, useEffect, useCallback, useRef } from 'react';
import { AREAS } from '../data/mockData';

/**
 * Real WebSocket hook that connects to the UrbanBus Edge Python backend.
 * 
 * Falls back to mock data generation if WebSocket connection fails after
 * MAX_RETRIES attempts, ensuring the dashboard always has data to display.
 * 
 * Maintains the same API surface as useMockWebSocket:
 *   { events, busUpdates, isConnected, stats, startSimulation, stopSimulation }
 */

const WS_URL = "wss://urbanbus-ai.onrender.com/ws";
const MAX_RETRIES = 5;
const BASE_RETRY_MS = 1000;
const MAX_EVENTS = 100;

// Event type → display mapping (for edge events that lack frontend fields)
const LABEL_MAP = {
  pothole: 'Pothole Detected', crack: 'Road Crack Found',
  damaged_road: 'Damaged Road Surface', missing_divider: 'Missing Road Divider',
  missing_zebra_crossing: 'Missing Zebra Crossing',
  damaged_signboard: 'Damaged Signboard', missing_signboard: 'Missing Signboard',
  waterlogging: 'Waterlogging Detected',
  hit_and_run: 'Hit & Run Alert', rash_driving: 'Rash Driving Detected',
  wrong_side: 'Wrong Side Driving', signal_violation: 'Signal Violation',
  person: 'Pedestrian in Path', child: 'Child Near Road',
  school_child: 'School Children Crossing', cyclist: 'Cyclist Hazard',
  high_density: 'High Traffic Density', congestion: 'Traffic Congestion',
};

const ICON_MAP = {
  pothole: 'PTH', crack: 'CRK', damaged_road: 'DMG', missing_divider: 'DIV',
  missing_zebra_crossing: 'ZBR', damaged_signboard: 'SGN', missing_signboard: 'SGN',
  waterlogging: 'WTR', hit_and_run: 'H&R', rash_driving: 'RSH',
  wrong_side: 'WRG', signal_violation: 'SIG', person: 'PED',
  child: 'CHD', school_child: 'SCH', cyclist: 'CYC',
};

const PRIORITY_MAP = {
  road_defect: 'medium', incident: 'critical',
  pedestrian_alert: 'high', vehicle_density: 'low',
  bus_status: 'info',
};

/**
 * Transform a raw edge event into the frontend event shape
 * expected by LiveFeed, GISMap, and other components.
 */
function transformEdgeEvent(raw) {
  const eventType = raw.event_type;

  // Determine the detection class name
  let detectionClass = '';
  if (raw.detection?.class_name) {
    detectionClass = raw.detection.class_name;
  } else if (raw.incident_type) {
    detectionClass = raw.incident_type;
  } else if (raw.density_level) {
    detectionClass = raw.density_level;
  }

  // Severity
  const severity = raw.severity_display
    || raw.detection?.severity
    || raw.risk_level
    || raw.density_level
    || 'medium';

  return {
    id: raw.event_id || `EDGE-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    eventType,
    detectionClass,
    label: raw.label || LABEL_MAP[detectionClass] || detectionClass,
    icon: raw.icon || ICON_MAP[detectionClass] || 'EVT',
    confidence: raw.detection?.confidence || raw.anpr?.confidence || 0,
    severity,
    priority: PRIORITY_MAP[eventType] || 'medium',
    position: {
      lat: raw.gps?.lat || 0,
      lng: raw.gps?.lon || raw.gps?.lng || 0,
    },
    area: raw.area || '',
    busId: raw.bus_id || '',
    routeNumber: raw.metadata?.route_number || '',
    timestamp: raw.timestamp,
    isNew: true,
    // Preserve extra fields for specialized views
    anpr: raw.anpr || null,
    vehicleCounts: raw.vehicle_counts || null,
    pedestrianCount: raw.pedestrian_count || 0,
    riskLevel: raw.risk_level || null,
    incidentType: raw.incident_type || null,
    cameraId: raw.metadata?.camera_id || '',
    inferenceMs: raw.metadata?.inference_time_ms || 0,
  };
}


// ─── Fallback mock generator (used when WS is unavailable) ───────────

const MOCK_EVENT_TEMPLATES = [
  { type: 'road_defect', classes: ['pothole', 'damaged_road', 'waterlogging', 'crack', 'missing_divider'] },
  { type: 'incident', classes: ['hit_and_run', 'rash_driving', 'signal_violation', 'wrong_side'] },
  { type: 'pedestrian_alert', classes: ['school_child', 'person', 'cyclist'] },
  { type: 'vehicle_density', classes: ['high_density', 'congestion'] },
];

function generateFallbackEvent() {
  const template = MOCK_EVENT_TEMPLATES[Math.floor(Math.random() * MOCK_EVENT_TEMPLATES.length)];
  const cls = template.classes[Math.floor(Math.random() * template.classes.length)];

  return {
    id: `MOCK-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    eventType: template.type,
    detectionClass: cls,
    label: LABEL_MAP[cls] || cls,
    icon: ICON_MAP[cls] || 'EVT',
    confidence: parseFloat((Math.random() * 0.33 + 0.65).toFixed(2)),
    severity: ['critical', 'high', 'medium', 'low'][Math.floor(Math.random() * 4)],
    priority: PRIORITY_MAP[template.type],
    position: {
      lat: 17.385 + (Math.random() - 0.5) * 0.1,
      lng: 78.487 + (Math.random() - 0.5) * 0.1,
    },
    area: AREAS[Math.floor(Math.random() * AREAS.length)],
    busId: `TS-${String(Math.floor(Math.random() * 3) + 1).padStart(3, '0')}`,
    routeNumber: ['10K', '5V', '216'][Math.floor(Math.random() * 3)],
    timestamp: new Date().toISOString(),
    isNew: true,
  };
}


// ─── Hook ─────────────────────────────────────────────────────────────

export function useEdgeWebSocket(intervalMs = 3000) {
  const [events, setEvents] = useState([]);
  const [busUpdates, setBusUpdates] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [stats, setStats] = useState({ totalEvents: 0, criticalAlerts: 0, activeDetections: 0 });

  const wsRef = useRef(null);
  const retriesRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const fallbackIntervalRef = useRef(null);
  const isMockModeRef = useRef(false);
  const pingIntervalRef = useRef(null);

  // Start fallback mock mode
  const startFallbackMode = useCallback(() => {
    if (isMockModeRef.current) return;
    isMockModeRef.current = true;
    setIsConnected(true); // Show as connected (mock mode)

    console.warn('[UrbanBus] WebSocket unavailable — using mock data fallback');

    fallbackIntervalRef.current = setInterval(() => {
      if (Math.random() < 0.7) {
        const event = generateFallbackEvent();
        setEvents(prev => [event, ...prev].slice(0, MAX_EVENTS));
        setStats(prev => ({
          totalEvents: prev.totalEvents + 1,
          criticalAlerts: prev.criticalAlerts + (event.severity === 'critical' ? 1 : 0),
          activeDetections: prev.activeDetections + 1,
        }));
      }
    }, intervalMs);
  }, [intervalMs]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[UrbanBus] Connected to Edge WebSocket');
        setIsConnected(true);
        retriesRef.current = 0;
        isMockModeRef.current = false;

        // Clear fallback if running
        if (fallbackIntervalRef.current) {
          clearInterval(fallbackIntervalRef.current);
          fallbackIntervalRef.current = null;
        }

        // Start ping interval (every 30s)
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle bus position updates
          if (data.type === 'bus_position') {
            setBusUpdates(prev => ({ ...prev, [data.busId]: data }));
            return;
          }

          // Handle connection status messages
          if (data.type === 'connection_status' || data.type === 'pong') {
            return;
          }

          // Handle detection events
          if (data.event_type) {
            // Skip bus_status events from the feed (they're metadata, not detections)
            if (data.event_type === 'bus_status') return;

            const transformed = transformEdgeEvent(data);
            setEvents(prev => [transformed, ...prev].slice(0, MAX_EVENTS));
            setStats(prev => ({
              totalEvents: prev.totalEvents + 1,
              criticalAlerts: prev.criticalAlerts + (transformed.severity === 'critical' ? 1 : 0),
              activeDetections: prev.activeDetections + 1,
            }));
          }
        } catch (err) {
          console.warn('[UrbanBus] Failed to parse message:', err);
        }
      };

      ws.onclose = (event) => {
        console.log(`[UrbanBus] WebSocket closed (code: ${event.code})`);
        setIsConnected(false);
        wsRef.current = null;

        // Clear ping
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Attempt reconnect with exponential backoff
        if (retriesRef.current < MAX_RETRIES) {
          const delay = BASE_RETRY_MS * Math.pow(2, retriesRef.current);
          retriesRef.current += 1;
          console.log(`[UrbanBus] Reconnecting in ${delay}ms (attempt ${retriesRef.current}/${MAX_RETRIES})`);
          reconnectTimerRef.current = setTimeout(connect, delay);
        } else {
          console.warn(`[UrbanBus] Max retries (${MAX_RETRIES}) reached — switching to fallback`);
          startFallbackMode();
        }
      };

      ws.onerror = (error) => {
        console.error('[UrbanBus] WebSocket error:', error);
      };
    } catch (err) {
      console.error('[UrbanBus] Failed to create WebSocket:', err);
      if (retriesRef.current >= MAX_RETRIES) {
        startFallbackMode();
      }
    }
  }, [startFallbackMode]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    isMockModeRef.current = false;
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    events,
    busUpdates,
    isConnected,
    stats,
    startSimulation: connect,
    stopSimulation: disconnect,
  };
}

export default useEdgeWebSocket;
