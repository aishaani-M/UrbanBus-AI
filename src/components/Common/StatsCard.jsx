export default function StatsCard({ icon, iconColor, value, label, trend, trendDirection, delay = 0 }) {
  return (
    <div
      className={`glass-card stat-card animate-fade-in-up`}
      style={{ animationDelay: `${delay}ms` , animationFillMode: 'backwards' }}
    >
      <div className="stat-card-header">
        <div className={`stat-card-icon ${iconColor}`}>
          {icon}
        </div>
        {trend && (
          <span className={`stat-card-trend ${trendDirection || 'neutral'}`}>
            {trendDirection === 'up' ? '↑' : trendDirection === 'down' ? '↓' : '–'} {trend}
          </span>
        )}
      </div>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  );
}
