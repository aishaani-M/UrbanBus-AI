import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

// Fix default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const HYDERABAD = [17.385, 78.4867];

// Create a bus icon
function createBusIcon(color = '#00d4ff', heading = 0) {
  return L.divIcon({
    className: 'bus-marker',
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;">
        <div style="
          width:32px;height:32px;border-radius:50%;
          background:radial-gradient(circle, ${color}33 0%, transparent 70%);
          display:flex;align-items:center;justify-content:center;
          animation: bus-pulse 2s infinite;
        ">
          <div style="
            width:14px;height:14px;border-radius:50%;
            background:${color};border:2px solid white;
            box-shadow:0 0 10px ${color};
          "></div>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

// Create event marker icon
function createEventIcon(emoji, bgColor) {
  return L.divIcon({
    className: 'event-marker-icon',
    html: `
      <div class="event-marker" style="background:${bgColor}22;border-color:${bgColor};">
        <span style="font-size:14px;">${emoji}</span>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const EVENT_COLORS = {
  pothole: '#ef4444', damaged_road: '#f97316', missing_divider: '#dc2626',
  missing_zebra_crossing: '#eab308', damaged_signboard: '#a855f7',
  missing_signboard: '#8b5cf6', waterlogging: '#3b82f6', crack: '#6b7280',
  hit_and_run: '#ef4444', rash_driving: '#f97316', pedestrian_danger: '#eab308',
  wrong_side: '#ef4444', signal_violation: '#f97316',
};

const EVENT_EMOJIS = {
  pothole: 'PTH', damaged_road: 'DMG', missing_divider: 'DIV',
  missing_zebra_crossing: 'ZBR', damaged_signboard: 'SGN',
  missing_signboard: 'SGN', waterlogging: 'WTR', crack: 'CRK',
  hit_and_run: 'H&R', rash_driving: 'RSH', pedestrian_danger: 'PED',
  wrong_side: 'WRG', signal_violation: 'SIG',
};

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

// Heatmap layer component
function HeatLayer({ points, options = {} }) {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length === 0) return;

    import('leaflet.heat').then(() => {
      const data = points.map(p => [p.lat, p.lng, p.intensity || 0.5]);
      const heat = L.heatLayer(data, {
        radius: options.radius || 25,
        blur: options.blur || 20,
        maxZoom: options.maxZoom || 17,
        max: options.max || 1.0,
        gradient: options.gradient || {
          0.0: '#0a0e1a',
          0.2: '#1e3a5f',
          0.4: '#00d4ff',
          0.6: '#ffd93d',
          0.8: '#f97316',
          1.0: '#ef4444',
        },
      });
      heat.addTo(map);
      return () => map.removeLayer(heat);
    });
  }, [map, points, options]);

  return null;
}

// Route polyline component
function RouteLines({ routes, visible }) {
  const map = useMap();
  const layersRef = useRef([]);

  useEffect(() => {
    layersRef.current.forEach(l => map.removeLayer(l));
    layersRef.current = [];

    if (!visible || !routes) return;

    routes.forEach(route => {
      const line = L.polyline(route.points, {
        color: route.color || '#00d4ff',
        weight: 3,
        opacity: 0.6,
        dashArray: '8 6',
      });
      line.addTo(map);
      layersRef.current.push(line);
    });

    return () => {
      layersRef.current.forEach(l => map.removeLayer(l));
    };
  }, [map, routes, visible]);

  return null;
}

export default function GISMap({
  buses = [],
  events = [],
  densityPoints = [],
  routes = [],
  showBuses = true,
  showEvents = true,
  showHeatmap = false,
  showRoutes = false,
  heatmapOptions = {},
  center = HYDERABAD,
  zoom = 12,
  height = '100%',
  onEventClick,
  onBusClick,
  className = '',
}) {
  const busIcons = useMemo(() => {
    const icons = {};
    buses.forEach(bus => {
      if (bus.position) {
        icons[bus.id] = createBusIcon(bus.routeColor || '#00d4ff', bus.heading);
      }
    });
    return icons;
  }, [buses]);

  const eventIcons = useMemo(() => {
    const icons = {};
    events.forEach(evt => {
      const cls = evt.detectionClass || evt.incidentType;
      const color = EVENT_COLORS[cls] || '#00d4ff';
      const emoji = EVENT_EMOJIS[cls] || 'EVT';
      icons[evt.id] = createEventIcon(emoji, color);
    });
    return icons;
  }, [events]);

  return (
    <div className={`map-container ${className}`} style={{ height }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Heatmap */}
        {showHeatmap && <HeatLayer points={densityPoints} options={heatmapOptions} />}

        {/* Routes */}
        {showRoutes && <RouteLines routes={routes} visible={showRoutes} />}

        {/* Bus markers */}
        {showBuses && buses.filter(b => b.position).map(bus => (
          <Marker
            key={bus.id}
            position={[bus.position.lat, bus.position.lng]}
            icon={busIcons[bus.id]}
            eventHandlers={{ click: () => onBusClick?.(bus) }}
          >
            <Popup>
              <div style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: '#00d4ff' }}>
                  Bus {bus.id}
                </div>
                <div style={{ fontSize: 12, marginBottom: 8, color: '#94a3b8' }}>
                  Route {bus.routeNumber} · {bus.routeName}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                  <div><span style={{ color: '#64748b' }}>Speed:</span> <strong>{bus.speed} km/h</strong></div>
                  <div><span style={{ color: '#64748b' }}>Status:</span> <strong style={{ color: '#22c55e' }}>{bus.status}</strong></div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Event markers */}
        {showEvents && events.map(evt => (
          <Marker
            key={evt.id}
            position={[evt.position.lat, evt.position.lng]}
            icon={eventIcons[evt.id]}
            eventHandlers={{ click: () => onEventClick?.(evt) }}
          >
            <Popup>
              <div style={{ minWidth: 200 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                  {evt.icon || 'EVT'} {evt.label}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11, marginBottom: 6 }}>
                  <div><span style={{ color: '#64748b' }}>Confidence:</span> <strong>{Math.round(evt.confidence * 100)}%</strong></div>
                  <div><span style={{ color: '#64748b' }}>Severity:</span> <strong style={{ color: EVENT_COLORS[evt.detectionClass] || '#f97316' }}>{evt.severity}</strong></div>
                  <div><span style={{ color: '#64748b' }}>Bus:</span> <strong>{evt.busId}</strong></div>
                  <div><span style={{ color: '#64748b' }}>Time:</span> <strong>{formatTime(evt.timestamp)}</strong></div>
                </div>
                {evt.area && <div style={{ fontSize: 11, color: '#64748b' }}>{evt.area}</div>}
                {evt.plateText && (
                  <div style={{ marginTop: 6, fontFamily: 'monospace', fontWeight: 700, color: '#00d4ff', fontSize: 14 }}>
                    Plate: {evt.plateText}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
