'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, TrendingUp, TrendingDown, RefreshCw,
  ArrowUpRight, AlertTriangle, CheckCircle2, Info,
  ChevronRight, Activity, Zap,
} from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import type { FirsatItem, FirsatlarResponse } from '@/app/api/firsatlar/route';

// ── Yardımcılar ─────────────────────────────────────────────────────

function confluenceColor(score: number): string {
  if (score >= 70) return 'text-green-400';
  if (score >= 55) return 'text-yellow-400';
  return 'text-orange-400';
}

function confluenceBg(score: number): string {
  if (score >= 70) return 'bg-green-500/15 border-green-500/30';
  if (score >= 55) return 'bg-yellow-500/15 border-yellow-500/30';
  return 'bg-orange-500/15 border-orange-500/30';
}

function confluenceLabel(score: number): string {
  if (score >= 70) return 'Güçlü';
  if (score >= 55) return 'Orta';
  return 'Zayıf';
}

function makroUyumBadge(uyum: FirsatItem['makroUyum']) {
  if (uyum === 'guclu') return (
    <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-400 border border-green-500/25">
      <CheckCircle2 className="h-2.5 w-2.5" /> Makro Uyumlu
    </span>
  );
  if (uyum === 'dikkat') return (
    <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/25">
      <AlertTriangle className="h-2.5 w-2.5" /> Makroya Dikkat
    </span>
  );
  return (
    <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-text-muted border border-border">
      <Info className="h-2.5 w-2.5" /> Nötr
    </span>
  );
}

function regimeLabel(r: string | null): string {
  if (!r) return 'Bilinmiyor';
  return { bull_trend: 'Boğa Piyasası', bear_trend: 'Ayı Piyasası', sideways: 'Yatay Piyasa' }[r] ?? r;
}

function regimeColor(r: string | null): string {
  if (r === 'bull_trend') return 'text-green-400 bg-green-500/10 border-green-500/25';
  if (r === 'bear_trend') return 'text-red-400 bg-red-500/10 border-red-500/25';
  return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25';
}

function makroScoreLabel(score: number | null): string {
  if (score === null) return '—';
  if (score >= 30) return 'Pozitif';
  if (score >= -30) return 'Nötr';
  return 'Negatif';
}

function makroScoreColor(score: number | null): string {
  if (score === null) return 'text-text-muted';
  if (score >= 30) return 'text-green-400';
  if (score >= -30) return 'text-yellow-400';
  return 'text-red-400';
}

// ── Sinyal etiketi kısaltma ──────────────────────────────────────────
const SINYAL_KISALT: Record<string, string> = {
  'RSI Uyumsuzluğu':         'RSI Div.',
  'Hacim Anomalisi':          'Hacim',
  'Trend Başlangıcı':         'Trend',
  'Destek/Direnç Kırılımı':  'D/D Kır.',
  'MACD Kesişimi':            'MACD',
  'RSI Seviyesi':             'RSI',
  'Altın Çapraz':             'Altın Çpz.',
  'Bollinger Sıkışması':      'BB Sık.',
};

// ── Fırsat Kartı ─────────────────────────────────────────────────────

function FirsatKarti({ firsat, index }: { firsat: FirsatItem; index: number }) {
  const isAl  = firsat.direction === 'yukari';
  const isSat = firsat.direction === 'asagi';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
    >
      <Link
        href={`/hisse/${firsat.sembol}`}
        className="block rounded-xl border border-border bg-surface p-4 transition-all hover:border-primary/40 hover:bg-white/5 hover:shadow-lg hover:shadow-primary/5"
      >
        {/* Üst satır: sembol + yön + confluence */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-text-primary">{firsat.sembol}</span>
              {/* Yön badge */}
              {isAl && (
                <span className="flex items-center gap-0.5 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-bold text-green-400 border border-green-500/25">
                  <TrendingUp className="h-3 w-3" /> AL
                </span>
              )}
              {isSat && (
                <span className="flex items-center gap-0.5 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-400 border border-red-500/25">
                  <TrendingDown className="h-3 w-3" /> SAT
                </span>
              )}
            </div>
            <span className="text-xs text-text-muted">{firsat.sektorAdi}</span>
          </div>

          {/* Confluence skoru */}
          <div className={`flex flex-col items-center rounded-xl border px-3 py-1.5 ${confluenceBg(firsat.confluenceScore)}`}>
            <span className={`text-xl font-bold leading-none ${confluenceColor(firsat.confluenceScore)}`}>
              {firsat.confluenceScore}
            </span>
            <span className={`text-[9px] font-semibold uppercase tracking-wide ${confluenceColor(firsat.confluenceScore)}`}>
              {confluenceLabel(firsat.confluenceScore)}
            </span>
          </div>
        </div>

        {/* Sinyal etiketleri */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {firsat.sinyaller.map((s) => (
            <span
              key={s}
              className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary border border-primary/20"
            >
              {SINYAL_KISALT[s] ?? s}
            </span>
          ))}
        </div>

        {/* Alt satır: makro uyum + fiyat + detay ok */}
        <div className="flex items-center justify-between gap-2">
          {makroUyumBadge(firsat.makroUyum)}
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span>
              Giriş: <span className="font-semibold text-text-secondary">
                {firsat.entryPrice.toFixed(2)} ₺
              </span>
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-primary" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ── Makro Özet Bar ───────────────────────────────────────────────────

function MakroBar({ score, regime }: { score: number | null; regime: string | null }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface/50 px-4 py-3">
      <Activity className="h-4 w-4 shrink-0 text-text-muted" />
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-text-muted">Makro:</span>
        <span className={`text-sm font-bold ${makroScoreColor(score)}`}>
          {score !== null ? `${score > 0 ? '+' : ''}${score}` : '—'}
        </span>
        <span className={`text-xs ${makroScoreColor(score)}`}>
          ({makroScoreLabel(score)})
        </span>
      </div>
      <span className="text-text-muted">·</span>
      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${regimeColor(regime)}`}>
        {regimeLabel(regime)}
      </span>
    </div>
  );
}

// ── Boş Durum ────────────────────────────────────────────────────────

function BosEkran() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Sparkles className="mx-auto mb-4 h-12 w-12 text-text-muted opacity-30" />
      <h2 className="mb-2 text-xl font-bold text-text-primary">Henüz Fırsat Yok</h2>
      <p className="max-w-sm text-sm text-text-secondary leading-relaxed">
        Sistem her iş günü sabah sinyalleri tarar. Yüksek kaliteli sinyaller burada otomatik görünür.
      </p>
    </div>
  );
}

// ── Ana Sayfa ────────────────────────────────────────────────────────

export default function FirsatlarPage() {
  const [data,    setData]    = useState<FirsatlarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  // Filtreler
  const [dirFilter, setDirFilter] = useState<'tumu' | 'yukari' | 'asagi'>('tumu');
  const [minScore,  setMinScore]  = useState<number>(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/firsatlar');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: FirsatlarResponse = await res.json();
      setData(json);
      setLastFetch(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Veri alınamadı');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // Client-side filtrele
  const filtered = (data?.firsatlar ?? []).filter((f) => {
    if (dirFilter !== 'tumu' && f.direction !== dirFilter) return false;
    if (minScore > 0 && f.confluenceScore < minScore) return false;
    return true;
  });

  const alSayisi  = (data?.firsatlar ?? []).filter((f) => f.direction === 'yukari').length;
  const satSayisi = (data?.firsatlar ?? []).filter((f) => f.direction === 'asagi').length;

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Zap className="h-8 w-8 text-yellow-400" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Fırsatlar</h1>
            <p className="text-sm text-text-secondary">
              Yüksek kaliteli, makro uyumlu sinyaller
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {lastFetch && (
            <span className="text-xs text-text-muted">
              {lastFetch.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => void fetchData()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text-primary transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>
      </div>

      {/* Makro Bar */}
      {data && <MakroBar score={data.makroScore} regime={data.regime} />}

      {/* Filtreler */}
      {!loading && !error && data && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          {/* Yön filtresi */}
          <div className="flex overflow-hidden rounded-lg border border-border">
            {([
              { val: 'tumu',  label: `Tümü (${data.firsatlar.length})`  },
              { val: 'yukari', label: `↑ AL (${alSayisi})`  },
              { val: 'asagi',  label: `↓ SAT (${satSayisi})` },
            ] as const).map((opt) => (
              <button
                key={opt.val}
                onClick={() => setDirFilter(opt.val)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  dirFilter === opt.val
                    ? 'bg-primary text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Min confluence */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Min Kalite:</span>
            <div className="flex overflow-hidden rounded-lg border border-border">
              {([
                { val: 0,  label: 'Tümü' },
                { val: 55, label: '>55'  },
                { val: 70, label: '>70'  },
              ] as const).map((opt) => (
                <button
                  key={opt.val}
                  onClick={() => setMinScore(opt.val)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    minScore === opt.val
                      ? 'bg-primary text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <span className="ml-auto text-xs text-text-muted">
            {filtered.length} fırsat gösteriliyor
          </span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-400" />
          <p className="mb-4 text-red-300">{error}</p>
          <button
            onClick={() => void fetchData()}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary/80"
          >
            Tekrar Dene
          </button>
        </div>
      )}

      {/* İçerik */}
      {!loading && !error && (
        <>
          {filtered.length === 0 ? (
            <BosEkran />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <AnimatePresence mode="popLayout">
                {filtered.map((f, i) => (
                  <FirsatKarti key={f.sembol} firsat={f} index={i} />
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Info notu */}
          {filtered.length > 0 && (
            <p className="mt-6 text-center text-xs text-text-muted">
              Son 3 günlük tarama verisi · Confluence ≥ 45 · Yatırım tavsiyesi değildir
            </p>
          )}
        </>
      )}
    </div>
  );
}
