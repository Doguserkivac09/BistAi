'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw, Zap, ShoppingCart, LogOut, Pause, RotateCcw,
         AlertTriangle, Activity, Flame, Info } from 'lucide-react';
import { APEX_INITIAL_CAPITAL, APEX_STOP_LOSS_PCT, APEX_MIN_CONFLUENCE, APEX_MIN_REL_VOL } from '@/lib/apex-engine';

// ── Tipler ───────────────────────────────────────────────────────────

interface Position {
  id: string; sembol: string; sector_name: string | null;
  shares: number; entry_price: number; current_price: number | null;
  stop_loss: number; trailing_stop: number; cost_basis: number;
  entry_date: string; entry_confluence: number | null; entry_rel_vol5: number | null;
  // Canlı veriler (API tarafından eklenir)
  live_return_pct: number | null; live_pnl: number | null;
  stop_distance_pct: number | null; trail_distance_pct: number | null;
  scan_confluence: number | null; scan_rel_vol5: number | null;
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
  outcome_return: number | null; // kapanış sonrası net getiri %
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

// ── Yardımcılar ──────────────────────────────────────────────────────

function fmtTL(v: number) {
  return v.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + '₺';
}
function fmtPct(v: number | null) {
  if (v == null) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
}

const ACTION_CFG: Record<string, { label: string; icon: React.ElementType; cls: string; dot: string }> = {
  BUY:        { label: 'GİRİŞ',    icon: ShoppingCart, cls: 'text-orange-300 bg-orange-500/10 border-orange-500/30', dot: 'bg-orange-400' },
  SELL:       { label: 'ÇIKIŞ',    icon: LogOut,       cls: 'text-red-300 bg-red-500/10 border-red-500/30',         dot: 'bg-red-400' },
  ROTATE_OUT: { label: 'ROTASYON', icon: RotateCcw,    cls: 'text-violet-300 bg-violet-500/10 border-violet-500/30',dot: 'bg-violet-400' },
  ROTATE_IN:  { label: 'ROT.GİRİŞ',icon: RotateCcw,   cls: 'text-violet-300 bg-violet-500/10 border-violet-500/30',dot: 'bg-violet-400' },
  HOLD:       { label: 'TUT',      icon: Pause,        cls: 'text-slate-400 bg-slate-500/10 border-slate-500/20',   dot: 'bg-slate-400' },
};

// ── Performans grafiği ────────────────────────────────────────────────

function MiniChart({ history }: { history: HistoryRow[] }) {
  if (history.length < 2) return null;
  const vals = history.map((h) => h.total_value);
  const min  = Math.min(...vals) * 0.995;
  const max  = Math.max(...vals) * 1.005;
  const W = 600; const H = 100;
  const isPos = vals[vals.length - 1]! >= vals[0]!;
  const col = isPos ? '#f97316' : '#ef4444'; // orange for APEX
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - ((v - min) / (max - min || 1)) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4">
      <p className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Portföy Performans Grafiği</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16">
        <defs>
          <linearGradient id="apexGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity="0.3" />
            <stop offset="100%" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#apexGrad)" />
        <polyline points={pts} fill="none" stroke={col} strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-[9px] text-text-muted mt-1">
        <span>{fmtDate(history[0]!.snapshot_date)}</span>
        <span>{fmtDate(history[history.length - 1]!.snapshot_date)}</span>
      </div>
    </div>
  );
}

// ── Ana Sayfa ─────────────────────────────────────────────────────────

export default function ApexPortfoyuPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory]     = useState<HistoryRow[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState<'pozisyon' | 'karar' | 'performans'>('pozisyon');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/apex-portfolio');
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

  // Günlük TL P&L — pozisyonlardan gerçek zamanlı
  const dailyPnlTL = positions.reduce((sum, p) => {
    if (p.change_today == null) return sum;
    const cp = p.current_price ?? p.entry_price;
    return sum + (p.change_today / 100) * cp * p.shares;
  }, 0);
  const dailyPnlPct = s ? (dailyPnlTL / s.totalValue) * 100 : 0;
  const dailyIsPos  = dailyPnlTL >= 0;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-5xl px-4 py-8">

        {/* Başlık — APEX brand */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex items-center gap-1">
                <Zap className="h-6 w-6 text-orange-400" />
                <span className="text-2xl font-black tracking-tight text-orange-400">APEX</span>
              </div>
              <span className="text-2xl font-bold text-text-primary">Portföyü</span>
              <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold text-orange-400 uppercase tracking-wider">Agresif</span>
            </div>
            <p className="text-sm text-text-secondary">
              Günlük momentum kararları · relVol5 ≥ {APEX_MIN_REL_VOL}x · Conf ≥ {APEX_MIN_CONFLUENCE} · Stop -%{(APEX_STOP_LOSS_PCT * 100).toFixed(0)} · Trailing exit
            </p>
          </div>
          <button onClick={() => void load()} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2 text-xs text-orange-400/80 hover:text-orange-400 disabled:opacity-50 self-start">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {loading && (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl border border-border bg-surface/30 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && !s && (
          <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-8 text-center">
            <Zap className="mx-auto h-10 w-10 text-orange-400 mb-3" />
            <p className="font-semibold text-orange-300 mb-1">APEX henüz başlatılmadı</p>
            <p className="text-xs text-text-muted">Migration çalıştırıldıktan sonra otomatik aktif olur.</p>
          </div>
        )}

        {!loading && s && (
          <div className="space-y-5">

            {/* Risk Uyarıları */}
            {(s.stopAlert || (s.weakSignals && s.weakSignals.length > 0)) && (
              <div className="space-y-2">
                {s.stopAlert && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/8 px-4 py-3">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                    <p className="text-sm text-red-300 font-semibold">⚠️ {s.stopAlert}</p>
                  </div>
                )}
                {s.weakSignals && s.weakSignals.length > 0 && (
                  <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                    <p className="text-sm text-amber-300">Sinyal zayıflıyor: <strong>{s.weakSignals.join(', ')}</strong> — yarın değerlendirme yapılacak</p>
                  </div>
                )}
              </div>
            )}

            {/* Fiyat kaynağı */}
            <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
              <Activity className="h-3 w-3" />
              <span>Fiyat: <span className={s.lastPriceUpdate === 'scan_cache' ? 'text-emerald-400' : 'text-amber-400'}>{s.lastPriceUpdate === 'scan_cache' ? 'Canlı (scan_cache)' : 'Snapshot'}</span></span>
            </div>

            {/* ── Günlük P&L şeridi ── */}
            <div className={`rounded-xl border px-5 py-4 flex items-center gap-6 ${
              dailyIsPos ? 'border-orange-500/25 bg-orange-500/5' : 'border-red-500/25 bg-red-500/5'
            }`}>
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Bugün</p>
                <p className={`text-3xl font-black tabular-nums ${dailyIsPos ? 'text-orange-400' : 'text-red-400'}`}>
                  {dailyIsPos ? '+' : ''}{fmtTL(dailyPnlTL)}
                </p>
                <p className={`text-sm font-bold tabular-nums ${dailyIsPos ? 'text-orange-400/70' : 'text-red-400/70'}`}>
                  {dailyIsPos ? '+' : ''}{dailyPnlPct.toFixed(2)}%
                </p>
              </div>
              <div className="w-px h-12 bg-border/50" />
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Toplam</p>
                <p className={`text-xl font-bold tabular-nums ${s.totalReturn >= 0 ? 'text-orange-400' : 'text-red-400'}`}>
                  {s.totalReturn >= 0 ? '▲' : '▼'} {fmtPct(s.totalReturn)}
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">{fmtTL(s.totalValue)} · Başlangıç: {fmtTL(APEX_INITIAL_CAPITAL)}</p>
              </div>
              <div className="ml-auto text-right hidden sm:block">
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Win Rate (30G)</p>
                <p className={`text-xl font-bold tabular-nums ${(s.winRate30d ?? 0) >= 55 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {s.winRate30d != null ? `%${s.winRate30d.toFixed(0)}` : '—'}
                </p>
                <p className="text-[10px] text-text-muted">{s.totalTrades} toplam işlem</p>
              </div>
            </div>

            {/* İkincil stat kartları */}
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Nakit', val: fmtTL(s.cash), sub: `%${((s.cash / s.totalValue) * 100).toFixed(0)} nakit`, pos: true },
                { label: 'Max Drawdown', val: fmtPct(s.maxDrawdown), sub: `En iyi işlem: ${s.bestTrade != null ? fmtPct(s.bestTrade) : '—'}`, pos: (s.maxDrawdown ?? 0) > -15 },
                { label: 'Açık Pozisyon', val: `${s.positionCount}`, sub: `Bugün ${positions.filter(p => p.change_today != null).length} fiyat güncel`, pos: true },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-border bg-surface p-4">
                  <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{card.label}</p>
                  <p className={`text-2xl font-bold tabular-nums ${card.pos ? 'text-text-primary' : 'text-red-400'}`}>{card.val}</p>
                  <p className="text-[10px] text-text-muted mt-0.5">{card.sub}</p>
                </div>
              ))}
            </div>

            {/* Grafik */}
            {history.length >= 2 && <MiniChart history={history} />}

            {/* Strateji özeti */}
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Flame className="h-4 w-4 text-orange-400" />
                <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider">APEX Strateji Parametreleri</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                {[
                  { k: 'Giriş Filtresi', v: `Conf ≥${APEX_MIN_CONFLUENCE} + Vol ≥${APEX_MIN_REL_VOL}x` },
                  { k: 'Max Pozisyon', v: '4 hisse / %25 sınır' },
                  { k: 'Stop-Loss', v: `-%${(APEX_STOP_LOSS_PCT * 100).toFixed(0)} (sabit disiplin)` },
                  { k: 'Çıkış', v: 'Trailing stop — kâr al yok' },
                ].map((item) => (
                  <div key={item.k}>
                    <p className="text-text-muted">{item.k}</p>
                    <p className="font-semibold text-text-primary mt-0.5">{item.v}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-border">
              {([
                { key: 'pozisyon',  label: `Açık Pozisyonlar (${s.positionCount})` },
                { key: 'karar',     label: 'İşlem Akışı' },
                { key: 'performans',label: 'Günlük Performans' },
              ] as const).map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    tab === t.key
                      ? 'border-orange-400 text-orange-400'
                      : 'border-transparent text-text-muted hover:text-text-primary'
                  }`}>{t.label}</button>
              ))}
            </div>

            {/* Açık Pozisyonlar */}
            {tab === 'pozisyon' && (
              <div className="space-y-3">
                {positions.length === 0 ? (
                  <div className="rounded-xl border border-orange-500/15 bg-orange-500/3 p-6 text-center">
                    <Activity className="mx-auto h-8 w-8 text-orange-400/40 mb-3" />
                    <p className="text-sm font-semibold text-text-muted mb-2">Açık pozisyon yok</p>
                    <p className="text-xs text-text-muted/60 mb-3">
                      Sonraki tarama: 17:55 TRT · APEX her iş günü kapanışa 15 dk kala çalışır
                    </p>
                    <div className="inline-flex flex-col items-start gap-1 rounded-lg border border-border bg-surface/50 px-4 py-2.5 text-left text-[11px]">
                      <p className="text-text-muted font-medium mb-0.5">Giriş kriterleri (ikisi aynı anda):</p>
                      <p className="text-orange-400/80">Confluence ≥ {APEX_MIN_CONFLUENCE}</p>
                      <p className="text-orange-400/80">Relative Volume ≥ {APEX_MIN_REL_VOL}x (5G ortalaması)</p>
                      <p className="text-text-muted/50 mt-1">Bu kriterler BIST'te nadir — uzun süre pozisyonsuz kalınabilir.</p>
                    </div>
                  </div>
                ) : positions.map((pos) => {
                  const cp        = pos.current_price ?? pos.entry_price;
                  const ret       = pos.live_return_pct ?? ((cp - pos.entry_price) / pos.entry_price) * 100;
                  const pnl       = pos.live_pnl        ?? (cp - pos.entry_price) * pos.shares;
                  const isPos     = ret >= 0;
                  const stopDist  = pos.stop_distance_pct  ?? ((cp - pos.stop_loss)    / cp) * 100;
                  const trailDist = pos.trail_distance_pct ?? ((cp - pos.trailing_stop) / cp) * 100;
                  const dailyPosTL = pos.change_today != null
                    ? (pos.change_today / 100) * cp * pos.shares : null;
                  const stopDanger   = stopDist < 2.5;
                  const signalWeak   = pos.signal_strength === 'zayıf';
                  return (
                    <div key={pos.id} className={`rounded-xl border p-4 ${stopDanger ? 'border-red-500/50' : signalWeak ? 'border-amber-500/30' : isPos ? 'border-orange-500/20 bg-orange-500/3' : 'border-red-500/20 bg-red-500/3'}`}>
                      {/* Uyarı satırı */}
                      {(stopDanger || signalWeak) && (
                        <div className={`flex items-center gap-1.5 mb-2 text-[10px] font-semibold ${stopDanger ? 'text-red-400' : 'text-amber-400'}`}>
                          <AlertTriangle className="h-3 w-3" />
                          {stopDanger ? `APEX stop'a -%${stopDist.toFixed(1)} uzakta — tehlike bölgesi` : `Sinyal zayıflıyor (conf: ${pos.scan_confluence}) — rotasyon adayı`}
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link href={`/hisse/${pos.sembol}`}
                              className="text-base font-black text-text-primary hover:text-orange-400 transition-colors">
                              {pos.sembol}
                            </Link>
                            {pos.change_today != null && (
                              <span className={`text-[10px] font-bold ${pos.change_today >= 0 ? 'text-orange-400' : 'text-red-400'}`}>
                                {pos.change_today >= 0 ? '+' : ''}{pos.change_today.toFixed(1)}% bugün
                                {dailyPosTL != null && (
                                  <span className="opacity-70"> ({dailyPosTL >= 0 ? '+' : ''}{fmtTL(dailyPosTL)})</span>
                                )}
                              </span>
                            )}
                            {pos.scan_confluence != null && (
                              <span className={`text-[9px] border rounded px-1 ${pos.scan_confluence >= 75 ? 'border-orange-500/30 text-orange-400' : pos.scan_confluence >= 55 ? 'border-amber-500/30 text-amber-400' : 'border-red-500/30 text-red-400'}`}>
                                Conf: {pos.scan_confluence}
                              </span>
                            )}
                            {pos.scan_rel_vol5 != null && pos.scan_rel_vol5 >= 2 && (
                              <span className="text-[9px] border border-violet-500/30 text-violet-400 rounded px-1">
                                Vol: {pos.scan_rel_vol5.toFixed(1)}x
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-text-muted mt-0.5">
                            {pos.sector_name} · {fmtDate(pos.entry_date)} · Giriş conf: {pos.entry_confluence ?? '—'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-xl font-black tabular-nums ${isPos ? 'text-orange-400' : 'text-red-400'}`}>
                            {isPos ? '+' : ''}{ret.toFixed(2)}%
                          </p>
                          <p className={`text-xs tabular-nums ${isPos ? 'text-orange-400/70' : 'text-red-400/70'}`}>
                            {isPos ? '+' : ''}{fmtTL(pnl)}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-[10px]">
                        <div
                          className="rounded-md bg-surface/60 px-2 py-1.5 cursor-help"
                          title="Karar anındaki scan_cache kapanış fiyatıdır. BIST'te fiili giriş ertesi açılışta olur — gerçek dünyada %0.3–1.0 slippage olabilir."
                        >
                          <p className="text-text-muted flex items-center gap-0.5">Alım <Info className="h-2.5 w-2.5 opacity-40" /></p>
                          <p className="font-mono font-bold tabular-nums">{pos.entry_price.toFixed(2)}₺</p>
                        </div>
                        <div className="rounded-md bg-surface/60 px-2 py-1.5">
                          <p className="text-text-muted">Güncel</p>
                          <p className="font-mono font-bold tabular-nums">{cp.toFixed(2)}₺</p>
                        </div>
                        <div className="rounded-md bg-red-500/5 border border-red-500/20 px-2 py-1.5">
                          <p className="text-red-400/60">Stop</p>
                          <p className="font-mono font-bold text-red-400 tabular-nums">{pos.stop_loss.toFixed(2)}₺</p>
                          <p className="text-[8px] text-red-400/50">-%{Math.abs(stopDist).toFixed(1)}</p>
                        </div>
                        <div className="rounded-md bg-orange-500/5 border border-orange-500/20 px-2 py-1.5">
                          <p className="text-orange-400/60">Trailing</p>
                          <p className="font-mono font-bold text-orange-400 tabular-nums">{pos.trailing_stop.toFixed(2)}₺</p>
                          <p className="text-[8px] text-orange-400/50">-%{Math.abs(trailDist).toFixed(1)}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex justify-between text-[10px] text-text-muted">
                        <span>{pos.shares} adet · {fmtTL(pos.cost_basis)}</span>
                        <span>Güncel: {fmtTL(cp * pos.shares)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* İşlem Akışı — tradedesk */}
            {tab === 'karar' && (
              <div>
                {decisions.length > 0 && (() => {
                  const today = new Date().toISOString().slice(0, 10);
                  const todayCount = decisions.filter(d => d.decision_date?.startsWith(today)).length;
                  return (
                    <p className="text-[11px] text-text-muted mb-3">
                      Son {decisions.length} işlem
                      {todayCount > 0 && <span className="ml-2 text-orange-400 font-semibold">· Bugün {todayCount} karar</span>}
                    </p>
                  );
                })()}
                <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/40">
                  {decisions.length === 0 ? (
                    <p className="text-center text-text-muted text-sm py-8">Henüz karar yok</p>
                  ) : decisions.map((d) => {
                    const cfg   = ACTION_CFG[d.action] ?? ACTION_CFG.HOLD!;
                    const isBuy  = d.action === 'BUY' || d.action === 'ROTATE_IN';
                    const isSell = d.action === 'SELL' || d.action === 'ROTATE_OUT';
                    const hasOutcome = d.outcome_return != null;
                    const outcomeTL  = hasOutcome && d.shares != null
                      ? (d.outcome_return! / 100) * d.theoretical_price * d.shares : null;
                    return (
                      <div key={d.id} className="flex items-start gap-3 px-4 py-3 hover:bg-white/2 transition-colors">
                        <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${cfg.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-black uppercase tracking-wider ${cfg.cls.split(' ')[0]}`}>
                              {cfg.label}
                            </span>
                            <Link href={`/hisse/${d.sembol}`}
                              className="font-black text-sm text-text-primary hover:text-orange-400 transition-colors">
                              {d.sembol}
                            </Link>
                            {d.shares != null && (
                              <span className="text-[10px] text-text-muted">
                                {d.shares.toFixed(0)} lot · @{d.theoretical_price.toFixed(2)}₺
                              </span>
                            )}
                            {/* Kapalı işlem sonucu */}
                            {hasOutcome && (
                              <span className={`text-[10px] font-bold ml-1 ${(d.outcome_return ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {(d.outcome_return ?? 0) >= 0 ? '↑' : '↓'} {(d.outcome_return ?? 0) >= 0 ? '+' : ''}{d.outcome_return!.toFixed(1)}%
                                {outcomeTL != null && (
                                  <span className="opacity-70"> · {outcomeTL >= 0 ? '+' : ''}{fmtTL(outcomeTL)}</span>
                                )}
                              </span>
                            )}
                            <span className="text-[10px] text-text-muted/50 ml-auto">{fmtDate(d.decision_date)}</span>
                          </div>
                          <p className="text-[11px] text-text-secondary mt-0.5 leading-snug">{d.reason_short}</p>
                          {(d.confluence_score != null || d.rel_vol5 != null) && (
                            <div className="flex gap-2 mt-1 text-[10px] text-text-muted/60">
                              {d.confluence_score != null && <span>Conf: {d.confluence_score}</span>}
                              {d.rel_vol5 != null && <span>Vol: {d.rel_vol5.toFixed(1)}x</span>}
                              {d.stop_loss != null && <span>Stop: {d.stop_loss.toFixed(2)}₺</span>}
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
                      {['Tarih', 'Portföy', 'Günlük', 'Toplam', 'Max DD', 'Win Rate', 'İşlem', 'Poz.'].map((h) => (
                        <th key={h} className="px-3 py-2.5 text-left text-text-muted font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().map((h) => (
                      <tr key={h.snapshot_date} className="border-b border-border/40 hover:bg-white/5">
                        <td className="px-3 py-2 text-text-secondary">{fmtDate(h.snapshot_date)}</td>
                        <td className="px-3 py-2 font-mono tabular-nums">{fmtTL(h.total_value)}</td>
                        <td className={`px-3 py-2 font-bold tabular-nums ${(h.daily_return ?? 0) >= 0 ? 'text-orange-400' : 'text-red-400'}`}>
                          {fmtPct(h.daily_return)}
                        </td>
                        <td className={`px-3 py-2 font-bold tabular-nums ${(h.total_return ?? 0) >= 0 ? 'text-orange-400' : 'text-red-400'}`}>
                          {fmtPct(h.total_return)}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-red-400/70">{fmtPct(h.max_drawdown)}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {h.win_rate_30d != null ? `%${h.win_rate_30d.toFixed(0)}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-text-muted">{h.trades_today}</td>
                        <td className="px-3 py-2 text-text-muted">{h.position_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-center text-[10px] text-text-muted/50 italic">
              Sanal portföy simülasyonu — gerçek para içermez. Yatırım tavsiyesi değildir.
              Geçmiş performans gelecek sonuçları garanti etmez. Agresif strateji yüksek volatilite içerir.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
