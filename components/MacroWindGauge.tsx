'use client';

import { motion } from 'framer-motion';
import type { MacroScoreResult } from '@/lib/macro-score';

// ── Sabitler ──────────────────────────────────────────────────────────────────

const WIND_EMOJI: Record<MacroScoreResult['wind'], string> = {
  strong_positive: '☀️',
  positive:        '🌤️',
  neutral:         '⛅',
  negative:        '🌧️',
  strong_negative: '⛈️',
};

const COLOR_CLASS: Record<MacroScoreResult['color'], string> = {
  green:      'text-emerald-400',
  lightgreen: 'text-green-300',
  gray:       'text-zinc-400',
  orange:     'text-orange-400',
  red:        'text-red-400',
};

const COLOR_HEX: Record<MacroScoreResult['color'], string> = {
  green:      '#34d399',
  lightgreen: '#86efac',
  gray:       '#71717a',
  orange:     '#fb923c',
  red:        '#f87171',
};

const SIGNAL_BAR: Record<string, string> = {
  positive: 'bg-emerald-500',
  neutral:  'bg-zinc-500',
  negative: 'bg-red-500',
};

const SIGNAL_TEXT: Record<string, string> = {
  positive: 'text-emerald-400',
  neutral:  'text-zinc-400',
  negative: 'text-red-400',
};

// ── SVG yardımcıları ──────────────────────────────────────────────────────────

/** Standart matematik koordinatı (0°=sağ, 90°=üst) → SVG koordinatı */
function polarPoint(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)] as const;
}

/**
 * SVG yay yolu: startDeg'den endDeg'e (yüksek açıdan düşüğe = saat yönünde ekranda)
 * Gauge için 180°→0° aralığı üst yarım daire üzerinden geçer.
 */
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const [sx, sy] = polarPoint(cx, cy, r, startDeg);
  const [ex, ey] = polarPoint(cx, cy, r, endDeg);
  const large = Math.abs(startDeg - endDeg) > 180 ? 1 : 0;
  // startDeg > endDeg (180→0) → sweep=1 (CW ekranda, üstten geçer)
  const sweep = startDeg > endDeg ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} ${sweep} ${ex} ${ey}`;
}

/** -100/+100 → standart açı (180°→0°) */
function scoreToAngle(score: number) {
  return 180 - ((score + 100) / 200) * 180;
}

/** Standart açı → SVG rotate (ibre yukarı başlar) */
function angleToSVGRotate(angle: number) {
  return 90 - angle;
}

// ── Bileşen ───────────────────────────────────────────────────────────────────

interface MacroWindGaugeProps {
  result: MacroScoreResult;
  /** true → faktör detaylarını gizle (Dashboard widget modu) */
  compact?: boolean;
}

export function MacroWindGauge({ result, compact = false }: MacroWindGaugeProps) {
  const { score, wind, color, label, components } = result;
  const gaugePct  = Math.round((score + 100) / 2);
  const stdAngle  = scoreToAngle(score);
  const svgRotate = angleToSVGRotate(stdAngle);
  const colorHex  = COLOR_HEX[color];

  // SVG geometri sabitleri
  const CX = 100, CY = 96, R = 78, NEEDLE = 62;

  // Renkli bölge tanımları (standart açı aralıkları)
  const ZONES = [
    { from: 180, to: 126, bg: '#ef444430', line: '#ef4444' }, // Güçlü Negatif
    { from: 126, to:  99, bg: '#f9731630', line: '#f97316' }, // Negatif
    { from:  99, to:  81, bg: '#71717a30', line: '#71717a' }, // Nötr
    { from:  81, to:  54, bg: '#86efac30', line: '#86efac' }, // Pozitif
    { from:  54, to:   0, bg: '#22c55e30', line: '#22c55e' }, // Güçlü Pozitif
  ];

  return (
    <div className="rounded-xl border border-border bg-background/50 p-5">
      {/* Başlık */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl leading-none">{WIND_EMOJI[wind]}</span>
        <h3 className="text-sm font-semibold text-text-primary">Makro Rüzgar Skoru</h3>
      </div>

      {/* SVG Gauge */}
      <div className="flex justify-center">
        <svg width="200" height="112" viewBox="0 0 200 112" className="overflow-visible">
          {/* Arka plan bölge yayları */}
          {ZONES.map((z, i) => (
            <path
              key={i}
              d={arcPath(CX, CY, R, z.from, z.to)}
              fill="none"
              stroke={z.bg}
              strokeWidth="16"
              strokeLinecap="butt"
            />
          ))}

          {/* Bölge kenar çizgileri */}
          {[180, 126, 99, 81, 54, 0].map((angle) => {
            const [x1, y1] = polarPoint(CX, CY, R - 8, angle);
            const [x2, y2] = polarPoint(CX, CY, R + 8, angle);
            return (
              <line
                key={angle} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="rgba(0,0,0,0.6)" strokeWidth="1.5"
              />
            );
          })}

          {/* Aktif dolgu yayı (score konumuna kadar) */}
          {stdAngle < 179.9 && (
            <path
              d={arcPath(CX, CY, R, 180, Math.max(stdAngle, 0.5))}
              fill="none"
              stroke={colorHex}
              strokeWidth="5"
              strokeLinecap="round"
              opacity="0.8"
            />
          )}

          {/* İbre (iğne) */}
          <motion.g
            style={{ transformOrigin: `${CX}px ${CY}px` }}
            initial={{ rotate: -90 }}
            animate={{ rotate: svgRotate }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          >
            <line
              x1={CX} y1={CY + 8}
              x2={CX} y2={CY - NEEDLE}
              stroke="white" strokeWidth="2.5" strokeLinecap="round"
            />
          </motion.g>

          {/* Merkez yuvarlak */}
          <circle cx={CX} cy={CY} r="6" fill="#111" stroke="white" strokeWidth="2" />

          {/* Eksen etiketleri */}
          <text x="6"   y="112" fill="#ef4444" fontSize="8" fontFamily="monospace">-100</text>
          <text x={CX}  y="14"  fill="#71717a" fontSize="8" fontFamily="monospace" textAnchor="middle">0</text>
          <text x="194" y="112" fill="#22c55e" fontSize="8" fontFamily="monospace" textAnchor="end">+100</text>
        </svg>
      </div>

      {/* Skor metni */}
      <div className="text-center mt-1 mb-4">
        <motion.p
          className={`text-4xl font-bold tabular-nums ${COLOR_CLASS[color]}`}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          {score > 0 ? '+' : ''}{score}
        </motion.p>
        <p className={`text-sm font-semibold mt-0.5 ${COLOR_CLASS[color]}`}>{label}</p>
        <p className="text-xs text-text-secondary/60 font-mono mt-0.5">
          {gaugePct}/100
        </p>
      </div>

      {/* Faktör detayları */}
      {!compact && (
        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
            Faktör Katkıları
          </p>
          {components.map((c, i) => (
            <motion.div
              key={c.name}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: 0.08 * i }}
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-text-secondary">{c.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-text-secondary/50">
                    %{Math.round(c.weight * 100)}
                  </span>
                  <span className={`font-mono font-semibold ${SIGNAL_TEXT[c.signal] ?? 'text-zinc-400'}`}>
                    {c.rawScore > 0 ? '+' : ''}{c.rawScore}
                  </span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${SIGNAL_BAR[c.signal] ?? 'bg-zinc-500'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.abs(c.rawScore)}%` }}
                  transition={{ duration: 0.5, delay: 0.15 + 0.05 * i }}
                />
              </div>
              <p className="text-[10px] text-text-secondary/50 mt-0.5 leading-tight">
                {c.detail}
              </p>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
