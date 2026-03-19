'use client';

import { useState, useCallback, useEffect } from 'react';
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
import { Search, RefreshCw } from 'lucide-react';
import { saveSignalPerformance } from '@/lib/performance';
import { ScanProgress } from '@/components/ScanProgress';
import { toast } from 'sonner';

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
  const [failedSymbols, setFailedSymbols] = useState<string[]>([]);
  const [macroScore, setMacroScore] = useState<{ score: number; wind: string } | null>(null);

  // Makro skoru bir kez çek
  useEffect(() => {
    fetch('/api/macro')
      .then(r => r.json())
      .then(data => {
        if (data.score) setMacroScore({ score: data.score.score, wind: data.score.wind });
      })
      .catch(() => {});
  }, []);

  const scanSymbols = useCallback(async (symbols: string[]) => {
    setLoading(true);
    setError(null);
    const failed: string[] = [];
    const BATCH_SIZE = 5;
    const BATCH_DELAY_MS = 200;

    try {
      const all: ScanResult[] = [...results];
      setScanProgress({ current: 0, total: symbols.length, symbol: '' });
      let completed = 0;

      for (let batchStart = 0; batchStart < symbols.length; batchStart += BATCH_SIZE) {
        const batch = symbols.slice(batchStart, batchStart + BATCH_SIZE);

        const batchResults = await Promise.allSettled(
          batch.map(async (sembol) => {
            const candles = await fetchOHLCVClient(sembol, 90);
            const signals = detectAllSignals(sembol, candles);
            return { sembol, signals, candles };
          })
        );

        for (const result of batchResults) {
          completed++;
          if (result.status === 'fulfilled') {
            const { sembol, signals, candles } = result.value;
            setScanProgress({ current: completed, total: symbols.length, symbol: sembol });

            if (signals.length > 0) {
              for (const signal of signals) {
                saveSignalPerformance({ userId: null, signal, candles }).catch(() => {});
              }
              const existingIdx = all.findIndex(r => r.sembol === sembol);
              if (existingIdx >= 0) {
                all[existingIdx] = { sembol, signals, candles };
              } else {
                all.push({ sembol, signals, candles });
              }
            }
          } else {
            const sembol = batch[batchResults.indexOf(result)] ?? '?';
            failed.push(sembol);
            setScanProgress({ current: completed, total: symbols.length, symbol: sembol });
          }
        }

        // Batch arası rate limit — son batch'ten sonra bekleme
        if (batchStart + BATCH_SIZE < symbols.length) {
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        }
      }

      setResults(all);
      setFailedSymbols(failed);

      const signalCount = all.reduce((sum, r) => sum + r.signals.length, 0);
      if (failed.length > 0) {
        toast.warning(`Tarama tamamlandı. ${failed.length} sembol başarısız oldu.`);
      } else {
        toast.success(`Tarama tamamlandı! ${signalCount} sinyal bulundu.`);
      }
    } finally {
      setLoading(false);
    }
  }, [results]);

  const runScan = useCallback(() => {
    setResults([]);
    setFailedSymbols([]);
    scanSymbols([...BIST_SYMBOLS]);
  }, [scanSymbols]);

  const retryFailed = useCallback(() => {
    scanSymbols(failedSymbols);
  }, [scanSymbols, failedSymbols]);

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

        {!loading && failedSymbols.length > 0 && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-yellow-500/50 bg-yellow-500/10 px-4 py-3">
            <span className="text-sm text-yellow-400">
              {failedSymbols.length} sembol taranamadı: {failedSymbols.join(', ')}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={retryFailed}
              className="ml-3 gap-1 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/20"
            >
              <RefreshCw className="h-3 w-3" />
              Tekrar Dene
            </Button>
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
                <StockCard key={`${r.sembol}-${sig.type}`} signal={sig} candleData={r.candles} macroScore={macroScore} />
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
