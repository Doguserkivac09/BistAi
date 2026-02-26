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
}

export function StockCard({ signal, candleData }: StockCardProps) {
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
    <Card className="overflow-hidden transition hover:border-primary/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-lg font-semibold text-text-primary">
            {signal.sembol}
          </span>
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
