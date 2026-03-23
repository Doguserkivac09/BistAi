'use client';

import { useState, useEffect, lazy, Suspense, useCallback } from 'react';
import Link from 'next/link';
import type { HaberItem } from '@/app/api/haber/route';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SignalBadge } from '@/components/SignalBadge';
import { SignalExplanation } from '@/components/SignalExplanation';
import { Skeleton } from '@/components/ui/skeleton';
import { WatchlistButton } from '@/components/WatchlistButton';
import { PortfolyoEkleButton } from '@/components/PortfolyoEkleButton';
import { SaveSignalButton } from '@/components/SaveSignalButton';
import { fetchOHLCVByTimeframeClient, type TimeframeKey } from '@/lib/api-client';
import { detectAllSignals } from '@/lib/signals';
import { calculateSRLevels } from '@/lib/support-resistance';
import { SRLevels } from '@/components/SRLevels';
import { HisseAIYorum } from '@/components/HisseAIYorum';
import { AdilDegerMetre } from '@/components/AdilDegerMetre';
import { HisseSkorKarti } from '@/components/HisseSkorKarti';
import { SinyalGecmisi } from '@/components/SinyalGecmisi';
import { computeTechFairValue } from '@/lib/tech-fair-value';
import { computeStockScore } from '@/lib/stock-score';
import { createClient } from '@/lib/supabase';
import type { OHLCVCandle, StockSignal } from '@/types';
import { saveSignalPerformance } from '@/lib/performance';
import { toast } from 'sonner';

// Lazy-load chart component (lightweight-charts ~40KB gzipped)
const StockChart = lazy(() =>
  import('@/components/StockChart').then((mod) => ({ default: mod.StockChart }))
);

const TIMEFRAMES: { key: TimeframeKey; label: string; description: string; group: 'intraday' | 'daily' }[] = [
  { key: '15m',  label: '15D',  description: '15 dakika',  group: 'intraday' },
  { key: '30m',  label: '30D',  description: '30 dakika',  group: 'intraday' },
  { key: '1h',   label: '1S',   description: '1 saat',     group: 'intraday' },
  { key: '1d',   label: '1G',   description: '1 gün',      group: 'daily' },
  { key: '1wk',  label: '1H',   description: '1 hafta',    group: 'daily' },
  { key: '1mo',  label: '1A',   description: '1 ay',       group: 'daily' },
];

interface HisseDetailClientProps {
  sembol: string;
  isInWatchlist: boolean;
  savedSignalTypes: string[];
}

export function HisseDetailClient({ sembol, isInWatchlist, savedSignalTypes }: HisseDetailClientProps) {
  const [candles, setCandles]         = useState<OHLCVCandle[]>([]);
  const [signals, setSignals]         = useState<StockSignal[]>([]);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [loading, setLoading]         = useState(true);
  const [timeframe, setTimeframe]     = useState<TimeframeKey>('1d');
  const [haberler, setHaberler]       = useState<HaberItem[]>([]);
  const [haberLoading, setHaberLoading] = useState(true);

  // ── Haberler ────────────────────────────────────────────────────────────────
  const loadHaberler = useCallback(async () => {
    setHaberLoading(true);
    try {
      const res = await fetch(`/api/haber?sembol=${sembol}`);
      if (!res.ok) return;
      const data = await res.json();
      setHaberler(data.haberler ?? []);
    } catch {
      // sessizce geç
    } finally {
      setHaberLoading(false);
    }
  }, [sembol]);

  useEffect(() => { loadHaberler(); }, [loadHaberler]);

  // ── OHLCV + Sinyaller ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sembol) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchOHLCVByTimeframeClient(sembol, timeframe);
        if (cancelled) return;
        setCandles(data);
        const sigs = detectAllSignals(sembol, data);
        setSignals(sigs);

        const supabase = createClient();
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData.user?.id ?? null;

        const res = await Promise.allSettled(
          sigs.map(async (sig) => {
            const r = await fetch('/api/explain', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ signal: sig }),
            });
            const j = await r.json();

            if (!cancelled) {
              try {
                await saveSignalPerformance({ userId, signal: sig, candles: data });
              } catch {
                // ignore
              }
            }

            return { key: `${sig.type}`, text: r.ok ? j.explanation : j.error };
          })
        );
        const next: Record<string, string> = {};
        res.forEach((r, i) => {
          if (r.status === 'fulfilled' && sigs[i]) next[sigs[i].type] = r.value.text;
        });
        if (!cancelled) setExplanations(next);
      } catch {
        if (!cancelled) {
          setSignals([]);
          toast.error(`${sembol} verileri yüklenemedi.`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sembol, timeframe]);

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6">
        <div className="mb-4 flex items-center gap-2 text-text-secondary">
          <Link href="/tarama" className="hover:text-primary">
            Tarama
          </Link>
          <span>/</span>
          <span className="text-text-primary">{sembol}</span>
        </div>

        {loading && (
          <>
            <Skeleton className="mb-6 h-[400px] w-full rounded-card" />
            <Skeleton className="h-32 w-full rounded-card" />
          </>
        )}

        {!loading && candles.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-text-secondary">
              Bu hisse için veri bulunamadı. Sembolü kontrol edin.
            </p>
            <Button variant="secondary" className="mt-4" asChild>
              <Link href="/tarama">Tarama sayfasına dön</Link>
            </Button>
          </Card>
        )}

        {!loading && candles.length > 0 && (
          <>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-text-primary">{sembol}</h1>
                <div className="overflow-x-auto">
                <div className="inline-flex items-center rounded-lg border border-border bg-surface/80 p-1 text-xs text-text-secondary whitespace-nowrap">
                  {TIMEFRAMES.map((tf, i) => {
                    const prev = TIMEFRAMES[i - 1];
                    const showSep = prev && prev.group !== tf.group;
                    return (
                      <span key={tf.key} className="flex items-center">
                        {showSep && <span className="mx-1 h-4 w-px bg-border" />}
                        <button
                          type="button"
                          onClick={() => setTimeframe(tf.key)}
                          className={`rounded-md px-2.5 py-1 transition-colors ${
                            timeframe === tf.key
                              ? 'bg-primary text-white'
                              : 'text-text-secondary hover:text-text-primary'
                          }`}
                          aria-label={tf.description}
                          title={tf.description}
                        >
                          {tf.label}
                        </button>
                      </span>
                    );
                  })}
                </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <PortfolyoEkleButton
                  sembol={sembol}
                  defaultFiyat={candles[candles.length - 1]?.close}
                />
                <WatchlistButton sembol={sembol} isInWatchlist={isInWatchlist} />
              </div>
            </div>

            <Card className="mb-6 overflow-hidden">
              <CardHeader>
                <CardTitle className="text-base">Fiyat & EMA</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-[400px] w-full">
                  <Suspense fallback={<div className="flex h-[400px] w-full items-center justify-center bg-surface/50"><span className="text-sm text-text-secondary">Grafik yükleniyor...</span></div>}>
                    <StockChart candles={candles} height={400} />
                  </Suspense>
                </div>
              </CardContent>
            </Card>

            <HisseAIYorum sembol={sembol} />

            <Card className="mb-6 overflow-hidden">
              <CardHeader>
                <CardTitle className="text-base">RSI (14)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-[180px] w-full">
                  <Suspense fallback={<div className="flex h-[180px] w-full items-center justify-center bg-surface/50"><span className="text-sm text-text-secondary">RSI yükleniyor...</span></div>}>
                    <StockChart candles={candles} showRsi height={180} />
                  </Suspense>
                </div>
              </CardContent>
            </Card>

            {candles.length >= 20 && (
              <Card className="mb-6 overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-base">Destek &amp; Direnç Seviyeleri</CardTitle>
                </CardHeader>
                <CardContent>
                  <SRLevels analysis={calculateSRLevels(candles)} />
                </CardContent>
              </Card>
            )}

            {/* ── Teknik Adil Değer + Skor Kartı ──────────────────── */}
            {candles.length >= 50 && (() => {
              const fairValue = computeTechFairValue(candles);
              const stockScore = computeStockScore(candles, signals);
              return (
                <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">📐 Teknik Adil Değer</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <AdilDegerMetre result={fairValue} />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">🏆 Hisse Skor Kartı</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <HisseSkorKarti result={stockScore} />
                    </CardContent>
                  </Card>
                </div>
              );
            })()}

            <h2 className="mb-4 text-lg font-semibold text-text-primary">Tespit Edilen Sinyaller</h2>
            {signals.length === 0 ? (
              <p className="text-text-secondary">Bu hisse için şu an tespit edilen sinyal yok.</p>
            ) : (
              <div className="space-y-4">
                {signals.map((sig) => (
                  <Card key={sig.type}>
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <SignalBadge
                          type={sig.type}
                          direction={sig.direction}
                          severity={sig.severity}
                        />
                        <SaveSignalButton
                          sembol={sembol}
                          signalType={sig.type}
                          signalData={sig.data}
                          aiExplanation={explanations[sig.type] ?? ''}
                          isSaved={savedSignalTypes.includes(sig.type)}
                        />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <SignalExplanation
                        text={explanations[sig.type] ?? null}
                        isLoading={!explanations[sig.type]}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* ── Sinyal Geçmişi ────────────────────────────────────────────── */}
            <h2 className="mb-4 mt-8 text-lg font-semibold text-text-primary">
              📋 Sinyal Geçmişi
            </h2>
            <div className="mb-8">
              <SinyalGecmisi sembol={sembol} />
            </div>

            {/* ── Haberler ──────────────────────────────────────────────────── */}
            <h2 className="mb-4 mt-8 text-lg font-semibold text-text-primary">
              📰 {sembol} Haberleri
            </h2>
            {haberLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-surface" />
                ))}
              </div>
            ) : haberler.length === 0 ? (
              <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface py-8 text-center">
                <p className="text-sm text-text-secondary">
                  {sembol} için güncel haber bulunamadı.
                </p>
                <Link
                  href="/haberler"
                  className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-primary/20 transition-all hover:shadow-primary/40"
                >
                  <span className="absolute inset-0 -translate-x-full bg-white/10 transition-transform duration-300 group-hover:translate-x-0" />
                  <span>📰 Günün Tüm Haberlerini Gör</span>
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {haberler.map((h, i) => {
                  const tarihStr = h.tarih
                    ? new Date(h.tarih).toLocaleDateString('tr-TR', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })
                    : '';
                  return (
                    <a
                      key={i}
                      href={h.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 hover:border-primary/40 hover:bg-surface-alt transition-colors group"
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm">
                        📰
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-primary group-hover:text-primary transition-colors line-clamp-2">
                          {h.baslik}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                          <span>{h.kaynak}</span>
                          {tarihStr && <><span>·</span><span>{tarihStr}</span></>}
                        </div>
                      </div>
                      <span className="shrink-0 text-text-muted group-hover:text-primary transition-colors">↗</span>
                    </a>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
