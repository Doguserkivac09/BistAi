'use client';

/**
 * Broker/Platform Linkleri Dropdown
 *
 * Analiz → Emir köprüsü. İki bölüm:
 *  1. Emir Ver — Türkiye'nin en popüler yatırım platformlarına doğrudan link
 *  2. Analiz — Grafik, şirket kartı, derinlik platformları
 *
 * BIST hisseleri için evrensel deep-link yok (aracı kurumlar kapalı ekosistem).
 * Kullanıcıyı doğrudan ilgili broker sayfasına yönlendiriyoruz.
 */

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, ChevronDown, Copy, Check, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface BrokerLinkButtonProps {
  sembol: string;
}

interface LinkTarget {
  label: string;
  description: string;
  url: (sembol: string) => string;
  emoji: string;
}

// Emir verebileceğiniz aracı kurum platformları
const BROKER_TARGETS: LinkTarget[] = [
  {
    label: 'Midas',
    description: 'Kolay alım/satım · Türkiye\'nin yeni nesil uygulaması',
    url: () => 'https://getmidas.app',
    emoji: '🟣',
  },
  {
    label: 'İş Yatırım Trader',
    description: 'Web tabanlı online işlem platformu',
    url: () => 'https://www.isyatirim.com.tr/tr-tr/islem',
    emoji: '🏦',
  },
  {
    label: 'Garanti BBVA Yatırım',
    description: 'Hisse alım/satım · online işlem',
    url: () => 'https://yatirim.garantibbva.com.tr',
    emoji: '🏧',
  },
  {
    label: 'Yapı Kredi Yatırım',
    description: 'Online işlem platformu',
    url: () => 'https://www.yapikredi.com.tr/yatirim/bireysel-yatirim/hisse-senedi',
    emoji: '🏛️',
  },
];

// Analiz & veri platformları
const ANALYSIS_TARGETS: LinkTarget[] = [
  {
    label: 'İş Yatırım — Şirket Kartı',
    description: 'Bilanço, çarpanlar, analist görüşleri',
    url: (s) => `https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/sirket-karti.aspx?hisse=${s}`,
    emoji: '📊',
  },
  {
    label: 'TradingView',
    description: 'Profesyonel grafik + çizim araçları',
    url: (s) => `https://www.tradingview.com/symbols/BIST-${s}/`,
    emoji: '📈',
  },
  {
    label: 'Foreks',
    description: 'Emir defteri + seans içi veri',
    url: (s) => `https://www.foreks.com/sembol/hisse/bist/${s}`,
    emoji: '🔍',
  },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
      {children}
    </p>
  );
}

function LinkRow({ t, sembol, onClose }: { t: LinkTarget; sembol: string; onClose: () => void }) {
  return (
    <a
      href={t.url(sembol)}
      target="_blank"
      rel="noopener noreferrer"
      role="menuitem"
      onClick={onClose}
      className="flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-alt/50"
    >
      <span className="text-base leading-none">{t.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{t.label}</p>
        <p className="truncate text-[11px] text-text-muted">{t.description}</p>
      </div>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-text-muted" />
    </a>
  );
}

export function BrokerLinkButton({ sembol }: BrokerLinkButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sembol);
      setCopied(true);
      toast.success(`${sembol} panoya kopyalandı`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Kopyalama başarısız');
    }
  };

  return (
    <div ref={ref} className="relative">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Aracı kurumda işlem aç veya analiz platformlarında görüntüle"
        className="gap-1"
      >
        <ShoppingCart className="h-4 w-4" />
        <span className="hidden sm:inline">Al / Sat</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-72 overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
        >
          {/* Sembolü kopyala */}
          <button
            type="button"
            role="menuitem"
            onClick={handleCopy}
            className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-surface-alt/50"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary">Sembolü Kopyala</p>
              <p className="text-[11px] text-text-muted">
                <span className="font-mono text-primary">{sembol}</span> → broker terminalinize yapıştırın
              </p>
            </div>
            {copied ? (
              <Check className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4 shrink-0 text-text-muted" />
            )}
          </button>

          {/* Emir Ver bölümü */}
          <SectionLabel>📲 Emir Ver</SectionLabel>
          <div className="pb-1">
            {BROKER_TARGETS.map((t) => (
              <LinkRow key={t.label} t={t} sembol={sembol} onClose={() => setOpen(false)} />
            ))}
          </div>

          {/* Analiz bölümü */}
          <div className="border-t border-border/40">
            <SectionLabel>🔬 Analiz & Veri</SectionLabel>
            <div className="pb-1">
              {ANALYSIS_TARGETS.map((t) => (
                <LinkRow key={t.label} t={t} sembol={sembol} onClose={() => setOpen(false)} />
              ))}
            </div>
          </div>

          <p className="border-t border-border/60 bg-surface-alt/30 px-3 py-1.5 text-[10px] text-text-muted">
            BistAI sinyal üretir, emir vermez. Tercih ettiğiniz aracı kurumu kullanın.
          </p>
        </div>
      )}
    </div>
  );
}
