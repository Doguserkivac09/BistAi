'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SignalBadge } from '@/components/SignalBadge';
import { SignalExplanation } from '@/components/SignalExplanation';
import { Skeleton } from '@/components/ui/skeleton';
import { WatchlistButton } from '@/components/WatchlistButton';
import { SaveSignalButton } from '@/components/SaveSignalButton';
import { fetchOHLCVClient, fetchOHLCVByTimeframeClient, type TimeframeKey } from '@/lib/api-client';
import { detectAllSignals } from '@/lib/signals';
import { createClient } from '@/lib/supabase';
import type { OHLCVCandle, StockSignal } from '@/types';
import { StockChart } from '@/components/StockChart';
import { saveSignalPerformance } from '@/lib/performance';
import { toast } from 'sonner';

const TIMEFRAMES: { key: TimeframeKey; label: string; description: string }[] = [
  { key: '1H', label: '1H', description: '1 saat' },
  { key: '1G', label: '1G', description: '1 gün' },
  { key: '1W', label: '1W', description: '1 hafta' },
  { key: '1A', label: '1A', description: '1 ay' },
  { key: '3A', label: '3A', description: '3 ay' },
  { key: '1Y', label: '1Y', description: '1 yıl' },
];

interface HisseDetailClientProps {
  sembol: string;
  isInWatchlist: boolean;
  savedSignalTypes: string[];
}

export function HisseDetailClient({ sembol, isInWatchlist, savedSignalTypes }: HisseDetailClientProps) {
  const [candles, setCandles] = useState<OHLCVCandle[]>([]);
  const [signals, setSignals] = useState<StockSignal[]>([]);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<TimeframeKey>('1A');

  useEffect(() => {
    if (!sembol) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data =
          timeframe === '1A'
            ? await fetchOHLCVClient(sembol, 30)
            : await fetchOHLCVByTimeframeClient(sembol, timeframe);
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

            try {
              await saveSignalPerformance({ userId, signal: sig, candles: data });
            } catch {
              // ignore
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
                <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface/80 p-1 text-xs text-text-secondary">
                  {TIMEFRAMES.map((tf) => (
                    <button
                      key={tf.key}
                      type="button"
                      onClick={() => setTimeframe(tf.key)}
                      className={`px-2.5 py-1 rounded-lg transition-colors ${
                        timeframe === tf.key
                          ? 'bg-primary text-white'
                          : 'bg-surface text-text-secondary hover:bg-surface/80'
                      }`}
                      aria-label={tf.description}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              </div>
              <WatchlistButton sembol={sembol} isInWatchlist={isInWatchlist} />
            </div>

            <Card className="mb-6 overflow-hidden">
              <CardHeader>
                <CardTitle className="text-base">Fiyat & EMA</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-[400px] w-full">
                  <StockChart candles={candles} height={400} />
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6 overflow-hidden">
              <CardHeader>
                <CardTitle className="text-base">RSI (14)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-[180px] w-full">
                  <StockChart candles={candles} showRsi height={180} />
                </div>
              </CardContent>
            </Card>

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
          </>
        )}
      </main>
    </div>
  );
}
