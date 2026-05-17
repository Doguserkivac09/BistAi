'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Minus, AlertTriangle,
         BarChart2, Shield, Flame, ChevronUp, ChevronDown, Activity } from 'lucide-react';
import type { InstrumentAnalysis, InstrumentCategory, MacroRegimeSummary } from '@/lib/emtia-instruments';

// ── Format yardımcıları ──────────────────────────────────────────────

function fmtPrice(v: number | null, currency: string) {
  if (v == null) return '—';
  if (currency === 'USD') return '$' + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(v: number | null, showPlus = true) {
  if (v == null) return '—';
  return `${showPlus && v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}
function fmtPctShort(v: number | null) {
  if (v == null) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

// ── Renk yardımcıları ────────────────────────────────────────────────

const DECISION_CFG = {
  AL:  { label: 'AL',  bg: 'bg-emerald-500/15 border-emerald-500/40', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  TUT: { label: 'TUT', bg: 'bg-sky-500/15 border-sky-500/40',         text: 'text-sky-300',     dot: 'bg-sky-400' },
  SAT: { label: 'SAT', bg: 'bg-red-500/15 border-red-500/40',         text: 'text-red-300',     dot: 'bg-red-400' },
};

const CONFIDENCE_CFG = {
  yuksek: { label: 'Yüksek Güven',  cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  orta:   { label: 'Orta Güven',    cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  dusuk:  { label: 'Düşük Güven',  cls: 'text-text-muted bg-surface border-border' },
};

const VOL_CFG = {
  dusuk:    { label: '🟢 Düşük Volatilite',   cls: 'text-emerald-400' },
  normal:   { label: '🟡 Normal Volatilite',   cls: 'text-amber-400' },
  yukseldi: { label: '🟠 Yükselen Volatilite', cls: 'text-orange-400' },
  yuksek:   { label: '🔴 Yüksek Volatilite',  cls: 'text-red-400' },
};

const MTF_CFG = {
  uyumlu:  { label: '✓ MTF Uyumlu',  cls: 'text-emerald-400' },
  karisik: { label: '⚡ MTF Karışık', cls: 'text-amber-400' },
  ters:    { label: '✗ MTF Ters',    cls: 'text-red-400' },
};

const TREND_ICON = {
  yukari: <ChevronUp className="h-3.5 w-3.5 text-emerald-400" />,
  asagi:  <ChevronDown className="h-3.5 w-3.5 text-red-400" />,
  yatay:  <Minus className="h-3.5 w-3.5 text-text-muted" />,
};

const CAT_LABELS: Record<InstrumentCategory, string> = {
  endeks: '📈 Endeksler',
  emtia:  '🏅 Emtia',
  doviz:  '💱 Döviz',
};

// ── Makro Rejim Paneli ───────────────────────────────────────────────

function MacroPanel({ regime }: { regime: MacroRegimeSummary }) {
  const isRiskOff = regime.regime === 'risk_off';
  const isRiskOn  = regime.regime === 'risk_on';
  const borderCls = isRiskOff ? 'border-red-500/30 bg-red-500/5'
    : isRiskOn ? 'border-emerald-500/30 bg-emerald-500/5'
    : 'border-amber-500/30 bg-amber-500/5';

  return (
    <div className={`rounded-xl border p-5 mb-6 ${borderCls}`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-5 w-5 text-text-muted" />
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Makro Piyasa Ortamı</h2>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-bold text-text-primary">{regime.regimeLabel}</span>
            {/* Risk barı */}
            <div className="flex-1 max-w-32 h-2 rounded-full bg-surface overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isRiskOff ? 'bg-red-500' : isRiskOn ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${regime.riskScore}%` }}
              />
            </div>
            <span className="text-xs text-text-muted">Risk: {regime.riskScore}/100</span>
          </div>
          <p className="text-sm text-text-secondary">{regime.regimeDesc}</p>
        </div>
        {/* Sinyal listesi */}
        {regime.signals.length > 0 && (
          <div className="shrink-0 sm:max-w-xs">
            <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Piyasa Sinyalleri</p>
            <ul className="space-y-1">
              {regime.signals.slice(0, 4).map((s, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] text-text-secondary">
                  <span className="shrink-0 mt-0.5 text-text-muted">›</span>{s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Momentum Şeridi ──────────────────────────────────────────────────

function MomentumBar({ instruments }: { instruments: InstrumentAnalysis[] }) {
  const valid = instruments.filter((i) => i.momentum5d != null && !i.error);
  const sorted = [...valid].sort((a, b) => (b.momentum5d ?? 0) - (a.momentum5d ?? 0));

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-text-muted" />
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">5 Günlük Momentum Sıralaması</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {sorted.map((inst) => {
          const m = inst.momentum5d ?? 0;
          const isPos = m >= 0;
          return (
            <div key={inst.symbol} className={`rounded-lg border px-2 py-1.5 text-center ${isPos ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
              <p className="text-[10px] text-text-muted font-medium">{inst.nameShort}</p>
              <p className={`text-sm font-bold tabular-nums ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmtPctShort(m)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Enstrüman Kartı ──────────────────────────────────────────────────

function InstrumentCard({ inst }: { inst: InstrumentAnalysis }) {
  const [showFactors, setShowFactors] = useState(false);
  const dcfg  = DECISION_CFG[inst.decision];
  const chg   = inst.changePercent ?? 0;
  const ChangeIcon = chg > 0 ? TrendingUp : chg < 0 ? TrendingDown : Minus;
  const chgColor = chg > 0 ? 'text-emerald-400' : chg < 0 ? 'text-red-400' : 'text-text-muted';
  const rsiColor = !inst.rsi ? 'text-text-muted'
    : inst.rsi >= 70 ? 'text-red-400' : inst.rsi <= 30 ? 'text-emerald-400' : 'text-text-secondary';
  const confCfg = CONFIDENCE_CFG[inst.confidence ?? 'dusuk'];

  if (inst.error) {
    return (
      <div className="rounded-xl border border-border bg-surface/30 p-4 opacity-50 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
        <div>
          <p className="font-semibold text-text-primary text-sm">{inst.icon} {inst.name}</p>
          <p className="text-xs text-text-muted">Veri alınamadı</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-3 hover:border-primary/30 transition">

      {/* Başlık */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl shrink-0">{inst.icon}</span>
          <div className="min-w-0">
            <p className="font-bold text-text-primary text-sm leading-tight">{inst.name}</p>
            <p className="text-[10px] text-text-muted truncate">{inst.desc}</p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm font-bold shrink-0 ${dcfg.bg} ${dcfg.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${dcfg.dot}`} />
          {dcfg.label}
        </div>
      </div>

      {/* Fiyat + değişim */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-bold tabular-nums text-text-primary leading-tight">
            {fmtPrice(inst.lastClose, inst.currency)}
            <span className="text-xs text-text-muted ml-1">{inst.currency}</span>
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`flex items-center gap-0.5 text-sm font-semibold ${chgColor}`}>
              <ChangeIcon className="h-3.5 w-3.5" />{fmtPct(inst.changePercent)}
            </span>
            {inst.momentum5d != null && (
              <span className="text-[10px] text-text-muted">5G: {fmtPctShort(inst.momentum5d)}</span>
            )}
            {inst.momentum30d != null && (
              <span className="text-[10px] text-text-muted">1A: {fmtPctShort(inst.momentum30d)}</span>
            )}
          </div>
        </div>
        {/* Skor */}
        {inst.confluenceScore != null && (
          <div className={`flex flex-col items-center rounded-xl border px-2.5 py-1 ${dcfg.bg} ${dcfg.text}`}>
            <span className="text-[8px] uppercase tracking-wider opacity-60">Skor</span>
            <span className="text-lg font-bold leading-none">{inst.confluenceScore}</span>
          </div>
        )}
      </div>

      {/* Teknik metrikler */}
      <div className="grid grid-cols-4 gap-1.5 text-[10px]">
        <div className="rounded-md bg-surface/60 border border-border/40 px-1.5 py-1">
          <p className="text-text-muted">RSI(G)</p>
          <p className={`font-bold tabular-nums ${rsiColor}`}>{inst.rsi?.toFixed(1) ?? '—'}</p>
        </div>
        <div className="rounded-md bg-surface/60 border border-border/40 px-1.5 py-1">
          <p className="text-text-muted">RSI(H)</p>
          <p className={`font-bold tabular-nums ${
            !inst.weeklyRsi ? 'text-text-muted'
              : inst.weeklyRsi >= 70 ? 'text-red-400'
              : inst.weeklyRsi <= 30 ? 'text-emerald-400'
              : 'text-text-secondary'
          }`}>{inst.weeklyRsi?.toFixed(1) ?? '—'}</p>
        </div>
        <div className="rounded-md bg-surface/60 border border-border/40 px-1.5 py-1">
          <p className="text-text-muted">ATR%</p>
          <p className={`font-bold tabular-nums ${
            inst.volatilityLevel === 'yuksek' ? 'text-red-400' :
            inst.volatilityLevel === 'yukseldi' ? 'text-orange-400' :
            inst.volatilityLevel === 'dusuk' ? 'text-emerald-400' : 'text-text-secondary'
          }`}>{inst.atrPct?.toFixed(1) ?? '—'}%</p>
        </div>
        <div className="rounded-md bg-surface/60 border border-border/40 px-1.5 py-1">
          <p className="text-text-muted">Hacim</p>
          <p className="font-bold tabular-nums text-text-secondary">{inst.relVol5 != null ? `${inst.relVol5}x` : '—'}</p>
        </div>
      </div>

      {/* MTF + Volatilite + Trend */}
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        {inst.mtfAlignment && (
          <span className={`${MTF_CFG[inst.mtfAlignment].cls} font-medium`}>
            {MTF_CFG[inst.mtfAlignment].label}
          </span>
        )}
        {inst.volatilityLevel && (
          <span className={VOL_CFG[inst.volatilityLevel].cls}>
            {VOL_CFG[inst.volatilityLevel].label}
          </span>
        )}
        {inst.weeklyTrend && (
          <span className="flex items-center gap-0.5 text-text-muted">
            Haftalık: {TREND_ICON[inst.weeklyTrend]}
          </span>
        )}
        {inst.pctFromHigh != null && (
          <span className={inst.pctFromHigh < -15 ? 'text-emerald-400' : 'text-text-muted'}>
            Zirve: {fmtPct(inst.pctFromHigh, false)}
          </span>
        )}
      </div>

      {/* Destek / Direnç / Pivot */}
      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
        {inst.pivotS1 != null && (
          <div className="rounded-md bg-emerald-500/5 border border-emerald-500/20 px-2 py-1">
            <p className="text-emerald-400/60">Pivot S1</p>
            <p className="font-mono font-semibold text-emerald-400 tabular-nums">{fmtPrice(inst.pivotS1, inst.currency)}</p>
          </div>
        )}
        {inst.pivotR1 != null && (
          <div className="rounded-md bg-red-500/5 border border-red-500/20 px-2 py-1">
            <p className="text-red-400/60">Pivot R1</p>
            <p className="font-mono font-semibold text-red-400 tabular-nums">{fmtPrice(inst.pivotR1, inst.currency)}</p>
          </div>
        )}
        {inst.support52w != null && (
          <div className="rounded-md bg-surface/40 border border-border/40 px-2 py-1">
            <p className="text-text-muted">52H Dip</p>
            <p className="font-mono font-semibold text-text-secondary tabular-nums">{fmtPrice(inst.support52w, inst.currency)}</p>
          </div>
        )}
        {inst.resistance52w != null && (
          <div className="rounded-md bg-surface/40 border border-border/40 px-2 py-1">
            <p className="text-text-muted">52H Zirve</p>
            <p className="font-mono font-semibold text-text-secondary tabular-nums">{fmtPrice(inst.resistance52w, inst.currency)}</p>
          </div>
        )}
      </div>

      {/* Gerekçe */}
      <div className="border-t border-border/40 pt-2.5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className={`text-[10px] rounded-full border px-2 py-0.5 font-medium ${confCfg.cls}`}>
            {confCfg.label}
          </span>
          {(inst.bullFactors.length > 0 || inst.bearFactors.length > 0) && (
            <button onClick={() => setShowFactors((p) => !p)}
              className="text-[10px] text-text-muted hover:text-text-secondary transition">
              {showFactors ? 'Gizle ▲' : 'Faktörler ▼'}
            </button>
          )}
        </div>
        <p className="text-[11px] text-text-secondary leading-snug">{inst.keyReason}</p>

        {showFactors && (
          <div className="mt-2 space-y-1">
            {inst.bullFactors.map((f, i) => (
              <div key={i} className="flex items-start gap-1 text-[10px] text-emerald-400">
                <span className="shrink-0">▲</span>{f}
              </div>
            ))}
            {inst.bearFactors.map((f, i) => (
              <div key={i} className="flex items-start gap-1 text-[10px] text-red-400">
                <span className="shrink-0">▼</span>{f}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sinyal chip'leri */}
      {inst.signals.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {inst.signals.slice(0, 3).map((s, i) => (
            <span key={i} className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold border ${
              s.direction === 'yukari' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                : s.direction === 'asagi' ? 'bg-red-500/10 border-red-500/25 text-red-400'
                : 'bg-sky-500/10 border-sky-500/25 text-sky-400'
            }`}>{s.type}</span>
          ))}
          {inst.signals.length > 3 && (
            <span className="text-[9px] text-text-muted self-center">+{inst.signals.length - 3}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Ana Sayfa ────────────────────────────────────────────────────────

export default function EmtiaEndeksPage() {
  const [instruments, setInstruments] = useState<InstrumentAnalysis[]>([]);
  const [regime, setRegime]           = useState<MacroRegimeSummary | null>(null);
  const [loading, setLoading]         = useState(true);
  const [cached, setCached]           = useState(false);
  const [lastUpdate, setLastUpdate]   = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/emtia-analiz');
      const json = await res.json();
      setInstruments(json.instruments ?? []);
      setRegime(json.regime ?? null);
      setCached(json.cached ?? false);
      setLastUpdate(new Date().toLocaleTimeString('tr-TR'));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const groups: Record<InstrumentCategory, InstrumentAnalysis[]> = {
    endeks: instruments.filter((d) => d.category === 'endeks'),
    emtia:  instruments.filter((d) => d.category === 'emtia'),
    doviz:  instruments.filter((d) => d.category === 'doviz'),
  };

  const alCount  = instruments.filter((d) => d.decision === 'AL').length;
  const satCount = instruments.filter((d) => d.decision === 'SAT').length;
  const tutCount = instruments.filter((d) => d.decision === 'TUT').length;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-6xl px-4 py-8">

        {/* Başlık */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold text-text-primary">Emtia & Endeks Analizi</h1>
            </div>
            <p className="text-sm text-text-secondary">
              Günlük + haftalık MTF · ATR volatilite · Pivot seviyeleri · Makro rejim tespiti
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {lastUpdate && (
              <span className="text-xs text-text-muted">
                {cached ? '⚡ Cache (15dk)' : '🔄 Canlı'} · {lastUpdate}
              </span>
            )}
            <button onClick={() => void fetchData()} disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/50 px-3 py-2 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          </div>
        </div>

        {/* Makro Rejim */}
        {!loading && regime && <MacroPanel regime={regime} />}

        {/* Özet bar */}
        {!loading && instruments.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-2 items-center">
            {[
              { label: 'AL',  count: alCount,  cls: 'border-emerald-500/30 bg-emerald-500/8 text-emerald-400' },
              { label: 'TUT', count: tutCount, cls: 'border-sky-500/30 bg-sky-500/8 text-sky-400' },
              { label: 'SAT', count: satCount, cls: 'border-red-500/30 bg-red-500/8 text-red-400' },
            ].map((s) => (
              <div key={s.label} className={`flex items-center gap-2 rounded-lg border px-4 py-2 ${s.cls}`}>
                <span className="text-lg font-bold tabular-nums">{s.count}</span>
                <span className="text-xs font-medium">{s.label}</span>
              </div>
            ))}
            <span className="text-xs text-text-muted">{instruments.length} enstrüman</span>
            <div className="ml-auto flex items-center gap-1 text-[10px] text-text-muted border border-border rounded-lg px-3 py-1.5">
              <Flame className="h-3 w-3 text-amber-400" />
              RSI(G) = Günlük · RSI(H) = Haftalık · ATR% = Volatilite · MTF = Çoklu Zaman Dilimi
            </div>
          </div>
        )}

        {/* Momentum şeridi */}
        {!loading && instruments.some((i) => i.momentum5d != null) && (
          <MomentumBar instruments={instruments} />
        )}

        {/* Yükleniyor */}
        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-72 rounded-xl border border-border bg-surface/30 animate-pulse" />
            ))}
          </div>
        )}

        {/* Kategoriler */}
        {!loading && (['endeks', 'emtia', 'doviz'] as InstrumentCategory[]).map((cat) => {
          const items = groups[cat];
          if (items.length === 0) return null;
          return (
            <div key={cat} className="mb-8">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
                {CAT_LABELS[cat]}
                <span className="h-px flex-1 bg-border/50" />
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((inst) => (
                  <InstrumentCard key={inst.symbol} inst={inst} />
                ))}
              </div>
            </div>
          );
        })}

        {/* Yasal uyarı */}
        <div className="mt-8 rounded-xl border border-border/30 bg-surface/20 p-4 text-[11px] text-text-muted space-y-1">
          <p className="font-semibold">⚠️ Önemli Uyarı</p>
          <p>Bu sayfa teknik analiz araçları kullanılarak üretilmiş bilgilendirme içeriğidir. Yatırım tavsiyesi veya finansal danışmanlık hizmeti değildir. Geçmiş performans gelecekteki sonuçların garantisi değildir. Veriler 15 dakikaya kadar gecikmeli olabilir. Emtia, endeks ve döviz yatırımları yüksek risk içerir; yatırım kararlarınızı bağımsız bir finansal danışmana onaylatmadan uygulamayınız.</p>
        </div>
      </main>
    </div>
  );
}
