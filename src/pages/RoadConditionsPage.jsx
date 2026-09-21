import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import Header from '../components/Common/Header';
import StatsCard from '../components/Common/StatsCard';
import GISMap from '../components/Map/GISMap';
import { MOCK_DEFECTS, SEVERITY_COLORS, EVENT_TYPE_COLORS } from '../data/mockData';
import { AlertTriangle, CheckCircle, Clock, MapPin } from 'lucide-react';
import { formatDateTime } from '../utils/timeUtils';
import { useApp } from '../contexts/AppContext';

const chartTooltipStyle = {
  contentStyle: {
    background: 'rgba(15, 23, 42, 0.95)',
    border: '1px solid rgba(0, 212, 255, 0.25)',
    borderRadius: 8,
    fontSize: 12,
    color: '#f1f5f9',
  },
};

export default function RoadConditionsPage() {
  const { t } = useApp();
  const [severityFilter, setSeverityFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const filtered = useMemo(() => {
    let data = MOCK_DEFECTS;
    if (severityFilter !== 'all') data = data.filter(d => d.severity === severityFilter);
    if (typeFilter !== 'all') data = data.filter(d => d.detectionClass === typeFilter);
    return data;
  }, [severityFilter, typeFilter]);

  const byType = useMemo(() => {
    const counts = {};
    MOCK_DEFECTS.forEach(d => {
      counts[d.label] = (counts[d.label] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, []);

  const bySeverity = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    MOCK_DEFECTS.forEach(d => { counts[d.severity] = (counts[d.severity] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      color: SEVERITY_COLORS[name],
    }));
  }, []);

  const resolvedCount = MOCK_DEFECTS.filter(d => d.status === 'resolved').length;

  const defectTypes = [...new Set(MOCK_DEFECTS.map(d => d.detectionClass))];

  return (
    <>
      <Header title={t('roadConditions')} subtitle={t('infrastructureDefectMonitoring')} />
      <div className="page-content" style={{ padding: 16 }}>
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <StatsCard icon={<AlertTriangle size={20} />} iconColor="orange" value={MOCK_DEFECTS.length} label={t('totalDefects')} trend="+18" trendDirection="up" delay={0} />
          <StatsCard icon={<MapPin size={20} />} iconColor="red" value={MOCK_DEFECTS.filter(d => d.severity === 'critical').length} label={t('criticalDefects')} delay={50} />
          <StatsCard icon={<CheckCircle size={20} />} iconColor="green" value={resolvedCount} label={t('resolved')} delay={100} />
          <StatsCard icon={<Clock size={20} />} iconColor="blue" value={MOCK_DEFECTS.filter(d => d.status === 'new').length} label={t('pendingReview')} delay={150} />
        </div>

        {/* Filters */}
        <div className="filter-panel">
          <div className="filter-group">
            <span className="filter-label">{t('severity')}:</span>
            {['all', 'critical', 'high', 'medium', 'low'].map(sev => (
              <button
                key={sev}
                className={`filter-btn ${severityFilter === sev ? 'active' : ''}`}
                onClick={() => setSeverityFilter(sev)}
              >
                {sev === 'all' ? t('all') : sev.charAt(0).toUpperCase() + sev.slice(1)}
              </button>
            ))}
          </div>
          <div className="filter-group" style={{ marginLeft: 16 }}>
            <span className="filter-label">{t('type')}:</span>
            <select
              className="filter-select"
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
            >
              <option value="all">{t('allTypes')}</option>
              {defectTypes.map(tp => (
                <option key={tp} value={tp}>{tp.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
            {t('showing')} {filtered.length} {t('of')} {MOCK_DEFECTS.length}
          </span>
        </div>

        <div className="two-col-layout" style={{ height: 'calc(100vh - 340px)' }}>
          {/* Map */}
          <div>
            <GISMap
              buses={[]}
              events={filtered}
              showBuses={false}
              showEvents={true}
              height="100%"
              zoom={12}
            />
          </div>

          {/* Side Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
            {/* Defect Type Distribution */}
            <div className="glass-card chart-card">
              <div className="chart-card-title">{t('byType')}</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={byType} layout="vertical">
                  <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} width={110} />
                  <Tooltip {...chartTooltipStyle} />
                  <Bar dataKey="value" fill="#00d4ff" radius={[0, 4, 4, 0]} opacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Severity Breakdown */}
            <div className="glass-card chart-card">
              <div className="chart-card-title">{t('bySeverity')}</div>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={bySeverity} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value" paddingAngle={3}>
                    {bySeverity.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip {...chartTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                {bySeverity.map(s => (
                  <span key={s.name} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
                    {s.name}: {s.value}
                  </span>
                ))}
              </div>
            </div>

            {/* Recent Defects List */}
            <div className="glass-card" style={{ padding: 16, flex: 1, overflow: 'auto' }}>
              <div className="chart-card-title">{t('recentDetections')}</div>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filtered.slice(0, 15).map(defect => (
                  <div
                    key={defect.id}
                    className="live-feed-item"
                    style={{ animation: 'none', padding: 10 }}
                  >
                    <div className="live-feed-icon" style={{ background: `${EVENT_TYPE_COLORS[defect.detectionClass]}20`, width: 32, height: 32 }}>
                      {defect.icon}
                    </div>
                    <div className="live-feed-content">
                      <div className="live-feed-title" style={{ fontSize: 12 }}>{defect.label}</div>
                      <div className="live-feed-meta">
                        <span className={`severity-badge ${defect.severity}`}>{defect.severity}</span>
                        <span>{defect.area}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {Math.round(defect.confidence * 100)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
