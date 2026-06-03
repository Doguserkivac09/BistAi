'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw, Shield, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

type Period = 'gunluk' | 'haftalik' | 'tumu';

interface Pos {
  id: string; sembol: string; shares: number; entry_week: number; entry_year: number;
  entry_price: number; current_price: number | null; stop_loss: number; trailing_stop: number | null;
  live_return_pct: number; live_pnl: number;
  stop_distance_pct: number | null; change_today: number | null; scan_confluence: number | null;
}
interface Hist { week_number: number; year: number; total_value: number; weekly_return: number | null; bist_return: number | null; alpha: number | null; }
interface Txn {
  id: string; week_number: number; year: number; sembol: string; action: string;
  shares: number | null; theoretical_price: number; cost_or_proceeds: number; reason_short: string;
}
interface Sum {
  totalValue: number; cash: number; positionsValue: number;
  totalReturn: number; initialCapital: number; maxDrawdown: number;
  positionCount: number; weeklyReturn: number; alpha: number;
  riskAlert: string | null;
}

function fmtTL(v: number) {
  return v.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + '₺';
}

function SparkLine({ vals, color }: { vals: number[]; color: string }) {
  if (vals.length < 2) return null;
  const min = Math.min(...vals) * 0.998, max = Math.max(...vals) * 1.002;
  const W = 200, H = 40;
  const pts = vals.map((v, i) =>
    `${((i / (vals.length - 1)) * W).toFixed(1)},${(H - ((v - min) / (max - min || 1)) * H).toFixed(1)}`
  ).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-10">
      <defs>
        <linearGradient id="aegSpk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#aegSpk)" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export default function YapayZekaPortfoyuPage() {
  const [sum,     setSum]     = useState<Sum | null>(null);
  const [pos,     setPos]     = useState<Pos[]>([]);
  const [hist,    setHist]    = useState<Hist[]>([]);
  const [txns,    setTxns]    = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [period,  setPeriod]  = useState<Period>('haftalik');
  const [showTxns, setShowTxns] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/ai-portfolio');
      const j = await r.json();
      setSum(j.summary); setPos(j.positions ?? []); setHist(j.history ?? []); setTxns(j.decisions ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  let pnl = 0, pnlPct = 0;
  if (sum) {
    if (period === 'gunluk') {
      pnl = pos.reduce((s, p) => {
        if (p.change_today == null) return s;
        const cp = p.current_price ?? p.entry_price;
        return s + (p.change_today / 100) * cp * p.shares;
      }, 0);
      pnlPct = sum.totalValue > 0 ? (pnl / sum.totalValue) * 100 : 0;
    } else if (period === 'haftalik') {
      pnl = (sum.weeklyReturn / 100) * sum.totalValue;
      pnlPct = sum.weeklyReturn;
    } else {
      pnl = sum.totalValue - sum.initialCapital;
      pnlPct = sum.totalReturn;
    }
  }

  const isPos = pnl >= 0;
  const COL = isPos ? '#10b981' : '#ef4444';
  const chartVals = hist.map(h => h.total_value);
  const activeTxns = txns.filter(t => t.action !== 'HOLD');

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-md px-4 py-8">

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-400" />
            <span className="text-xl font-black text-emerald-400">Aegis</span>
            <span className="text-xl">🇹🇷</span>
            <span className="text-[10px] border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 rounded-full px-2 py-0.5 font-bold uppercase">Orta Risk</span>
          </div>
          <button onClick={() => void load()} disabled={loading} className="text-text-muted hover:text-text-primary disabled:opacity-40">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-2xl bg-surface/30 animate-pulse" />)}
          </div>
        )}

        {!loading && !sum && (
          <div className="text-center py-16">
            <Shield className="mx-auto h-10 w-10 text-emerald-400/40 mb-3" />
            <p className="text-text-muted text-sm">Aegis Portföy henüz başlatılmadı</p>
            <p className="text-[11px] text-text-muted/60 mt-1">Pazartesi 09:00 TRT · Claude haftalık kararlar verir</p>
          </div>
        )}

        {!loading && sum && (
          <div className="space-y-3">

            {/* Risk uyarısı */}
            {sum.riskAlert && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                <p className="text-xs text-amber-300">{sum.riskAlert}</p>
              </div>
            )}

            {/* Bakiye */}
            <div className="rounded-2xl border border-border bg-surface p-5 text-center">
              <p className="text-[11px] text-text-muted uppercase tracking-widest mb-1">Toplam Değer</p>
              <p className="text-4xl font-black tabular-nums text-text-primary">{fmtTL(sum.totalValue)}</p>
              <p className="text-xs text-text-muted mt-1">
                Başlangıç {fmtTL(sum.initialCapital)}
                {sum.alpha != null && (
                  <span className={`ml-2 font-semibold ${sum.alpha >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    · Alpha {sum.alpha >= 0 ? '+' : ''}{sum.alpha.toFixed(1)}% vs BIST100
                  </span>
                )}
              </p>
            </div>

            {/* P&L + toggle */}
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex rounded-lg bg-background/60 p-1 mb-4 gap-1">
                {(['gunluk', 'haftalik', 'tumu'] as Period[]).map((p) => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
                      period === p ? 'bg-emerald-500/20 text-emerald-400' : 'text-text-muted hover:text-text-primary'
                    }`}>
                    {p === 'gunluk' ? 'Günlük' : p === 'haftalik' ? 'Haftalık' : 'Tümü'}
                  </button>
                ))}
              </div>
              <div className={`text-center mb-3 ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                <p className="text-3xl font-black tabular-nums">{isPos ? '+' : ''}{fmtTL(pnl)}</p>
                <p className="text-sm font-bold mt-0.5 opacity-80">{isPos ? '+' : ''}{pnlPct.toFixed(2)}%</p>
              </div>
              {chartVals.length >= 2 && (
                <>
                  <SparkLine vals={chartVals} color={COL} />
                  {hist.length > 0 && (
                    <div className="flex justify-between text-[9px] text-text-muted mt-0.5">
                      <span>H{hist[0]!.week_number}/{hist[0]!.year}</span>
                      <span>H{hist.at(-1)!.week_number}/{hist.at(-1)!.year}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Pozisyonlar */}
            <div className="rounded-2xl border border-border bg-surface overflow-hidden">
              <div className="px-4 py-3 border-b border-border/50">
                <p className="text-xs font-semibold text-text-primary">Pozisyonlar · {sum.positionCount}</p>
              </div>
              {pos.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs text-text-muted">Açık pozisyon yok</p>
                  <p className="text-[10px] text-text-muted/60 mt-1">Pazartesi 09:00 TRT — Claude haftalık kararlar verir</p>
                </div>
              ) : pos.map((p, i) => {
                const cp   = p.current_price ?? p.entry_price;
                const ret  = p.live_return_pct ?? ((cp - p.entry_price) / p.entry_price) * 100;
                const pnlA = p.live_pnl ?? (cp - p.entry_price) * p.shares;
                const rPos = ret >= 0;
                const stopPct = p.stop_distance_pct ?? ((cp - p.stop_loss) / cp) * 100;
                const nearStop = stopPct < 3;
                return (
                  <div key={p.id} className={`flex items-center px-4 py-3 ${i < pos.length - 1 ? 'border-b border-border/30' : ''} ${nearStop ? 'bg-red-500/5' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/hisse/${p.sembol}`} className="font-bold text-sm text-text-primary hover:text-emerald-400">{p.sembol}</Link>
                        {nearStop && <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />}
                        {p.change_today != null && (
                          <span className={`text-[10px] ${p.change_today >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {p.change_today >= 0 ? '+' : ''}{p.change_today.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-text-muted mt-0.5">
                        {p.shares} adet · @{p.entry_price.toFixed(2)}₺ · Hafta {p.entry_week}/{p.entry_year}
                      </p>
                    </div>
                    <div className="text-right ml-3 shrink-0">
                      <p className={`text-sm font-bold tabular-nums ${rPos ? 'text-emerald-400' : 'text-red-400'}`}>
                        {rPos ? '+' : ''}{ret.toFixed(2)}%
                      </p>
                      <p className={`text-[10px] tabular-nums ${rPos ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                        {rPos ? '+' : ''}{fmtTL(pnlA)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* İstatistikler */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Bu Hafta', val: `${(sum.weeklyReturn ?? 0) >= 0 ? '+' : ''}${(sum.weeklyReturn ?? 0).toFixed(1)}%` },
                { label: 'Max DD',   val: `${sum.maxDrawdown.toFixed(1)}%` },
                { label: 'Nakit',    val: `%${((sum.cash / sum.totalValue) * 100).toFixed(0)}` },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-surface p-3 text-center">
                  <p className="text-[10px] text-text-muted mb-1">{s.label}</p>
                  <p className="text-base font-bold text-text-primary tabular-nums">{s.val}</p>
                </div>
              ))}
            </div>

            {/* İşlemler */}
            {activeTxns.length > 0 && (
              <div className="rounded-2xl border border-border bg-surface overflow-hidden">
                <button onClick={() => setShowTxns(!showTxns)}
                  className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-text-primary hover:bg-white/2 transition-colors">
                  <span>İşlemler ({activeTxns.length})</span>
                  {showTxns ? <ChevronUp className="h-4 w-4 text-text-muted" /> : <ChevronDown className="h-4 w-4 text-text-muted" />}
                </button>
                {showTxns && (
                  <div className="divide-y divide-border/30 border-t border-border/50">
                    {activeTxns.map((t) => {
                      const isBuy  = t.action === 'BUY';
                      const isSell = t.action === 'SELL' || t.action === 'PARTIAL_SELL';
                      const dotCls = isBuy ? 'bg-emerald-400' : isSell ? 'bg-red-400' : 'bg-amber-400';
                      const lblCls = isBuy ? 'text-emerald-400' : isSell ? 'text-red-400' : 'text-amber-400';
                      const lbl    = t.action === 'BUY' ? 'GİRİŞ' : t.action === 'SELL' ? 'ÇIKIŞ' : 'KISMI SAT';
                      return (
                        <div key={t.id} className="flex items-start gap-3 px-4 py-2.5">
                          <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${dotCls}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[10px] font-bold uppercase ${lblCls}`}>{lbl}</span>
                              <Link href={`/hisse/${t.sembol}`} className="text-sm font-bold text-text-primary hover:text-emerald-400">{t.sembol}</Link>
                              {t.shares != null && (
                                <span className="text-[10px] text-text-muted">{t.shares.toFixed(0)} lot · @{t.theoretical_price.toFixed(2)}₺</span>
                              )}
                              <span className="ml-auto text-[10px] text-text-muted/50">H{t.week_number}/{t.year}</span>
                            </div>
                            <p className="text-[10px] text-text-secondary mt-0.5 leading-snug">{t.reason_short}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <p className="text-center text-[10px] text-text-muted/40 italic">
              Sanal portföy · gerçek para içermez · yatırım tavsiyesi değildir
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
