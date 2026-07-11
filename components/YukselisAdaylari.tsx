'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Rocket, RefreshCw, AlertTriangle, Filter, ShieldCheck, Info, Trophy } from 'lucide-react';
import type { YukselisResult } from '@/app/api/yukselis-adaylari/route';
import type { BabyPicksPerformance } from '@/lib/baby-picks';
import { MiniChart } from '@/components/MiniChart';
import { SparklineChartButton } from '@/components/new/ChartModal';

type VerdictFilter = 'tumu' | 'güçlü kurulum' | 'umut vadeden' | 'izlemede';

interface ApiResponse {
  ok: boolean;
  results: YukselisResult[];
  pending?: boolean;
  scoredAt?: string;
  inflationYoy?: number | null;
  universeScored?: number;
}

function fmtB(v: number | null): string {
  if (!v) return '—';
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B₺';
  if (v >= 1e6) return (v / 1e6).toFixed(0) + 'M₺';
  return (v / 1e3).toFixed(0) + 'K₺';
}

// "Tehlikeli" rozetler (kırmızı), bilgilendirici olanlar (sarı/nötr)
const DANGER_FLAGS = ['🎭 olası operasyon', '📉 düşen bıçak', '🔒 çok düşük float'];
function isDanger(flag: string): boolean {
  return DANGER_FLAGS.includes(flag);
}

const VERDICT_CFG: Record<string, { color: string; bg: string }> = {
  'güçlü kurulum': { color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  'umut vadeden':  { color: 'text-sky-300',     bg: 'bg-sky-500/10 border-sky-500/30' },
  'izlemede':      { color: 'text-amber-300',   bg: 'bg-amber-500/10 border-amber-500/30' },
  'zayıf kurulum': { color: 'text-orange-300',  bg: 'bg-orange-500/10 border-orange-500/30' },
};

// ── Bileşen kırılım barı ──────────────────────────────────────────────
function PillarBar({ label, value, hint }: { label: string; value: number | null; hint: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]" title={hint}>
      <span className="text-text-muted w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
        {value !== null && (
          <div
            className={`h-full rounded-full ${
              value >= 70 ? 'bg-emerald-500' : value >= 50 ? 'bg-sky-500' : value >= 35 ? 'bg-amber-500' : 'bg-orange-500'
            }`}
            style={{ width: `${value}%` }}
          />
        )}
      </div>
      <span className="w-7 text-right font-semibold tabular-nums text-text-secondary">
        {value !== null ? value : '—'}
      </span>
    </div>
  );
}

// ── Şeffaflık çipi ────────────────────────────────────────────────────
function Chip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-surface/30 px-2 py-1 text-center">
      <div className={`text-xs font-bold tabular-nums ${color ?? 'text-text-primary'}`}>{value}</div>
      <div className="text-[9px] text-text-muted">{label}</div>
    </div>
  );
}

// ── Model Performansı (forward-tracking) ──────────────────────────────
function ModelPerfCard({ perf, pending }: { perf: BabyPicksPerformance | null; pending: boolean }) {
  if (!perf) return null;
  return (
    <div className="mb-5 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="h-4 w-4 text-emerald-400" />
        <h2 className="text-sm font-bold text-text-primary">Model Performansı</h2>
        <span className="text-[10px] text-text-muted">· {perf.totalPicks} takip edilen aday · BIST100 karşılaştırmalı</span>
      </div>
      {pending ? (
        <p className="text-[11px] text-text-muted">
          📈 Veri birikiyor — adaylar her Pazartesi snapshot&apos;lanır, ilk sonuçlar ~1 ay sonra görünür.
          Model dürüstçe kendini ileriye dönük kanıtlar (geçmişe uydurma yok).
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {perf.horizons.map((h) => (
            <div key={h.key} className="rounded-lg border border-border/40 bg-surface/30 px-3 py-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-text-secondary">{h.label}</span>
                <span className="text-[9px] text-text-muted">{h.n} aday</span>
              </div>
              {h.n === 0 ? (
                <p className="text-[10px] text-text-muted">henüz ufuk dolmadı</p>
              ) : (
                <div className="flex flex-col gap-0.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Ort. getiri</span>
                    <span className={`font-bold tabular-nums ${(h.avgReturn ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(h.avgReturn ?? 0) > 0 ? '+' : ''}{h.avgReturn}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">BIST&apos;i geçen</span>
                    <span className="font-semibold tabular-nums text-text-primary">%{h.beatRate ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Alfa</span>
                    <span className={`font-semibold tabular-nums ${(h.alpha ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(h.alpha ?? 0) > 0 ? '+' : ''}{h.alpha} puan
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Aday Kartı ─────────────────────────────────────────────────────────
function AdayKart({ r }: { r: YukselisResult }) {
  const vcfg = VERDICT_CFG[r.verdict] ?? VERDICT_CFG['izlemede'];
  const pos52Pct = Math.round(r.pos52 * 100);

  return (
    <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-3">
      {/* Başlık */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/hisse/${r.sembol}?tab=temel`}
              className="text-base font-bold text-text-primary hover:text-primary transition-colors"
            >
              {r.sembol}
            </Link>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${vcfg.bg} ${vcfg.color}`}>
              {r.verdict}
            </span>
            {r.themeMember && (
              <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[9px] text-violet-300">
                tematik
              </span>
            )}
          </div>
          <p className="text-[11px] text-text-muted mt-0.5">{r.sectorName}</p>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-2xl font-bold tabular-nums ${vcfg.color}`}>{r.babyScore}</div>
          <p className="text-[9px] text-text-muted">Bebek Skoru</p>
        </div>
      </div>

      {/* Risk rozetleri */}
      {r.riskFlags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {r.riskFlags.map((flag) => (
            <span
              key={flag}
              className={`rounded-full border px-2 py-0.5 text-[9px] font-medium ${
                isDanger(flag)
                  ? 'border-red-500/40 bg-red-500/10 text-red-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              }`}
            >
              {flag}
            </span>
          ))}
        </div>
      )}

      {/* 5 bileşen kırılımı */}
      <div className="rounded-lg border border-border/40 bg-surface/30 px-3 py-2 flex flex-col gap-1.5">
        <PillarBar label="Kıtlık" value={r.components.scarcity} hint="Düşük float + küçük piyasa değeri = hareketin yakıtı" />
        <PillarBar label="Birikim" value={r.components.accumulation} hint="OBV + hacim + volatilite daralması = sessiz toplama izi" />
        <PillarBar label="Ateşleme" value={r.components.ignition} hint="Reel kâr büyüme/ivmelenme (banka/veri yok → —)" />
        <PillarBar label="Katalist" value={r.components.catalyst} hint="Haber + tema + IPO tazeliği" />
        <PillarBar label="Zamanlama" value={r.components.timing} hint="'Henüz yükselmemiş' — 52H konumu, yıl içi salınım, RSI" />
      </div>

      {/* "Henüz yükselmemiş" şeffaflığı */}
      <div className="grid grid-cols-3 gap-1.5">
        <Chip label="52H konumu" value={`%${pos52Pct}`} color={pos52Pct <= 50 ? 'text-emerald-400' : pos52Pct <= 70 ? 'text-amber-400' : 'text-orange-400'} />
        <Chip label="Yıl içi salınım" value={`${r.rangeWidth.toFixed(1)}x`} color={r.rangeWidth < 1.8 ? 'text-emerald-400' : r.rangeWidth < 3 ? 'text-amber-400' : 'text-orange-400'} />
        <Chip label="Float" value={r.freeFloat !== null ? `%${r.freeFloat}` : '—'} color={r.freeFloat !== null && r.freeFloat < 30 ? 'text-emerald-400' : 'text-text-primary'} />
        <Chip label="Piyasa Değ." value={fmtB(r.marketCap)} />
        <Chip label="Hacim (20g)" value={fmtB(r.advTL)} />
        <Chip label="IPO yaşı" value={r.ipoMonths !== null ? `${r.ipoMonths} ay` : '—'} color={r.ipoMonths !== null && r.ipoMonths < 18 ? 'text-violet-400' : 'text-text-primary'} />
      </div>

      {/* Sparkline */}
      {r.candles && r.candles.length >= 20 && (() => {
        const last = r.candles[r.candles.length - 1]?.close;
        const prev20 = r.candles[r.candles.length - 20]?.close;
        const isPositive = last && prev20 ? last > prev20 : undefined;
        return (
          <SparklineChartButton symbol={r.sembol} title={r.sembol} className="block w-full">
            <div className="overflow-hidden rounded-lg border border-border/30">
              <MiniChart data={r.candles} height={44} positive={isPositive} />
            </div>
          </SparklineChartButton>
        );
      })()}

      {/* Detay linki */}
      <Link
        href={`/hisse/${r.sembol}?tab=temel`}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
      >
        Tam Analiz →
      </Link>
    </div>
  );
}

// ── Ana Bileşen ────────────────────────────────────────────────────────
export function YukselisAdaylari() {
  const [data, setData] = useState<YukselisResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [verdict, setVerdict] = useState<VerdictFilter>('tumu');
  const [safeOnly, setSafeOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'score' | 'scarcity' | 'accumulation' | 'timing'>('score');
  const [scoredAt, setScoredAt] = useState<string | null>(null);
  const [perf, setPerf] = useState<BabyPicksPerformance | null>(null);
  const [perfPending, setPerfPending] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/yukselis-adaylari');
      const json = (await res.json()) as ApiResponse;
      setData(json.results ?? []);
      setPending(json.pending ?? false);
      setScoredAt(json.scoredAt ?? null);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  const fetchPerf = async () => {
    try {
      const res = await fetch('/api/baby-picks-performance');
      const json = (await res.json()) as { performance: BabyPicksPerformance | null; pending?: boolean };
      setPerf(json.performance ?? null);
      setPerfPending(json.pending ?? true);
    } catch {
      /* performans gösterilemezse gizlenir */
    }
  };

  useEffect(() => {
    void fetchData();
    void fetchPerf();
  }, []);

  const filtered = data
    .filter((r) => verdict === 'tumu' || r.verdict === verdict)
    .filter((r) => !safeOnly || !r.riskFlags.some(isDanger))
    .sort((a, b) => {
      if (sortBy === 'scarcity') return b.components.scarcity - a.components.scarcity;
      if (sortBy === 'accumulation') return b.components.accumulation - a.components.accumulation;
      if (sortBy === 'timing') return b.components.timing - a.components.timing;
      return b.babyScore - a.babyScore;
    });

  const counts = {
    tumu: data.length,
    'güçlü kurulum': data.filter((r) => r.verdict === 'güçlü kurulum').length,
    'umut vadeden': data.filter((r) => r.verdict === 'umut vadeden').length,
    izlemede: data.filter((r) => r.verdict === 'izlemede').length,
  };
  const avgScore = data.length > 0 ? Math.round(data.reduce((s, r) => s + r.babyScore, 0) / data.length) : 0;
  const cleanCount = data.filter((r) => !r.riskFlags.some(isDanger)).length;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-7xl px-4 py-8">
        {/* Başlık */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Rocket className="h-6 w-6 text-fuchsia-400" />
              <h1 className="text-2xl font-bold text-text-primary">Yükseliş Adayları</h1>
            </div>
            <p className="text-sm text-text-secondary max-w-2xl">
              Henüz <strong>yükselmemiş</strong>, yükselme potansiyeli yüksek &quot;bebek&quot; hisseler. Patlamanın sonucunu
              değil <strong>kurulumunu</strong> skorlar: yapısal kıtlık + sessiz birikim + temel ateşleme + katalist +
              zamanlama − tuzak filtresi.
            </p>
            {scoredAt && (
              <p className="text-[11px] text-text-muted mt-1">
                Son tarama: {new Date(scoredAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            )}
          </div>
          <button
            onClick={() => void fetchData()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/50 px-3 py-2 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 self-start"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {/* Spekülasyon uyarısı */}
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-200/90 leading-relaxed">
            <strong>Yüksek risk:</strong> Bu liste düşük halka açıklık + küçük piyasa değerli hisselere odaklanır — doğası
            gereği volatil ve manipülasyona en açık zemindir. Model tuzakları (operasyon, illikidite, kâr manipülasyonu)
            agresifçe elemeye çalışır ama <strong>garanti vermez</strong>. Olasılıksal bir kurulum taramasıdır;
            yatırım tavsiyesi değildir.
          </p>
        </div>

        {/* Model performansı (forward-tracking) */}
        <ModelPerfCard perf={perf} pending={perfPending} />

        {pending ? (
          <div className="rounded-xl border border-border bg-surface/30 p-8 text-center text-text-muted">
            <Info className="h-5 w-5 mx-auto mb-2 opacity-60" />
            Tarama henüz çalışmadı. Pazartesi sabahları otomatik koşar.
          </div>
        ) : (
          <>
            {/* İstatistikler */}
            {!loading && data.length > 0 && (
              <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Aday', value: data.length, color: 'text-text-primary' },
                  { label: 'Güçlü Kurulum', value: counts['güçlü kurulum'], color: 'text-emerald-400' },
                  { label: 'Ort. Skor', value: avgScore, color: 'text-sky-400' },
                  { label: 'Temiz (risksiz)', value: cleanCount, color: 'text-emerald-400' },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-border bg-surface p-3 text-center">
                    <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-[10px] text-text-muted mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Filtreler */}
            <div className="mb-5 flex flex-wrap items-center gap-2">
              {(Object.entries({
                tumu: 'Tümü',
                'güçlü kurulum': '🟢 Güçlü Kurulum',
                'umut vadeden': '🔵 Umut Vadeden',
                izlemede: '🟡 İzlemede',
              }) as Array<[VerdictFilter, string]>).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setVerdict(key)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                    verdict === key
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border bg-surface text-text-secondary hover:border-primary/40'
                  }`}
                >
                  <span>{label}</span>
                  <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">{counts[key]}</span>
                </button>
              ))}

              <button
                onClick={() => setSafeOnly((v) => !v)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                  safeOnly ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-border bg-surface text-text-secondary hover:border-emerald-500/40'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Düşük riskli
              </button>

              <div className="ml-auto flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-text-muted" />
                {[
                  { key: 'score', label: 'Skor' },
                  { key: 'scarcity', label: 'Kıtlık' },
                  { key: 'accumulation', label: 'Birikim' },
                  { key: 'timing', label: 'Zamanlama' },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSortBy(opt.key as typeof sortBy)}
                    className={`rounded-md border px-2.5 py-1 text-[11px] transition ${
                      sortBy === opt.key ? 'border-primary bg-primary/15 text-primary' : 'border-border text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Liste */}
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-96 rounded-xl border border-border bg-surface/30 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface/30 p-8 text-center text-text-muted">
                Bu filtrede aday bulunamadı
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((r) => (
                  <AdayKart key={r.sembol} r={r} />
                ))}
              </div>
            )}
          </>
        )}

        <p className="mt-8 text-center text-[10px] text-text-muted/60 italic">
          Bebek Skoru = kıtlık (0.22) + birikim (0.20) + ateşleme (0.18) + katalist (0.15) + zamanlama (0.25),
          × kalite kapısı × aşırı-uzama kapısı. Geçmiş performans geleceği garanti etmez. Yatırım tavsiyesi değildir.
        </p>
      </main>
    </div>
  );
}
