'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SignalBadge } from '@/components/SignalBadge';
import dynamic from 'next/dynamic';

const MiniChart = dynamic(
  () => import('@/components/MiniChart').then((mod) => ({ default: mod.MiniChart })),
  { ssr: false, loading: () => <div className="h-[80px] w-full animate-pulse rounded bg-white/5" /> },
);
import { SignalExplanation } from '@/components/SignalExplanation';
import type { StockSignal, OHLCVCandle, ConfluenceResult } from '@/types';
import { computeConfluence } from '@/lib/signals';
import { PortfolyoEkleButton } from '@/components/PortfolyoEkleButton';
import { SRLevels } from '@/components/SRLevels';
import { calculateSRLevels } from '@/lib/support-resistance';

interface StockCardProps {
  signal: StockSignal;
  candleData: OHLCVCandle[];
  allSignals?: StockSignal[];
  macroScore?: { score: number; wind: string } | null;
  winRate?: { rate: number; sampleSize: number } | null; // backtest başarı oranı
  delay?: number;
  cachedExplanation?: string | null;
  onExplanationLoaded?: (text: string) => void;
}

function ConfluenceBadge({ result }: { result: ConfluenceResult }) {
  const cls = result.level === 'yüksek'
    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    : result.level === 'orta'
    ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
    : 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30';

  const tooltip = `Güven: ${result.score}/100 · ${result.categoryCount} kategori · ${result.bullishCount} yükselişçi / ${result.bearishCount} düşüşçü sinyal`;

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}
    >
      <span className="opacity-70">Güven</span> {result.score}
    </span>
  );
}

function WinRateBadge({ rate, sampleSize }: { rate: number; sampleSize: number }) {
  const pct = Math.round(rate * 100);
  const cls = pct >= 60
    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    : pct >= 45
    ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
    : 'text-red-400 bg-red-500/10 border-red-500/30';
  return (
    <span
      title={`${sampleSize} geçmiş sinyale göre 7 günlük başarı oranı`}
      className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}
    >
      7g %{pct}
    </span>
  );
}

function FreshnessBadge({ candlesAgo }: { candlesAgo: number }) {
  if (candlesAgo === 0) return null;
  return (
    <span
      className="inline-flex items-center rounded-md border border-zinc-700/50 bg-zinc-800/40 px-1.5 py-0.5 text-[10px] text-zinc-400"
      title={`Sinyal ${candlesAgo} iş günü önce tetiklendi`}
    >
      {candlesAgo}g önce
    </span>
  );
}

function MTFBadge({ aligned }: { aligned: boolean }) {
  return aligned ? (
    <span
      title="Haftalık trend ile uyumlu — güçlü sinyal"
      className="inline-flex items-center gap-0.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400"
    >
      W✓
    </span>
  ) : (
    <span
      title="Haftalık trend ile uyumsuz — zayıf sinyal"
      className="inline-flex items-center gap-0.5 rounded-md border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-400"
    >
      W✗
    </span>
  );
}

function MacroBadge({ score, wind }: { score: number; wind: string }) {
  const color = score >= 30 ? 'text-green-400 bg-green-500/10 border-green-500/30'
    : score >= 0 ? 'text-green-300 bg-green-500/5 border-green-500/20'
    : score >= -30 ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
    : 'text-red-400 bg-red-500/10 border-red-500/30';

  const windLabel = wind === 'strong_positive' ? 'Güçlü Pozitif'
    : wind === 'positive' ? 'Pozitif'
    : wind === 'neutral' ? 'Nötr'
    : wind === 'negative' ? 'Negatif'
    : 'Güçlü Negatif';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${color}`}
      title={`Makro Rüzgar: ${windLabel} (${score > 0 ? '+' : ''}${score})`}
    >
      Makro: {score > 0 ? '+' : ''}{score}
    </span>
  );
}

export function StockCard({ signal, candleData, allSignals, macroScore, winRate, delay = 0, cachedExplanation, onExplanationLoaded }: StockCardProps) {
  const confluence = allSignals && allSignals.length > 1 ? computeConfluence(allSignals) : null;
  const [explanation, setExplanation] = useState<string | null>(cachedExplanation ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(!!cachedExplanation); // Cache varsa zaten yüklenmiş say

  useEffect(() => {
    // Üst bileşenden cache geldiyse hemen göster, fetch atma
    if (cachedExplanation) {
      setExplanation(cachedExplanation);
      fetchedRef.current = true;
      return;
    }

    const card = cardRef.current;
    if (!card) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry.isIntersecting || fetchedRef.current) return;

        fetchedRef.current = true;
        observer.disconnect();

        let cancelled = false;
        setLoading(true);
        setError(null);

        (async () => {
          if (delay > 0) await new Promise((r) => setTimeout(r, delay));
          try {
            const lastCandle = candleData[candleData.length - 1];
            const res = await fetch('/api/explain', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                signal,
                priceData: lastCandle
                  ? { lastClose: lastCandle.close, lastDate: lastCandle.date }
                  : undefined,
              }),
            });
            const data = await res.json();
            if (cancelled) return;
            if (!res.ok) {
              setError(data.error ?? 'Açıklama alınamadı.');
              return;
            }
            const text = data.explanation ?? null;
            setExplanation(text);
            if (text) onExplanationLoaded?.(text);
          } catch {
            if (!cancelled) setError('Bağlantı hatası.');
          } finally {
            if (!cancelled) setLoading(false);
          }
        })();

        return () => { cancelled = true; };
      },
      { threshold: 0.1 }
    );

    observer.observe(card);
    return () => observer.disconnect();
  }, [signal, candleData, delay, cachedExplanation, onExplanationLoaded]);

  const isUp = signal.direction === 'yukari';
  const isDown = signal.direction === 'asagi';

  return (
    <Card ref={cardRef} className="overflow-hidden transition hover:scale-[1.02] hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-lg font-semibold text-text-primary">
              {signal.sembol}
            </span>
            {macroScore && <MacroBadge score={macroScore.score} wind={macroScore.wind} />}
            {confluence && <ConfluenceBadge result={confluence} />}
            {winRate && winRate.sampleSize >= 20 && <WinRateBadge rate={winRate.rate} sampleSize={winRate.sampleSize} />}
            {signal.weeklyAligned !== undefined && <MTFBadge aligned={signal.weeklyAligned} />}
            {(signal.candlesAgo ?? 0) > 0 && <FreshnessBadge candlesAgo={signal.candlesAgo!} />}
          </div>
          <SignalBadge
            type={signal.type}
            direction={signal.direction}
            severity={signal.severity}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pb-2">
        <MiniChart
          data={candleData}
          height={56}
          positive={isUp ? true : isDown ? false : undefined}
        />
        {/* Ek sinyaller */}
        {allSignals && allSignals.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {allSignals.slice(1).map((s) => (
              <span
                key={s.type}
                className="inline-flex items-center gap-0.5 rounded border border-border bg-surface/50 px-1.5 py-0.5 text-[10px] text-text-muted"
              >
                {s.direction === 'yukari' ? '↑' : s.direction === 'asagi' ? '↓' : '→'} {s.type}
              </span>
            ))}
          </div>
        )}
        <SRLevels analysis={calculateSRLevels(candleData)} compact />
        <SignalExplanation text={explanation} isLoading={loading} error={error} />
      </CardContent>
      <CardFooter className="flex gap-2 pt-0">
        <Button variant="secondary" size="sm" asChild className="flex-1">
          <Link href={`/hisse/${encodeURIComponent(signal.sembol)}`}>Detay Gör</Link>
        </Button>
        <PortfolyoEkleButton
          sembol={signal.sembol}
          defaultFiyat={candleData[candleData.length - 1]?.close}
        />
      </CardFooter>
    </Card>
  );
}
