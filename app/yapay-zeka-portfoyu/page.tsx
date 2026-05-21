'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  RefreshCw, TrendingUp, TrendingDown, Shield, BarChart2,
  ShoppingCart, LogOut, Pause, AlertTriangle, Activity, Info,
} from 'lucide-react';

// ── Tipler ────────────────────────────────────────────────────────────

interface Position {
  id: string; sembol: string; sector_name: string | null;
  shares: number; entry_price: number; current_price: number | null;
  stop_loss: number; take_profit: number; trailing_stop: number | null;
  cost_basis: number; entry_week: number; entry_year: number;
  live_return_pct: number; live_pnl: number;
  stop_distance_pct: number | null; trail_distance_pct: number | null;
  scan_confluence: number | null; change_today: number | null;
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
  summary: {
    totalValue: number; cash: number; positionsValue: number;
    totalReturn: number; initialCapital: number; maxDrawdown: number;
    positionCount: number; weeklyReturn: number; alpha: number;
    riskAlert: string | null; lastPriceUpdate: string;
  };
  positions: Position[];
  history:   HistoryRow[];
  decisions: DecisionRow[];
}

// ── Sabitler ──────────────────────────────────────────────────────────

const ACTION_CONFIG = {
  BUY:          { label: 'GİRİŞ',    icon: ShoppingCart, color: 'text-emerald-400', bg: 'border-emerald-500/30 bg-emerald-500/8' },
  SELL:         { label: 'ÇIKIŞ',    icon: LogOut,       color: 'text-red-400',     bg: 'border-red-500/30 bg-red-500/8' },
  PARTIAL_SELL: { label: 'KISMI SAT',icon: TrendingDown, color: 'text-amber-400',   bg: 'border-amber-500/30 bg-amber-500/8' },
  HOLD:         { label: 'TUT',      icon: Pause,        color: 'text-sky-400',     bg: 'border-sky-500/20 bg-sky-500/5' },
};
const ACTION_DOT: Record<string, string> = {
  BUY: 'bg-emerald-400', SELL: 'bg-red-400', PARTIAL_SELL: 'bg-amber-400', HOLD: 'bg-slate-400',
};

// ── Yardımcılar ───────────────────────────────────────────────────────

function fmtTL(v: number) {
  return v.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + '₺';
}
function fmtPct(v: number | null, plus = true) {
  if (v == null) return '—';
  return `${plus && v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}

// ── Portföy grafiği ───────────────────────────────────────────────────

function MiniChart({ history }: { history: HistoryRow[] }) {
  if (history.length < 2) return null;
  const vals = history.map((h) => h.total_value);
  const min = Math.min(...vals) * 0.995;
  const max = Math.max(...vals) * 1.005;
  const W = 600; const H = 100;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - ((v - min) / (max - min || 1)) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const isPos = vals[vals.length - 1]! >= vals[0]!;
  const col = isPos ? '#10b981' : '#ef4444';
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-[11px] text-text-muted uppercase tracking-widest mb-3">Portföy Değer Grafiği</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20">
        <defs>
          <linearGradient id="aegisGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity="0.25" />
            <stop offset="100%" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#aegisGrad)" />
        <polyline points={pts} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-[9px] text-text-muted mt-1">
        <span>H{history[0]?.week_number}/{history[0]?.year}</span>
        <span>H{history[history.length - 1]?.week_number}/{history[history.length - 1]?.year}</span>
      </div>
    </div>
  );
}

// ── Ana Sayfa ─────────────────────────────────────────────────────────

export default function YapayZekaPortfoyuPage() {
  const [data, setData]     = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState<'pozisyon' | 'islem' | 'performans'>('pozisyon');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/ai-portfolio');
      const json = await res.json();
      setData(json);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { void fetchData(); }, []);

  // Günlük P&L — açık pozisyonlardan gerçek zamanlı hesap
  const dailyPnlTL = (data?.positions ?? []).reduce((sum, p) => {
    if (p.change_today == null) return sum;
    const cp = p.current_price ?? p.entry_price;
    return sum + (p.change_today / 100) * cp * p.shares;
  }, 0);
  const dailyPnlPct = data?.summary?.totalValue
    ? (dailyPnlTL / data.summary.totalValue) * 100
    : 0;
  const dailyIsPos = dailyPnlTL >= 0;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-5xl px-4 py-8">

        {/* ── Başlık ── */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-6 w-6 text-emerald-400" />
              <h1 className="text-2xl font-bold text-text-primary">Aegis Portföy</h1>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Orta Risk</span>
            </div>
            <p className="text-sm text-text-secondary">
              100.000₺ sanal sermaye · Kelly Criterion · Stop -%8 · Trailing Stop · Claude haftalık kararları
            </p>
          </div>
          <button onClick={() => void fetchData()} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400/80 hover:text-emerald-400 disabled:opacity-50 self-start">
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
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center">
            <Shield className="mx-auto h-10 w-10 text-emerald-400 mb-3" />
            <p className="text-sm font-semibold text-emerald-300 mb-2">Aegis Portföy Henüz Başlamadı</p>
            <p className="text-xs text-text-muted">
              Migration çalıştırıldıktan sonra, Pazartesi 09:00'da ilk kararlar verilecek.
            </p>
          </div>
        )}

        {!loading && data?.summary && (
          <div className="space-y-5">

            {/* Risk Uyarısı */}
            {data.summary.riskAlert && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                <p className="text-sm text-amber-300 font-medium">{data.summary.riskAlert}</p>
              </div>
            )}

            {/* Fiyat güncelleme kaynağı */}
            <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
              <Activity className="h-3 w-3" />
              <span>Fiyat: <span className={data.summary.lastPriceUpdate === 'scan_cache' ? 'text-emerald-400' : 'text-amber-400'}>{data.summary.lastPriceUpdate === 'scan_cache' ? 'Canlı (scan_cache)' : 'Snapshot'}</span></span>
            </div>

            {/* ── Günlük P&L şeridi (BÜYÜK) ── */}
            <div className={`rounded-xl border px-5 py-4 flex items-center gap-6 ${
              dailyIsPos ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-red-500/25 bg-red-500/5'
            }`}>
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Bugün</p>
                <p className={`text-3xl font-black tabular-nums ${dailyIsPos ? 'text-emerald-400' : 'text-red-400'}`}>
                  {dailyIsPos ? '+' : ''}{fmtTL(dailyPnlTL)}
                </p>
                <p className={`text-sm font-bold tabular-nums ${dailyIsPos ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                  {dailyIsPos ? '+' : ''}{dailyPnlPct.toFixed(2)}%
                </p>
              </div>
              <div className="w-px h-12 bg-border/50" />
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Toplam</p>
                <p className={`text-xl font-bold tabular-nums ${data.summary.totalReturn >= 0 ? 'text-text-primary' : 'text-red-400'}`}>
                  {fmtPct(data.summary.totalReturn)} &nbsp;
                  <span className="text-sm font-normal text-text-muted">
                    ({data.summary.totalReturn >= 0 ? '+' : ''}{fmtTL(data.summary.totalValue - data.summary.initialCapital)})
                  </span>
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">{fmtTL(data.summary.totalValue)} portföy değeri</p>
              </div>
              <div className="ml-auto text-right hidden sm:block">
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Alpha (haftalık)</p>
                <p className={`text-lg font-bold tabular-nums ${(data.summary.alpha ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {(data.summary.alpha ?? 0) >= 0 ? '+' : ''}{(data.summary.alpha ?? 0).toFixed(2)}%
                </p>
                <p className="text-[10px] text-text-muted">vs BIST100</p>
              </div>
            </div>

            {/* İkincil istatistikler */}
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  label: 'Bu Hafta', isPos: (data.summary.weeklyReturn ?? 0) >= 0,
                  value: fmtPct(data.summary.weeklyReturn),
                  sub: `BIST alpha: ${(data.summary.alpha ?? 0) >= 0 ? '+' : ''}${(data.summary.alpha ?? 0).toFixed(2)}%`,
                },
                {
                  label: 'Nakit', isPos: true,
                  value: fmtTL(data.summary.cash),
                  sub: `%${((data.summary.cash / data.summary.totalValue) * 100).toFixed(0)} nakit oranı`,
                },
                {
                  label: 'Max Drawdown', isPos: (data.summary.maxDrawdown ?? 0) > -15,
                  value: fmtPct(data.summary.maxDrawdown, false),
                  sub: 'En kötü geri çekilme',
                },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-surface p-4">
                  <p className="text-[10px] text-text-muted uppercase tracking-widest mb-1">{s.label}</p>
                  <p className={`text-xl font-bold tabular-nums ${s.isPos ? 'text-emerald-400' : 'text-red-400'}`}>{s.value}</p>
                  <p className="text-[10px] text-text-muted mt-0.5">{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Grafik */}
            {data.history.length >= 2 && <MiniChart history={data.history} />}

            {/* Tab bar */}
            <div className="flex border-b border-border">
              {([
                { key: 'pozisyon', label: `Açık Pozisyonlar (${data.summary.positionCount})` },
                { key: 'islem',    label: 'İşlem Akışı' },
                { key: 'performans', label: 'Haftalık Performans' },
              ] as const).map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    tab === t.key ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-text-muted hover:text-text-primary'
                  }`}>{t.label}</button>
              ))}
            </div>

            {/* ── Açık Pozisyonlar ── */}
            {tab === 'pozisyon' && (
              <div className="space-y-3">
                {data.positions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-surface/20 p-8 text-center">
                    <Shield className="mx-auto h-10 w-10 text-text-muted/30 mb-3" />
                    <p className="text-sm text-text-muted font-medium mb-1">Açık pozisyon yok</p>
                    <p className="text-xs text-text-muted/60">Pazartesi 09:00 TRT — Claude haftalık kararlar verir</p>
                  </div>
                ) : data.positions.map((pos) => {
                  const cp       = pos.current_price ?? pos.entry_price;
                  const ret      = pos.live_return_pct ?? ((cp - pos.entry_price) / pos.entry_price) * 100;
                  const pnl      = pos.live_pnl ?? (cp - pos.entry_price) * pos.shares;
                  const isPos    = ret >= 0;
                  const stopDist = pos.stop_distance_pct ?? ((cp - pos.stop_loss) / cp) * 100;
                  const stopDanger = stopDist < 3;
                  // Günlük TL P&L
                  const dailyPosTL = pos.change_today != null
                    ? (pos.change_today / 100) * cp * pos.shares : null;
                  return (
                    <div key={pos.id} className={`rounded-xl border bg-surface p-4 ${stopDanger ? 'border-red-500/50' : 'border-border'}`}>
                      {stopDanger && (
                        <div className="flex items-center gap-1.5 mb-2 text-[10px] text-red-400 font-semibold">
                          <AlertTriangle className="h-3 w-3" />
                          Stop'a çok yakın — -%{stopDist.toFixed(1)}
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link href={`/hisse/${pos.sembol}`} className="text-base font-bold text-text-primary hover:text-emerald-400 transition-colors">
                              {pos.sembol}
                            </Link>
                            {/* Bugün % + TL */}
                            {pos.change_today != null && (
                              <span className={`text-[10px] font-semibold ${pos.change_today >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {pos.change_today >= 0 ? '+' : ''}{pos.change_today.toFixed(1)}% bugün
                                {dailyPosTL != null && (
                                  <span className="opacity-70"> ({dailyPosTL >= 0 ? '+' : ''}{fmtTL(dailyPosTL)})</span>
                                )}
                              </span>
                            )}
                            {pos.scan_confluence != null && (
                              <span className={`text-[9px] border rounded px-1 ${pos.scan_confluence >= 65 ? 'border-emerald-500/30 text-emerald-400' : pos.scan_confluence >= 45 ? 'border-amber-500/30 text-amber-400' : 'border-red-500/30 text-red-400'}`}>
                                Conf: {pos.scan_confluence}
                              </span>
                            )}
                          </div>
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
                        <div
                          className="rounded-md bg-surface/50 px-2 py-1 cursor-help"
                          title="Giriş fiyatı, karar anındaki önceki kapanış fiyatına dayanır. BIST'te fiili giriş ertesi seans açılışında gerçekleşir — gerçek dünyada %0.3–1.0 slippage olabilir."
                        >
                          <p className="text-text-muted flex items-center gap-0.5">Alım <Info className="h-2.5 w-2.5 opacity-50" /></p>
                          <p className="font-mono font-semibold tabular-nums">{pos.entry_price.toFixed(2)}₺</p>
                        </div>
                        <div className="rounded-md bg-surface/50 px-2 py-1">
                          <p className="text-text-muted">Güncel</p>
                          <p className="font-mono font-semibold tabular-nums">{cp.toFixed(2)}₺</p>
                        </div>
                        <div className={`rounded-md px-2 py-1 border ${stopDanger ? 'bg-red-500/15 border-red-500/50' : 'bg-red-500/5 border-red-500/20'}`}>
                          <p className="text-red-400/70">Stop</p>
                          <p className="font-mono font-semibold text-red-400 tabular-nums">{pos.stop_loss.toFixed(2)}₺</p>
                          <p className={`text-[9px] ${stopDanger ? 'text-red-400 font-bold' : 'text-red-400/50'}`}>-%{Math.abs(stopDist).toFixed(1)}</p>
                        </div>
                        <div className="rounded-md bg-violet-500/5 border border-violet-500/20 px-2 py-1">
                          <p className="text-violet-400/70">Trailing</p>
                          <p className="font-mono font-semibold text-violet-400 tabular-nums">{pos.trailing_stop?.toFixed(2) ?? '—'}₺</p>
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

            {/* ── İşlem Akışı (tradedesk) ── */}
            {tab === 'islem' && (
              <div>
                {data.decisions.length > 0 && (
                  <p className="text-[11px] text-text-muted mb-3">
                    Son {data.decisions.length} karar · Haftalık Claude kararları
                  </p>
                )}
                <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/40">
                  {data.decisions.length === 0 ? (
                    <div className="p-8 text-center text-text-muted text-sm">Henüz karar yok</div>
                  ) : data.decisions.map((d) => {
                    const cfg   = ACTION_CONFIG[d.action as keyof typeof ACTION_CONFIG] ?? ACTION_CONFIG.HOLD;
                    const dot   = ACTION_DOT[d.action] ?? 'bg-slate-400';
                    const isBuy  = d.action === 'BUY';
                    const isSell = d.action === 'SELL' || d.action === 'PARTIAL_SELL';
                    return (
                      <div key={d.id} className="flex items-start gap-3 px-4 py-3 hover:bg-white/2 transition-colors">
                        {/* Durum noktası */}
                        <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-black uppercase tracking-wider ${cfg.color}`}>
                              {cfg.label}
                            </span>
                            <Link href={`/hisse/${d.sembol}`} className="font-bold text-sm text-text-primary hover:text-emerald-400 transition-colors">
                              {d.sembol}
                            </Link>
                            {d.shares != null && (
                              <span className="text-[10px] text-text-muted">
                                {d.shares.toFixed(0)} lot · @{d.theoretical_price.toFixed(2)}₺
                              </span>
                            )}
                            {(isBuy || isSell) && (
                              <span className={`text-[10px] font-semibold tabular-nums ${isBuy ? 'text-emerald-400/60' : 'text-red-400/60'}`}>
                                {isBuy ? '+' : '-'}{fmtTL(Math.abs(d.cost_or_proceeds))}
                              </span>
                            )}
                            <span className="text-[10px] text-text-muted/50 ml-auto">
                              H{d.week_number}/{d.year}
                            </span>
                          </div>
                          <p className="text-[11px] text-text-secondary mt-0.5 leading-snug">{d.reason_short}</p>
                          {(d.technical_score != null || d.macro_context) && (
                            <div className="flex gap-2 mt-1 text-[10px] text-text-muted/60">
                              {d.technical_score != null && <span>Teknik: {d.technical_score}</span>}
                              {d.dip_score != null && <span>Dip: {d.dip_score}</span>}
                              {d.macro_context && <span>{d.macro_context}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Haftalık Performans ── */}
            {tab === 'performans' && (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface/50">
                      {['Hafta', 'Portföy', 'Haftalık', 'BIST', 'Alpha', 'Toplam', 'Poz.'].map((h) => (
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
                          <td className={`px-3 py-2 tabular-nums ${(h.bist_return ?? 0) >= 0 ? 'text-emerald-400/60' : 'text-red-400/60'}`}>
                            {fmtPct(h.bist_return)}
                          </td>
                          <td className={`px-3 py-2 font-semibold tabular-nums ${alpha >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {alpha >= 0 ? '+' : ''}{alpha.toFixed(2)}%
                          </td>
                          <td className={`px-3 py-2 font-semibold tabular-nums ${(h.total_return ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {fmtPct(h.total_return)}
                          </td>
                          <td className="px-3 py-2 text-text-muted">
                            {h.position_count}
                            {(h.opened_this_week > 0 || h.closed_this_week > 0) && (
                              <span className="opacity-50"> (+{h.opened_this_week}−{h.closed_this_week})</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-center text-[10px] text-text-muted/50 italic">
              Sanal portföy — gerçek para içermez · Yatırım tavsiyesi değildir · Slippage ve komisyon modele dahil değil
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
