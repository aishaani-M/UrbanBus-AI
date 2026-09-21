import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Map, AlertTriangle, Shield, BarChart3,
  Bus, ChevronLeft, ChevronRight, Sun, Moon, Languages
} from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../contexts/AppContext';

export default function Sidebar({ isConnected }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { theme, lang, toggleTheme, toggleLang, t } = useApp();

  const navItems = [
    { section: t('overview') },
    { path: '/', label: t('dashboard'), icon: LayoutDashboard },
    { path: '/congestion', label: t('congestionHeatmap'), icon: Map },
    { section: t('monitoring') },
    { path: '/road-conditions', label: t('roadConditions'), icon: AlertTriangle },
    { path: '/incidents', label: t('incidents'), icon: Shield },
    { section: t('analytics') },
    { path: '/analytics', label: t('trafficAnalytics'), icon: BarChart3 },
    { path: '/fleet', label: t('fleetManagement'), icon: Bus },
  ];

  const criticalCount = 3; // Mock

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">UB</div>
        {!collapsed && (
          <div className="sidebar-logo-text">
            Urban<span>Bus</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {navItems.map((item, i) => {
          if (item.section) {
            return !collapsed ? (
              <div key={i} className="sidebar-section-title">{item.section}</div>
            ) : <div key={i} style={{ height: 12 }} />;
          }

          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          const showBadge = item.path === '/incidents' && criticalCount > 0;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`nav-item ${isActive ? 'active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="nav-icon" size={20} />
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && showBadge && (
                <span className="nav-badge">{criticalCount}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        {/* Theme & Language Toggles */}
        {!collapsed && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button
              onClick={toggleTheme}
              className="sidebar-toggle-btn"
              title={theme === 'dark' ? t('lightMode') : t('darkMode')}
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              <span>{theme === 'dark' ? t('lightMode') : t('darkMode')}</span>
            </button>
            <button
              onClick={toggleLang}
              className="sidebar-toggle-btn"
              title={t('language')}
            >
              <Languages size={14} />
              <span>{lang === 'en' ? 'हिंदी' : 'EN'}</span>
            </button>
          </div>
        )}
        {collapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            <button
              onClick={toggleTheme}
              className="sidebar-toggle-btn"
              title={theme === 'dark' ? t('lightMode') : t('darkMode')}
              style={{ justifyContent: 'center' }}
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button
              onClick={toggleLang}
              className="sidebar-toggle-btn"
              title={t('language')}
              style={{ justifyContent: 'center' }}
            >
              <Languages size={14} />
            </button>
          </div>
        )}

        <div className="connection-status">
          <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
          {!collapsed && (
            <span>{isConnected ? t('edgeConnected') : t('disconnected')}</span>
          )}
        </div>

        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            marginTop: 12,
            background: 'transparent',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-muted)',
            padding: '6px',
            cursor: 'pointer',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  );
}
