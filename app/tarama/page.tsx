'use client';

import { useState, useCallback } from 'react';
import { StockCard } from '@/components/StockCard';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BIST_SYMBOLS } from '@/types';
import type {
  SignalTypeFilter,
  DirectionFilter,
  StockSignal,
  OHLCVCandle,
  SignalSeverity,
} from '@/types';
import { fetchOHLCVClient } from '@/lib/api-client';
import { detectAllSignals } from '@/lib/signals';
import { Search } from 'lucide-react';
import { saveSignalPerformance } from '@/lib/performance';
import { ScanProgress } from '@/components/ScanProgress';

const SIGNAL_TYPE_OPTIONS: { value: SignalTypeFilter; label: string }[] = [
  { value: 'Tümü', label: 'Tümü' },
  { value: 'RSI Uyumsuzluğu', label: 'RSI Uyumsuzluğu' },
  { value: 'Hacim Anomalisi', label: 'Hacim Anomalisi' },
  { value: 'Trend Başlangıcı', label: 'Trend Başlangıcı' },
  { value: 'Kırılım', label: 'Kırılım' },
];

const DIRECTION_OPTIONS: { value: DirectionFilter; label: string }[] = [
  { value: 'Tümü', label: 'Tümü' },
  { value: 'Yukarı', label: 'Yukarı' },
  { value: 'Aşağı', label: 'Aşağı' },
];

interface ScanResult {
  sembol: string;
  signals: StockSignal[];
  candles: OHLCVCandle[];
}

function filterResults(
  results: ScanResult[],
  signalFilter: SignalTypeFilter,
  directionFilter: DirectionFilter
): ScanResult[] {
  const severityRank: Record<SignalSeverity, number> = {
    zayıf: 1,
    orta: 2,
    güçlü: 3,
  };

  return results
    .map((r) => {
      let signals = r.signals;
      if (signalFilter !== 'Tümü') {
        const typeLabel = signalFilter === 'Kırılım' ? 'Destek/Direnç Kırılımı' : signalFilter;
        signals = signals.filter((s) => s.type === typeLabel);
      }
      if (directionFilter !== 'Tümü') {
        const dir = directionFilter === 'Yukarı' ? 'yukari' : 'asagi';
        signals = signals.filter((s) => s.direction === dir);
      }

      if (signals.length === 0) {
        return { ...r, signals };
      }

      // Her hisse için en güçlü tek sinyali seç (güçlü > orta > zayıf)
      const strongest = signals.reduce<StockSignal | null>((best, current) => {
        if (!best) return current;
        return severityRank[current.severity] > severityRank[best.severity] ? current : best;
      }, null);

      return { ...r, signals: strongest ? [strongest] : [] };
    })
    .filter((r) => r.signals.length > 0);
}

export default function TaramaPage() {
  const [signalType, setSignalType] = useState<SignalTypeFilter>('Tümü');
  const [direction, setDirection] = useState<DirectionFilter>('Tümü');
  const [results, setResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, symbol: '' });

  const runScan = useCallback(async () => {
  setLoading(true);
  setError(null);

  try {
    const symbols = [...BIST_SYMBOLS];
    const all: ScanResult[] = [];
    setScanProgress({ current: 0, total: symbols.length, symbol: '' });

    for (let i = 0; i < symbols.length; i++) {
      const sembol = symbols[i];
      setScanProgress({ current: i + 1, total: symbols.length, symbol: sembol });

      try {
        const candles = await fetchOHLCVClient(sembol, 90);
        const signals = detectAllSignals(sembol, candles);

        if (signals.length > 0) {
          for (const signal of signals) {
            await saveSignalPerformance({
              userId: null, // global istatistik
              signal,
              candles
            });
          }

          all.push({ sembol, signals, candles });
        }

      } catch {
        // skip failed symbol
      }
    }

    setResults(all);

  } finally {
    setLoading(false);
  }
}, []);

  const filtered = filterResults(results, signalType, direction);
  const displayList = loading ? [] : filtered;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-text-primary">Sinyal Tarama</h1>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={signalType}
              onValueChange={(v) => setSignalType(v as SignalTypeFilter)}
            >
              <SelectTrigger className="w-[180px] border-border bg-surface">
                <SelectValue placeholder="Sinyal tipi" />
              </SelectTrigger>
              <SelectContent>
                {SIGNAL_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={direction} onValueChange={(v) => setDirection(v as DirectionFilter)}>
              <SelectTrigger className="w-[140px] border-border bg-surface">
                <SelectValue placeholder="Yön" />
              </SelectTrigger>
              <SelectContent>
                {DIRECTION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={runScan} disabled={loading} className="gap-2">
              <Search className="h-4 w-4" />
              {loading ? 'Taranıyor...' : 'Tümünü Tara'}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-bearish/50 bg-bearish/10 px-4 py-3 text-sm text-bearish">
            {error}
          </div>
        )}

        {loading && (
          <ScanProgress
            current={scanProgress.current}
            total={scanProgress.total}
            symbol={scanProgress.symbol}
          />
        )}

        {!loading && displayList.length === 0 && results.length === 0 && (
          <div className="rounded-card border border-border bg-surface/50 p-8 text-center text-text-secondary">
            &quot;Tümünü Tara&quot; butonuna tıklayarak {BIST_SYMBOLS.length} BIST hissesini tarayın ve sinyalleri
            görüntüleyin.
          </div>
        )}

        {!loading && displayList.length === 0 && results.length > 0 && (
          <div className="rounded-card border border-border bg-surface/50 p-8 text-center text-text-secondary">
            Seçilen filtreye uygun sinyal bulunamadı. Filtreleri değiştirmeyi deneyin.
          </div>
        )}

        {!loading && displayList.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayList.flatMap((r) =>
              r.signals.map((sig) => (
                <StockCard key={`${r.sembol}-${sig.type}`} signal={sig} candleData={r.candles} />
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
