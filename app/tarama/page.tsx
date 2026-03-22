'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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
  { value: 'RSI Uyumsuzluğu', label: 'RSI Div' },
  { value: 'Hacim Anomalisi', label: 'Hacim' },
  { value: 'Trend Başlangıcı', label: 'Trend' },
  { value: 'Kırılım', label: 'Kırılım' },
  { value: 'MACD Kesişimi', label: 'MACD' },
  { value: 'RSI Seviyesi', label: 'RSI OB/OS' },
  { value: 'Altın Çapraz', label: 'Çapraz' },
  { value: 'Bollinger Sıkışması', label: 'Bollinger' },
];

// Tarama sırasında hangi sinyaller hesaplanacak (gerçek sinyal type adları)
const SCANNABLE_SIGNALS: { type: string; label: string; color: string; activeColor: string }[] = [
  { type: 'RSI Uyumsuzluğu',        label: 'RSI Div',   color: 'text-violet-400 border-violet-500/40 bg-violet-500/10',  activeColor: 'text-violet-300 border-violet-400 bg-violet-500/25 ring-1 ring-violet-500/50' },
  { type: 'Hacim Anomalisi',         label: 'Hacim',     color: 'text-amber-400 border-amber-500/40 bg-amber-500/10',    activeColor: 'text-amber-300 border-amber-400 bg-amber-500/25 ring-1 ring-amber-500/50' },
  { type: 'Trend Başlangıcı',        label: 'Trend',     color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10', activeColor: 'text-emerald-300 border-emerald-400 bg-emerald-500/25 ring-1 ring-emerald-500/50' },
  { type: 'Destek/Direnç Kırılımı',  label: 'Kırılım',   color: 'text-sky-400 border-sky-500/40 bg-sky-500/10',          activeColor: 'text-sky-300 border-sky-400 bg-sky-500/25 ring-1 ring-sky-500/50' },
  { type: 'MACD Kesişimi',           label: 'MACD',      color: 'text-blue-400 border-blue-500/40 bg-blue-500/10',       activeColor: 'text-blue-300 border-blue-400 bg-blue-500/25 ring-1 ring-blue-500/50' },
  { type: 'RSI Seviyesi',            label: 'RSI OB/OS', color: 'text-rose-400 border-rose-500/40 bg-rose-500/10',       activeColor: 'text-rose-300 border-rose-400 bg-rose-500/25 ring-1 ring-rose-500/50' },
  { type: 'Altın Çapraz',            label: 'Çapraz',    color: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',  activeColor: 'text-yellow-300 border-yellow-400 bg-yellow-500/25 ring-1 ring-yellow-500/50' },
  { type: 'Bollinger Sıkışması',     label: 'Bollinger', color: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10',         activeColor: 'text-cyan-300 border-cyan-400 bg-cyan-500/25 ring-1 ring-cyan-500/50' },
];

const ALL_SIGNAL_TYPES = SCANNABLE_SIGNALS.map(s => s.type);
const SCAN_PREFS_KEY = 'bistai_scan_signal_prefs';

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

const TYPE_LABEL_MAP: Partial<Record<SignalTypeFilter, string>> = {
  'Kırılım': 'Destek/Direnç Kırılımı',
};

const MAX_SIGNALS_PER_STOCK = 3;

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
        const typeLabel = TYPE_LABEL_MAP[signalFilter] ?? signalFilter;
        signals = signals.filter((s) => s.type === typeLabel);
      }
      if (directionFilter !== 'Tümü') {
        const dir = directionFilter === 'Yukarı' ? 'yukari' : 'asagi';
        signals = signals.filter((s) => s.direction === dir);
      }

      if (signals.length === 0) return { ...r, signals };

      // Tip başına en güçlü sinyali al, maks MAX_SIGNALS_PER_STOCK
      const byType = new Map<string, StockSignal>();
      for (const sig of signals) {
        const existing = byType.get(sig.type);
        const sigRank = severityRank[sig.severity as SignalSeverity] ?? 0;
        const existingRank = existing ? (severityRank[existing.severity as SignalSeverity] ?? 0) : -1;
        if (!existing || sigRank > existingRank) {
          byType.set(sig.type, sig);
        }
      }
      const top = Array.from(byType.values())
        .sort((a, b) => (severityRank[b.severity as SignalSeverity] ?? 0) - (severityRank[a.severity as SignalSeverity] ?? 0))
        .slice(0, MAX_SIGNALS_PER_STOCK);

      return { ...r, signals: top };
    })
    .filter((r) => r.signals.length > 0);
}

/* ------------------------------------------------------------------ */
/* EmptyState                                                           */
/* ------------------------------------------------------------------ */
function EmptyState({
  onScan,
  selectedTypes,
  onToggleType,
}: {
  onScan: () => void;
  selectedTypes: string[];
  onToggleType: (type: string) => void;
}) {
  const allSelected = selectedTypes.length === ALL_SIGNAL_TYPES.length;

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      {/* Radar animasyon */}
      <div className="relative mb-10 h-36 w-36">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full border border-primary/20"
            style={{ margin: `${i * 14}px` }}
            animate={{ opacity: [0.15, 0.45, 0.15], scale: [1, 1.04, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.5, ease: 'easeInOut' }}
          />
        ))}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-transparent"
          style={{
            background: 'linear-gradient(#0c0c18, #0c0c18) padding-box, conic-gradient(from 0deg, transparent 75%, #6366f1 100%) border-box',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/30">
            <Search className="h-6 w-6 text-primary" />
          </div>
        </div>
        {[45, 135, 250].map((deg, i) => (
          <motion.div
            key={i}
            className="absolute h-1.5 w-1.5 rounded-full bg-primary"
            style={{ top: '50%', left: '50%', transform: `rotate(${deg}deg) translateX(52px) translateY(-50%)` }}
            animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.6 }}
          />
        ))}
      </div>

      <h2 className="mb-2 text-xl font-semibold text-text-primary">
        {BIST_SYMBOLS.length} BIST Hissesi Taranmayı Bekliyor
      </h2>
      <p className="mb-6 max-w-sm text-sm text-text-secondary">
        Hangi sinyalleri aradığını seç, tarayıcı sadece onları hesaplayarak daha hızlı sonuç verir.
      </p>

      {/* İnteraktif sinyal seçim chip'leri */}
      <div className="mb-2 flex flex-wrap justify-center gap-2">
        {SCANNABLE_SIGNALS.map((s, i) => {
          const active = selectedTypes.includes(s.type);
          return (
            <motion.button
              key={s.type}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              whileTap={{ scale: 0.93 }}
              onClick={() => onToggleType(s.type)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${active ? s.activeColor : 'text-white/30 border-white/10 bg-white/[0.03] hover:border-white/20 hover:text-white/50'}`}
            >
              {s.label}
            </motion.button>
          );
        })}
      </div>

      {/* Tümünü seç / kaldır */}
      <button
        onClick={() => {
          if (allSelected) {
            SCANNABLE_SIGNALS.forEach(s => {
              if (selectedTypes.includes(s.type)) onToggleType(s.type);
            });
          } else {
            SCANNABLE_SIGNALS.forEach(s => {
              if (!selectedTypes.includes(s.type)) onToggleType(s.type);
            });
          }
        }}
        className="mb-7 text-xs text-white/25 hover:text-white/50 transition-colors underline underline-offset-2"
      >
        {allSelected ? 'Tümünü kaldır' : 'Tümünü seç'}
      </button>

      <Button size="lg" onClick={onScan} disabled={selectedTypes.length === 0} className="gap-2 px-8 text-base">
        <Zap className="h-5 w-5" />
        {selectedTypes.length === ALL_SIGNAL_TYPES.length
          ? 'Tümünü Tara'
          : `${selectedTypes.length} Sinyal ile Tara`}
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
const SCAN_CACHE_KEY = 'bistai_scan_results';
const SCAN_CACHE_TTL_MS = 10 * 60 * 1000; // 10 dakika

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
  const [selectedTypes, setSelectedTypes] = useState<string[]>(ALL_SIGNAL_TYPES);
  // Filtre değişimlerinde açıklamalar kaybolmasın diye sayfa seviyesinde cache
  const explanationCache = useRef<Map<string, string>>(new Map());

  // localStorage'dan sinyal tercihleri yükle
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SCAN_PREFS_KEY);
      if (saved) {
        const parsed: string[] = JSON.parse(saved);
        const valid = parsed.filter(t => ALL_SIGNAL_TYPES.includes(t));
        if (valid.length > 0) setSelectedTypes(valid);
      }
    } catch { /* ignore */ }
  }, []);

  const toggleType = useCallback((type: string) => {
    setSelectedTypes(prev => {
      const next = prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type];
      try { localStorage.setItem(SCAN_PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // sessionStorage'dan önceki tarama sonuçlarını geri yükle
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(SCAN_CACHE_KEY);
      if (cached) {
        const { results: cachedResults, scannedCount: cachedCount, ts } = JSON.parse(cached);
        if (Date.now() - ts < SCAN_CACHE_TTL_MS) {
          setResults(cachedResults);
          setScannedCount(cachedCount);
        } else {
          sessionStorage.removeItem(SCAN_CACHE_KEY);
        }
      }
    } catch {
      // sessionStorage erişimi yoksa sessizce geç
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetch('/api/macro', { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data.score) setMacroScore({ score: data.score.score, wind: data.score.wind });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const scanSymbols = useCallback(async (symbols: string[], types: string[]) => {
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

        // Altın Çapraz EMA200 gerektiriyor → 252 gün; diğerleri için 90 yeterli
        const needsLongHistory = types.length === 0 || types.includes('Altın Çapraz');
        const days = needsLongHistory ? 252 : 90;

        const batchResults = await Promise.allSettled(
          batch.map(async (sembol) => {
            const candles = await fetchOHLCVClient(sembol, days);
            const signals = detectAllSignals(sembol, candles, { types });
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

      // Sonuçları sessionStorage'a kaydet (geri tuşu sonrası geri yükleme için)
      try {
        sessionStorage.setItem(SCAN_CACHE_KEY, JSON.stringify({ results: all, scannedCount: symbols.length, ts: Date.now() }));
      } catch {
        // sessionStorage dolu veya erişilemez
      }

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
    try { sessionStorage.removeItem(SCAN_CACHE_KEY); } catch { /* ignore */ }
    scanSymbols([...BIST_SYMBOLS], selectedTypes);
  }, [scanSymbols, selectedTypes]);

  const retryFailed = useCallback(() => {
    scanSymbols(failedSymbols, selectedTypes);
  }, [scanSymbols, failedSymbols, selectedTypes]);

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

            <div className="hidden sm:block h-5 w-px bg-border" />

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

            <div className="hidden sm:block h-5 w-px bg-border" />

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
          <EmptyState onScan={runScan} selectedTypes={selectedTypes} onToggleType={toggleType} />
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

        {/* Sonuç grid — hisse başına 1 kart, en güçlü sinyal önce */}
        {!loading && displayList.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            <AnimatePresence>
              {displayList.map((r) => {
                const primarySig = r.signals[0]!;
                return (
                  <motion.div
                    key={r.sembol}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                  >
                    <StockCard
                      signal={primarySig}
                      candleData={r.candles}
                      allSignals={r.signals}
                      macroScore={macroScore}
                      cachedExplanation={explanationCache.current.get(`${r.sembol}:${primarySig.type}`) ?? null}
                      onExplanationLoaded={(text) => explanationCache.current.set(`${r.sembol}:${primarySig.type}`, text)}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </main>
    </div>
  );
}
