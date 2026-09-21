import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Legend,
} from 'recharts';
import Header from '../components/Common/Header';
import StatsCard from '../components/Common/StatsCard';
import {
  MOCK_ROUTE_DELAYS, MOCK_VEHICLE_CLASSES, MOCK_WEEKLY,
  MOCK_OD_MATRIX, MOCK_HOURLY,
} from '../data/mockData';
import { BarChart3, TrendingUp, GitBranch, Car } from 'lucide-react';
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

export default function AnalyticsPage() {
  const { t } = useApp();
  const [activeTab, setActiveTab] = useState('overview');

  const totalVehicles = MOCK_VEHICLE_CLASSES.reduce((s, v) => s + v.value, 0);
  const avgDelay = Math.round(MOCK_ROUTE_DELAYS.reduce((s, r) => s + r.delayMinutes, 0) / MOCK_ROUTE_DELAYS.length);

  const topODPairs = useMemo(() => {
    return MOCK_OD_MATRIX.matrix
      .sort((a, b) => b.trips - a.trips)
      .slice(0, 10);
  }, []);

  return (
    <>
      <Header title={t('trafficAnalytics')} subtitle={t('insightsAndPatterns')} />
      <div className="page-content" style={{ padding: 16 }}>
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <StatsCard icon={<Car size={20} />} iconColor="blue" value={totalVehicles.toLocaleString()} label={t('vehiclesClassified')} delay={0} />
          <StatsCard icon={<TrendingUp size={20} />} iconColor="orange" value={`${avgDelay} min`} label={t('avgRouteDelay')} delay={50} />
          <StatsCard icon={<BarChart3 size={20} />} iconColor="purple" value={MOCK_OD_MATRIX.zones.length} label={t('trafficZones')} delay={100} />
          <StatsCard icon={<GitBranch size={20} />} iconColor="green" value={MOCK_ROUTE_DELAYS.length} label={t('routesMonitored')} delay={150} />
        </div>

        {/* Tabs */}
        <div className="tab-bar" style={{ maxWidth: 500 }}>
          {['overview', 'routes', 'od-matrix'].map(tab => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'od-matrix' ? 'O-D Matrix' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="chart-grid animate-fade-in">
            {/* Vehicle Classification */}
            <div className="glass-card chart-card">
              <div className="chart-card-title">{t('vehicleClassification')}</div>
              <div className="chart-card-subtitle">{t('breakdownByType')}</div>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={MOCK_VEHICLE_CLASSES}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                    dataKey="value"
                    paddingAngle={3}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: '#64748b' }}
                  >
                    {MOCK_VEHICLE_CLASSES.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip {...chartTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Weekly Trends */}
            <div className="glass-card chart-card">
              <div className="chart-card-title">{t('weeklyTrends')}</div>
              <div className="chart-card-subtitle">{t('detectionsOverWeek')}</div>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={MOCK_WEEKLY}>
                  <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} width={30} />
                  <Tooltip {...chartTooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                  <Line type="monotone" dataKey="potholes" stroke="#00d4ff" strokeWidth={2} dot={{ fill: '#00d4ff', r: 3 }} name={t('potholes')} />
                  <Line type="monotone" dataKey="incidents" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 3 }} name={t('incidents')} />
                  <Line type="monotone" dataKey="alerts" stroke="#ffd93d" strokeWidth={2} dot={{ fill: '#ffd93d', r: 3 }} name={t('alerts')} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Hourly Distribution */}
            <div className="glass-card chart-card">
              <div className="chart-card-title">{t('hourlyTrafficDistribution')}</div>
              <div className="chart-card-subtitle">{t('vehicleDensity24h')}</div>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={MOCK_HOURLY}>
                  <defs>
                    <linearGradient id="densGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="hour" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} interval={2} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} width={35} />
                  <Tooltip {...chartTooltipStyle} />
                  <Area type="monotone" dataKey="density" stroke="#7c3aed" fill="url(#densGrad2)" strokeWidth={2} name={t('vehicles')} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Event Types */}
            <div className="glass-card chart-card">
              <div className="chart-card-title">{t('detectionEventsByHour')}</div>
              <div className="chart-card-subtitle">{t('defectsVsIncidents')}</div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={MOCK_HOURLY}>
                  <XAxis dataKey="hour" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} interval={2} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                  <Tooltip {...chartTooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                  <Bar dataKey="defects" fill="#00d4ff" radius={[2, 2, 0, 0]} name={t('roadDefects')} />
                  <Bar dataKey="incidents" fill="#f97316" radius={[2, 2, 0, 0]} name={t('incidents')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'routes' && (
          <div className="animate-fade-in">
            <div className="glass-card chart-card" style={{ marginBottom: 16 }}>
              <div className="chart-card-title">{t('routeDelayAnalysis')}</div>
              <div className="chart-card-subtitle">{t('expectedVsActual')}</div>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={MOCK_ROUTE_DELAYS} layout="vertical">
                  <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} unit=" min" />
                  <YAxis type="category" dataKey="routeNumber" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} width={50} />
                  <Tooltip {...chartTooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                  <Bar dataKey="expectedMinutes" fill="#00d4ff" radius={[0, 2, 2, 0]} name={t('expected')} opacity={0.6} />
                  <Bar dataKey="actualMinutes" fill="#f97316" radius={[0, 2, 2, 0]} name={t('actual')} opacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Route Table */}
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('route')}</th>
                    <th>{t('name')}</th>
                    <th>{t('expected')}</th>
                    <th>{t('actual')}</th>
                    <th>{t('delay')}</th>
                    <th>{t('status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_ROUTE_DELAYS.map(r => (
                    <tr key={r.routeNumber}>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color }} />
                          <strong>{r.routeNumber}</strong>
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>{r.routeName}</td>
                      <td style={{ fontSize: 12 }}>{r.expectedMinutes} min</td>
                      <td style={{ fontSize: 12 }}>{r.actualMinutes} min</td>
                      <td>
                        <span style={{
                          color: r.delayMinutes > 15 ? 'var(--severity-critical)' : r.delayMinutes > 8 ? 'var(--severity-medium)' : 'var(--status-active)',
                          fontWeight: 700,
                          fontSize: 12,
                        }}>
                          +{r.delayMinutes} min
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${r.delayMinutes > 15 ? 'open' : r.delayMinutes > 8 ? 'investigating' : 'active'}`}>
                          {r.delayMinutes > 15 ? t('severe') : r.delayMinutes > 8 ? t('moderate') : t('normal')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'od-matrix' && (
          <div className="animate-fade-in">
            <div className="chart-grid">
              {/* Top O-D Pairs */}
              <div className="glass-card chart-card">
                <div className="chart-card-title">{t('topODPairs')}</div>
                <div className="chart-card-subtitle">{t('highestTrafficFlowCorridors')}</div>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={topODPairs} layout="vertical">
                    <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="origin"
                      tick={{ fill: '#94a3b8', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={90}
                      tickFormatter={(v, i) => `${topODPairs[i]?.origin?.slice(0, 8)}→${topODPairs[i]?.destination?.slice(0, 8)}`}
                    />
                    <Tooltip
                      {...chartTooltipStyle}
                      formatter={(value, name, props) => [`${value} trips`, `${props.payload.origin} → ${props.payload.destination}`]}
                    />
                    <Bar dataKey="trips" fill="#7c3aed" radius={[0, 4, 4, 0]} opacity={0.8} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Zone Matrix Heatmap */}
              <div className="glass-card chart-card" style={{ overflow: 'auto' }}>
                <div className="chart-card-title">{t('trafficFlowMatrix')}</div>
                <div className="chart-card-subtitle">{t('tripCountsBetweenZones')}</div>
                <div style={{ overflow: 'auto', marginTop: 12 }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 10, width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '4px 6px', color: 'var(--text-muted)', textAlign: 'left', fontSize: 9 }}>From \ To</th>
                        {MOCK_OD_MATRIX.zones.map(z => (
                          <th key={z} style={{ padding: '4px 4px', color: 'var(--text-muted)', fontSize: 8, writingMode: 'vertical-lr', transform: 'rotate(180deg)', maxWidth: 20 }}>
                            {z.slice(0, 8)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {MOCK_OD_MATRIX.zones.map(origin => (
                        <tr key={origin}>
                          <td style={{ padding: '4px 6px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: 9 }}>{origin.slice(0, 10)}</td>
                          {MOCK_OD_MATRIX.zones.map(dest => {
                            if (origin === dest) {
                              return <td key={dest} style={{ padding: 4, textAlign: 'center', color: 'var(--text-muted)' }}>—</td>;
                            }
                            const pair = MOCK_OD_MATRIX.matrix.find(m => m.origin === origin && m.destination === dest);
                            const trips = pair?.trips || 0;
                            const maxTrips = 800;
                            const intensity = trips / maxTrips;
                            const bg = `rgba(0, 212, 255, ${intensity * 0.6})`;
                            return (
                              <td
                                key={dest}
                                style={{
                                  padding: 4,
                                  textAlign: 'center',
                                  background: bg,
                                  color: intensity > 0.4 ? '#fff' : 'var(--text-muted)',
                                  fontWeight: intensity > 0.5 ? 600 : 400,
                                  borderRadius: 2,
                                  fontSize: 9,
                                }}
                                title={`${origin} → ${dest}: ${trips} trips`}
                              >
                                {trips}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
