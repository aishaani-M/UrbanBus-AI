import { useState, useMemo } from 'react';
import Header from '../components/Common/Header';
import StatsCard from '../components/Common/StatsCard';
import GISMap from '../components/Map/GISMap';
import { MOCK_INCIDENTS } from '../data/mockData';
import { Shield, AlertTriangle, Search, Eye } from 'lucide-react';
import { formatDateTime } from '../utils/timeUtils';
import { useApp } from '../contexts/AppContext';

export default function IncidentsPage() {
  const { t } = useApp();
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedIncident, setSelectedIncident] = useState(null);

  const filtered = useMemo(() => {
    let data = MOCK_INCIDENTS;
    if (statusFilter !== 'all') data = data.filter(i => i.status === statusFilter);
    if (typeFilter !== 'all') data = data.filter(i => i.incidentType === typeFilter);
    return data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [statusFilter, typeFilter]);

  const openCount = MOCK_INCIDENTS.filter(i => i.status === 'open').length;
  const investigatingCount = MOCK_INCIDENTS.filter(i => i.status === 'investigating').length;
  const resolvedCount = MOCK_INCIDENTS.filter(i => i.status === 'resolved').length;
  const highConfidence = MOCK_INCIDENTS.filter(i => i.plateConfidence > 0.85).length;

  const mapEvents = filtered.map(inc => ({
    ...inc,
    detectionClass: inc.incidentType,
    label: inc.label,
    icon: inc.icon,
    confidence: inc.plateConfidence,
    severity: inc.status === 'open' ? 'critical' : inc.status === 'investigating' ? 'high' : 'low',
  }));

  const incidentTypes = [...new Set(MOCK_INCIDENTS.map(i => i.incidentType))];

  return (
    <>
      <Header title={t('incidents')} subtitle={t('trafficViolationsSafetyAlerts')} />
      <div className="page-content" style={{ padding: 16 }}>
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <StatsCard icon={<Shield size={20} />} iconColor="red" value={openCount} label={t('openIncidents')} delay={0} />
          <StatsCard icon={<Search size={20} />} iconColor="yellow" value={investigatingCount} label={t('investigating')} delay={50} />
          <StatsCard icon={<Eye size={20} />} iconColor="green" value={resolvedCount} label={t('resolved')} delay={100} />
          <StatsCard icon={<AlertTriangle size={20} />} iconColor="blue" value={highConfidence} label={t('highConfidenceANPR')} delay={150} />
        </div>

        {/* Filters */}
        <div className="filter-panel">
          <div className="filter-group">
            <span className="filter-label">{t('status')}:</span>
            {['all', 'open', 'investigating', 'resolved'].map(s => (
              <button
                key={s}
                className={`filter-btn ${statusFilter === s ? 'active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? t('all') : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div className="filter-group" style={{ marginLeft: 16 }}>
            <span className="filter-label">{t('type')}:</span>
            <select className="filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="all">{t('allTypes')}</option>
              {incidentTypes.map(tp => (
                <option key={tp} value={tp}>{tp.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
            {filtered.length} {t('incidents').toLowerCase()}
          </span>
        </div>

        <div className="two-col-layout" style={{ height: 'calc(100vh - 340px)' }}>
          {/* Map */}
          <div>
            <GISMap
              buses={[]}
              events={mapEvents}
              showBuses={false}
              showEvents={true}
              height="100%"
              zoom={12}
              onEventClick={evt => setSelectedIncident(MOCK_INCIDENTS.find(i => i.id === evt.id))}
            />
          </div>

          {/* Incident List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
            {/* Selected Incident Detail */}
            {selectedIncident && (
              <div className="glass-card-accent" style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span style={{ fontSize: 28 }}>{selectedIncident.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedIncident.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedIncident.id}</div>
                  </div>
                  <span className={`status-badge ${selectedIncident.status}`} style={{ marginLeft: 'auto' }}>
                    {selectedIncident.status}
                  </span>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                    {t('licensePlateANPR')}
                  </div>
                  <span className="plate-number">{selectedIncident.plateText}</span>
                  <div className="confidence-bar" style={{ width: 200, marginTop: 6 }}>
                    <div
                      className="confidence-fill"
                      style={{
                        width: `${selectedIncident.plateConfidence * 100}%`,
                        background: selectedIncident.plateConfidence > 0.85 ? 'var(--status-active)' : 'var(--severity-medium)',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {t('confidence')}: {Math.round(selectedIncident.plateConfidence * 100)}%
                  </div>
                </div>
                <div className="incident-card-body">
                  <div className="incident-card-field">
                    <span className="incident-card-field-label">{t('vehicleType')}</span>
                    <span className="incident-card-field-value">{selectedIncident.vehicleType?.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="incident-card-field">
                    <span className="incident-card-field-label">{t('speedEstimate')}</span>
                    <span className="incident-card-field-value">{selectedIncident.speedEstimate} km/h</span>
                  </div>
                  <div className="incident-card-field">
                    <span className="incident-card-field-label">{t('detectedBy')}</span>
                    <span className="incident-card-field-value">Bus {selectedIncident.busId}</span>
                  </div>
                  <div className="incident-card-field">
                    <span className="incident-card-field-label">{t('area')}</span>
                    <span className="incident-card-field-value">{selectedIncident.area}</span>
                  </div>
                  <div className="incident-card-field" style={{ gridColumn: '1 / -1' }}>
                    <span className="incident-card-field-label">{t('timestamp')}</span>
                    <span className="incident-card-field-value">{formatDateTime(selectedIncident.timestamp)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Incident Table */}
            <div className="data-table-container" style={{ flex: 1 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('type')}</th>
                    <th>{t('plate')}</th>
                    <th>{t('confidence')}</th>
                    <th>{t('area')}</th>
                    <th>{t('status')}</th>
                    <th>{t('time')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(inc => (
                    <tr
                      key={inc.id}
                      onClick={() => setSelectedIncident(inc)}
                      style={{ cursor: 'pointer', background: selectedIncident?.id === inc.id ? 'var(--accent-primary-dim)' : undefined }}
                    >
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{inc.icon}</span>
                          <span style={{ fontSize: 12 }}>{inc.label}</span>
                        </span>
                      </td>
                      <td><span className="font-mono" style={{ color: 'var(--accent-primary)', fontWeight: 600, fontSize: 12 }}>{inc.plateText}</span></td>
                      <td>
                        <span style={{
                          color: inc.plateConfidence > 0.85 ? 'var(--status-active)' : 'var(--severity-medium)',
                          fontWeight: 600,
                          fontSize: 12,
                        }}>
                          {Math.round(inc.plateConfidence * 100)}%
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>{inc.area}</td>
                      <td><span className={`status-badge ${inc.status}`}>{inc.status}</span></td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDateTime(inc.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
