// SCORING_V2 FAZ 3 — rejim bağlam rozeti.
// v2 skorlamada skaler makro/rejim SIRALAMADAN çıkıp KAPIYA taşındı: kaç fırsat
// gösterileceğini + eşiği + güveni belirler (bkz. lib/scoring-config regimeGate).
// Bu rozet o gizli kapıyı kullanıcıya görünür kılar ("neden bu kadar / bu seçicilik").
// Kendi kendine kapılı: v2 aktif değilse null döner → v1'de hiç görünmez.

'use client';

import { isScoringV2, regimeGate } from '@/lib/scoring-config';

type Tone = {
  icon: string;
  title: string;
  desc: string;
  badge: string; // tam Tailwind sınıfı (dinamik interpolasyon yok)
};

const POSTURE_TONE: Record<string, Tone> = {
  agresif: {
    icon: '🟢',
    title: 'Boğa rejimi',
    desc: 'Piyasa güçlü — geniş fırsat yelpazesi gösteriliyor.',
    badge: 'bg-up/12 text-up',
  },
  normal: {
    icon: '🟡',
    title: 'Nötr rejim',
    desc: 'Dengeli piyasa — standart seçicilik uygulanıyor.',
    badge: 'bg-warn/12 text-warn',
  },
  temkinli: {
    icon: '🟠',
    title: 'Temkinli rejim',
    desc: 'Riskli ortam — daha seçici gösteriliyor, eşik yükseltildi.',
    badge: 'bg-down/12 text-down',
  },
  savunma: {
    icon: '🔴',
    title: 'Savunma rejimi',
    desc: 'Yüksek risk — yalnızca en güçlü kurulumlar gösteriliyor.',
    badge: 'bg-down/12 text-down',
  },
};

export default function RejimRozeti({ regime, className = '' }: { regime: string | null; className?: string }) {
  // v2 yalnız 'short' yüzeyinde aktif — kapalıysa rozet hiç görünmez (v1 davranışı korunur).
  if (!isScoringV2('short')) return null;

  const gate = regimeGate(regime);
  const tone = POSTURE_TONE[gate.posture] ?? POSTURE_TONE.normal!;

  return (
    <div className={`ie-glass-flat flex items-center gap-2.5 rounded-[14px] px-3.5 py-2.5 ${className}`}>
      <span aria-hidden className="text-[15px] leading-none">{tone.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-bold text-ink">
          Rejim: {tone.title}
          <span className="ml-1.5 font-mono text-[10px] font-semibold text-t3">skor v2</span>
        </div>
        <div className="truncate text-[11px] font-medium text-t3">{tone.desc}</div>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${tone.badge}`}>
        ≤{gate.surfacedCount}
        {gate.thresholdBump > 0 ? ` · eşik +${gate.thresholdBump}` : ''}
      </span>
    </div>
  );
}
