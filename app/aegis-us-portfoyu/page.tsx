'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, Shield, ShoppingCart, LogOut, Pause,
         AlertTriangle, Activity, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { AEGIS_US_INITIAL_CAPITAL, AEGIS_US_STOP_LOSS_PCT, AEGIS_US_MIN_CONFLUENCE, AEGIS_US_MIN_REL_VOL } from '@/lib/aegis-us-engine';

interface Position {
  id: string; sembol: string; sector_name: string | null;
  shares: number; entry_price: number; current_price: number | null;
  stop_loss: number; trailing_stop: number; cost_basis: number;
  entry_date: string; entry_week: number; entry_year: number;
  tp1_hit: boolean | null;
  live_return_pct: number | null; live_pnl: number | null;
  stop_distance_pct: number | null; trail_distance_pct: number | null;
  scan_confluence: number | null; scan_rel_vol5: number | null; scan_rsi: number | null;
  change_today: number | null;
}
interface HistoryRow {
  week_number: number; year: number;
  total_value: number; cash: number; positions_value: number;
  weekly_return: number | null; sp500_return: number | null; alpha: number | null;
  total_return: number | null; max_drawdown: number | null;
  position_count: number; closed_this_week: number; opened_this_week: number;
}
interface Decision {
  id: string; week_number: number; year: number;
  sembol: string; action: string;
  shares: number | null; theoretical_price: number; cost_or_proceeds: number;
  technical_score: number | null; macro_context: string | null; reason_short: string;
  outcome_return: number | null;
}
interface Summary {
  totalValue: number; cash: number; positionsValue: number;
  totalReturn: number; initialCapital: number; maxDrawdown: number;
  positionCount: number; weeklyReturn: number; alpha: number;
  lastPriceUpdate: string;
}

function fmtUSD(v: number) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(v: number | null, plus = true) {
  if (v == null) return '—';
  return `${plus && v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}
function fmtShares(n: number) { return n % 1 === 0 ? n.toString() : n.toFixed(4); }

const ACTION_CFG: Record<string, { label: string; icon: React.ElementType; cls: string; dot: string }> = {
  BUY:          { label: 'GİRİŞ',     icon: ShoppingCart, cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400' },
  SELL:         { label: 'ÇIKIŞ',     icon: LogOut,       cls: 'text-red-300 bg-red-500/10 border-red-500/30',             dot: 'bg-red-400' },
  PARTIAL_SELL: { label: 'KISMI SAT', icon: TrendingDown, cls: 'text-amber-300 bg-amber-500/10 border-amber-500/30',       dot: 'bg-amber-400' },
  HOLD:         { label: 'TUT',       icon: Pause,        cls: 'text-sky-400 bg-sky-500/10 border-sky-500/20',             dot: 'bg-sky-400' },
};

function MiniChart({ history }: { history: HistoryRow[] }) {
  if (history.length < 2) return null;
  const vals = history.map((h) => h.total_value);
  const min = Math.min(...vals) * 0.995, max = Math.max(...vals) * 1.005;
  const W = 600, H = 100;
  const isPos = vals.at(-1)! >= vals[0]!;
  const col = isPos ? '#10b981' : '#ef4444';
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * W).toFixed(1)},${(H - ((v - min) / (max - min || 1)) * H).toFixed(1)}`).join(' ');
  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4">
      <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Portföy Değer Grafiği</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20">
        <defs><linearGradient id="aegusGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity="0.25"/><stop offset="100%" stopColor={col} stopOpacity="0"/></linearGradient></defs>
        <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#aegusGrad)" />
        <polyline points={pts} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-[9px] text-text-muted mt-1">
        <span>H{history[0]?.week_number}/{history[0]?.year}</span>
        <span>H{history.at(-1)?.week_number}/{history.at(-1)?.year}</span>
      </div>
    </div>
  );
}

export default function AegisUSPage() {
  const [data,     setData]     = useState<{ summary: Summary; positions: Position[]; history: HistoryRow[]; decisions: Decision[] } | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState<'pozisyon' | 'karar' | 'performans'>('pozisyon');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/aegis-us-portfolio');
      const json = await res.json();
      setData(json);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { void fetchData(); }, []);

  const s = data?.summary;
  const positions = data?.positions ?? [];
  const history   = data?.history   ?? [];
  const decisions = data?.decisions ?? [];

  const dailyPnlUSD = positions.reduce((sum, p) => {
    if (p.change_today == null) return sum;
    const cp = p.current_price ?? p.entry_price;
    return sum + (p.change_today / 100) * cp * p.shares;
  }, 0);
  const dailyIsPos = dailyPnlUSD >= 0;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-5xl px-4 py-8">

        {/* Başlık */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-6 w-6 text-emerald-400" />
              <span className="text-2xl font-bold text-text-primary">Aegis US Portföy</span>
              <span className="text-lg">🇺🇸</span>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 uppercase">Orta Risk · USD</span>
            </div>
            <p className="text-sm text-text-secondary">
              $2.000 başlangıç · conf ≥ {AEGIS_US_MIN_CONFLUENCE} · relVol ≥ {AEGIS_US_MIN_REL_VOL}x · Stop -%{(AEGIS_US_STOP_LOSS_PCT * 100).toFixed(0)} · Haftalık karar
            </p>
          </div>
          <button onClick={() => void fetchData()} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400/80 hover:text-emerald-400 disabled:opacity-50 self-start">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {loading && <div className="space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl border border-border bg-surface/30 animate-pulse" />)}</div>}

        {!loading && !s && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center">
            <Shield className="mx-auto h-10 w-10 text-emerald-400 mb-3" />
            <p className="font-semibold text-emerald-300 mb-1">Aegis-US henüz başlatılmadı</p>
            <p className="text-xs text-text-muted">Migration çalıştırıldıktan sonra, Pazartesi 00:30 TRT'de ilk kararlar verilecek.</p>
          </div>
        )}

        {!loading && s && (
          <div className="space-y-5">

            {/* Günlük P&L şeridi */}
            <div className={`rounded-xl border px-5 py-4 flex items-center gap-6 ${dailyIsPos ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-red-500/25 bg-red-500/5'}`}>
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Bugün</p>
                <p className={`text-3xl font-black tabular-nums ${dailyIsPos ? 'text-emerald-400' : 'text-red-400'}`}>
                  {dailyIsPos ? '+' : ''}{fmtUSD(dailyPnlUSD)}
                </p>
                <p className={`text-sm font-bold tabular-nums ${dailyIsPos ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                  {dailyIsPos ? '+' : ''}{s.totalValue > 0 ? ((dailyPnlUSD / s.totalValue) * 100).toFixed(2) : '0.00'}%
                </p>
              </div>
              <div className="w-px h-12 bg-border/50" />
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Toplam</p>
                <p className={`text-xl font-bold tabular-nums ${s.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {s.totalReturn >= 0 ? '▲' : '▼'} {fmtPct(s.totalReturn)}
                </p>
                <p className="text-[10px] text-text-muted">{fmtUSD(s.totalValue)} · Başlangıç: {fmtUSD(s.initialCapital)}</p>
              </div>
              <div className="ml-auto text-right hidden sm:block">
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Bu Hafta</p>
                <p className={`text-xl font-bold tabular-nums ${(s.weeklyReturn ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPct(s.weeklyReturn)}</p>
                <p className="text-[10px] text-text-muted">Alpha: {fmtPct(s.alpha ?? 0)} vs S&P500</p>
              </div>
            </div>

            {/* İkincil kartlar */}
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Nakit', val: fmtUSD(s.cash), sub: `%${((s.cash/s.totalValue)*100).toFixed(0)} nakit`, pos: true },
                { label: 'Max Drawdown', val: fmtPct(s.maxDrawdown, false), sub: 'Kümülatif en kötü', pos: (s.maxDrawdown ?? 0) > -20 },
                { label: 'Açık Pozisyon', val: `${s.positionCount}`, sub: 'Haftalık kadar', pos: true },
              ].map((c) => (
                <div key={c.label} className="rounded-xl border border-border bg-surface p-4">
                  <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{c.label}</p>
                  <p className={`text-2xl font-bold tabular-nums ${c.pos ? 'text-text-primary' : 'text-red-400'}`}>{c.val}</p>
                  <p className="text-[10px] text-text-muted mt-0.5">{c.sub}</p>
                </div>
              ))}
            </div>

            {history.length >= 2 && <MiniChart history={history} />}

            {/* Tab bar */}
            <div className="flex border-b border-border">
              {([
                { key: 'pozisyon',   label: `Açık Pozisyonlar (${s.positionCount})` },
                { key: 'karar',      label: 'İşlem Akışı' },
                { key: 'performans', label: 'Haftalık Performans' },
              ] as const).map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-text-muted hover:text-text-primary'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Açık Pozisyonlar */}
            {tab === 'pozisyon' && (
              <div className="space-y-3">
                {positions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center">
                    <Shield className="mx-auto h-10 w-10 text-text-muted/30 mb-3" />
                    <p className="text-sm text-text-muted font-medium mb-1">Açık pozisyon yok</p>
                    <p className="text-xs text-text-muted/60">Pazartesi 00:30 TRT — haftalık kararlar verilir</p>
                    <div className="mt-3 inline-flex flex-col items-start gap-1 rounded-lg border border-border bg-surface/50 px-4 py-2.5 text-left text-[11px]">
                      <p className="text-text-muted font-medium mb-0.5">Giriş kriterleri:</p>
                      <p className="text-emerald-400/80">Confluence ≥ {AEGIS_US_MIN_CONFLUENCE} · RelVol ≥ {AEGIS_US_MIN_REL_VOL}x</p>
                    </div>
                  </div>
                ) : positions.map((pos) => {
                  const cp      = pos.current_price ?? pos.entry_price;
                  const ret     = pos.live_return_pct ?? ((cp - pos.entry_price) / pos.entry_price) * 100;
                  const pnl     = pos.live_pnl ?? (cp - pos.entry_price) * pos.shares;
                  const isPos   = ret >= 0;
                  const stopDist = pos.stop_distance_pct ?? ((cp - pos.stop_loss) / cp) * 100;
                  const stopDanger = stopDist < 3;
                  const dailyPosTL = pos.change_today != null ? (pos.change_today / 100) * cp * pos.shares : null;
                  return (
                    <div key={pos.id} className={`rounded-xl border bg-surface p-4 ${stopDanger ? 'border-red-500/40' : 'border-border'}`}>
                      {stopDanger && <div className="flex items-center gap-1.5 mb-2 text-[10px] text-red-400 font-semibold"><AlertTriangle className="h-3 w-3" />Stop'a çok yakın — -%{stopDist.toFixed(1)}</div>}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link href={`/hisse/${pos.sembol}`} className="text-base font-bold text-text-primary hover:text-emerald-400">{pos.sembol}</Link>
                            {pos.change_today != null && (
                              <span className={`text-[10px] font-semibold ${pos.change_today >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {pos.change_today >= 0 ? '+' : ''}{pos.change_today.toFixed(1)}% bugün
                                {dailyPosTL != null && <span className="opacity-70"> ({dailyPosTL >= 0 ? '+' : ''}${Math.abs(dailyPosTL).toFixed(2)})</span>}
                              </span>
                            )}
                            {pos.scan_confluence != null && (
                              <span className={`text-[9px] border rounded px-1 ${pos.scan_confluence >= 65 ? 'border-emerald-500/30 text-emerald-400' : 'border-amber-500/30 text-amber-400'}`}>
                                Conf: {pos.scan_confluence}
                              </span>
                            )}
                            {pos.tp1_hit && <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400">Kısmi Çıkış ✓</span>}
                          </div>
                          <p className="text-[11px] text-text-muted mt-0.5">{pos.sector_name} · Hafta {pos.entry_week}/{pos.entry_year}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-lg font-bold tabular-nums ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>{isPos ? '+' : ''}{ret.toFixed(2)}%</p>
                          <p className={`text-xs tabular-nums ${isPos ? 'text-emerald-400/70' : 'text-red-400/70'}`}>{isPos ? '+' : ''}{fmtUSD(pnl)}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-[10px]">
                        <div className="rounded-md bg-surface/50 px-2 py-1 cursor-help" title="Giriş kararı scan_cache kapanış fiyatına dayanır. Gerçek giriş haftalık seansın başında olur.">
                          <p className="text-text-muted flex items-center gap-0.5">Alım <Info className="h-2.5 w-2.5 opacity-40" /></p>
                          <p className="font-mono font-semibold tabular-nums">{fmtUSD(pos.entry_price)}</p>
                          <p className="text-[9px] text-text-muted/60">{fmtShares(pos.shares)} pay</p>
                        </div>
                        <div className="rounded-md bg-surface/50 px-2 py-1">
                          <p className="text-text-muted">Güncel</p>
                          <p className="font-mono font-semibold tabular-nums">{fmtUSD(cp)}</p>
                        </div>
                        <div className={`rounded-md px-2 py-1 border ${stopDanger ? 'bg-red-500/15 border-red-500/50' : 'bg-red-500/5 border-red-500/20'}`}>
                          <p className="text-red-400/70">Stop</p>
                          <p className="font-mono font-semibold text-red-400 tabular-nums">{fmtUSD(pos.stop_loss)}</p>
                          <p className="text-[8px] text-red-400/50">-%{Math.abs(stopDist).toFixed(1)}</p>
                        </div>
                        <div className="rounded-md bg-emerald-500/5 border border-emerald-500/20 px-2 py-1">
                          <p className="text-emerald-400/70">Trailing</p>
                          <p className="font-mono font-semibold text-emerald-400 tabular-nums">{fmtUSD(pos.trailing_stop)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* İşlem Akışı */}
            {tab === 'karar' && (
              <div>
                {decisions.length > 0 && <p className="text-[11px] text-text-muted mb-3">Son {decisions.length} karar</p>}
                <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/40">
                  {decisions.length === 0 ? (
                    <p className="text-center text-text-muted text-sm py-8">Henüz karar yok</p>
                  ) : decisions.map((d) => {
                    const cfg = ACTION_CFG[d.action] ?? ACTION_CFG.HOLD!;
                    return (
                      <div key={d.id} className="flex items-start gap-3 px-4 py-3 hover:bg-white/2">
                        <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${cfg.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-black uppercase tracking-wider ${cfg.cls.split(' ')[0]}`}>{cfg.label}</span>
                            <Link href={`/hisse/${d.sembol}`} className="font-black text-sm text-text-primary hover:text-emerald-400">{d.sembol}</Link>
                            {d.shares != null && <span className="text-[10px] text-text-muted">{fmtShares(d.shares)} pay · @{fmtUSD(d.theoretical_price)}</span>}
                            {d.outcome_return != null && (
                              <span className={`text-[10px] font-bold ${d.outcome_return >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {d.outcome_return >= 0 ? '↑+' : '↓'}{d.outcome_return.toFixed(1)}%
                              </span>
                            )}
                            <span className="text-[10px] text-text-muted/50 ml-auto">H{d.week_number}/{d.year}</span>
                          </div>
                          <p className="text-[11px] text-text-secondary mt-0.5 leading-snug">{d.reason_short}</p>
                          {(d.technical_score != null || d.macro_context) && (
                            <div className="flex gap-2 mt-1 text-[10px] text-text-muted/60">
                              {d.technical_score != null && <span>Conf: {d.technical_score}</span>}
                              {d.macro_context && <span>Makro: {d.macro_context}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Haftalık Performans */}
            {tab === 'performans' && (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface/50">
                      {['Hafta','Portföy','Haftalık','S&P500','Alpha','Toplam','Poz.'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-text-muted font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().map((h) => (
                      <tr key={`${h.year}-${h.week_number}`} className="border-b border-border/40 hover:bg-white/5">
                        <td className="px-3 py-2 text-text-secondary">{h.week_number}/{h.year}</td>
                        <td className="px-3 py-2 font-mono tabular-nums">{fmtUSD(h.total_value)}</td>
                        <td className={`px-3 py-2 font-semibold tabular-nums ${(h.weekly_return ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPct(h.weekly_return)}</td>
                        <td className={`px-3 py-2 tabular-nums ${(h.sp500_return ?? 0) >= 0 ? 'text-emerald-400/60' : 'text-red-400/60'}`}>{fmtPct(h.sp500_return)}</td>
                        <td className={`px-3 py-2 font-semibold tabular-nums ${(h.alpha ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPct(h.alpha)}</td>
                        <td className={`px-3 py-2 font-semibold tabular-nums ${(h.total_return ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPct(h.total_return)}</td>
                        <td className="px-3 py-2 text-text-muted">{h.position_count} (+{h.opened_this_week} −{h.closed_this_week})</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-center text-[10px] text-text-muted/50 italic">
              Sanal portföy · $2.000 başlangıç · Yatırım tavsiyesi değildir
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
