// UrbanBus — Comprehensive Mock Data for Hyderabad
// Generates realistic bus positions, road defects, traffic density, incidents, and routes

const HYDERABAD_CENTER = { lat: 17.385, lng: 78.4867 };

// === Bus Fleet ===
const BUS_STATUSES = ['active', 'active', 'active', 'active', 'offline', 'maintenance'];
const ROUTE_NAMES = [
  { id: 'RT-001', number: '10K', name: 'Secunderabad – Koti', color: '#00d4ff' },
  { id: 'RT-002', number: '5V', name: 'JNTU – Charminar', color: '#ff6b6b' },
  { id: 'RT-003', number: '216', name: 'Miyapur – LB Nagar', color: '#ffd93d' },
  { id: 'RT-004', number: '65', name: 'Kukatpally – Secunderabad', color: '#6bcb77' },
  { id: 'RT-005', number: '127', name: 'Dilsukhnagar – Mehdipatnam', color: '#c084fc' },
  { id: 'RT-006', number: '49M', name: 'Ameerpet – ECIL', color: '#fb923c' },
  { id: 'RT-007', number: '300', name: 'Uppal – Aramgarh', color: '#38bdf8' },
  { id: 'RT-008', number: '229', name: 'Patancheru – Falaknuma', color: '#f472b6' },
  { id: 'RT-009', number: '86', name: 'Tarnaka – Tolichowki', color: '#34d399' },
  { id: 'RT-010', number: '47A', name: 'BHEL – Afzalgunj', color: '#a78bfa' },
];

export const AREAS = [
  'Ameerpet', 'Begumpet', 'Banjara Hills', 'Jubilee Hills', 'Kukatpally',
  'Miyapur', 'Secunderabad', 'Koti', 'Charminar', 'Mehdipatnam',
  'Dilsukhnagar', 'LB Nagar', 'Uppal', 'ECIL', 'Tarnaka',
  'Madhapur', 'Gachibowli', 'Hitech City', 'Kondapur', 'Tolichowki'
];

function randomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateBusId(index) {
  return `TS-${String(index + 1).padStart(3, '0')}`;
}

function generateGPSNear(center, radiusKm = 8) {
  const r = radiusKm / 111.32;
  const angle = Math.random() * 2 * Math.PI;
  const dist = Math.sqrt(Math.random()) * r;
  return {
    lat: center.lat + dist * Math.cos(angle),
    lng: center.lng + dist * Math.sin(angle)
  };
}

export function generateBuses(count = 50) {
  return Array.from({ length: count }, (_, i) => {
    const pos = generateGPSNear(HYDERABAD_CENTER);
    const route = ROUTE_NAMES[i % ROUTE_NAMES.length];
    const status = randomItem(BUS_STATUSES);
    return {
      id: generateBusId(i),
      busNumber: `TSRTC-${route.number}-${String(i + 1).padStart(2, '0')}`,
      routeId: route.id,
      routeNumber: route.number,
      routeName: route.name,
      routeColor: route.color,
      status,
      position: status === 'active' ? pos : null,
      speed: status === 'active' ? Math.round(randomInRange(5, 45)) : 0,
      heading: Math.round(randomInRange(0, 360)),
      lastSeen: new Date(Date.now() - (status === 'active' ? randomInRange(0, 60000) : randomInRange(3600000, 86400000))).toISOString(),
      cameraHealth: {
        front: status === 'active' ? (Math.random() > 0.05 ? 'ok' : 'error') : 'offline',
        rear: status === 'active' ? (Math.random() > 0.08 ? 'ok' : 'error') : 'offline',
        left: status === 'active' ? (Math.random() > 0.1 ? 'ok' : 'error') : 'offline',
        right: status === 'active' ? (Math.random() > 0.1 ? 'ok' : 'error') : 'offline',
      },
      edgeMetrics: {
        cpuTemp: Math.round(randomInRange(45, 72)),
        gpuTemp: Math.round(randomInRange(50, 80)),
        inferenceLatency: Math.round(randomInRange(15, 45)),
        uptime: Math.round(randomInRange(1, 72)),
      }
    };
  });
}

// === Road Defect Events ===
const DEFECT_TYPES = [
  { class: 'pothole', label: 'Pothole', icon: 'PTH', severities: ['high', 'critical', 'medium'] },
  { class: 'damaged_road', label: 'Damaged Road', icon: 'DMG', severities: ['high', 'medium', 'low'] },
  { class: 'missing_divider', label: 'Missing Divider', icon: 'DIV', severities: ['critical', 'high'] },
  { class: 'missing_zebra_crossing', label: 'Missing Zebra Crossing', icon: 'ZBR', severities: ['high', 'medium'] },
  { class: 'damaged_signboard', label: 'Damaged Signboard', icon: 'SGN', severities: ['medium', 'low'] },
  { class: 'missing_signboard', label: 'Missing Signboard', icon: 'SGN', severities: ['high', 'medium'] },
  { class: 'waterlogging', label: 'Waterlogging', icon: 'WTR', severities: ['critical', 'high', 'medium'] },
  { class: 'crack', label: 'Road Crack', icon: 'CRK', severities: ['low', 'medium'] },
];

export function generateRoadDefects(count = 200) {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const defect = randomItem(DEFECT_TYPES);
    const pos = generateGPSNear(HYDERABAD_CENTER, 10);
    const daysAgo = Math.floor(randomInRange(0, 30));
    return {
      id: `EVT-RD-${String(i + 1).padStart(4, '0')}`,
      eventType: 'road_defect',
      detectionClass: defect.class,
      label: defect.label,
      icon: defect.icon,
      confidence: parseFloat(randomInRange(0.65, 0.98).toFixed(2)),
      severity: randomItem(defect.severities),
      position: pos,
      area: randomItem(AREAS),
      busId: generateBusId(Math.floor(Math.random() * 50)),
      cameraId: randomItem(['front_cam', 'left_cam', 'right_cam']),
      timestamp: new Date(now - daysAgo * 86400000 - randomInRange(0, 86400000)).toISOString(),
      status: randomItem(['new', 'acknowledged', 'in_progress', 'resolved', 'new', 'new']),
    };
  });
}

// === Traffic Density Points ===
export function generateDensityPoints(count = 300) {
  return Array.from({ length: count }, () => {
    const pos = generateGPSNear(HYDERABAD_CENTER, 9);
    const hour = Math.floor(randomInRange(0, 24));
    const isPeak = (hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20);
    const baseIntensity = isPeak ? randomInRange(0.6, 1.0) : randomInRange(0.1, 0.5);
    return {
      lat: pos.lat,
      lng: pos.lng,
      intensity: parseFloat(baseIntensity.toFixed(2)),
      hour,
      vehicleCounts: {
        car: Math.round(randomInRange(isPeak ? 15 : 3, isPeak ? 80 : 25)),
        truck: Math.round(randomInRange(0, isPeak ? 8 : 3)),
        bus: Math.round(randomInRange(1, isPeak ? 12 : 5)),
        two_wheeler: Math.round(randomInRange(isPeak ? 10 : 2, isPeak ? 60 : 20)),
        auto_rickshaw: Math.round(randomInRange(isPeak ? 5 : 1, isPeak ? 25 : 10)),
      }
    };
  });
}

// === Incident Events ===
const INCIDENT_TYPES = [
  { type: 'hit_and_run', label: 'Hit & Run', icon: 'H&R', color: '#ef4444' },
  { type: 'rash_driving', label: 'Rash Driving', icon: 'RSH', color: '#f97316' },
  { type: 'pedestrian_danger', label: 'Pedestrian Danger', icon: 'PED', color: '#eab308' },
  { type: 'wrong_side', label: 'Wrong Side Driving', icon: 'WRG', color: '#ef4444' },
  { type: 'signal_violation', label: 'Signal Violation', icon: 'SIG', color: '#f97316' },
];

const PLATE_PREFIXES = ['TS09', 'TS07', 'TS08', 'AP39', 'AP37', 'TS10', 'TS11', 'KA05'];

function generatePlate() {
  const prefix = randomItem(PLATE_PREFIXES);
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const mid = letters[Math.floor(Math.random() * letters.length)] + letters[Math.floor(Math.random() * letters.length)];
  const num = String(Math.floor(Math.random() * 9000) + 1000);
  return `${prefix}${mid}${num}`;
}

export function generateIncidents(count = 40) {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const incident = randomItem(INCIDENT_TYPES);
    const pos = generateGPSNear(HYDERABAD_CENTER, 8);
    const daysAgo = Math.floor(randomInRange(0, 14));
    return {
      id: `INC-${String(i + 1).padStart(4, '0')}`,
      incidentType: incident.type,
      label: incident.label,
      icon: incident.icon,
      color: incident.color,
      position: pos,
      area: randomItem(AREAS),
      busId: generateBusId(Math.floor(Math.random() * 50)),
      plateText: generatePlate(),
      plateConfidence: parseFloat(randomInRange(0.55, 0.98).toFixed(2)),
      timestamp: new Date(now - daysAgo * 86400000 - randomInRange(0, 86400000)).toISOString(),
      status: randomItem(['open', 'investigating', 'resolved', 'open', 'open']),
      vehicleType: randomItem(['car', 'truck', 'two_wheeler', 'auto_rickshaw', 'bus']),
      speedEstimate: Math.round(randomInRange(30, 110)),
    };
  });
}

// === Route Polylines ===
function generateRoutePoints(start, end, points = 12) {
  const result = [];
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    result.push([
      start[0] + (end[0] - start[0]) * t + randomInRange(-0.008, 0.008),
      start[1] + (end[1] - start[1]) * t + randomInRange(-0.008, 0.008),
    ]);
  }
  return result;
}

export function generateRoutes() {
  return [
    { ...ROUTE_NAMES[0], points: generateRoutePoints([17.434, 78.502], [17.373, 78.475]) },
    { ...ROUTE_NAMES[1], points: generateRoutePoints([17.458, 78.388], [17.358, 78.474]) },
    { ...ROUTE_NAMES[2], points: generateRoutePoints([17.448, 78.358], [17.348, 78.548]) },
    { ...ROUTE_NAMES[3], points: generateRoutePoints([17.425, 78.398], [17.434, 78.502]) },
    { ...ROUTE_NAMES[4], points: generateRoutePoints([17.369, 78.531], [17.394, 78.441]) },
    { ...ROUTE_NAMES[5], points: generateRoutePoints([17.437, 78.448], [17.445, 78.571]) },
    { ...ROUTE_NAMES[6], points: generateRoutePoints([17.399, 78.556], [17.379, 78.418]) },
    { ...ROUTE_NAMES[7], points: generateRoutePoints([17.448, 78.328], [17.328, 78.458]) },
    { ...ROUTE_NAMES[8], points: generateRoutePoints([17.418, 78.528], [17.398, 78.408]) },
    { ...ROUTE_NAMES[9], points: generateRoutePoints([17.458, 78.348], [17.378, 78.468]) },
  ];
}

// === Analytics Data ===
export function generateHourlyEvents() {
  return Array.from({ length: 24 }, (_, h) => {
    const isPeak = (h >= 8 && h <= 10) || (h >= 17 && h <= 20);
    return {
      hour: `${String(h).padStart(2, '0')}:00`,
      defects: Math.round(randomInRange(isPeak ? 8 : 1, isPeak ? 25 : 8)),
      incidents: Math.round(randomInRange(isPeak ? 2 : 0, isPeak ? 8 : 3)),
      density: Math.round(randomInRange(isPeak ? 150 : 30, isPeak ? 400 : 120)),
    };
  });
}

export function generateWeeklyTrend() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days.map(day => ({
    day,
    potholes: Math.round(randomInRange(5, 35)),
    incidents: Math.round(randomInRange(2, 15)),
    alerts: Math.round(randomInRange(8, 45)),
  }));
}

export function generateRouteDelays() {
  return ROUTE_NAMES.map(route => ({
    routeNumber: route.number,
    routeName: route.name,
    expectedMinutes: Math.round(randomInRange(25, 60)),
    actualMinutes: Math.round(randomInRange(30, 90)),
    delayMinutes: Math.round(randomInRange(0, 30)),
    color: route.color,
  }));
}

export function generateVehicleClassification() {
  return [
    { name: 'Cars', value: Math.round(randomInRange(3000, 8000)), color: '#00d4ff' },
    { name: 'Two Wheelers', value: Math.round(randomInRange(4000, 10000)), color: '#ffd93d' },
    { name: 'Auto Rickshaws', value: Math.round(randomInRange(1500, 4000)), color: '#6bcb77' },
    { name: 'Buses', value: Math.round(randomInRange(500, 2000)), color: '#c084fc' },
    { name: 'Trucks', value: Math.round(randomInRange(300, 1200)), color: '#ff6b6b' },
    { name: 'Bicycles', value: Math.round(randomInRange(100, 800)), color: '#fb923c' },
  ];
}

export function generateODMatrix() {
  const zones = ['Hitech City', 'Ameerpet', 'Secunderabad', 'Koti', 'LB Nagar', 'Kukatpally', 'Dilsukhnagar', 'Mehdipatnam'];
  const matrix = [];
  for (let i = 0; i < zones.length; i++) {
    for (let j = 0; j < zones.length; j++) {
      if (i !== j) {
        matrix.push({
          origin: zones[i],
          destination: zones[j],
          trips: Math.round(randomInRange(50, 800)),
        });
      }
    }
  }
  return { zones, matrix };
}

// === Severity Colors ===
export const SEVERITY_COLORS = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
};

export const EVENT_TYPE_COLORS = {
  pothole: '#ef4444',
  damaged_road: '#f97316',
  missing_divider: '#dc2626',
  missing_zebra_crossing: '#eab308',
  damaged_signboard: '#a855f7',
  missing_signboard: '#8b5cf6',
  waterlogging: '#3b82f6',
  crack: '#6b7280',
};

// Pre-generated data (singleton)
export const MOCK_BUSES = generateBuses(50);
export const MOCK_DEFECTS = generateRoadDefects(200);
export const MOCK_DENSITY = generateDensityPoints(300);
export const MOCK_INCIDENTS = generateIncidents(40);
export const MOCK_ROUTES = generateRoutes();
export const MOCK_HOURLY = generateHourlyEvents();
export const MOCK_WEEKLY = generateWeeklyTrend();
export const MOCK_ROUTE_DELAYS = generateRouteDelays();
export const MOCK_VEHICLE_CLASSES = generateVehicleClassification();
export const MOCK_OD_MATRIX = generateODMatrix();
