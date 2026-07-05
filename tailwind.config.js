const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    path.join(__dirname, 'pages/**/*.{js,ts,jsx,tsx,mdx}'),
    path.join(__dirname, 'components/**/*.{js,ts,jsx,tsx,mdx}'),
    path.join(__dirname, 'app/**/*.{js,ts,jsx,tsx,mdx}'),
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0f',
        surface: '#12121a',
        border: '#1e1e2e',
        primary: '#6366f1',
        bullish: '#22c55e',
        bearish: '#ef4444',
        'text-primary': '#f1f5f9',
        'text-secondary': '#94a3b8',
        // ── Yeni tasarım (modern-minimalist) — tema-farkında (CSS değişkeni) ──
        // Değerler app/globals.css'te :root (açık) + .dark (koyu) altında.
        ink: 'var(--ink)',           // birincil metin + ters-dönen yüzeyler
        onink: 'var(--on-ink)',      // ters yüzey üstündeki metin
        up: '#16a35b',
        'up-on-dark': '#3fce8a',
        down: '#e5484d',
        ai: '#6b6ff5',
        'ai-on-dark': '#8b8fff',
        warn: '#c98a00',
        'v-consider': '#4aa84a',
        'v-avoid': '#8a909b',
        't2': 'var(--t2)',   // metin ikincil
        't3': 'var(--t3)',   // metin üçüncül
        't4': 'var(--t4)',   // metin sönük
        page: 'var(--page)',   // sayfa zemini
        panel: 'var(--panel)',  // kart yüzeyi
        fill: 'var(--fill)',   // dolgu yüzey
        hairline: 'var(--hairline)',
        'ai-panel': 'var(--ai-panel)',
        'ai-panel-border': 'var(--ai-panel-border)',
        'up-badge': 'var(--up-badge)',
        // Kalıcı koyu yüzey — karanlık temada da koyu kalır (Portföy değer kartı,
        // Sektör momentum, Yardım destek kartı gibi "koyu feature" kartları).
        'surface-dark': '#16181d',
      },
      borderRadius: {
        card: '12px',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        manrope: ['var(--font-manrope)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
