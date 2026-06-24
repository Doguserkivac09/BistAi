'use client';

/**
 * Yatırım Radarı — temel veriyle hisse sıralama hub'ı (FAZ 3A).
 *
 * Üç eski sayfa (/uzun-vade-firsatlar, /buyuyen-sirketler, /gelecek-sirketler) tek
 * sekmeli ekranda birleştirildi — hepsi "temel veriyle hisse sırala" işini yapıyordu.
 * Veri katmanları değişmedi (her sekme kendi ai_cache API'sini çeker); eski URL'ler
 * bu sayfaya ?tab= ile redirect eder.
 */

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Diamond, TrendingUp, Brain } from 'lucide-react';
import UzunVadeFirsatlar from '@/components/UzunVadeFirsatlar';
import BuyuyenSirketler from '@/components/BuyuyenSirketler';
import GelecekSirketler from '@/components/GelecekSirketler';

type TabKey = 'uzun-vade' | 'buyuyen' | 'gelecek';

const TABS: { key: TabKey; label: string; kisa: string; icon: typeof Diamond; aciklama: string }[] = [
  { key: 'uzun-vade', label: 'Uzun Vade Fırsatlar', kisa: 'Uzun Vade', icon: Diamond,
    aciklama: 'Bileşik temel skor: Yatırım + Finansal Sağlık + Değerleme + Büyüme' },
  { key: 'buyuyen', label: 'Büyüyen Şirketler', kisa: 'Büyüme', icon: TrendingUp,
    aciklama: 'Geliri, kârı ve EPS\'i artan — reel büyüme momentumu' },
  { key: 'gelecek', label: 'Geleceği Parlak', kisa: 'Gelecek', icon: Brain,
    aciklama: 'Tematik gelecek skoru: büyüme + analist + değerleme' },
];

const VALID = new Set<TabKey>(['uzun-vade', 'buyuyen', 'gelecek']);

function RadarContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const tabParam = searchParams.get('tab');
  const initial: TabKey = tabParam && VALID.has(tabParam as TabKey) ? (tabParam as TabKey) : 'uzun-vade';
  const [tab, setTab] = useState<TabKey>(initial);

  // URL ?tab değişirse (eski URL redirect'i) sekmeyi senkronla
  useEffect(() => {
    if (tabParam && VALID.has(tabParam as TabKey) && tabParam !== tab) {
      setTab(tabParam as TabKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);

  const selectTab = useCallback((key: TabKey) => {
    setTab(key);
    router.replace(`/yatirim-radari?tab=${key}`, { scroll: false });
  }, [router]);

  const aktif = TABS.find((t) => t.key === tab) ?? TABS[0];

  return (
    <div className="min-h-screen bg-background">
      {/* Sekme şeridi */}
      <div className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="container mx-auto max-w-7xl px-4">
          <div className="flex items-center gap-1 overflow-x-auto py-2">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = t.key === tab;
              return (
                <button
                  key={t.key}
                  onClick={() => selectTab(t.key)}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-primary/15 text-primary'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface/60'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{t.label}</span>
                  <span className="sm:hidden">{t.kisa}</span>
                </button>
              );
            })}
          </div>
          <p className="pb-2 text-[11px] text-text-muted">{aktif.aciklama}</p>
        </div>
      </div>

      {/* Aktif sekme içeriği — yalnızca seçili olan mount edilir (kendi verisini çeker) */}
      {tab === 'uzun-vade' && <UzunVadeFirsatlar />}
      {tab === 'buyuyen' && <BuyuyenSirketler />}
      {tab === 'gelecek' && <GelecekSirketler />}
    </div>
  );
}

export default function YatirimRadariPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <RadarContent />
    </Suspense>
  );
}
