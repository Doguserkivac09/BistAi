'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';

const STORAGE_KEY = 'bistai.onboarding.dismissed';
const STEP_KEY    = 'bistai.onboarding.step';

const STEPS = [
  {
    emoji: '👋',
    title: 'BistAI\'ya Hoş Geldin!',
    desc: 'BIST\'te AI destekli teknik analiz. Sana birkaç dakikada temel özellikleri gösterelim.',
    action: null,
    actionLabel: null,
  },
  {
    emoji: '⚡',
    title: 'Fırsatlar Sayfası',
    desc: 'Her sabah 07:30\'da güncellenen aktif sinyaller. Yüksek skorlu hisseler önce gelir.',
    action: '/firsatlar',
    actionLabel: 'Fırsatlara Git →',
  },
  {
    emoji: '🔍',
    title: 'Sinyal Tarama',
    desc: 'Tüm BIST\'i tara. RSI, MACD, formasyon — istediğin kombinasyonu seç.',
    action: '/tarama',
    actionLabel: 'Taramaya Git →',
  },
  {
    emoji: '📐',
    title: 'Hisse Detayı',
    desc: 'Bir hisseye tıklayınca grafik üstünde formasyonlar ve stop/hedef seviyeleri görürsün.',
    action: null,
    actionLabel: null,
  },
  {
    emoji: '🛡️',
    title: 'Risk Yönetimi',
    desc: 'İşlem başına sermayenin max %1\'ini riske at. BistAI stop-loss seviyesini otomatik hesaplar.',
    action: '/yardim/risk-yonetimi',
    actionLabel: 'Rehberi Oku →',
  },
];

export function OnboardingBanner() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (dismissed) return;
      const savedStep = parseInt(localStorage.getItem(STEP_KEY) ?? '0', 10);
      setStep(isNaN(savedStep) ? 0 : savedStep);
      setVisible(true);
    } catch { /* ignore */ }
  }, []);

  function dismiss() {
    setVisible(false);
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
  }

  function next() {
    const nextStep = step + 1;
    if (nextStep >= STEPS.length) { dismiss(); return; }
    setStep(nextStep);
    try { localStorage.setItem(STEP_KEY, String(nextStep)); } catch { /* ignore */ }
  }

  function prev() {
    const prevStep = Math.max(0, step - 1);
    setStep(prevStep);
    try { localStorage.setItem(STEP_KEY, String(prevStep)); } catch { /* ignore */ }
  }

  if (!visible) return null;

  const current = STEPS[step]!;
  const isLast  = step === STEPS.length - 1;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 px-4 sm:px-0">
      <div className="rounded-2xl border border-primary/30 bg-surface shadow-2xl shadow-primary/10 p-4 backdrop-blur-sm">
        {/* Üst: Başlık + Kapat */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{current.emoji}</span>
            <p className="text-sm font-bold text-text-primary">{current.title}</p>
          </div>
          <button
            onClick={dismiss}
            className="shrink-0 text-text-muted hover:text-text-primary transition-colors"
            aria-label="Kapat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Açıklama */}
        <p className="text-xs text-text-secondary leading-relaxed mb-4">{current.desc}</p>

        {/* İlerleme noktaları */}
        <div className="flex items-center gap-1 mb-3">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-4 bg-primary' : 'w-1.5 bg-border'
              }`}
            />
          ))}
        </div>

        {/* Aksiyonlar */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={prev}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Geri
              </button>
            )}
            <button
              onClick={dismiss}
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              Atla
            </button>
          </div>

          <div className="flex items-center gap-2">
            {current.action && (
              <Link
                href={current.action}
                className="text-xs text-primary hover:underline"
                onClick={next}
              >
                {current.actionLabel}
              </Link>
            )}
            <button
              onClick={next}
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 transition-colors"
            >
              {isLast ? 'Tamam 🎉' : 'İleri'}
              {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
