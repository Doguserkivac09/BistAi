'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StockCard } from '@/components/StockCard';
import { Button } from '@/components/ui/button';
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
import { Search, RefreshCw, Zap, TrendingUp, TrendingDown, BarChart2, Activity } from 'lucide-react';
import { saveSignalPerformance } from '@/lib/performance';
import { ScanProgress } from '@/components/ScanProgress';
import { toast } from 'sonner';

const SIGNAL_TYPE_OPTIONS: { value: SignalTypeFilter; label: string }[] = [
  { value: 'Tümü', label: 'Tümü' },
  { value: 'RSI Uyumsuzluğu', label: 'RSI' },
  { value: 'Hacim Anomalisi', label: 'Hacim' },
  { value: 'Trend Başlangıcı', label: 'Trend' },
  { value: 'Kırılım', label: 'Kırılım' },
];

const DIRECTION_OPTIONS: { value: DirectionFilter; label: string; icon: React.ElementType }[] = [
  { value: 'Tümü', label: 'Tümü', icon: Activity },
  { value: 'Yukarı', label: 'Yukarı', icon: TrendingUp },
  { value: 'Aşağı', label: 'Aşağı', icon: TrendingDown },
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

      const strongest = signals.reduce<StockSignal | null>((best, current) => {
        if (!best) return current;
        return severityRank[current.severity] > severityRank[best.severity] ? current : best;
      }, null);

      return { ...r, signals: strongest ? [strongest] : [] };
    })
    .filter((r) => r.signals.length > 0);
}

/* ------------------------------------------------------------------ */
/* EmptyState                                                           */
/* ------------------------------------------------------------------ */
function EmptyState({ onScan }: { onScan: () => void }) {
  const signalPreviews = [
    { label: 'RSI Uyumsuzluğu', color: 'text-violet-400 border-violet-500/40 bg-violet-500/10' },
    { label: 'Hacim Anomalisi', color: 'text-amber-400 border-amber-500/40 bg-amber-500/10' },
    { label: 'Trend Başlangıcı', color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' },
    { label: 'Kırılım', color: 'text-sky-400 border-sky-500/40 bg-sky-500/10' },
  ];

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      {/* Radar animasyon */}
      <div className="relative mb-10 h-36 w-36">
        {/* Dış halkalar */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full border border-primary/20"
            style={{ margin: `${i * 14}px` }}
            animate={{ opacity: [0.15, 0.45, 0.15], scale: [1, 1.04, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.5, ease: 'easeInOut' }}
          />
        ))}
        {/* Dönen çerçeve */}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-transparent"
          style={{
            background: 'linear-gradient(#0c0c18, #0c0c18) padding-box, conic-gradient(from 0deg, transparent 75%, #6366f1 100%) border-box',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        />
        {/* Merkez icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/30">
            <Search className="h-6 w-6 text-primary" />
          </div>
        </div>
        {/* Sinyal noktaları */}
        {[45, 135, 250].map((deg, i) => (
          <motion.div
            key={i}
            className="absolute h-1.5 w-1.5 rounded-full bg-primary"
            style={{
              top: '50%',
              left: '50%',
              transform: `rotate(${deg}deg) translateX(52px) translateY(-50%)`,
            }}
            animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.6 }}
          />
        ))}
      </div>

      <h2 className="mb-2 text-xl font-semibold text-text-primary">
        {BIST_SYMBOLS.length} BIST Hissesi Taranmayı Bekliyor
      </h2>
      <p className="mb-8 max-w-sm text-sm text-text-secondary">
        AI destekli sinyal tarayıcımız tüm hisseleri saniyeler içinde analiz eder ve güçlü fırsatları öne çıkarır.
      </p>

      {/* Sinyal tipi önizleme chip'leri */}
      <div className="mb-8 flex flex-wrap justify-center gap-2">
        {signalPreviews.map((s, i) => (
          <motion.span
            key={s.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * i }}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${s.color}`}
          >
            {s.label}
          </motion.span>
        ))}
      </div>

      <Button size="lg" onClick={onScan} className="gap-2 px-8 text-base">
        <Zap className="h-5 w-5" />
        Tümünü Tara
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ScanSummary                                                          */
/* ------------------------------------------------------------------ */
function ScanSummary({
  total,
  signalCount,
  strongCount,
}: {
  total: number;
  signalCount: number;
  strongCount: number;
}) {
  const stats = [
    { label: 'Hisse Tarandı', value: total, color: 'text-text-primary' },
    { label: 'Sinyal Bulundu', value: signalCount, color: 'text-primary' },
    { label: 'Güçlü Sinyal', value: strongCount, color: 'text-emerald-400' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border"
    >
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col items-center bg-surface py-4">
          <span className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</span>
          <span className="mt-0.5 text-xs text-text-secondary">{s.label}</span>
        </div>
      ))}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Chip bileşeni                                                        */
/* ------------------------------------------------------------------ */
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
        active
          ? 'border-primary bg-primary/15 text-primary'
          : 'border-border bg-surface text-text-secondary hover:border-primary/40 hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Ana sayfa                                                            */
/* ------------------------------------------------------------------ */
export default function TaramaPage() {
  const [signalType, setSignalType] = useState<SignalTypeFilter>('Tümü');
  const [direction, setDirection] = useState<DirectionFilter>('Tümü');
  const [results, setResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, symbol: '' });
  const [failedSymbols, setFailedSymbols] = useState<string[]>([]);
  const [macroScore, setMacroScore] = useState<{ score: number; wind: string } | null>(null);
  const [scannedCount, setScannedCount] = useState(0);

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

        if (batchStart + BATCH_SIZE < symbols.length) {
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        }
      }

      setResults(all);
      setFailedSymbols(failed);
      setScannedCount(symbols.length);

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
    setScannedCount(0);
    scanSymbols([...BIST_SYMBOLS]);
  }, [scanSymbols]);

  const retryFailed = useCallback(() => {
    scanSymbols(failedSymbols);
  }, [scanSymbols, failedSymbols]);

  const filtered = filterResults(results, signalType, direction);
  const displayList = loading ? [] : filtered;
  const hasScanResults = results.length > 0;
  const signalCount = results.reduce((sum, r) => sum + r.signals.length, 0);
  const strongCount = results.reduce(
    (sum, r) => sum + r.signals.filter(s => s.severity === 'güçlü').length,
    0
  );

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6">
        {/* Başlık + kontroller */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-text-primary">Sinyal Tarama</h1>

          <div className="flex flex-wrap items-center gap-2">
            {/* Sinyal tipi chip'leri */}
            <div className="flex flex-wrap gap-1.5">
              {SIGNAL_TYPE_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  active={signalType === o.value}
                  onClick={() => setSignalType(o.value)}
                >
                  {o.label}
                </Chip>
              ))}
            </div>

            <div className="h-5 w-px bg-border" />

            {/* Yön chip'leri */}
            <div className="flex gap-1.5">
              {DIRECTION_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  active={direction === o.value}
                  onClick={() => setDirection(o.value)}
                >
                  <span className="flex items-center gap-1">
                    <o.icon className="h-3 w-3" />
                    {o.label}
                  </span>
                </Chip>
              ))}
            </div>

            <div className="h-5 w-px bg-border" />

            {/* Tara butonu */}
            <Button onClick={runScan} disabled={loading} className="gap-2">
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {loading ? 'Taranıyor...' : 'Tümünü Tara'}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-bearish/50 bg-bearish/10 px-4 py-3 text-sm text-bearish">
            {error}
          </div>
        )}

        {/* Tarama progress */}
        {loading && (
          <ScanProgress
            current={scanProgress.current}
            total={scanProgress.total}
            symbol={scanProgress.symbol}
          />
        )}

        {/* Başarısız semboller */}
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

        {/* Özet çubuk */}
        {!loading && hasScanResults && (
          <ScanSummary
            total={scannedCount}
            signalCount={signalCount}
            strongCount={strongCount}
          />
        )}

        {/* Boş durum */}
        {!loading && !hasScanResults && (
          <EmptyState onScan={runScan} />
        )}

        {/* Filtre sonucu yok */}
        {!loading && hasScanResults && displayList.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-card border border-border bg-surface/50 p-8 text-center text-text-secondary"
          >
            Seçilen filtreye uygun sinyal bulunamadı. Filtreleri değiştirmeyi deneyin.
          </motion.div>
        )}

        {/* Sonuç grid */}
        {!loading && displayList.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            <AnimatePresence>
              {displayList.flatMap((r) =>
                r.signals.map((sig) => (
                  <motion.div
                    key={`${r.sembol}-${sig.type}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                  >
                    <StockCard signal={sig} candleData={r.candles} macroScore={macroScore} />
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </main>
    </div>
  );
}
