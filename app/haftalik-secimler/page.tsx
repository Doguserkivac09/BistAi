'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TrendingUp, TrendingDown, RefreshCw, Trophy, BarChart2, Target, Star } from 'lucide-react';

interface Pick {
  id: string;
  sembol: string;
  sector_name: string | null;
  entry_price: number;
  entry_time: string;
  confluence_score: number | null;
  signal_types: string[];
  weekly_aligned: boolean | null;
  close_price: number | null;
  return_pct: number | null;
  bist_return_pct: number | null;
  is_closed: boolean;
  live_price?: number;
  live_return_pct?: number;
}

interface WeekSummary {
  week: number;
  year: number;
  picks: Pick[];
  summary: {
    avgReturn: number | null;
    bistReturn: number | null;
    closedCount: number;
    outperformed: boolean | null;
  };
}

interface ApiResponse {
  ok: boolean;
  currentWeek: number;
  currentYear: number;
  thisWeek: Pick[];
  weeks: WeekSummary[];
  stats: {
    totalWeeks: number;
    avgReturn: number | null;
    outperformedCount: number;
    outperformedRate: number | null;
  };
}

function fmtPct(v: number | null | undefined, withSign = true): string {
  if (v === null || v === undefined) return '—';
  const sign = withSign && v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function ReturnBadge({ value, size = 'sm' }: { value: number | null | undefined; size?: 'sm' | 'lg' }) {
  if (value === null || value === undefined) return <span className="text-text-muted">—</span>;
  const isPos = value >= 0;
  const cls = isPos ? 'text-emerald-400' : 'text-red-400';
  const Icon = isPos ? TrendingUp : TrendingDown;
  const sizeClass = size === 'lg' ? 'text-2xl font-bold' : 'text-sm font-semibold';
  return (
    <span className={`inline-flex items-center gap-1 ${cls} ${sizeClass} tabular-nums`}>
      <Icon className={size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5'} />
      {fmtPct(value)}
    </span>
  );
}

function PickCard({ pick }: { pick: Pick }) {
  const currentReturn = pick.is_closed ? pick.return_pct : (pick.live_return_pct ?? null);
  const currentPrice  = pick.is_closed ? pick.close_price : (pick.live_price ?? null);
  const isPos = (currentReturn ?? 0) >= 0;

  return (
    <Link
      href={`/hisse/${pick.sembol}`}
      className={`block rounded-xl border p-4 transition-all hover:scale-[1.01] hover:shadow-lg ${
        isPos
          ? 'border-emerald-500/25 bg-emerald-500/5 hover:shadow-emerald-500/10'
          : 'border-red-500/25 bg-red-500/5 hover:shadow-red-500/10'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-base font-bold text-text-primary">{pick.sembol}</p>
          {pick.sector_name && (
            <p className="text-[11px] text-text-muted">{pick.sector_name}</p>
          )}
        </div>
        <ReturnBadge value={currentReturn} size="lg" />
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div>
          <span className="text-text-muted">Giriş:</span>
          <span className="ml-1 font-mono text-text-secondary">{pick.entry_price.toFixed(2)}₺</span>
        </div>
        {currentPrice && (
          <div>
            <span className="text-text-muted">{pick.is_closed ? 'Kapanış:' : 'Anlık:'}</span>
            <span className="ml-1 font-mono text-text-secondary">{currentPrice.toFixed(2)}₺</span>
          </div>
        )}
        {pick.confluence_score && (
          <div>
            <span className="text-text-muted">Güven:</span>
            <span className={`ml-1 font-semibold ${
              pick.confluence_score >= 70 ? 'text-emerald-400' :
              pick.confluence_score >= 55 ? 'text-amber-400' : 'text-text-secondary'
            }`}>{pick.confluence_score}</span>
          </div>
        )}
        {pick.weekly_aligned && (
          <div className="text-emerald-400 font-semibold">MTF ✓</div>
        )}
      </div>

      {!pick.is_closed && (
        <p className="mt-2 text-[10px] text-text-muted/70">Anlık fiyat · Pozisyon açık</p>
      )}
    </Link>
  );
}

export default function HaftalikSecimlerPage() {
  const [data, setData]       = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/weekly-picks');
      const json = await res.json() as ApiResponse;
      setData(json);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { void fetchData(); }, []);

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-5xl px-4 py-8">

        {/* Başlık */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="h-6 w-6 text-amber-400" />
              <h1 className="text-2xl font-bold text-text-primary">Haftanın Seçimleri</h1>
            </div>
            <p className="text-sm text-text-secondary">
              Algoritmanın her hafta seçtiği en güçlü hisseler — performans takibi ile
            </p>
          </div>
          <button
            onClick={() => void fetchData()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/50 px-3 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 self-start"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 rounded-xl border border-border bg-surface/30 animate-pulse" />
            ))}
          </div>
        ) : !data ? (
          <div className="rounded-xl border border-border bg-surface/30 p-8 text-center text-text-muted">
            Veri yüklenemedi
          </div>
        ) : (
          <>
            {/* Toplam Performans Özeti */}
            {data.stats.totalWeeks > 0 && (
              <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  {
                    icon: BarChart2,
                    label: 'Analiz Edilen Hafta',
                    value: String(data.stats.totalWeeks),
                    color: 'text-text-primary',
                  },
                  {
                    icon: TrendingUp,
                    label: 'Ort. Haftalık Getiri',
                    value: fmtPct(data.stats.avgReturn),
                    color: (data.stats.avgReturn ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400',
                  },
                  {
                    icon: Target,
                    label: 'BIST\'i Geçen',
                    value: `${data.stats.outperformedCount}/${data.stats.totalWeeks}`,
                    color: 'text-primary',
                  },
                  {
                    icon: Star,
                    label: 'Başarı Oranı',
                    value: data.stats.outperformedRate !== null ? `%${data.stats.outperformedRate}` : '—',
                    color: (data.stats.outperformedRate ?? 0) >= 50 ? 'text-emerald-400' : 'text-amber-400',
                  },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div key={label} className="rounded-xl border border-border bg-surface p-4">
                    <div className="flex items-center gap-1.5 text-[11px] text-text-muted mb-1">
                      <Icon className="h-3 w-3" />
                      {label}
                    </div>
                    <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Bu Haftanın Seçimleri */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">🏆</span>
                <h2 className="text-base font-bold text-text-primary">
                  Bu Haftanın Seçimleri
                  <span className="ml-2 text-sm font-normal text-text-muted">
                    Hafta {data.currentWeek}/{data.currentYear}
                  </span>
                </h2>
              </div>

              {data.thisWeek.length === 0 ? (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-5 text-center">
                  <p className="text-sm text-amber-300 font-semibold mb-1">
                    Bu hafta seçimler henüz yapılmadı
                  </p>
                  <p className="text-xs text-text-muted">
                    Seçimler her Pazartesi sabahı 08:30 TRT'de otomatik yapılır.
                    Piyasalar kapandıktan sonra canlı fiyatlar güncellenir.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.thisWeek.map((pick) => (
                    <PickCard key={pick.id} pick={pick} />
                  ))}
                </div>
              )}
            </section>

            {/* Geçmiş Haftalar */}
            {data.weeks.length > 1 && (
              <section>
                <h2 className="text-base font-bold text-text-primary mb-4">📅 Geçmiş Seçimler</h2>
                <div className="space-y-4">
                  {data.weeks
                    .filter((w) => !(w.week === data.currentWeek && w.year === data.currentYear))
                    .map((wk) => {
                      const { avgReturn, bistReturn, outperformed, closedCount } = wk.summary;
                      const hasData = closedCount > 0;

                      return (
                        <div key={`${wk.year}-${wk.week}`}
                          className="rounded-xl border border-border bg-surface/50 overflow-hidden">
                          {/* Hafta başlığı */}
                          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/50">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-semibold text-text-primary">
                                Hafta {wk.week}/{wk.year}
                              </span>
                              <span className="text-[11px] text-text-muted">{closedCount} hisse</span>
                            </div>

                            {hasData ? (
                              <div className="flex items-center gap-3">
                                {/* Seçimler getirisi */}
                                <div className="text-right">
                                  <p className="text-[10px] text-text-muted">Seçimler</p>
                                  <ReturnBadge value={avgReturn} />
                                </div>
                                {/* BIST */}
                                {bistReturn !== null && (
                                  <div className="text-right">
                                    <p className="text-[10px] text-text-muted">BIST</p>
                                    <ReturnBadge value={bistReturn} />
                                  </div>
                                )}
                                {/* Sonuç */}
                                {outperformed !== null && (
                                  <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${
                                    outperformed
                                      ? 'bg-emerald-500/15 text-emerald-300'
                                      : 'bg-red-500/15 text-red-300'
                                  }`}>
                                    {outperformed ? 'BIST\'i Geçti ✓' : 'BIST Geride ✗'}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-text-muted">Veri bekleniyor</span>
                            )}
                          </div>

                          {/* Hisse listesi — kompakt */}
                          <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                            {wk.picks.map((pick) => {
                              const ret = pick.is_closed ? pick.return_pct : pick.live_return_pct;
                              return (
                                <Link
                                  key={pick.id}
                                  href={`/hisse/${pick.sembol}`}
                                  className="flex items-center justify-between rounded-lg border border-border/50 bg-surface/30 px-2.5 py-1.5 hover:bg-white/5 transition-colors"
                                >
                                  <span className="text-xs font-bold text-text-primary">{pick.sembol}</span>
                                  <ReturnBadge value={ret} />
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </section>
            )}

            {/* Yasal */}
            <p className="mt-8 text-center text-[10px] text-text-muted/60 italic">
              Haftanın seçimleri algoritmik olarak belirlenir. Yatırım tavsiyesi değildir.
              Geçmiş performans gelecekteki sonuçları garanti etmez.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
