import { useState, useMemo } from 'react';
import Header from '../components/Common/Header';
import StatsCard from '../components/Common/StatsCard';
import { MOCK_BUSES } from '../data/mockData';
import { Bus, Wifi, WifiOff, Wrench, Thermometer, Cpu, Clock, Camera } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

export default function FleetPage() {
  const { t } = useApp();
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedBus, setSelectedBus] = useState(null);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return MOCK_BUSES;
    return MOCK_BUSES.filter(b => b.status === statusFilter);
  }, [statusFilter]);

  const activeCount = MOCK_BUSES.filter(b => b.status === 'active').length;
  const offlineCount = MOCK_BUSES.filter(b => b.status === 'offline').length;
  const maintenanceCount = MOCK_BUSES.filter(b => b.status === 'maintenance').length;
  const cameraErrors = MOCK_BUSES.reduce((count, bus) => {
    return count + Object.values(bus.cameraHealth).filter(v => v === 'error').length;
  }, 0);

  const statusIcon = (status) => {
    switch (status) {
      case 'active': return <Wifi size={14} style={{ color: 'var(--status-active)' }} />;
      case 'offline': return <WifiOff size={14} style={{ color: 'var(--status-offline)' }} />;
      case 'maintenance': return <Wrench size={14} style={{ color: 'var(--status-maintenance)' }} />;
      default: return null;
    }
  };

  return (
    <>
      <Header title={t('fleetManagement')} subtitle={t('busStatusEdgeHealth')} />
      <div className="page-content" style={{ padding: 16 }}>
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <StatsCard icon={<Bus size={20} />} iconColor="green" value={activeCount} label={t('activeBuses')} delay={0} />
          <StatsCard icon={<WifiOff size={20} />} iconColor="purple" value={offlineCount} label={t('offline')} delay={50} />
          <StatsCard icon={<Wrench size={20} />} iconColor="orange" value={maintenanceCount} label={t('maintenance')} delay={100} />
          <StatsCard icon={<Camera size={20} />} iconColor="red" value={cameraErrors} label={t('cameraErrors')} delay={150} />
        </div>

        {/* Filters */}
        <div className="filter-panel">
          <div className="filter-group">
            <span className="filter-label">{t('status')}:</span>
            {['all', 'active', 'offline', 'maintenance'].map(s => (
              <button
                key={s}
                className={`filter-btn ${statusFilter === s ? 'active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? `${t('all')} (${MOCK_BUSES.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${MOCK_BUSES.filter(b => b.status === s).length})`}
              </button>
            ))}
          </div>
        </div>

        <div className="two-col-layout" style={{ height: 'calc(100vh - 310px)' }}>
          {/* Bus Grid */}
          <div style={{ overflow: 'auto' }}>
            <div className="fleet-grid">
              {filtered.map(bus => (
                <div
                  key={bus.id}
                  className={`glass-card bus-card ${selectedBus?.id === bus.id ? 'glass-card-accent' : ''}`}
                  onClick={() => setSelectedBus(bus)}
                >
                  <div className="bus-card-header">
                    {statusIcon(bus.status)}
                    <div>
                      <div className="bus-card-id">{bus.id}</div>
                      <div className="bus-card-route">{bus.busNumber}</div>
                    </div>
                    <span className={`status-badge ${bus.status}`} style={{ marginLeft: 'auto' }}>
                      {bus.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    {t('route')} {bus.routeNumber} · {bus.routeName}
                  </div>
                  {bus.status === 'active' && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                      <span>{bus.speed} km/h</span>
                      <span>{bus.heading}°</span>
                    </div>
                  )}
                  <div className="bus-card-cameras">
                    {Object.entries(bus.cameraHealth).map(([cam, status]) => (
                      <div key={cam} title={`${cam}: ${status}`} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span className={`camera-indicator ${status}`} />
                        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{cam.charAt(0).toUpperCase()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bus Detail Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {selectedBus ? (
              <>
                {/* Bus Info */}
                <div className="glass-card-accent" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 'var(--radius-md)',
                      background: 'var(--accent-primary-dim)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 24,
                    }}>
                      Bus
                    </div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedBus.id}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{selectedBus.busNumber}</div>
                    </div>
                    <span className={`status-badge ${selectedBus.status}`} style={{ marginLeft: 'auto' }}>
                      {selectedBus.status}
                    </span>
                  </div>
                  <div className="incident-card-body">
                    <div className="incident-card-field">
                      <span className="incident-card-field-label">{t('route')}</span>
                      <span className="incident-card-field-value">
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: selectedBus.routeColor, display: 'inline-block', marginRight: 6 }} />
                        {selectedBus.routeNumber} — {selectedBus.routeName}
                      </span>
                    </div>
                    <div className="incident-card-field">
                      <span className="incident-card-field-label">{t('speed')}</span>
                      <span className="incident-card-field-value">{selectedBus.speed} km/h</span>
                    </div>
                    {selectedBus.position && (
                      <>
                        <div className="incident-card-field">
                          <span className="incident-card-field-label">{t('latitude')}</span>
                          <span className="incident-card-field-value font-mono">{selectedBus.position.lat.toFixed(5)}</span>
                        </div>
                        <div className="incident-card-field">
                          <span className="incident-card-field-label">{t('longitude')}</span>
                          <span className="incident-card-field-value font-mono">{selectedBus.position.lng.toFixed(5)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Edge Device Health */}
                <div className="glass-card" style={{ padding: 20 }}>
                  <div className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Cpu size={16} style={{ color: 'var(--accent-primary)' }} />
                    {t('edgeDeviceHealth')}
                  </div>
                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* CPU Temp */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{t('cpuTemperature')}</span>
                        <span style={{
                          fontWeight: 600,
                          color: selectedBus.edgeMetrics.cpuTemp > 65 ? 'var(--severity-high)' : 'var(--status-active)',
                        }}>
                          {selectedBus.edgeMetrics.cpuTemp}°C
                        </span>
                      </div>
                      <div style={{ height: 4, background: 'var(--bg-tertiary)', borderRadius: 2 }}>
                        <div style={{
                          height: '100%',
                          width: `${(selectedBus.edgeMetrics.cpuTemp / 100) * 100}%`,
                          background: selectedBus.edgeMetrics.cpuTemp > 65 ? 'var(--severity-high)' : 'var(--status-active)',
                          borderRadius: 2,
                          transition: 'width 0.5s',
                        }} />
                      </div>
                    </div>
                    {/* GPU Temp */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{t('gpuTemperature')}</span>
                        <span style={{
                          fontWeight: 600,
                          color: selectedBus.edgeMetrics.gpuTemp > 75 ? 'var(--severity-critical)' : 'var(--status-active)',
                        }}>
                          {selectedBus.edgeMetrics.gpuTemp}°C
                        </span>
                      </div>
                      <div style={{ height: 4, background: 'var(--bg-tertiary)', borderRadius: 2 }}>
                        <div style={{
                          height: '100%',
                          width: `${(selectedBus.edgeMetrics.gpuTemp / 100) * 100}%`,
                          background: selectedBus.edgeMetrics.gpuTemp > 75 ? 'var(--severity-critical)' : 'var(--status-active)',
                          borderRadius: 2,
                          transition: 'width 0.5s',
                        }} />
                      </div>
                    </div>
                    {/* Inference Latency */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{t('inferenceLatency')}</span>
                        <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>
                          {selectedBus.edgeMetrics.inferenceLatency} ms
                        </span>
                      </div>
                    </div>
                    {/* Uptime */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{t('uptime')}</span>
                        <span style={{ fontWeight: 600, color: 'var(--status-active)' }}>
                          {selectedBus.edgeMetrics.uptime}h
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Camera Status */}
                <div className="glass-card" style={{ padding: 20 }}>
                  <div className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Camera size={16} style={{ color: 'var(--accent-primary)' }} />
                    {t('cameraStatus')}
                  </div>
                  <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {Object.entries(selectedBus.cameraHealth).map(([cam, status]) => (
                      <div
                        key={cam}
                        style={{
                          padding: 12,
                          background: status === 'ok' ? 'rgba(34,197,94,0.08)' : status === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(107,114,128,0.08)',
                          borderRadius: 'var(--radius-sm)',
                          border: `1px solid ${status === 'ok' ? 'rgba(34,197,94,0.2)' : status === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(107,114,128,0.2)'}`,
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
                          {cam}
                        </div>
                        <span className={`status-badge ${status === 'ok' ? 'active' : status === 'error' ? 'open' : 'offline'}`}>
                          {status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="glass-card flex-center" style={{ flex: 1, color: 'var(--text-muted)', fontSize: 14 }}>
                {t('selectBusToViewDetails')}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
