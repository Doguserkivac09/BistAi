'use client';

/**
 * PWA "Ana Ekrana Ekle" banner bileşeni.
 * beforeinstallprompt event'ini yakalar, kullanıcıya banner gösterir.
 * Kullanıcı reddederse veya yüklerse 30 gün boyunca tekrar göstermez.
 */

import { useEffect, useState } from 'react';

const DISMISS_KEY = 'pwa_install_dismissed_at';
const DISMISS_DAYS = 30;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export function PwaInstallBanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Daha önce reddedildiyse gösterme
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const days = (Date.now() - Number(dismissedAt)) / (1000 * 60 * 60 * 24);
      if (days < DISMISS_DAYS) return;
    }

    // Zaten yüklüyse gösterme
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Uygulama yüklenince banner'ı kapat
  useEffect(() => {
    const handler = () => setVisible(false);
    window.addEventListener('appinstalled', handler);
    return () => window.removeEventListener('appinstalled', handler);
  }, []);

  async function handleInstall() {
    if (!prompt) return;
    setInstalling(true);
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') {
        setVisible(false);
      }
    } finally {
      setInstalling(false);
      setPrompt(null);
    }
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-background/95 backdrop-blur-md shadow-2xl shadow-black/40 p-4">
        {/* İkon */}
        <div className="shrink-0 h-11 w-11 rounded-xl overflow-hidden border border-border/50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="BistAI" className="h-full w-full object-cover" />
        </div>

        {/* Metin */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary leading-tight">
            Ana Ekrana Ekle
          </p>
          <p className="text-[11px] text-text-muted mt-0.5 leading-snug">
            Hızlı erişim için uygulamayı yükle
          </p>
        </div>

        {/* Butonlar */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDismiss}
            className="text-[11px] text-text-muted hover:text-text-secondary px-2 py-1 transition-colors"
            aria-label="Kapat"
          >
            Daha sonra
          </button>
          <button
            onClick={handleInstall}
            disabled={installing}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {installing ? (
              <span className="h-3 w-3 rounded-full border border-white border-t-transparent animate-spin" />
            ) : (
              '↓'
            )}
            Yükle
          </button>
        </div>
      </div>
    </div>
  );
}
