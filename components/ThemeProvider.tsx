'use client';

/**
 * Tema sağlayıcı (açık/karanlık) — yeni tasarım için.
 * `.dark` sınıfını <html>'e ekler/çıkarır; token'lar globals.css'te CSS değişkeni.
 * Tercih localStorage'da ('ie-theme'). FOUC önleyici script layout <head>'inde.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);
const STORAGE_KEY = 'ie-theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');

  // İlk yüklemede DOM'daki sınıftan (FOUC script'in yazdığı) senkronize ol
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setThemeState(isDark ? 'dark' : 'light');
  }, []);

  const apply = useCallback((t: Theme) => {
    const root = document.documentElement;
    root.classList.add('theme-transition');
    root.classList.toggle('dark', t === 'dark');
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* yoksay */ }
    // Geçiş animasyonu bittikten sonra sınıfı kaldır (sonraki reflow'ları etkilemesin)
    window.setTimeout(() => root.classList.remove('theme-transition'), 250);
  }, []);

  const setTheme = useCallback((t: Theme) => { setThemeState(t); apply(t); }, [apply]);
  const toggle = useCallback(() => setThemeState((p) => { const n = p === 'dark' ? 'light' : 'dark'; apply(n); return n; }), [apply]);

  return <Ctx.Provider value={{ theme, toggle, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) return { theme: 'light', toggle: () => {}, setTheme: () => {} };
  return ctx;
}

/** FOUC önleyici — layout <head>'inde <script> olarak inline çalıştırılır. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;
