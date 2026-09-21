import { useState, useMemo } from 'react';
import Header from '../components/Common/Header';
import StatsCard from '../components/Common/StatsCard';
import GISMap from '../components/Map/GISMap';
import { MOCK_DENSITY, MOCK_ROUTES, MOCK_BUSES } from '../data/mockData';
import { Thermometer, Clock, TrendingUp, Car } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

export default function CongestionPage() {
  const { t } = useApp();
  const [selectedHour, setSelectedHour] = useState(9);
  const [showRoutes, setShowRoutes] = useState(true);

  const filteredDensity = useMemo(() =>
    MOCK_DENSITY.filter(p => Math.abs(p.hour - selectedHour) <= 2),
    [selectedHour]
  );

  const totalVehicles = useMemo(() =>
    filteredDensity.reduce((sum, p) => {
      const counts = p.vehicleCounts;
      return sum + counts.car + counts.truck + counts.bus + counts.two_wheeler + counts.auto_rickshaw;
    }, 0),
    [filteredDensity]
  );

  const avgIntensity = useMemo(() => {
    if (filteredDensity.length === 0) return 0;
    return (filteredDensity.reduce((s, p) => s + p.intensity, 0) / filteredDensity.length * 100).toFixed(0);
  }, [filteredDensity]);

  const peakAreas = useMemo(() => {
    const high = filteredDensity.filter(p => p.intensity > 0.7);
    return high.length;
  }, [filteredDensity]);

  return (
    <>
      <Header title={t('congestionHeatmap')} subtitle={t('vehiclesDensityAnalysis')} />
      <div className="page-content" style={{ padding: 16 }}>
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <StatsCard icon={<Car size={20} />} iconColor="blue" value={totalVehicles.toLocaleString()} label={t('vehiclesDetected')} delay={0} />
          <StatsCard icon={<Thermometer size={20} />} iconColor="red" value={`${avgIntensity}%`} label={t('avgCongestion')} delay={50} />
          <StatsCard icon={<TrendingUp size={20} />} iconColor="orange" value={peakAreas} label={t('hotspotZones')} delay={100} />
          <StatsCard icon={<Clock size={20} />} iconColor="purple" value={`${String(selectedHour).padStart(2, '0')}:00`} label={t('selectedTime')} delay={150} />
        </div>

        <div className="two-col-layout" style={{ height: 'calc(100vh - 280px)' }}>
          {/* Map */}
          <div>
            <GISMap
              buses={MOCK_BUSES.filter(b => b.status === 'active')}
              events={[]}
              densityPoints={filteredDensity}
              routes={MOCK_ROUTES}
              showBuses={true}
              showEvents={false}
              showHeatmap={true}
              showRoutes={showRoutes}
              height="100%"
            />
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Time Slider */}
            <div className="glass-card" style={{ padding: 20 }}>
              <div className="chart-card-title">{t('timeOfDay')}</div>
              <div className="chart-card-subtitle">{t('slideToViewCongestion')}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                <span>00:00</span>
                <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>
                  {String(selectedHour).padStart(2, '0')}:00
                </span>
                <span>23:00</span>
              </div>
              <input
                type="range"
                className="time-slider"
                min={0}
                max={23}
                value={selectedHour}
                onChange={e => setSelectedHour(parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 12, flexWrap: 'wrap' }}>
                {[7, 9, 12, 17, 19, 22].map(h => (
                  <button
                    key={h}
                    className={`filter-btn ${selectedHour === h ? 'active' : ''}`}
                    onClick={() => setSelectedHour(h)}
                  >
                    {String(h).padStart(2, '0')}:00
                  </button>
                ))}
              </div>
            </div>

            {/* Route Toggle */}
            <div className="glass-card" style={{ padding: 20 }}>
              <div className="chart-card-title">{t('mapLayers')}</div>
              <div style={{ marginTop: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={showRoutes}
                    onChange={e => setShowRoutes(e.target.checked)}
                    style={{ accentColor: 'var(--accent-primary)' }}
                  />
                  {t('showBusRoutes')}
                </label>
              </div>
            </div>

            {/* Density Legend */}
            <div className="glass-card" style={{ padding: 20 }}>
              <div className="chart-card-title">{t('densityLegend')}</div>
              <div style={{
                marginTop: 12,
                height: 16,
                borderRadius: 8,
                background: 'linear-gradient(to right, #1e3a5f, #00d4ff, #ffd93d, #f97316, #ef4444)',
              }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
                <span>{t('low')}</span>
                <span>{t('medium')}</span>
                <span>{t('high')}</span>
                <span>{t('critical')}</span>
              </div>
            </div>

            {/* Top Bottlenecks */}
            <div className="glass-card" style={{ padding: 20, flex: 1, overflow: 'auto' }}>
              <div className="chart-card-title">{t('topBottleneckZones')}</div>
              <div className="chart-card-subtitle">{t('areasHighestCongestion')}</div>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {['Ameerpet Junction', 'Kukatpally Y Junction', 'Paradise Circle', 'Mehdipatnam Bus Stop', 'LB Nagar X Roads'].map((area, i) => {
                  const pct = Math.round(90 - i * 12);
                  return (
                    <div key={area}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span>{area}</span>
                        <span style={{ color: pct > 70 ? 'var(--severity-critical)' : 'var(--severity-medium)', fontWeight: 600 }}>{pct}%</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--bg-tertiary)', borderRadius: 2 }}>
                        <div style={{
                          height: '100%',
                          width: `${pct}%`,
                          borderRadius: 2,
                          background: pct > 70 ? 'var(--severity-critical)' : pct > 50 ? 'var(--severity-medium)' : 'var(--status-active)',
                          transition: 'width 0.5s ease',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
