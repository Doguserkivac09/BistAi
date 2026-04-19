'use client';

/**
 * Broker/Platform Linkleri Dropdown
 *
 * Analiz → Emir köprüsü. Kullanıcı sinyal gördükten sonra:
 *  - Sembolü tek tıkla panoya kopyalar (terminalde yapıştırmak için)
 *  - İş Yatırım / TradingView / Foreks / Mynet gibi referans kaynaklarda açar
 *
 * BIST hisseleri için evrensel "emir aç" deep-link yok (aracı kurumlar kapalı ekosistem).
 * Bu yüzden piyasada en çok başvurulan 4 kaynağa yönlendiriyoruz + clipboard copy.
 */

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, ChevronDown, Copy, Check } from 'lucide-react';
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

const LINK_TARGETS: LinkTarget[] = [
  {
    label: 'İş Yatırım',
    description: 'Şirket kartı, bilanço, çarpanlar',
    url: (s) => `https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/sirket-karti.aspx?hisse=${s}`,
    emoji: '📊',
  },
  {
    label: 'TradingView',
    description: 'Profesyonel grafik + çizim',
    url: (s) => `https://www.tradingview.com/symbols/BIST-${s}/`,
    emoji: '📈',
  },
  {
    label: 'Foreks',
    description: 'Derinlik + seans içi veri',
    url: (s) => `https://www.foreks.com/sembol/hisse/bist/${s}`,
    emoji: '🔍',
  },
  {
    label: 'Mynet Finans',
    description: 'Haber + yatırımcı yorumları',
    url: (s) => `https://finans.mynet.com/borsa/hisseler/${s.toLowerCase()}/`,
    emoji: '📰',
  },
];

export function BrokerLinkButton({ sembol }: BrokerLinkButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Dış tıklama ile kapat
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
        title="Aracı kurum ve analiz platformlarında bu hisseyi aç"
        className="gap-1"
      >
        <ExternalLink className="h-4 w-4" />
        <span className="hidden sm:inline">Aç</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
        >
          {/* Kopyala satırı */}
          <button
            type="button"
            role="menuitem"
            onClick={handleCopy}
            className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-surface-alt/50"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary">
                Sembolü Kopyala
              </p>
              <p className="text-[11px] text-text-muted">
                <span className="font-mono">{sembol}</span> → Terminalinize yapıştırın
              </p>
            </div>
            {copied ? (
              <Check className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4 shrink-0 text-text-muted" />
            )}
          </button>

          {/* Harici linkler */}
          <div className="py-1">
            {LINK_TARGETS.map((t) => (
              <a
                key={t.label}
                href={t.url(sembol)}
                target="_blank"
                rel="noopener noreferrer"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-alt/50"
              >
                <span className="text-base leading-none">{t.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary">
                    {t.label}
                  </p>
                  <p className="truncate text-[11px] text-text-muted">
                    {t.description}
                  </p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              </a>
            ))}
          </div>

          <p className="border-t border-border/60 bg-surface-alt/30 px-3 py-1.5 text-[10px] text-text-muted">
            BIST hisse emri için aracı kurumunuzun kendi platformunu kullanın.
          </p>
        </div>
      )}
    </div>
  );
}
