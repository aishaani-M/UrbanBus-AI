import { useMemo } from 'react';
import { Bus, AlertTriangle, Shield, Eye, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import Header from '../components/Common/Header';
import StatsCard from '../components/Common/StatsCard';
import GISMap from '../components/Map/GISMap';
import LiveFeed from '../components/Dashboard/LiveFeed';
import { MOCK_BUSES, MOCK_DEFECTS, MOCK_INCIDENTS, MOCK_ROUTES, MOCK_HOURLY } from '../data/mockData';
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

export default function DashboardPage({ liveEvents, stats }) {
  const { t } = useApp();
  const activeBuses = useMemo(() => MOCK_BUSES.filter(b => b.status === 'active'), []);
  const recentDefects = useMemo(() => MOCK_DEFECTS.slice(0, 30), []);
  const recentIncidents = useMemo(() => MOCK_INCIDENTS.slice(0, 10), []);
  const allMapEvents = useMemo(() => [
    ...recentDefects.map(d => ({ ...d, icon: d.icon })),
    ...recentIncidents.map(inc => ({ ...inc, detectionClass: inc.incidentType, label: inc.label, icon: inc.icon })),
  ], [recentDefects, recentIncidents]);

  const criticalCount = MOCK_DEFECTS.filter(d => d.severity === 'critical').length;
  const todayIncidents = MOCK_INCIDENTS.filter(i => {
    const diff = Date.now() - new Date(i.timestamp).getTime();
    return diff < 86400000;
  }).length;

  return (
    <>
      <Header
        title={t('commandCenter')}
        subtitle={t('realTimeUrbanIntelligence')}
        stats={{
          activeBuses: activeBuses.length,
          totalDetections: MOCK_DEFECTS.length + MOCK_INCIDENTS.length,
          criticalAlerts: criticalCount,
          avgConfidence: '87%',
        }}
      />
      <div className="page-content" style={{ padding: 16 }}>
        {/* Stats Row */}
        <div className="stats-grid">
          <StatsCard
            icon={<Bus size={20} />}
            iconColor="blue"
            value={activeBuses.length}
            label={t('activeBuses')}
            trend="+3"
            trendDirection="up"
            delay={0}
          />
          <StatsCard
            icon={<Eye size={20} />}
            iconColor="green"
            value={MOCK_DEFECTS.length}
            label={t('roadDefectsFound')}
            trend="+12"
            trendDirection="up"
            delay={50}
          />
          <StatsCard
            icon={<Shield size={20} />}
            iconColor="red"
            value={todayIncidents}
            label={t('incidentsToday')}
            trend="-2"
            trendDirection="down"
            delay={100}
          />
          <StatsCard
            icon={<AlertTriangle size={20} />}
            iconColor="orange"
            value={criticalCount}
            label={t('criticalAlerts')}
            trend="+1"
            trendDirection="up"
            delay={150}
          />
        </div>

        {/* Main Grid: Map + Feed */}
        <div className="dashboard-grid">
          {/* Stats row spans full width */}
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="chart-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {/* Hourly Distribution */}
              <div className="glass-card chart-card">
                <div className="chart-card-title">{t('hourlyEventDistribution')}</div>
                <div className="chart-card-subtitle">{t('detectionsAndIncidents24h')}</div>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={MOCK_HOURLY}>
                    <XAxis dataKey="hour" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} interval={3} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                    <Tooltip {...chartTooltipStyle} />
                    <Bar dataKey="defects" fill="#00d4ff" radius={[3, 3, 0, 0]} opacity={0.8} name={t('defects')} />
                    <Bar dataKey="incidents" fill="#f97316" radius={[3, 3, 0, 0]} opacity={0.8} name={t('incidents')} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Traffic Density Trend */}
              <div className="glass-card chart-card">
                <div className="chart-card-title">{t('trafficDensityTrend')}</div>
                <div className="chart-card-subtitle">{t('vehicleCountCity')}</div>
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={MOCK_HOURLY}>
                    <defs>
                      <linearGradient id="densityGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="hour" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} interval={3} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                    <Tooltip {...chartTooltipStyle} />
                    <Area type="monotone" dataKey="density" stroke="#00d4ff" fill="url(#densityGrad)" strokeWidth={2} name={t('vehicles')} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Map */}
          <div className="dashboard-map">
            <GISMap
              buses={activeBuses}
              events={allMapEvents}
              routes={MOCK_ROUTES}
              showBuses={true}
              showEvents={true}
              showRoutes={true}
              height="100%"
            />
          </div>

          {/* Live Feed */}
          <div className="dashboard-feed glass-card">
            <div className="dashboard-feed-header">
              <div className="dashboard-feed-title">
                <span className="pulse-dot" />
                {t('liveEvents')}
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {liveEvents.length} {t('events')}
              </span>
            </div>
            <div className="dashboard-feed-body">
              <LiveFeed events={liveEvents} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
