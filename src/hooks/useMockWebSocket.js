import { useState, useEffect, useCallback, useRef } from 'react';
import { MOCK_BUSES, MOCK_DEFECTS, MOCK_INCIDENTS, AREAS, SEVERITY_COLORS } from '../data/mockData';

const EVENT_TEMPLATES = [
  { type: 'road_defect', classes: ['pothole', 'damaged_road', 'waterlogging', 'crack', 'missing_divider'] },
  { type: 'incident', classes: ['hit_and_run', 'rash_driving', 'signal_violation', 'wrong_side'] },
  { type: 'pedestrian_alert', classes: ['school_children', 'jaywalking', 'crosswalk_hazard'] },
  { type: 'vehicle_density', classes: ['high_density', 'congestion', 'bottleneck'] },
];

const LABELS = {
  pothole: 'Pothole Detected', damaged_road: 'Damaged Road Surface',
  waterlogging: 'Waterlogging Detected', crack: 'Road Crack Found',
  missing_divider: 'Missing Road Divider', hit_and_run: 'Hit & Run Alert',
  rash_driving: 'Rash Driving Detected', signal_violation: 'Signal Violation',
  wrong_side: 'Wrong Side Driving', school_children: 'School Children Crossing',
  jaywalking: 'Jaywalking Detected', crosswalk_hazard: 'Crosswalk Hazard',
  high_density: 'High Traffic Density', congestion: 'Traffic Congestion',
  bottleneck: 'Traffic Bottleneck',
};

const ICONS = {
  pothole: 'PTH', damaged_road: 'DMG', waterlogging: 'WTR', crack: 'CRK',
  missing_divider: 'DIV', hit_and_run: 'H&R', rash_driving: 'RSH',
  signal_violation: 'SIG', wrong_side: 'WRG', school_children: 'SCH',
  jaywalking: 'JAY', crosswalk_hazard: 'CRS', high_density: 'DEN',
  congestion: 'CON', bottleneck: 'BTL',
};

const PRIORITY_MAP = {
  road_defect: 'medium', incident: 'critical',
  pedestrian_alert: 'high', vehicle_density: 'low',
};

function randomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateLiveEvent() {
  const template = randomItem(EVENT_TEMPLATES);
  const cls = randomItem(template.classes);
  const bus = randomItem(MOCK_BUSES.filter(b => b.status === 'active'));
  const pos = bus?.position || { lat: 17.385 + randomInRange(-0.05, 0.05), lng: 78.487 + randomInRange(-0.05, 0.05) };

  return {
    id: `LIVE-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    eventType: template.type,
    detectionClass: cls,
    label: LABELS[cls] || cls,
    icon: ICONS[cls] || 'EVT',
    confidence: parseFloat(randomInRange(0.65, 0.98).toFixed(2)),
    severity: randomItem(['critical', 'high', 'medium', 'low']),
    priority: PRIORITY_MAP[template.type],
    position: { lat: pos.lat + randomInRange(-0.002, 0.002), lng: pos.lng + randomInRange(-0.002, 0.002) },
    area: randomItem(AREAS),
    busId: bus?.id || 'TS-001',
    routeNumber: bus?.routeNumber || '10K',
    timestamp: new Date().toISOString(),
    isNew: true,
  };
}

function generateBusPositionUpdate() {
  const bus = randomItem(MOCK_BUSES.filter(b => b.status === 'active'));
  if (!bus) return null;
  return {
    type: 'bus_position',
    busId: bus.id,
    position: {
      lat: bus.position.lat + randomInRange(-0.003, 0.003),
      lng: bus.position.lng + randomInRange(-0.003, 0.003),
    },
    speed: Math.round(randomInRange(5, 50)),
    heading: Math.round(randomInRange(0, 360)),
    timestamp: new Date().toISOString(),
  };
}

export function useMockWebSocket(intervalMs = 3000) {
  const [events, setEvents] = useState([]);
  const [busUpdates, setBusUpdates] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [stats, setStats] = useState({ totalEvents: 0, criticalAlerts: 0, activeDetections: 0 });
  const intervalRef = useRef(null);

  const startSimulation = useCallback(() => {
    setIsConnected(true);
    intervalRef.current = setInterval(() => {
      // 70% chance of new detection event
      if (Math.random() < 0.7) {
        const event = generateLiveEvent();
        setEvents(prev => [event, ...prev].slice(0, 100));
        setStats(prev => ({
          totalEvents: prev.totalEvents + 1,
          criticalAlerts: prev.criticalAlerts + (event.severity === 'critical' ? 1 : 0),
          activeDetections: prev.activeDetections + 1,
        }));
      }

      // 80% chance of bus position update
      if (Math.random() < 0.8) {
        const update = generateBusPositionUpdate();
        if (update) {
          setBusUpdates(prev => ({ ...prev, [update.busId]: update }));
        }
      }
    }, intervalMs);
  }, [intervalMs]);

  const stopSimulation = useCallback(() => {
    setIsConnected(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    startSimulation();
    return () => stopSimulation();
  }, [startSimulation, stopSimulation]);

  return { events, busUpdates, isConnected, stats, startSimulation, stopSimulation };
}

export default useMockWebSocket;
