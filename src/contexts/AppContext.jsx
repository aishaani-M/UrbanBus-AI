import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import translations from '../data/translations';

/**
 * UrbanBus — Theme & Language Context
 * 
 * Provides:
 * - Theme toggle (dark/light) persisted in localStorage
 * - Language toggle (en/hi) persisted in localStorage
 * - t() function for translating strings
 */

const AppContext = createContext();

const THEME_KEY = 'urbanbus-theme';
const LANG_KEY = 'urbanbus-lang';

export function AppProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) || 'light'; }
    catch { return 'light'; }
  });

  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem(LANG_KEY) || 'en'; }
    catch { return 'en'; }
  });

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  }, [theme]);

  // Persist language
  useEffect(() => {
    try { localStorage.setItem(LANG_KEY, lang); } catch {}
  }, [lang]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  const toggleLang = useCallback(() => {
    setLang(prev => prev === 'en' ? 'hi' : 'en');
  }, []);

  // Translation function
  const t = useCallback((key) => {
    return translations[lang]?.[key] || translations.en?.[key] || key;
  }, [lang]);

  return (
    <AppContext.Provider value={{ theme, lang, toggleTheme, toggleLang, setLang, t }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}

export default AppContext;
