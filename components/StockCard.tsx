'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SignalBadge } from '@/components/SignalBadge';
import { MiniChart } from '@/components/MiniChart';
import { SignalExplanation } from '@/components/SignalExplanation';
import type { StockSignal, OHLCVCandle } from '@/types';
import { createClient } from '@/lib/supabase';
import { saveSignalPerformance } from '@/lib/performance';

interface StockCardProps {
  signal: StockSignal;
  candleData: OHLCVCandle[];
  macroScore?: { score: number; wind: string } | null;
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

export function StockCard({ signal, candleData, macroScore }: StockCardProps) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
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
        setExplanation(data.explanation ?? null);

        // AI açıklaması alındıktan sonra performans kaydı ekle
        try {
          const supabase = createClient();
          const { data: authData } = await supabase.auth.getUser();
          const userId = authData.user?.id ?? null;
          await saveSignalPerformance({ userId, signal, candles: candleData });
        } catch {
          // Hata durumunda UI'yi etkilemeden yoksay
        }
      } catch (e) {
        if (!cancelled) setError('Bağlantı hatası.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signal]);

  const isUp = signal.direction === 'yukari';
  const isDown = signal.direction === 'asagi';

  return (
    <Card className="overflow-hidden transition hover:scale-[1.02] hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-semibold text-text-primary">
              {signal.sembol}
            </span>
            {macroScore && <MacroBadge score={macroScore.score} wind={macroScore.wind} />}
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
        <SignalExplanation text={explanation} isLoading={loading} error={error} />
      </CardContent>
      <CardFooter className="pt-0">
        <Button variant="secondary" size="sm" asChild className="w-full">
          <Link href={`/hisse/${encodeURIComponent(signal.sembol)}`}>Detay Gör</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
