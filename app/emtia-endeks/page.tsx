'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw, TrendingUp, TrendingDown, Minus, AlertTriangle, BarChart2 } from 'lucide-react';
import type { InstrumentAnalysis, InstrumentCategory } from '@/lib/emtia-instruments';

// ── Yardımcılar ──────────────────────────────────────────────────────

function fmtPrice(v: number | null, currency: string) {
  if (v == null) return '—';
  const locale = 'tr-TR';
  if (currency === 'USD') {
    return '$' + v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(v: number | null) {
  if (v == null) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}

const DECISION_CONFIG = {
  AL:  { label: 'AL',  cls: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300', dot: 'bg-emerald-400' },
  TUT: { label: 'TUT', cls: 'bg-sky-500/15 border-sky-500/40 text-sky-300',             dot: 'bg-sky-400' },
  SAT: { label: 'SAT', cls: 'bg-red-500/15 border-red-500/40 text-red-300',             dot: 'bg-red-400' },
};

const CATEGORY_LABELS: Record<InstrumentCategory, string> = {
  endeks: '📈 Endeksler',
  emtia:  '🏅 Emtia',
  doviz:  '💱 Döviz',
};

// ── Enstrüman Kartı ──────────────────────────────────────────────────

function InstrumentCard({ inst }: { inst: InstrumentAnalysis }) {
  const dcfg = DECISION_CONFIG[inst.decision];
  const chg  = inst.changePercent ?? 0;
  const ChangeIcon = chg > 0 ? TrendingUp : chg < 0 ? TrendingDown : Minus;
  const chgColor = chg > 0 ? 'text-emerald-400' : chg < 0 ? 'text-red-400' : 'text-text-muted';

  // RSI rengi
  const rsiColor = inst.rsi == null ? 'text-text-muted'
    : inst.rsi >= 70 ? 'text-red-400'
    : inst.rsi <= 30 ? 'text-emerald-400'
    : 'text-text-secondary';

  return (
    <div className={`rounded-xl border bg-surface p-4 flex flex-col gap-3 transition hover:border-primary/30 ${
      inst.error ? 'opacity-60 border-border' : 'border-border'
    }`}>
      {/* Başlık */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">{inst.icon}</span>
            <div>
              <p className="font-bold text-text-primary text-base leading-tight">{inst.name}</p>
              <p className="text-[10px] text-text-muted">{inst.desc}</p>
            </div>
          </div>
        </div>
        {/* Karar badge */}
        {!inst.error && (
          <div className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold shrink-0 ${dcfg.cls}`}>
            <span className={`h-2 w-2 rounded-full ${dcfg.dot}`} />
            {dcfg.label}
          </div>
        )}
      </div>

      {inst.error ? (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          Veri alınamadı
        </div>
      ) : (
        <>
          {/* Fiyat + değişim */}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-2xl font-bold tabular-nums text-text-primary">
                {fmtPrice(inst.lastClose, inst.currency)}
                <span className="text-xs text-text-muted ml-1">{inst.currency}</span>
              </p>
              <div className={`flex items-center gap-1 text-sm font-semibold ${chgColor}`}>
                <ChangeIcon className="h-3.5 w-3.5" />
                {fmtPct(inst.changePercent)}
              </div>
            </div>
            {/* Skor dairesi */}
            {inst.confluenceScore != null && (
              <div className={`flex flex-col items-center rounded-xl border px-3 py-1.5 ${dcfg.cls}`}>
                <span className="text-[9px] uppercase tracking-wider opacity-70">Skor</span>
                <span className="text-xl font-bold leading-none">{inst.confluenceScore}</span>
              </div>
            )}
          </div>

          {/* Metrikler */}
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-lg bg-surface/60 border border-border/50 px-2 py-1.5">
              <p className="text-text-muted">RSI</p>
              <p className={`font-bold tabular-nums ${rsiColor}`}>{inst.rsi?.toFixed(1) ?? '—'}</p>
            </div>
            <div className="rounded-lg bg-surface/60 border border-border/50 px-2 py-1.5">
              <p className="text-text-muted">Hacim</p>
              <p className="font-bold tabular-nums text-text-secondary">
                {inst.relVol5 != null ? `${inst.relVol5}x` : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-surface/60 border border-border/50 px-2 py-1.5">
              <p className="text-text-muted">Sinyal</p>
              <p className="font-bold tabular-nums text-text-secondary">{inst.signals.length}</p>
            </div>
          </div>

          {/* 52H destek/direnç */}
          {(inst.support52w != null || inst.resistance52w != null) && (
            <div className="flex gap-2 text-[10px]">
              {inst.support52w != null && (
                <div className="flex-1 rounded-md bg-emerald-500/5 border border-emerald-500/20 px-2 py-1">
                  <p className="text-emerald-400/60">52H Dip</p>
                  <p className="font-mono font-semibold text-emerald-400 tabular-nums">{fmtPrice(inst.support52w, inst.currency)}</p>
                </div>
              )}
              {inst.resistance52w != null && (
                <div className="flex-1 rounded-md bg-red-500/5 border border-red-500/20 px-2 py-1">
                  <p className="text-red-400/60">52H Zirve</p>
                  <p className="font-mono font-semibold text-red-400 tabular-nums">{fmtPrice(inst.resistance52w, inst.currency)}</p>
                </div>
              )}
            </div>
          )}

          {/* Gerekçe */}
          <p className="text-[11px] text-text-secondary leading-snug border-t border-border/40 pt-2">
            {inst.keyReason}
          </p>

          {/* Sinyal chip'leri */}
          {inst.signals.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {inst.signals.slice(0, 4).map((s, i) => (
                <span key={i}
                  className={`rounded-full px-2 py-0.5 text-[9px] font-semibold border ${
                    s.direction === 'yukari'
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                      : s.direction === 'asagi'
                      ? 'bg-red-500/10 border-red-500/25 text-red-400'
                      : 'bg-sky-500/10 border-sky-500/25 text-sky-400'
                  }`}>
                  {s.type}
                </span>
              ))}
              {inst.signals.length > 4 && (
                <span className="text-[9px] text-text-muted self-center">+{inst.signals.length - 4}</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Ana Sayfa ────────────────────────────────────────────────────────

export default function EmtiaEndeksPage() {
  const [data, setData]       = useState<InstrumentAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [cached, setCached]   = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/emtia-analiz');
      const json = await res.json();
      setData(json.instruments ?? []);
      setCached(json.cached ?? false);
      setLastUpdate(new Date().toLocaleTimeString('tr-TR'));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // Kategoriye göre grupla
  const groups: Record<InstrumentCategory, InstrumentAnalysis[]> = {
    endeks: data.filter((d) => d.category === 'endeks'),
    emtia:  data.filter((d) => d.category === 'emtia'),
    doviz:  data.filter((d) => d.category === 'doviz'),
  };

  // Özet istatistikler
  const alCount  = data.filter((d) => d.decision === 'AL').length;
  const satCount = data.filter((d) => d.decision === 'SAT').length;
  const tutCount = data.filter((d) => d.decision === 'TUT').length;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-6xl px-4 py-8">

        {/* Başlık */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold text-text-primary">Emtia & Endeks Analizi</h1>
            </div>
            <p className="text-sm text-text-secondary">
              BIST endeksleri, altın, gümüş, petrol ve döviz paritelerinde teknik sinyal analizi.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {lastUpdate && (
              <span className="text-xs text-text-muted">
                {cached ? '⚡ Cache' : '🔄 Canlı'} · {lastUpdate}
              </span>
            )}
            <button onClick={() => void fetchData()} disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/50 px-3 py-2 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          </div>
        </div>

        {/* Özet bar */}
        {!loading && data.length > 0 && (
          <div className="mb-6 flex gap-3">
            {[
              { label: 'AL',  count: alCount,  cls: 'border-emerald-500/30 bg-emerald-500/8 text-emerald-400' },
              { label: 'TUT', count: tutCount, cls: 'border-sky-500/30 bg-sky-500/8 text-sky-400' },
              { label: 'SAT', count: satCount, cls: 'border-red-500/30 bg-red-500/8 text-red-400' },
            ].map((s) => (
              <div key={s.label} className={`flex items-center gap-2 rounded-lg border px-4 py-2 ${s.cls}`}>
                <span className="text-lg font-bold tabular-nums">{s.count}</span>
                <span className="text-xs font-medium">{s.label}</span>
              </div>
            ))}
            <p className="text-xs text-text-muted self-center ml-2">
              {data.length} enstrüman analiz edildi
            </p>
          </div>
        )}

        {/* Yükleniyor */}
        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-64 rounded-xl border border-border bg-surface/30 animate-pulse" />
            ))}
          </div>
        )}

        {/* Kategoriler */}
        {!loading && (['endeks', 'emtia', 'doviz'] as InstrumentCategory[]).map((cat) => {
          const items = groups[cat];
          if (items.length === 0) return null;
          return (
            <div key={cat} className="mb-8">
              <h2 className="text-base font-semibold text-text-secondary mb-3">
                {CATEGORY_LABELS[cat]}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((inst) => (
                  <InstrumentCard key={inst.symbol} inst={inst} />
                ))}
              </div>
            </div>
          );
        })}

        <p className="text-center text-[10px] text-text-muted/50 mt-6 italic">
          Teknik analiz geçmiş fiyat hareketlerine dayanır, gelecek performansı garanti etmez.
          Yatırım tavsiyesi değildir. Veriler 15 dakika gecikmeli olabilir.
        </p>
      </main>
    </div>
  );
}
