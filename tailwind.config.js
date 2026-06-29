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
        // ── Yeni tasarım (modern-minimalist, açık tema) — design_handoff_bistai ──
        ink: '#16181d',
        up: '#16a35b',
        'up-on-dark': '#3fce8a',
        down: '#e5484d',
        ai: '#6b6ff5',
        'ai-on-dark': '#8b8fff',
        warn: '#c98a00',
        'v-consider': '#4aa84a',
        'v-avoid': '#8a909b',
        't2': '#7b818c',   // metin ikincil
        't3': '#9aa0ad',   // metin üçüncül
        't4': '#b4b8bf',   // metin sönük
        page: '#fcfcfd',   // sayfa zemini
        panel: '#ffffff',  // kart yüzeyi
        fill: '#f4f5f6',   // dolgu yüzey
        hairline: '#eef0f2',
        'ai-panel': '#faf9ff',
        'ai-panel-border': '#ece9fb',
        'up-badge': '#eaf7ef',
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
