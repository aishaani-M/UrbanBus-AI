import { Bus, AlertTriangle, Activity, Eye } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';

export default function Header({ title, subtitle, stats }) {
  const { t } = useApp();

  return (
    <header className="page-header">
      <div className="page-header-title-section">
        <h1 className="page-header-title">
          {title}
        </h1>
        {subtitle && <span className="page-header-subtitle">{subtitle}</span>}
      </div>

      <div className="page-header-stats">
        <div className="page-header-stat">
          <Bus size={16} />
          <span className="page-header-stat-value">{stats?.activeBuses ?? 42}</span>
          <span className="page-header-stat-label">{t('activeBuses')}</span>
        </div>
        <div className="page-header-stat">
          <Eye size={16} />
          <span className="page-header-stat-value">{stats?.totalDetections ?? 1247}</span>
          <span className="page-header-stat-label">{t('detectionsToday')}</span>
        </div>
        <div className="page-header-stat">
          <AlertTriangle size={16} />
          <span className="page-header-stat-value">{stats?.criticalAlerts ?? 8}</span>
          <span className="page-header-stat-label">{t('criticalAlerts')}</span>
        </div>
        <div className="page-header-stat">
          <Activity size={16} />
          <span className="page-header-stat-value">{stats?.avgConfidence ?? '87%'}</span>
          <span className="page-header-stat-label">{t('avgConfidence')}</span>
        </div>
      </div>
    </header>
  );
}
