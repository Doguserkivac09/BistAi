'use client';

import { useState, useEffect, lazy, Suspense, useCallback } from 'react';
import Link from 'next/link';
import type { HaberItem } from '@/app/api/haber/route';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SignalBadge } from '@/components/SignalBadge';
import { SignalExplanation } from '@/components/SignalExplanation';
import { Skeleton } from '@/components/ui/skeleton';
import { WatchlistButton } from '@/components/WatchlistButton';
import { PortfolyoEkleButton } from '@/components/PortfolyoEkleButton';
import { SaveSignalButton } from '@/components/SaveSignalButton';
import { fetchOHLCVByTimeframeClient, type TimeframeKey } from '@/lib/api-client';
import { detectAllSignals } from '@/lib/signals';
import { calculateSRLevels } from '@/lib/support-resistance';
import { SRLevels } from '@/components/SRLevels';
import { HisseAIYorum } from '@/components/HisseAIYorum';
import { AdilDegerMetre } from '@/components/AdilDegerMetre';
import { HisseSkorKarti } from '@/components/HisseSkorKarti';
import { SinyalGecmisi } from '@/components/SinyalGecmisi';
import { TradeTargetsCard } from '@/components/TradeTargetsCard';
import { computeTechFairValue } from '@/lib/tech-fair-value';
import { computeStockScore } from '@/lib/stock-score';
import { createClient } from '@/lib/supabase';
import type { OHLCVCandle, StockSignal } from '@/types';
import { saveSignalPerformance } from '@/lib/performance';
import { toast } from 'sonner';
import type { HisseAnalizResponse } from '@/app/api/hisse-analiz/route';

// Lazy-load chart component (lightweight-charts ~40KB gzipped)
const StockChart = lazy(() =>
  import('@/components/StockChart').then((mod) => ({ default: mod.StockChart }))
);

const TIMEFRAMES: { key: TimeframeKey; label: string; description: string; group: 'intraday' | 'daily' }[] = [
  { key: '15m',  label: '15D',  description: '15 dakika',  group: 'intraday' },
  { key: '30m',  label: '30D',  description: '30 dakika',  group: 'intraday' },
  { key: '1h',   label: '1S',   description: '1 saat',     group: 'intraday' },
  { key: '1d',   label: '1G',   description: '1 gün',      group: 'daily' },
  { key: '1wk',  label: '1H',   description: '1 hafta',    group: 'daily' },
  { key: '1mo',  label: '1A',   description: '1 ay',       group: 'daily' },
];

interface HisseDetailClientProps {
  sembol: string;
  isInWatchlist: boolean;
  savedSignalTypes: string[];
}

// ── Bölüm başlığı bileşeni (Bloomberg/Matriks stili) ─────────────────
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-muted">
      {children}
    </h2>
  );
}

// ── Fiyat değişim badge'i ──────────────────────────────────────────────
function ChangeBadge({ value }: { value: number }) {
  const isPos = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 text-sm font-semibold ${
      isPos ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
    }`}>
      {isPos ? '▲' : '▼'} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

// ── Hero meta hücre ────────────────────────────────────────────────────
function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="truncate text-sm font-medium text-text-primary">{value}</p>
    </div>
  );
}

function formatVolume(v: number): string {
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + 'B';
  if (v >= 1_000_000)     return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000)         return (v / 1_000).toFixed(0) + 'K';
  return String(v);
}

// ── Accordion sinyal satırı ────────────────────────────────────────────
function AccordionSignalRow({
  sig,
  explanation,
  sembol,
  savedSignalTypes,
}: {
  sig: StockSignal;
  explanation: string | null;
  sembol: string;
  savedSignalTypes: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-alt/50 transition-colors"
      >
        <SignalBadge type={sig.type} direction={sig.direction} severity={sig.severity} />
        {!open && explanation && (
          <span className="min-w-0 flex-1 truncate text-xs text-text-muted hidden sm:block">
            {explanation}
          </span>
        )}
        <span className="ml-auto shrink-0 text-text-muted text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2">
          <SignalExplanation text={explanation} isLoading={!explanation} />
          <div className="flex justify-end">
            <SaveSignalButton
              sembol={sembol}
              signalType={sig.type}
              signalData={sig.data}
              aiExplanation={explanation ?? ''}
              isSaved={savedSignalTypes.includes(sig.type)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function HisseDetailClient({ sembol, isInWatchlist, savedSignalTypes }: HisseDetailClientProps) {
  const [candles, setCandles]           = useState<OHLCVCandle[]>([]);
  const [signals, setSignals]           = useState<StockSignal[]>([]);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [loading, setLoading]           = useState(true);
  const [timeframe, setTimeframe]       = useState<TimeframeKey>('1d');
  const [haberler, setHaberler]         = useState<HaberItem[]>([]);
  const [haberLoading, setHaberLoading] = useState(true);

  // Hisse analizi (AI + fiyat hedefleri + hero meta)
  const [analiz, setAnaliz]             = useState<HisseAnalizResponse | null>(null);
  const [analizLoading, setAnalizLoading] = useState(true);

  // ── Hisse Analizi (AI, Fiyat Hedefleri, Hero Meta) ───────────────────────
  useEffect(() => {
    let cancelled = false;
    setAnalizLoading(true);
    setAnaliz(null);
    fetch(`/api/hisse-analiz?symbol=${encodeURIComponent(sembol)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: HisseAnalizResponse | null) => {
        if (!cancelled) setAnaliz(data);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAnalizLoading(false); });
    return () => { cancelled = true; };
  }, [sembol]);

  // ── Haberler ────────────────────────────────────────────────────────────────
  const loadHaberler = useCallback(async () => {
    setHaberLoading(true);
    try {
      const res = await fetch(`/api/haber?sembol=${sembol}`);
      if (!res.ok) return;
      const data = await res.json();
      setHaberler(data.haberler ?? []);
    } catch {
      // sessizce geç
    } finally {
      setHaberLoading(false);
    }
  }, [sembol]);

  useEffect(() => { loadHaberler(); }, [loadHaberler]);

  // ── OHLCV + Sinyaller ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sembol) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchOHLCVByTimeframeClient(sembol, timeframe);
        if (cancelled) return;
        setCandles(data);
        const sigs = detectAllSignals(sembol, data);
        setSignals(sigs);

        const supabase = createClient();
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData.user?.id ?? null;

        const res = await Promise.allSettled(
          sigs.map(async (sig) => {
            const r = await fetch('/api/explain', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ signal: sig }),
            });
            const j = await r.json();

            if (!cancelled) {
              try {
                await saveSignalPerformance({ userId, signal: sig, candles: data });
              } catch {
                // ignore
              }
            }

            return { key: `${sig.type}`, text: r.ok ? j.explanation : j.error };
          })
        );
        const next: Record<string, string> = {};
        res.forEach((r, i) => {
          if (r.status === 'fulfilled' && sigs[i]) next[sigs[i].type] = r.value.text;
        });
        if (!cancelled) setExplanations(next);
      } catch {
        if (!cancelled) {
          setSignals([]);
          toast.error(`${sembol} verileri yüklenemedi.`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sembol, timeframe]);

  // Fiyat bilgileri (hero için)
  const lastCandle    = candles[candles.length - 1];
  const currentPrice  = analiz?.currentPrice ?? lastCandle?.close;
  const changePercent = analiz?.changePercent;
  const shortName     = analiz?.shortName;
  const volume        = analiz?.volume ?? lastCandle?.volume;
  const avgVolume20d  = analiz?.avgVolume20d;
  const high90d       = analiz?.high90d;
  const low90d        = analiz?.low90d;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-2 text-text-secondary">
          <Link href="/tarama" className="hover:text-primary">Tarama</Link>
          <span>/</span>
          <span className="text-text-primary">{sembol}</span>
        </div>

        {loading && (
          <>
            <Skeleton className="mb-4 h-32 w-full rounded-xl" />
            <Skeleton className="mb-6 h-[400px] w-full rounded-card" />
            <Skeleton className="h-32 w-full rounded-card" />
          </>
        )}

        {!loading && candles.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-text-secondary">
              Bu hisse için veri bulunamadı. Sembolü kontrol edin.
            </p>
            <Button variant="secondary" className="mt-4" asChild>
              <Link href="/tarama">Tarama sayfasına dön</Link>
            </Button>
          </Card>
        )}

        {!loading && candles.length > 0 && (
          <>
            {/* ── HERO BÖLÜMÜ ──────────────────────────────────────────────── */}
            <div className="mb-6 rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                {/* Sol: Sembol + Fiyat */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl font-bold text-text-primary">{sembol}</h1>
                    {shortName && (
                      <span className="text-sm text-text-muted truncate max-w-[200px]">{shortName}</span>
                    )}
                  </div>
                  <div className="mt-2 flex items-baseline gap-3 flex-wrap">
                    {currentPrice && (
                      <span className="text-2xl font-mono font-bold text-text-primary">
                        {currentPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}₺
                      </span>
                    )}
                    {changePercent !== undefined && changePercent !== null && (
                      <ChangeBadge value={changePercent} />
                    )}
                    {/* AI Karar Badge */}
                    {!analizLoading && analiz && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                        style={{ color: analiz.color, borderColor: analiz.color + '66', backgroundColor: analiz.color + '18' }}
                      >
                        {analiz.emoji} {analiz.decisionTr}
                      </span>
                    )}
                  </div>
                </div>

                {/* Sağ: Butonlar */}
                <div className="flex items-center gap-2 shrink-0">
                  <PortfolyoEkleButton
                    sembol={sembol}
                    defaultFiyat={lastCandle?.close}
                  />
                  <WatchlistButton sembol={sembol} isInWatchlist={isInWatchlist} />
                </div>
              </div>

              {/* Meta ızgara */}
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 border-t border-border/50 pt-4">
                {volume !== undefined && (
                  <MetaCell label="Hacim" value={formatVolume(volume)} />
                )}
                {avgVolume20d !== undefined && (
                  <MetaCell
                    label="Ort. Hacim (20g)"
                    value={formatVolume(avgVolume20d)}
                  />
                )}
                {high90d !== undefined && (
                  <MetaCell
                    label="90G Yüksek"
                    value={high90d.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + '₺'}
                  />
                )}
                {low90d !== undefined && (
                  <MetaCell
                    label="90G Düşük"
                    value={low90d.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + '₺'}
                  />
                )}
              </div>
            </div>

            {/* ── İŞLEM PLANI (Entry/Stop/Target + R/R + Simülasyon) ──────── */}
            {!analizLoading && analiz?.priceTargets && (
              <TradeTargetsCard
                targets={analiz.priceTargets}
                direction={analiz.signalDirection ?? 'yukari'}
              />
            )}

            {/* ── Zaman dilimi seçici ──────────────────────────────────────── */}
            <div className="mb-4 flex items-center">
              <div className="overflow-x-auto">
                <div className="inline-flex items-center rounded-lg border border-border bg-surface/80 p-1 text-xs text-text-secondary whitespace-nowrap">
                  {TIMEFRAMES.map((tf, i) => {
                    const prev = TIMEFRAMES[i - 1];
                    const showSep = prev && prev.group !== tf.group;
                    return (
                      <span key={tf.key} className="flex items-center">
                        {showSep && <span className="mx-1 h-4 w-px bg-border" />}
                        <button
                          type="button"
                          onClick={() => setTimeframe(tf.key)}
                          className={`rounded-md px-2.5 py-1 transition-colors ${
                            timeframe === tf.key
                              ? 'bg-primary text-white'
                              : 'text-text-secondary hover:text-text-primary'
                          }`}
                          aria-label={tf.description}
                          title={tf.description}
                        >
                          {tf.label}
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── 2-KOLON LAYOUT (lg: 2/3 + 1/3) ─────────────────────────── */}
            <div className="lg:grid lg:grid-cols-3 lg:gap-6">

              {/* ── SOL KOLON: Grafik + S/R + Sinyaller ─────────────────── */}
              <div className="lg:col-span-2 space-y-4">

                {/* Fiyat grafik + RSI birleşik kart */}
                <Card className="overflow-hidden">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                      Fiyat & EMA
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="h-[320px] w-full">
                      <Suspense fallback={
                        <div className="flex h-[320px] w-full items-center justify-center bg-surface/50">
                          <span className="text-sm text-text-secondary">Grafik yükleniyor...</span>
                        </div>
                      }>
                        <StockChart candles={candles} height={320} signals={signals} />
                      </Suspense>
                    </div>
                    {/* Sinyal chips — grafik marker'larına karşılık gelen liste */}
                    {signals.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 border-y border-border/40 px-3 py-1.5">
                        <span className="text-[10px] text-text-muted mr-1">Aktif:</span>
                        {signals.map((s) => (
                          <span
                            key={s.type}
                            title={`${s.type} — ${s.severity} — ${s.direction === 'yukari' ? 'Yükseliş' : s.direction === 'asagi' ? 'Düşüş' : 'Nötr'}`}
                            className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium cursor-default select-none ${
                              s.direction === 'yukari'
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                                : s.direction === 'asagi'
                                ? 'border-red-500/40 bg-red-500/10 text-red-400'
                                : 'border-border bg-surface/50 text-text-muted'
                            }`}
                          >
                            {s.direction === 'yukari' ? '↑' : s.direction === 'asagi' ? '↓' : '→'} {s.type}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="h-[140px] w-full">
                      <Suspense fallback={
                        <div className="flex h-[140px] w-full items-center justify-center bg-surface/50">
                          <span className="text-sm text-text-secondary">RSI yükleniyor...</span>
                        </div>
                      }>
                        <StockChart candles={candles} showRsi height={140} />
                      </Suspense>
                    </div>
                  </CardContent>
                </Card>

                {/* Destek & Direnç */}
                {candles.length >= 20 && (
                  <Card className="overflow-hidden">
                    <CardHeader className="py-2 px-3">
                      <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                        Destek &amp; Direnç
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <SRLevels analysis={calculateSRLevels(candles)} />
                    </CardContent>
                  </Card>
                )}

                {/* Tespit Edilen Sinyaller — accordion */}
                <Card className="overflow-hidden">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                      Tespit Edilen Sinyaller
                    </CardTitle>
                  </CardHeader>
                  {signals.length === 0 ? (
                    <CardContent>
                      <p className="text-sm text-text-secondary">
                        Bu hisse için şu an tespit edilen sinyal yok.
                      </p>
                    </CardContent>
                  ) : (
                    <div className="divide-y divide-border">
                      {signals.map((sig) => (
                        <AccordionSignalRow
                          key={sig.type}
                          sig={sig}
                          explanation={explanations[sig.type] ?? null}
                          sembol={sembol}
                          savedSignalTypes={savedSignalTypes}
                        />
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              {/* ── SAĞ KOLON: AI Yorum + Adil Değer + Skor ────────────── */}
              <div className="mt-4 lg:mt-0 space-y-4">

                {/* AI Genel Yorumu */}
                <Card>
                  <CardHeader className="py-2 px-3 pb-0">
                    <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                      🤖 AI Yorumu
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-3">
                    <HisseAIYorum analiz={analiz} loading={analizLoading} />
                  </CardContent>
                </Card>

                {/* Teknik Adil Değer */}
                {candles.length >= 50 && (() => {
                  const fairValue = computeTechFairValue(candles);
                  return (
                    <Card>
                      <CardHeader className="py-2 px-3 pb-0">
                        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                          📐 Teknik Adil Değer
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-3">
                        <AdilDegerMetre result={fairValue} />
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* Hisse Skor Kartı */}
                {candles.length >= 50 && (() => {
                  const stockScore = computeStockScore(candles, signals);
                  return (
                    <Card>
                      <CardHeader className="py-2 px-3 pb-0">
                        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                          🏆 Hisse Skor Kartı
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-3">
                        <HisseSkorKarti result={stockScore} />
                      </CardContent>
                    </Card>
                  );
                })()}
              </div>
            </div>

            {/* ── TAM GENİŞLİK: Sinyal Geçmişi ───────────────────────────── */}
            <div className="mt-6">
              <SectionHeader>📋 Sinyal Geçmişi</SectionHeader>
              <div className="mb-8">
                <SinyalGecmisi sembol={sembol} />
              </div>
            </div>

            {/* ── TAM GENİŞLİK: Haberler ──────────────────────────────────── */}
            <div className="mt-2">
              <SectionHeader>📰 {sembol} Haberleri</SectionHeader>
              {haberLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-xl bg-surface" />
                  ))}
                </div>
              ) : haberler.length === 0 ? (
                <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface py-8 text-center">
                  <p className="text-sm text-text-secondary">
                    {sembol} için güncel haber bulunamadı.
                  </p>
                  <Link
                    href="/haberler"
                    className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-primary/20 transition-all hover:shadow-primary/40"
                  >
                    <span className="absolute inset-0 -translate-x-full bg-white/10 transition-transform duration-300 group-hover:translate-x-0" />
                    <span>📰 Günün Tüm Haberlerini Gör</span>
                    <span className="transition-transform group-hover:translate-x-1">→</span>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {haberler.map((h, i) => {
                    const tarihStr = h.tarih
                      ? new Date(h.tarih).toLocaleDateString('tr-TR', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })
                      : '';
                    return (
                      <a
                        key={i}
                        href={h.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 hover:border-primary/40 hover:bg-surface-alt transition-colors group"
                      >
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm">
                          📰
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text-primary group-hover:text-primary transition-colors line-clamp-2">
                            {h.baslik}
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                            <span>{h.kaynak}</span>
                            {tarihStr && <><span>·</span><span>{tarihStr}</span></>}
                          </div>
                        </div>
                        <span className="shrink-0 text-text-muted group-hover:text-primary transition-colors">↗</span>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
