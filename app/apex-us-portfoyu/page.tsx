'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  RefreshCw, Zap, ShoppingCart, LogOut, Pause, RotateCcw,
  AlertTriangle, Activity, Flame, Info, TrendingUp, TrendingDown,
} from 'lucide-react';
import { APEX_US_INITIAL_CAPITAL, APEX_US_STOP_LOSS_PCT, APEX_US_MIN_CONFLUENCE, APEX_US_MIN_REL_VOL } from '@/lib/apex-us-engine';

// ── Tipler ───────────────────────────────────────────────────────────────────

interface Position {
  id: string; sembol: string; sector_name: string | null;
  shares: number; entry_price: number; current_price: number | null;
  stop_loss: number; trailing_stop: number; cost_basis: number;
  entry_date: string; entry_confluence: number | null; entry_rel_vol5: number | null;
  tp1_hit: boolean | null;
  live_return_pct: number | null; live_pnl: number | null;
  stop_distance_pct: number | null; trail_distance_pct: number | null;
  scan_confluence: number | null; scan_rel_vol5: number | null; scan_rsi: number | null;
  change_today: number | null; signal_strength: string | null;
}
interface HistoryRow {
  snapshot_date: string; total_value: number; cash: number;
  daily_return: number | null; total_return: number | null;
  max_drawdown: number | null; position_count: number; trades_today: number;
  win_rate_30d: number | null;
}
interface Decision {
  id: string; decision_date: string; sembol: string; action: string;
  shares: number | null; theoretical_price: number; cost_or_proceeds: number;
  confluence_score: number | null; rel_vol5: number | null;
  stop_loss: number | null; reason_short: string;
  outcome_return: number | null; signal_type: string | null;
  news_status: string | null; news_score_adj: number | null;
}
interface Summary {
  totalValue: number; cash: number; positionsValue: number;
  totalReturn: number; initialCapital: number; maxDrawdown: number;
  positionCount: number; dailyReturn: number; winRate: number | null;
  winRate30d: number | null; totalTrades: number;
  bestTrade: number | null; worstTrade: number | null;
  stopAlert: string | null; weakSignals: string[] | null;
  lastPriceUpdate: string;
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function fmtUSD(v: number) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(v: number | null) {
  if (v == null) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
}
function fmtShares(n: number) {
  return n % 1 === 0 ? n.toString() : n.toFixed(4);
}

const ACTION_CFG: Record<string, { label: string; icon: React.ElementType; cls: string; dot: string }> = {
  BUY:          { label: 'GİRİŞ',      icon: ShoppingCart, cls: 'text-blue-300 bg-blue-500/10 border-blue-500/30',       dot: 'bg-blue-400' },
  SELL:         { label: 'ÇIKIŞ',      icon: LogOut,       cls: 'text-red-300 bg-red-500/10 border-red-500/30',           dot: 'bg-red-400' },
  PARTIAL_SELL: { label: 'TP1 · %50',  icon: LogOut,       cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',dot: 'bg-emerald-400' },
  ROTATE_OUT:   { label: 'ROTASYON',   icon: RotateCcw,    cls: 'text-violet-300 bg-violet-500/10 border-violet-500/30',  dot: 'bg-violet-400' },
  HOLD:         { label: 'TUT',        icon: Pause,        cls: 'text-slate-400 bg-slate-500/10 border-slate-500/20',     dot: 'bg-slate-400' },
};

function MiniChart({ history }: { history: HistoryRow[] }) {
  if (history.length < 2) return null;
  const vals = history.map((h) => h.total_value);
  const min  = Math.min(...vals) * 0.995, max = Math.max(...vals) * 1.005;
  const W = 600, H = 100;
  const isPos = vals.at(-1)! >= vals[0]!;
  const col = isPos ? '#3b82f6' : '#ef4444'; // blue for US
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * W).toFixed(1)},${(H - ((v - min) / (max - min || 1)) * H).toFixed(1)}`).join(' ');
  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4">
      <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Portföy Performans</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16">
        <defs><linearGradient id="usGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity="0.3"/><stop offset="100%" stopColor={col} stopOpacity="0"/></linearGradient></defs>
        <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#usGrad)" />
        <polyline points={pts} fill="none" stroke={col} strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-[9px] text-text-muted mt-1">
        <span>{fmtDate(history[0]!.snapshot_date)}</span>
        <span>{fmtDate(history.at(-1)!.snapshot_date)}</span>
      </div>
    </div>
  );
}

// ── Ana Sayfa ─────────────────────────────────────────────────────────────────

export default function ApexUSPage() {
  const [summary,   setSummary]   = useState<Summary | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history,   setHistory]   = useState<HistoryRow[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState<'pozisyon' | 'karar' | 'performans'>('pozisyon');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/apex-us-portfolio');
      const json = await res.json();
      setSummary(json.summary);
      setPositions(json.positions ?? []);
      setHistory(json.history ?? []);
      setDecisions(json.decisions ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const s = summary;

  const dailyPnlUSD = positions.reduce((sum, p) => {
    if (p.change_today == null) return sum;
    const cp = p.current_price ?? p.entry_price;
    return sum + (p.change_today / 100) * cp * p.shares;
  }, 0);
  const dailyPnlPct = s ? (dailyPnlUSD / s.totalValue) * 100 : 0;
  const dailyIsPos  = dailyPnlUSD >= 0;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-5xl px-4 py-8">

        {/* Başlık */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-6 w-6 text-blue-400" />
              <span className="text-2xl font-black tracking-tight text-blue-400">APEX</span>
              <span className="text-2xl font-bold text-text-primary">US Portföy</span>
              <span className="text-lg">🇺🇸</span>
              <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-400 uppercase">Agresif · USD</span>
            </div>
            <p className="text-sm text-text-secondary">
              $2.000 başlangıç · relVol5 ≥ {APEX_US_MIN_REL_VOL}x · Conf ≥ {APEX_US_MIN_CONFLUENCE} · Stop -%{(APEX_US_STOP_LOSS_PCT * 100).toFixed(0)} · Kesirli pay · Haber analizi
            </p>
          </div>
          <button onClick={() => void load()} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-blue-400/80 hover:text-blue-400 disabled:opacity-50 self-start">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {loading && (
          <div className="space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl border border-border bg-surface/30 animate-pulse" />)}</div>
        )}

        {!loading && !s && (
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-8 text-center">
            <Zap className="mx-auto h-10 w-10 text-blue-400 mb-3" />
            <p className="font-semibold text-blue-300 mb-1">APEX-US henüz başlatılmadı</p>
            <p className="text-xs text-text-muted">Migration çalıştırıldıktan sonra otomatik aktif olur. Cron: 23:45 TRT.</p>
          </div>
        )}

        {!loading && s && (
          <div className="space-y-5">

            {/* Risk Uyarıları */}
            {(s.stopAlert || (s.weakSignals?.length ?? 0) > 0) && (
              <div className="space-y-2">
                {s.stopAlert && <div className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/8 px-4 py-3"><AlertTriangle className="h-4 w-4 text-red-400" /><p className="text-sm text-red-300 font-semibold">{s.stopAlert}</p></div>}
                {(s.weakSignals?.length ?? 0) > 0 && <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3"><AlertTriangle className="h-4 w-4 text-amber-400" /><p className="text-sm text-amber-300">Sinyal zayıflıyor: <strong>{s.weakSignals!.join(', ')}</strong></p></div>}
              </div>
            )}

            {/* Günlük P&L */}
            <div className={`rounded-xl border px-5 py-4 flex items-center gap-6 ${dailyIsPos ? 'border-blue-500/25 bg-blue-500/5' : 'border-red-500/25 bg-red-500/5'}`}>
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Bugün</p>
                <p className={`text-3xl font-black tabular-nums ${dailyIsPos ? 'text-blue-400' : 'text-red-400'}`}>
                  {dailyIsPos ? '+' : ''}{fmtUSD(dailyPnlUSD)}
                </p>
                <p className={`text-sm font-bold ${dailyIsPos ? 'text-blue-400/70' : 'text-red-400/70'}`}>{dailyIsPos ? '+' : ''}{dailyPnlPct.toFixed(2)}%</p>
              </div>
              <div className="w-px h-12 bg-border/50" />
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Toplam</p>
                <p className={`text-xl font-bold tabular-nums ${s.totalReturn >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                  {s.totalReturn >= 0 ? '▲' : '▼'} {fmtPct(s.totalReturn)}
                </p>
                <p className="text-[10px] text-text-muted">{fmtUSD(s.totalValue)} · Başlangıç: {fmtUSD(s.initialCapital)}</p>
              </div>
              <div className="ml-auto text-right hidden sm:block">
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Win Rate (30G)</p>
                <p className={`text-xl font-bold tabular-nums ${(s.winRate30d ?? 0) >= 55 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {s.winRate30d != null ? `%${s.winRate30d.toFixed(0)}` : '—'}
                </p>
                <p className="text-[10px] text-text-muted">{s.totalTrades} işlem</p>
              </div>
            </div>

            {/* İkincil metrikler */}
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Nakit', val: fmtUSD(s.cash), sub: `%${((s.cash/s.totalValue)*100).toFixed(0)} nakit`, pos: true },
                { label: 'Max Drawdown', val: fmtPct(s.maxDrawdown), sub: `En iyi: ${s.bestTrade != null ? fmtPct(s.bestTrade) : '—'}`, pos: (s.maxDrawdown ?? 0) > -20 },
                { label: 'Açık Pozisyon', val: `${s.positionCount}`, sub: 'Kesirli pay izinli', pos: true },
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
                { key: 'pozisyon',  label: `Açık Pozisyonlar (${s.positionCount})` },
                { key: 'karar',     label: 'İşlem Akışı' },
                { key: 'performans',label: 'Günlük Performans' },
              ] as const).map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-blue-400 text-blue-400' : 'border-transparent text-text-muted hover:text-text-primary'}`}>{t.label}</button>
              ))}
            </div>

            {/* Açık Pozisyonlar */}
            {tab === 'pozisyon' && (
              <div className="space-y-3">
                {positions.length === 0 ? (
                  <div className="rounded-xl border border-blue-500/15 bg-blue-500/3 p-6 text-center">
                    <Activity className="mx-auto h-8 w-8 text-blue-400/40 mb-3" />
                    <p className="text-sm font-semibold text-text-muted mb-2">Açık pozisyon yok</p>
                    <p className="text-xs text-text-muted/60">Sonraki cron: 23:45 TRT</p>
                    <div className="mt-3 inline-flex flex-col items-start gap-1 rounded-lg border border-border bg-surface/50 px-4 py-2.5 text-left text-[11px]">
                      <p className="text-text-muted font-medium mb-0.5">Giriş kriterleri:</p>
                      <p className="text-blue-400/80">Confluence ≥ {APEX_US_MIN_CONFLUENCE} · RelVol ≥ {APEX_US_MIN_REL_VOL}x · Min $50</p>
                    </div>
                  </div>
                ) : positions.map((pos) => {
                  const cp      = pos.current_price ?? pos.entry_price;
                  const ret     = pos.live_return_pct ?? ((cp - pos.entry_price) / pos.entry_price) * 100;
                  const pnl     = pos.live_pnl ?? (cp - pos.entry_price) * pos.shares;
                  const isPos   = ret >= 0;
                  const stopDist = pos.stop_distance_pct ?? ((cp - pos.stop_loss) / cp) * 100;
                  const stopDanger = stopDist < 2.5;
                  const dailyPosTL = pos.change_today != null ? (pos.change_today / 100) * cp * pos.shares : null;

                  // Sinyal sağlığı skoru
                  const conf = pos.scan_confluence ?? 100;
                  const rv   = pos.scan_rel_vol5   ?? 1;
                  const rsi  = pos.scan_rsi        ?? 50;
                  let healthScore = 0;
                  if (conf >= 70) healthScore += 2; else if (conf >= 55) healthScore += 1; else if (conf < 45) healthScore -= 2; else healthScore -= 1;
                  if (rv >= 1.5) healthScore += 1; else if (rv < 1.2) healthScore -= 1;
                  if (rsi > 82) healthScore -= 2; else if (rsi > 75) healthScore -= 1; else if (rsi < 65) healthScore += 1;
                  const rsiIcon   = rsi > 80 ? '🔴' : rsi > 70 ? '🟡' : '🟢';
                  const volIcon   = rv >= 1.5 ? '🟢' : rv >= 1.0 ? '🟡' : '🔴';
                  const trendIcon = conf >= 60 ? '🟢' : conf >= 45 ? '🟡' : '🔴';
                  const hCfg = healthScore >= 4 ? { label: `Güçlü (+${healthScore})`, cls: 'border-emerald-500/40 bg-emerald-500/8 text-emerald-400' }
                             : healthScore >= 1 ? { label: `İzleniyor (+${healthScore})`, cls: 'border-amber-500/35 bg-amber-500/8 text-amber-400' }
                             : healthScore >= -2 ? { label: `Zayıf (${healthScore})`, cls: 'border-orange-500/35 bg-orange-500/8 text-orange-400' }
                             : { label: `Bozuldu (${healthScore})`, cls: 'border-red-500/40 bg-red-500/8 text-red-400' };

                  return (
                    <div key={pos.id} className={`rounded-xl border p-4 ${stopDanger ? 'border-red-500/50' : isPos ? 'border-blue-500/20 bg-blue-500/3' : 'border-red-500/20 bg-red-500/3'}`}>
                      {stopDanger && <div className="flex items-center gap-1.5 mb-2 text-[10px] text-red-400 font-semibold"><AlertTriangle className="h-3 w-3" />Stop'a -%{stopDist.toFixed(1)} uzakta</div>}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link href={`/hisse/${pos.sembol}`} className="text-base font-black text-text-primary hover:text-blue-400">{pos.sembol}</Link>
                            {pos.change_today != null && (
                              <span className={`text-[10px] font-bold ${pos.change_today >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                                {pos.change_today >= 0 ? '+' : ''}{pos.change_today.toFixed(1)}% bugün
                                {dailyPosTL != null && <span className="opacity-70"> ({dailyPosTL >= 0 ? '+' : ''}${Math.abs(dailyPosTL).toFixed(2)})</span>}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <p className="text-[10px] text-text-muted">{pos.sector_name} · {fmtDate(pos.entry_date)} · Conf: {pos.entry_confluence ?? '—'}</p>
                            {pos.tp1_hit && <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400">Kısmi Çıkış ✓</span>}
                            <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold ${hCfg.cls}`} title={`RSI:${rsi.toFixed(0)} relVol:${rv.toFixed(1)}x conf:${conf}`}>
                              {rsiIcon}{volIcon}{trendIcon} {hCfg.label}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-xl font-black tabular-nums ${isPos ? 'text-blue-400' : 'text-red-400'}`}>{isPos ? '+' : ''}{ret.toFixed(2)}%</p>
                          <p className={`text-xs tabular-nums ${isPos ? 'text-blue-400/70' : 'text-red-400/70'}`}>{isPos ? '+' : ''}{fmtUSD(pnl)}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-[10px]">
                        <div className="rounded-md bg-surface/60 px-2 py-1.5 cursor-help" title="Karar anındaki scan_cache kapanış fiyatıdır. Gerçek giriş bir sonraki seansta ±slippage ile gerçekleşir.">
                          <p className="text-text-muted flex items-center gap-0.5">Alım <Info className="h-2.5 w-2.5 opacity-40" /></p>
                          <p className="font-mono font-bold tabular-nums">{fmtUSD(pos.entry_price)}</p>
                          <p className="text-[9px] text-text-muted/60">{fmtShares(pos.shares)} pay</p>
                        </div>
                        <div className="rounded-md bg-surface/60 px-2 py-1.5">
                          <p className="text-text-muted">Güncel</p>
                          <p className="font-mono font-bold tabular-nums">{fmtUSD(cp)}</p>
                        </div>
                        <div className={`rounded-md px-2 py-1.5 border ${stopDanger ? 'bg-red-500/15 border-red-500/50' : 'bg-red-500/5 border-red-500/20'}`}>
                          <p className="text-red-400/60">Stop</p>
                          <p className="font-mono font-bold text-red-400 tabular-nums">{fmtUSD(pos.stop_loss)}</p>
                          <p className="text-[8px] text-red-400/50">-%{Math.abs(stopDist).toFixed(1)}</p>
                        </div>
                        <div className="rounded-md bg-blue-500/5 border border-blue-500/20 px-2 py-1.5">
                          <p className="text-blue-400/60">Trailing</p>
                          <p className="font-mono font-bold text-blue-400 tabular-nums">{fmtUSD(pos.trailing_stop)}</p>
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
                {decisions.length > 0 && (() => {
                  const today = new Date().toISOString().slice(0, 10);
                  const tc = decisions.filter((d) => d.decision_date === today).length;
                  return <p className="text-[11px] text-text-muted mb-3">Son {decisions.length} işlem{tc > 0 && <span className="ml-2 text-blue-400 font-semibold">· Bugün {tc} karar</span>}</p>;
                })()}
                <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/40">
                  {decisions.length === 0 ? (
                    <p className="text-center text-text-muted text-sm py-8">Henüz karar yok</p>
                  ) : decisions.map((d) => {
                    const cfg  = ACTION_CFG[d.action] ?? ACTION_CFG.HOLD!;
                    const isBuy = d.action === 'BUY';
                    return (
                      <div key={d.id} className="flex items-start gap-3 px-4 py-3 hover:bg-white/2 transition-colors">
                        <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${cfg.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-black uppercase tracking-wider ${cfg.cls.split(' ')[0]}`}>{cfg.label}</span>
                            <Link href={`/hisse/${d.sembol}`} className="font-black text-sm text-text-primary hover:text-blue-400">{d.sembol}</Link>
                            {d.shares != null && <span className="text-[10px] text-text-muted">{fmtShares(d.shares)} pay · @{fmtUSD(d.theoretical_price)}</span>}
                            {d.outcome_return != null && (
                              <span className={`text-[10px] font-bold ${d.outcome_return >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {d.outcome_return >= 0 ? '↑' : '↓'} {d.outcome_return >= 0 ? '+' : ''}{d.outcome_return.toFixed(1)}%
                              </span>
                            )}
                            {d.news_status && d.news_status !== 'no_news' && d.news_status !== 'stale' && (
                              <span className={`text-[9px] rounded px-1.5 py-0.5 border ${d.news_score_adj && d.news_score_adj < 0 ? 'text-red-400 border-red-500/25 bg-red-500/8' : 'text-sky-400 border-sky-500/25 bg-sky-500/8'}`}>
                                📰 {d.news_status}
                              </span>
                            )}
                            <span className="text-[10px] text-text-muted/50 ml-auto">{fmtDate(d.decision_date)}</span>
                          </div>
                          <p className="text-[11px] text-text-secondary mt-0.5 leading-snug">{d.reason_short}</p>
                          {(d.confluence_score != null || d.rel_vol5 != null || d.signal_type) && (
                            <div className="flex gap-2 mt-1 text-[10px] text-text-muted/60">
                              {d.confluence_score != null && <span>Conf: {d.confluence_score}</span>}
                              {d.rel_vol5 != null && <span>Vol: {d.rel_vol5.toFixed(1)}x</span>}
                              {d.signal_type && <span>[{d.signal_type}]</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Günlük Performans */}
            {tab === 'performans' && (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface/60">
                      {['Tarih','Portföy','Günlük','Toplam','Max DD','Win Rate','İşlem','Poz.'].map((h) => (
                        <th key={h} className="px-3 py-2.5 text-left text-text-muted font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().map((h) => (
                      <tr key={h.snapshot_date} className="border-b border-border/40 hover:bg-white/5">
                        <td className="px-3 py-2 text-text-secondary">{fmtDate(h.snapshot_date)}</td>
                        <td className="px-3 py-2 font-mono tabular-nums">{fmtUSD(h.total_value)}</td>
                        <td className={`px-3 py-2 font-bold tabular-nums ${(h.daily_return ?? 0) >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{fmtPct(h.daily_return)}</td>
                        <td className={`px-3 py-2 font-bold tabular-nums ${(h.total_return ?? 0) >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{fmtPct(h.total_return)}</td>
                        <td className="px-3 py-2 tabular-nums text-red-400/70">{fmtPct(h.max_drawdown)}</td>
                        <td className="px-3 py-2 tabular-nums">{h.win_rate_30d != null ? `%${h.win_rate_30d.toFixed(0)}` : '—'}</td>
                        <td className="px-3 py-2 text-text-muted">{h.trades_today}</td>
                        <td className="px-3 py-2 text-text-muted">{h.position_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-center text-[10px] text-text-muted/50 italic">
              Sanal portföy · $2.000 başlangıç · Yatırım tavsiyesi değildir · Geçmiş performans geleceği garanti etmez
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
