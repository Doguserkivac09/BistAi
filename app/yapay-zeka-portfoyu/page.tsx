'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, TrendingUp, TrendingDown, Brain, BarChart2, ShoppingCart, LogOut, Pause, AlertTriangle } from 'lucide-react';

interface Position {
  id: string; sembol: string; sector_name: string | null;
  shares: number; entry_price: number; current_price: number | null;
  stop_loss: number; take_profit: number;
  cost_basis: number; entry_week: number; entry_year: number;
}
interface HistoryRow {
  week_number: number; year: number;
  total_value: number; cash: number; positions_value: number;
  weekly_return: number | null; bist_return: number | null; alpha: number | null;
  total_return: number | null; max_drawdown: number | null;
  position_count: number; closed_this_week: number; opened_this_week: number;
}
interface DecisionRow {
  id: string; week_number: number; year: number;
  sembol: string; action: string; shares: number | null;
  theoretical_price: number; cost_or_proceeds: number;
  technical_score: number | null; dip_score: number | null;
  macro_context: string | null; reason_short: string;
}
interface ApiData {
  summary: { totalValue: number; cash: number; positionsValue: number; totalReturn: number; initialCapital: number; maxDrawdown: number; positionCount: number; weeklyReturn: number; alpha: number };
  positions: Position[];
  history: HistoryRow[];
  decisions: DecisionRow[];
}

const ACTION_CONFIG = {
  BUY:          { label: 'AL',       icon: ShoppingCart, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  SELL:         { label: 'SAT',      icon: LogOut,       color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/30' },
  PARTIAL_SELL: { label: 'KISMI SAT', icon: TrendingDown, color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/30' },
  HOLD:         { label: 'TUT',      icon: Pause,        color: 'text-sky-400',     bg: 'bg-sky-500/10 border-sky-500/30' },
};

function fmtTL(v: number) { return v.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + '₺'; }
function fmtPct(v: number | null, plus = true) { if (!v && v !== 0) return '—'; return `${plus && v > 0 ? '+' : ''}${v.toFixed(2)}%`; }

function PortfolioMeter({ value, initial }: { value: number; initial: number }) {
  const pct = ((value - initial) / initial) * 100;
  const isPos = pct >= 0;
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 text-center">
      <p className="text-[11px] text-text-muted uppercase tracking-widest mb-2">Portföy Değeri</p>
      <p className="text-4xl font-bold text-text-primary tabular-nums">{fmtTL(value)}</p>
      <div className={`mt-2 text-lg font-bold tabular-nums ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
        {isPos ? '▲' : '▼'} {fmtPct(pct)} ({isPos ? '+' : ''}{fmtTL(value - initial)})
      </div>
      <p className="text-[11px] text-text-muted mt-1">Başlangıç: {fmtTL(initial)}</p>
    </div>
  );
}

function MiniChart({ history }: { history: HistoryRow[] }) {
  if (history.length < 2) return null;
  const vals = history.map((h) => h.total_value);
  const min = Math.min(...vals) * 0.995;
  const max = Math.max(...vals) * 1.005;
  const W = 600; const H = 120;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - ((v - min) / (max - min)) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const isPos = vals[vals.length - 1] >= vals[0];
  const col = isPos ? '#10b981' : '#ef4444';
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-[11px] text-text-muted uppercase tracking-widest mb-3">Portföy Değer Grafiği</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity="0.3" />
            <stop offset="100%" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#areaGrad)" />
        <polyline points={pts} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div className="flex items-center justify-between mt-1 text-[10px] text-text-muted">
        <span>Hafta {history[0]?.week_number}/{history[0]?.year}</span>
        <span>Hafta {history[history.length - 1]?.week_number}/{history[history.length - 1]?.year}</span>
      </div>
    </div>
  );
}

export default function YapayZekaPortfoyuPage() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pozisyon' | 'karar' | 'performans'>('pozisyon');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai-portfolio');
      const json = await res.json();
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
              <Brain className="h-6 w-6 text-violet-400" />
              <h1 className="text-2xl font-bold text-text-primary">Yapay Zeka Portföyü</h1>
            </div>
            <p className="text-sm text-text-secondary">
              100.000₺ başlangıç sermayesiyle her hafta gerçek kararlar veren AI fonu.
              Kelly Criterion · Stop-Loss · Trailing Stop · Çeşitlendirme
            </p>
          </div>
          <button onClick={() => void fetchData()} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/50 px-3 py-2 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 self-start">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {loading && (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl border border-border bg-surface/30 animate-pulse" />)}
          </div>
        )}

        {!loading && !data?.summary && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-6 text-center">
            <Brain className="mx-auto h-10 w-10 text-amber-400 mb-3" />
            <p className="text-sm font-semibold text-amber-300 mb-2">AI Portföyü Henüz Başlamadı</p>
            <p className="text-xs text-text-muted">
              Migration çalıştırıldıktan sonra, Pazartesi 09:00'da ilk kararlar verilecek.
              Manuel tetiklemek için cron endpoint'ini çalıştırabilirsiniz.
            </p>
          </div>
        )}

        {!loading && data?.summary && (
          <div className="space-y-5">
            {/* Ana metrikler */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2 lg:col-span-1">
                <PortfolioMeter value={data.summary.totalValue} initial={data.summary.initialCapital} />
              </div>
              {[
                { label: 'Bu Hafta', value: fmtPct(data.summary.weeklyReturn), sub: `BIST vs +${(data.summary.alpha ?? 0).toFixed(2)}% alpha`, isPos: data.summary.weeklyReturn >= 0 },
                { label: 'Nakit', value: fmtTL(data.summary.cash), sub: `%${((data.summary.cash / data.summary.totalValue) * 100).toFixed(0)} nakit oranı`, isPos: true },
                { label: 'Max Drawdown', value: fmtPct(data.summary.maxDrawdown, false), sub: 'En kötü düşüş', isPos: (data.summary.maxDrawdown ?? 0) > -15 },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-surface p-4">
                  <p className="text-[11px] text-text-muted uppercase tracking-widest mb-1">{s.label}</p>
                  <p className={`text-2xl font-bold tabular-nums ${s.isPos ? 'text-emerald-400' : 'text-red-400'}`}>{s.value}</p>
                  <p className="text-[10px] text-text-muted mt-0.5">{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Grafik */}
            {data.history.length >= 2 && <MiniChart history={data.history} />}

            {/* Tab bar */}
            <div className="flex border-b border-border">
              {([
                { key: 'pozisyon',  label: `Açık Pozisyonlar (${data.summary.positionCount})` },
                { key: 'karar',     label: 'Son Kararlar' },
                { key: 'performans', label: 'Haftalık Performans' },
              ] as const).map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    tab === t.key ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-primary'
                  }`}>{t.label}</button>
              ))}
            </div>

            {/* Açık Pozisyonlar */}
            {tab === 'pozisyon' && (
              <div className="space-y-3">
                {data.positions.length === 0 ? (
                  <div className="rounded-xl border border-border bg-surface/30 p-6 text-center text-text-muted text-sm">
                    Henüz açık pozisyon yok — Pazartesi kararları bekleniyor
                  </div>
                ) : data.positions.map((pos) => {
                  const cp = pos.current_price ?? pos.entry_price;
                  const ret = ((cp - pos.entry_price) / pos.entry_price) * 100;
                  const pnl = (cp - pos.entry_price) * pos.shares;
                  const isPos = ret >= 0;
                  const stopDist = ((cp - pos.stop_loss) / cp) * 100;
                  const targetDist = ((pos.take_profit - cp) / cp) * 100;
                  return (
                    <div key={pos.id} className="rounded-xl border border-border bg-surface p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <Link href={`/hisse/${pos.sembol}`} className="text-base font-bold text-text-primary hover:text-primary transition-colors">
                            {pos.sembol}
                          </Link>
                          <p className="text-[11px] text-text-muted">{pos.sector_name} · Hafta {pos.entry_week}/{pos.entry_year}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-lg font-bold tabular-nums ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isPos ? '+' : ''}{ret.toFixed(2)}%
                          </p>
                          <p className={`text-xs tabular-nums ${isPos ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                            {isPos ? '+' : ''}{fmtTL(pnl)}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-[10px]">
                        <div className="rounded-md bg-surface/50 px-2 py-1">
                          <p className="text-text-muted">Alım</p>
                          <p className="font-mono font-semibold tabular-nums">{pos.entry_price.toFixed(2)}₺</p>
                        </div>
                        <div className="rounded-md bg-surface/50 px-2 py-1">
                          <p className="text-text-muted">Mevcut</p>
                          <p className="font-mono font-semibold tabular-nums">{cp.toFixed(2)}₺</p>
                        </div>
                        <div className="rounded-md bg-red-500/5 border border-red-500/20 px-2 py-1">
                          <p className="text-red-400/70">Stop</p>
                          <p className="font-mono font-semibold text-red-400 tabular-nums">{pos.stop_loss.toFixed(2)}₺</p>
                          <p className="text-[9px] text-red-400/50">-%{stopDist.toFixed(1)}</p>
                        </div>
                        <div className="rounded-md bg-emerald-500/5 border border-emerald-500/20 px-2 py-1">
                          <p className="text-emerald-400/70">Hedef</p>
                          <p className="font-mono font-semibold text-emerald-400 tabular-nums">{pos.take_profit.toFixed(2)}₺</p>
                          <p className="text-[9px] text-emerald-400/50">+%{targetDist.toFixed(1)}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-text-muted">
                        <span>{pos.shares} adet · Maliyet: {fmtTL(pos.cost_basis)}</span>
                        <span>Güncel: {fmtTL(cp * pos.shares)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Kararlar */}
            {tab === 'karar' && (
              <div className="space-y-2">
                {data.decisions.map((d) => {
                  const cfg = ACTION_CONFIG[d.action as keyof typeof ACTION_CONFIG] ?? ACTION_CONFIG.HOLD;
                  const Icon = cfg.icon;
                  return (
                    <div key={d.id} className={`flex items-start gap-3 rounded-xl border p-3 ${cfg.bg}`}>
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 ${cfg.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/hisse/${d.sembol}`} className="font-bold text-text-primary hover:text-primary text-sm transition-colors">
                            {d.sembol}
                          </Link>
                          <span className={`text-[10px] font-bold ${cfg.color}`}>{cfg.label}</span>
                          {d.shares && <span className="text-[10px] text-text-muted">{d.shares.toFixed(0)} adet · {d.theoretical_price.toFixed(2)}₺</span>}
                          <span className="text-[10px] text-text-muted ml-auto">Hafta {d.week_number}/{d.year}</span>
                        </div>
                        <p className="text-[11px] text-text-secondary mt-0.5 leading-snug">{d.reason_short}</p>
                        {d.technical_score !== null && (
                          <div className="flex gap-3 mt-1 text-[10px] text-text-muted">
                            <span>Teknik: {d.technical_score}</span>
                            {d.dip_score && <span>Dip: {d.dip_score}</span>}
                            {d.macro_context && <span>Makro: {d.macro_context}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Haftalık Performans */}
            {tab === 'performans' && (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface/50">
                      {['Hafta', 'Portföy', 'Haftalık', 'BIST', 'Alpha', 'Toplam', 'Pozisyon'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-text-muted font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.history].reverse().map((h) => {
                      const alpha = (h.weekly_return ?? 0) - (h.bist_return ?? 0);
                      return (
                        <tr key={`${h.year}-${h.week_number}`} className="border-b border-border/40 hover:bg-white/5">
                          <td className="px-3 py-2 text-text-secondary">{h.week_number}/{h.year}</td>
                          <td className="px-3 py-2 font-mono tabular-nums">{fmtTL(h.total_value)}</td>
                          <td className={`px-3 py-2 font-semibold tabular-nums ${(h.weekly_return ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {fmtPct(h.weekly_return)}
                          </td>
                          <td className={`px-3 py-2 tabular-nums ${(h.bist_return ?? 0) >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                            {fmtPct(h.bist_return)}
                          </td>
                          <td className={`px-3 py-2 font-semibold tabular-nums ${alpha >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {alpha >= 0 ? '+' : ''}{alpha.toFixed(2)}%
                          </td>
                          <td className={`px-3 py-2 font-semibold tabular-nums ${(h.total_return ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {fmtPct(h.total_return)}
                          </td>
                          <td className="px-3 py-2 text-text-muted">
                            {h.position_count} (+{h.opened_this_week} -{h.closed_this_week})
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-center text-[10px] text-text-muted/60 italic">
              Sanal portföy simülasyonu — gerçek para içermez. Yatırım tavsiyesi değildir.
              Stop-loss ve kâr alma seviyeleri teorik hesaplamaya dayanır.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
