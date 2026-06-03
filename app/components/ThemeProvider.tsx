'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  applyThemeClass,
  readStoredTheme,
  type ThemeMode,
  THEME_STORAGE_KEY,
} from '../../lib/theme/themeStorage';

type ThemeContextValue = {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = readStoredTheme();
    setModeState(stored);
    setResolved(applyThemeClass(stored));
    document.documentElement.classList.add('theme-transition');
  }, []);

  useEffect(() => {
    if (mode !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => setResolved(applyThemeClass('system'));

    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [mode]);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    setResolved(applyThemeClass(next));
  };

  const toggleMode = () => {
    const next = resolved === 'dark' ? 'light' : 'dark';
    setMode(next);
  };

  const value = useMemo(
    () => ({
      mode,
      resolved,
      setMode,
      toggleMode,
    }),
    [mode, resolved],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
