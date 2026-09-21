import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Map, AlertTriangle, Shield, BarChart3,
  Bus, Sun, Moon, Languages, LogOut, UserCircle
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';

export default function GovHeader({ isConnected }) {
  const location = useLocation();
  const { theme, lang, toggleTheme, toggleLang, t } = useApp();
  const { user, logout } = useAuth();

  const navItems = [
    { path: '/', label: t('dashboard'), icon: LayoutDashboard },
    { path: '/congestion', label: t('congestionHeatmap'), icon: Map },
    { path: '/road-conditions', label: t('roadConditions'), icon: AlertTriangle },
    { path: '/incidents', label: t('incidents'), icon: Shield },
    { path: '/analytics', label: t('trafficAnalytics'), icon: BarChart3 },
    { path: '/fleet', label: t('fleetManagement'), icon: Bus },
  ];

  return (
    <header className="gov-header">
      {/* Tricolour stripe */}
      <div className="gov-tricolour" />

      {/* Top banner */}
      <div className="gov-banner">
        <div className="gov-banner-left">
          <div className="gov-emblem">
            <div className="gov-emblem-icon">
              <svg viewBox="0 0 40 40" width="36" height="36" fill="none">
                <circle cx="20" cy="20" r="18" stroke="#003366" strokeWidth="2" fill="#fff" />
                <circle cx="20" cy="20" r="7" stroke="#003366" strokeWidth="1.5" fill="none" />
                {Array.from({ length: 24 }, (_, i) => {
                  const angle = (i * 15) * Math.PI / 180;
                  const x1 = 20 + 7 * Math.cos(angle);
                  const y1 = 20 + 7 * Math.sin(angle);
                  const x2 = 20 + 16 * Math.cos(angle);
                  const y2 = 20 + 16 * Math.sin(angle);
                  return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#003366" strokeWidth="0.5" />;
                })}
              </svg>
            </div>
          </div>
          <div className="gov-banner-text">
            <div className="gov-banner-ministry">Government of India</div>
            <div className="gov-banner-dept">Bharat Electronics Limited</div>
          </div>
        </div>
        <div className="gov-banner-right">
          <div className="gov-banner-controls">
            <button
              onClick={toggleTheme}
              className="gov-control-btn"
              title={theme === 'dark' ? t('lightMode') : t('darkMode')}
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              <span>{theme === 'dark' ? t('lightMode') : t('darkMode')}</span>
            </button>
            <button
              onClick={toggleLang}
              className="gov-control-btn"
              title={t('language')}
            >
              <Languages size={14} />
              <span>{lang === 'en' ? 'हिंदी' : 'EN'}</span>
            </button>
          </div>
          <div className="gov-connection-status">
            <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
            <span>{isConnected ? t('edgeConnected') : t('disconnected')}</span>
          </div>
          {user && (
            <div className="gov-user-info">
              <UserCircle size={16} />
              <div className="gov-user-details">
                <span className="gov-user-name">{user.name}</span>
                <span className="gov-user-role">{user.designation}</span>
              </div>
              <button onClick={logout} className="gov-logout-btn" title="Logout">
                <LogOut size={14} />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* App Title Bar */}
      <div className="gov-title-bar">
        <div className="gov-app-title">UrbanBus — Urban Intelligence Platform</div>
        <div className="gov-app-subtitle">Real-time Urban Sensing &amp; Monitoring System</div>
      </div>

      {/* Horizontal Navigation */}
      <nav className="gov-nav">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`gov-nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </header>
  );
}
