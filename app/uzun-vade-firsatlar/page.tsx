'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, TrendingUp, Diamond, Star, Zap, BarChart2, Filter } from 'lucide-react';
import type { LongTermResult } from '@/app/api/uzun-vade-firsatlar/route';

type Category = 'tumu' | 'cift_onay' | 'deger_firsati' | 'guclu_temel';

interface ApiResponse {
  ok: boolean;
  results: LongTermResult[];
  cached: boolean;
}

function fmtB(v: number | null): string {
  if (!v) return '—';
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B₺';
  if (v >= 1e6) return (v / 1e6).toFixed(0) + 'M₺';
  return (v / 1e3).toFixed(0) + 'K₺';
}

function ScoreRing({ score, size = 48 }: { score: number; size?: number }) {
  const r     = size / 2 - 4;
  const circ  = 2 * Math.PI * r;
  const color = score >= 75 ? '#10b981' : score >= 60 ? '#3b82f6' : score >= 45 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={size} height={size} className="shrink-0" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#ffffff10" strokeWidth="3" />
      <circle
        cx={size/2} cy={size/2} r={r}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeDasharray={`${(score / 100) * circ} ${circ}`}
        strokeLinecap="round"
      />
      <text
        x="50%" y="50%"
        dominantBaseline="middle"
        textAnchor="middle"
        fontSize={size * 0.28}
        fontWeight="700"
        fill={color}
        style={{ transform: 'rotate(90deg)', transformOrigin: '50% 50%' }}
      >
        {score}
      </text>
    </svg>
  );
}

const CATEGORY_CONFIG = {
  cift_onay: {
    label: 'Çift Onay',
    icon: Zap,
    emoji: '⚡',
    color: 'text-amber-300',
    bg: 'bg-amber-500/10 border-amber-500/30',
    desc: 'Teknik ve temel her iki perspektif güçlü — en güçlü kurulum',
  },
  deger_firsati: {
    label: 'Değer Fırsatı',
    icon: Diamond,
    emoji: '💎',
    color: 'text-sky-300',
    bg: 'bg-sky-500/10 border-sky-500/30',
    desc: 'Şirket sağlam ama fiyat düşük — sabırlı yatırımcı için fırsat',
  },
  guclu_temel: {
    label: 'Güçlü Temel',
    icon: Star,
    emoji: '📈',
    color: 'text-emerald-300',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
    desc: 'Temel veriler güçlü — uzun vadeli yatırım için güvenilir',
  },
};

function UzunVadeKart({ r }: { r: LongTermResult }) {
  const catCfg = CATEGORY_CONFIG[r.category];

  return (
    <Link
      href={`/hisse/${r.sembol}?tab=temel`}
      className="group block rounded-xl border border-border bg-surface p-4 hover:border-primary/40 hover:bg-surface/80 transition-all"
    >
      <div className="flex items-start gap-3 mb-3">
        <ScoreRing score={r.investmentScore} size={52} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-text-primary group-hover:text-primary transition-colors">
              {r.sembol}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${catCfg.bg} ${catCfg.color}`}>
              {catCfg.emoji} {catCfg.label}
            </span>
          </div>
          <p className="text-[11px] text-text-muted mt-0.5 truncate">{r.sectorName}</p>
          <p className={`text-[11px] font-semibold mt-0.5 ${
            r.investmentScore >= 75 ? 'text-emerald-400' :
            r.investmentScore >= 60 ? 'text-blue-400' :
            'text-amber-400'
          }`}>{r.investmentRating}</p>
        </div>
        {r.lastPrice && (
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-text-primary tabular-nums">
              {r.lastPrice >= 100
                ? r.lastPrice.toFixed(0)
                : r.lastPrice.toFixed(2)}₺
            </p>
          </div>
        )}
      </div>

      {/* Teknik Skor */}
      {r.technicalScore !== null && (
        <div className="mb-2 flex items-center gap-2 text-[11px]">
          <span className="text-text-muted">Teknik:</span>
          <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className={`h-full rounded-full ${
                r.technicalScore >= 70 ? 'bg-emerald-500' :
                r.technicalScore >= 50 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${r.technicalScore}%` }}
            />
          </div>
          <span className={`font-semibold tabular-nums ${
            r.technicalScore >= 70 ? 'text-emerald-400' :
            r.technicalScore >= 50 ? 'text-amber-400' : 'text-red-400'
          }`}>{r.technicalScore}</span>
        </div>
      )}

      {/* Metrikler */}
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        {r.peRatio !== null && (
          <div className="rounded-md bg-surface/50 px-2 py-1">
            <p className="text-text-muted">F/K</p>
            <p className={`font-semibold tabular-nums ${
              r.peRatio < 10 ? 'text-emerald-400' :
              r.peRatio < 20 ? 'text-text-primary' : 'text-amber-400'
            }`}>{r.peRatio.toFixed(1)}x</p>
          </div>
        )}
        {r.dividendYield !== null && r.dividendYield > 0 && (
          <div className="rounded-md bg-surface/50 px-2 py-1">
            <p className="text-text-muted">Temettü</p>
            <p className="font-semibold text-emerald-400 tabular-nums">
              %{(r.dividendYield * 100).toFixed(1)}
            </p>
          </div>
        )}
        {r.marketCap !== null && (
          <div className="rounded-md bg-surface/50 px-2 py-1">
            <p className="text-text-muted">Piy. Değ.</p>
            <p className="font-semibold text-text-secondary tabular-nums">{fmtB(r.marketCap)}</p>
          </div>
        )}
      </div>

      <p className="mt-2.5 text-[10px] text-text-muted/70 leading-snug">
        {catCfg.desc}
      </p>
    </Link>
  );
}

export default function UzunVadeFirsatlarPage() {
  const [data,     setData]     = useState<LongTermResult[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [category, setCategory] = useState<Category>('tumu');
  const [sortBy,   setSortBy]   = useState<'score' | 'pe' | 'divYield'>('score');
  const [cached,   setCached]   = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/uzun-vade-firsatlar');
      const json = await res.json() as ApiResponse;
      setData(json.results ?? []);
      setCached(json.cached);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { void fetchData(); }, []);

  const filtered = data
    .filter((r) => category === 'tumu' || r.category === category)
    .sort((a, b) => {
      if (sortBy === 'pe') return (a.peRatio ?? 999) - (b.peRatio ?? 999);
      if (sortBy === 'divYield') return (b.dividendYield ?? 0) - (a.dividendYield ?? 0);
      return b.investmentScore - a.investmentScore;
    });

  // Kategori sayıları
  const counts = {
    tumu:         data.length,
    cift_onay:    data.filter((r) => r.category === 'cift_onay').length,
    deger_firsati: data.filter((r) => r.category === 'deger_firsati').length,
    guclu_temel:  data.filter((r) => r.category === 'guclu_temel').length,
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-6xl px-4 py-8">

        {/* Başlık */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Diamond className="h-6 w-6 text-sky-400" />
              <h1 className="text-2xl font-bold text-text-primary">Uzun Vade Fırsatlar</h1>
            </div>
            <p className="text-sm text-text-secondary">
              Temel verilere göre güçlü şirketler — F/K, büyüme, temettü, borç analizi
            </p>
            {cached && (
              <p className="text-[11px] text-text-muted mt-1">✓ Cache — 6 saatte bir güncellenir</p>
            )}
          </div>
          <button onClick={() => void fetchData()} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/50 px-3 py-2 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 self-start">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {/* Kategori seçici */}
        <div className="mb-4 flex flex-wrap gap-2">
          {(Object.entries({
            tumu:          { label: 'Tümü',         emoji: '📊', color: '' },
            cift_onay:     { label: 'Çift Onay',    emoji: '⚡', color: 'text-amber-300' },
            deger_firsati: { label: 'Değer Fırsatı', emoji: '💎', color: 'text-sky-300' },
            guclu_temel:   { label: 'Güçlü Temel',  emoji: '📈', color: 'text-emerald-300' },
          }) as Array<[Category, { label: string; emoji: string; color: string }]>).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setCategory(key)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                category === key
                  ? `border-primary bg-primary/15 text-primary`
                  : 'border-border bg-surface text-text-secondary hover:border-primary/40'
              }`}
            >
              <span>{cfg.emoji}</span>
              <span>{cfg.label}</span>
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">
                {counts[key]}
              </span>
            </button>
          ))}

          {/* Sıralama */}
          <div className="ml-auto flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-text-muted" />
            {[
              { key: 'score',    label: 'Skor' },
              { key: 'pe',       label: 'F/K' },
              { key: 'divYield', label: 'Temettü' },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSortBy(opt.key as typeof sortBy)}
                className={`rounded-md border px-2.5 py-1 text-[11px] transition ${
                  sortBy === opt.key
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border text-text-muted hover:text-text-primary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Açıklama kartları — kategori seçilmediyse göster */}
        {category === 'tumu' && !loading && (
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setCategory(key as Category)}
                className={`text-left rounded-xl border p-3 hover:opacity-90 transition-opacity ${cfg.bg}`}
              >
                <p className={`text-sm font-bold mb-1 ${cfg.color}`}>{cfg.emoji} {cfg.label}</p>
                <p className="text-[11px] text-text-secondary leading-snug">{cfg.desc}</p>
                <p className={`text-[11px] font-semibold mt-1.5 ${cfg.color}`}>
                  {counts[key as Category]} hisse →
                </p>
              </button>
            ))}
          </div>
        )}

        {/* Yükleniyor */}
        {loading && (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-36 rounded-xl border border-border bg-surface/30 animate-pulse" />
            ))}
          </div>
        )}

        {/* Sonuçlar */}
        {!loading && filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-surface/30 p-8 text-center text-text-muted">
            Bu kategoride hisse bulunamadı
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((r) => <UzunVadeKart key={r.sembol} r={r} />)}
          </div>
        )}

        {/* İstatistik */}
        {!loading && filtered.length > 0 && (
          <div className="mt-8 grid gap-3 sm:grid-cols-3 text-center">
            {[
              { label: 'Ort. Yatırım Skoru', value: Math.round(filtered.reduce((s, r) => s + r.investmentScore, 0) / filtered.length) },
              { label: 'Çift Onay', value: filtered.filter((r) => r.category === 'cift_onay').length },
              { label: 'Temettü Ödeyen', value: filtered.filter((r) => (r.dividendYield ?? 0) > 0.02).length },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border bg-surface/30 p-3">
                <p className="text-xl font-bold text-text-primary">{stat.value}</p>
                <p className="text-[11px] text-text-muted mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        <p className="mt-6 text-center text-[10px] text-text-muted/60 italic">
          Yatırım Skoru P/E, kâr marjı, büyüme, borç ve TÜFE düzeltmeli metriklere dayanır.
          Yatırım tavsiyesi değildir. Veriler Yahoo Finance kaynaklıdır.
        </p>
      </main>
    </div>
  );
}
