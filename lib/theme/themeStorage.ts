export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'podpaigo-theme';

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;

  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
}

export function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system';

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }

  return 'system';
}

export function applyThemeClass(mode: ThemeMode): 'light' | 'dark' {
  const resolved = resolveTheme(mode);
  const root = document.documentElement;

  root.classList.toggle('dark', resolved === 'dark');
  root.dataset.theme = resolved;

  return resolved;
}

export function themeInitScript(): string {
  return `(function(){try{var key='${THEME_STORAGE_KEY}';var stored=localStorage.getItem(key);var mode=(stored==='light'||stored==='dark'||stored==='system')?stored:'system';var dark=mode==='dark'||(mode==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);document.documentElement.dataset.theme=dark?'dark':'light';}catch(e){}})();`;
}
