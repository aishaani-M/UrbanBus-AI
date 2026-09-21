import { formatDistanceToNow } from '../../utils/timeUtils';

export default function LiveFeed({ events = [] }) {
  const SEVERITY_BG = {
    critical: 'rgba(239, 68, 68, 0.12)',
    high: 'rgba(249, 115, 22, 0.12)',
    medium: 'rgba(234, 179, 8, 0.12)',
    low: 'rgba(34, 197, 94, 0.12)',
  };

  return (
    <div className="live-feed">
      {events.length === 0 && (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
          Waiting for events...
        </div>
      )}
      {events.map((evt, i) => (
        <div
          key={evt.id}
          className={`live-feed-item ${evt.isNew ? 'new' : ''}`}
          style={{ animationDelay: `${i * 30}ms` }}
        >
          <div
            className="live-feed-icon"
            style={{ background: SEVERITY_BG[evt.severity] || SEVERITY_BG.medium }}
          >
            {evt.icon || 'EVT'}
          </div>
          <div className="live-feed-content">
            <div className="live-feed-title">{evt.label}</div>
            <div className="live-feed-meta">
              <span className={`severity-badge ${evt.severity}`}>{evt.severity}</span>
              <span>Bus {evt.busId}</span>
              {evt.area && <span>{evt.area}</span>}
            </div>
          </div>
          <div className="live-feed-time">
            {formatDistanceToNow(evt.timestamp)}
          </div>
        </div>
      ))}
    </div>
  );
}
