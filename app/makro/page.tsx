'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, TrendingUp, TrendingDown, Minus, AlertTriangle, Shield, BarChart3, Globe, Building2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

// ── Türler ──────────────────────────────────────────────────────────

interface MacroComponent {
  name: string;
  weight: number;
  rawScore: number;
  weightedScore: number;
  signal: 'positive' | 'neutral' | 'negative';
  detail: string;
}

interface MacroResponse {
  score: {
    score: number;
    wind: string;
    color: string;
    label: string;
    components: MacroComponent[];
    calculatedAt: string;
  };
  indicators: {
    vix: { price: number; change: number; changePercent: number } | null;
    dxy: { price: number; change: number; changePercent: number } | null;
    us10y: { price: number; change: number; changePercent: number } | null;
    usdtry: { price: number; change: number; changePercent: number } | null;
    eem: { price: number; change: number; changePercent: number } | null;
    brent: { price: number; change: number; changePercent: number } | null;
  };
  turkey: {
    policyRate: { value: number; [key: string]: unknown } | number | null;
    cds5y: { value: number; [key: string]: unknown } | number | null;
    inflation: { value: number; [key: string]: unknown } | number | null;
  };
  fred: {
    fedFundsRate: { value: number; date: string; change: number } | null;
    gdpGrowth: { value: number; date: string } | null;
    unemployment: { value: number; date: string } | null;
  };
  usEconomy: {
    score: number;
    label: string;
    color: string;
  } | null;
  fetchedAt: string;
}

interface RiskComponent {
  name: string;
  weight: number;
  score: number;
  weightedScore: number;
  detail: string;
}

interface RiskResponse {
  score: number;
  level: string;
  color: string;
  label: string;
  emoji: string;
  components: RiskComponent[];
  recommendation: string;
  calculatedAt: string;
}

interface SectorItem {
  sectorId: string;
  sectorName: string;
  shortName: string;
  compositeScore: number;
  priceMomentum: number;
  perf20d: number;
  signal: string;
  color: string;
  reasoning: string;
  symbolCount: number;
}

interface SectorsResponse {
  sectors: SectorItem[];
  bestSector: SectorItem | null;
  worstSector: SectorItem | null;
}

interface AlertItem {
  id: string;
  category: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  emoji: string;
}

interface AlertsResponse {
  alerts: AlertItem[];
  count: number;
}

// ── Yardımcı Fonksiyonlar ───────────────────────────────────────────

function scoreColor(score: number, type: 'macro' | 'risk' = 'macro'): string {
  if (type === 'risk') {
    if (score <= 25) return 'text-green-400';
    if (score <= 50) return 'text-yellow-400';
    if (score <= 75) return 'text-orange-400';
    return 'text-red-400';
  }
  // macro: -100 to +100
  if (score >= 30) return 'text-green-400';
  if (score >= 0) return 'text-green-300';
  if (score >= -30) return 'text-yellow-400';
  return 'text-red-400';
}

function scoreBg(score: number, type: 'macro' | 'risk' = 'macro'): string {
  if (type === 'risk') {
    if (score <= 25) return 'bg-green-500/10 border-green-500/30';
    if (score <= 50) return 'bg-yellow-500/10 border-yellow-500/30';
    if (score <= 75) return 'bg-orange-500/10 border-orange-500/30';
    return 'bg-red-500/10 border-red-500/30';
  }
  if (score >= 30) return 'bg-green-500/10 border-green-500/30';
  if (score >= 0) return 'bg-green-500/5 border-green-500/20';
  if (score >= -30) return 'bg-yellow-500/10 border-yellow-500/30';
  return 'bg-red-500/10 border-red-500/30';
}

function changeIcon(val: number) {
  if (val > 0) return <TrendingUp className="h-4 w-4 text-green-400" />;
  if (val < 0) return <TrendingDown className="h-4 w-4 text-red-400" />;
  return <Minus className="h-4 w-4 text-text-secondary" />;
}

function formatChange(val: number | undefined | null): string {
  if (val == null) return '—';
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

function changeColor(val: number | undefined | null): string {
  if (val == null) return 'text-text-secondary';
  if (val > 0) return 'text-green-400';
  if (val < 0) return 'text-red-400';
  return 'text-text-secondary';
}

function sectorScoreColor(score: number): string {
  if (score >= 30) return 'bg-green-500';
  if (score >= 10) return 'bg-green-400';
  if (score >= -10) return 'bg-yellow-500';
  if (score >= -30) return 'bg-orange-500';
  return 'bg-red-500';
}

function severityStyle(severity: 'info' | 'warning' | 'critical'): string {
  switch (severity) {
    case 'critical': return 'border-red-500/40 bg-red-500/10';
    case 'warning': return 'border-orange-500/40 bg-orange-500/10';
    default: return 'border-blue-500/40 bg-blue-500/10';
  }
}

// ── Gauge Bileşeni ──────────────────────────────────────────────────

function MacroGauge({ score, label }: { score: number; label: string }) {
  // -100 to +100 → 0 to 180 derece
  const angle = ((score + 100) / 200) * 180;
  const radians = (angle * Math.PI) / 180;
  const cx = 100, cy = 100, r = 75;
  const needleX = cx + r * 0.85 * Math.cos(Math.PI - radians);
  const needleY = cy - r * 0.85 * Math.sin(Math.PI - radians);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 120" className="w-full max-w-56 h-auto" role="img" aria-label={`Makro skor: ${score}`}>
        {/* Background arc */}
        <path d="M 25 100 A 75 75 0 0 1 175 100" fill="none" stroke="currentColor" strokeWidth="12" className="text-surface" />
        {/* Red zone */}
        <path d="M 25 100 A 75 75 0 0 1 50 41" fill="none" stroke="#ef4444" strokeWidth="12" strokeLinecap="round" />
        {/* Orange zone */}
        <path d="M 50 41 A 75 75 0 0 1 100 25" fill="none" stroke="#f97316" strokeWidth="12" />
        {/* Yellow zone */}
        <path d="M 100 25 A 75 75 0 0 1 150 41" fill="none" stroke="#eab308" strokeWidth="12" />
        {/* Green zone */}
        <path d="M 150 41 A 75 75 0 0 1 175 100" fill="none" stroke="#22c55e" strokeWidth="12" strokeLinecap="round" />
        {/* Needle */}
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="4" fill="white" />
        {/* Score text */}
        <text x={cx} y={cy + 15} textAnchor="middle" className="fill-text-primary text-lg font-bold" fontSize="22">{score > 0 ? '+' : ''}{score}</text>
      </svg>
      <span className={`text-sm font-semibold mt-1 ${scoreColor(score, 'macro')}`}>{label}</span>
    </div>
  );
}

function RiskGaugeSmall({ score, label, emoji }: { score: number; label: string; emoji: string }) {
  const pct = Math.min(score, 100);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-surface" />
          <circle cx="50" cy="50" r="40" fill="none" strokeWidth="8"
            stroke={score <= 25 ? '#22c55e' : score <= 50 ? '#eab308' : score <= 75 ? '#f97316' : '#ef4444'}
            strokeDasharray={`${(pct / 100) * 251.3} 251.3`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-text-primary">{score}</span>
          <span className="text-xs">{emoji}</span>
        </div>
      </div>
      <span className={`text-xs font-semibold ${scoreColor(score, 'risk')}`}>{label}</span>
    </div>
  );
}

// ── Ana Sayfa Bileşeni ──────────────────────────────────────────────

export default function MakroPage() {
  const [macro, setMacro] = useState<MacroResponse | null>(null);
  const [risk, setRisk] = useState<RiskResponse | null>(null);
  const [sectors, setSectors] = useState<SectorsResponse | null>(null);
  const [alerts, setAlerts] = useState<AlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [macroRes, riskRes, sectorsRes, alertsRes] = await Promise.all([
        fetch('/api/macro').then(r => r.json()),
        fetch('/api/risk').then(r => r.json()),
        fetch('/api/sectors').then(r => r.json()),
        fetch('/api/alerts').then(r => r.json()),
      ]);
      if (macroRes.error) throw new Error(macroRes.error);
      setMacro(macroRes);
      setRisk(riskRes.error ? null : riskRes);
      setSectors(sectorsRes.error ? null : sectorsRes);
      setAlerts(alertsRes.error ? null : alertsRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Veri yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <main className="container mx-auto px-4 py-6">
          {/* Header skeleton */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-9 w-20" />
          </div>
          {/* Score cards skeleton */}
          <div className="grid gap-4 md:grid-cols-2 mb-6">
            <Skeleton className="h-64 rounded-lg" />
            <Skeleton className="h-64 rounded-lg" />
          </div>
          {/* Indicators skeleton */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
          {/* Country cards skeleton */}
          <div className="grid gap-4 md:grid-cols-2 mb-6">
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
          </div>
          {/* Sector grid skeleton */}
          <Skeleton className="h-6 w-40 mb-3" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (error || !macro) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="border-red-500/30 bg-red-500/5 max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-3" />
            <p className="text-red-400 font-medium">{error ?? 'Veri yüklenemedi'}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={fetchAll}>
              Tekrar Dene
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const ind = macro.indicators;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
              <Globe className="h-6 w-6 text-primary" />
              Makro Radar
            </h1>
            <p className="text-text-secondary text-sm mt-1">
              Global makro göstergeler, risk analizi ve sektör momentum
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>

        {/* Alerts */}
        {alerts && alerts.alerts.length > 0 && (
          <section className="mb-6">
            <div className="flex flex-col gap-2">
              {alerts.alerts.slice(0, 3).map((a) => (
                <div key={a.id} className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${severityStyle(a.severity)}`}>
                  <span className="text-lg mt-0.5">{a.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">{a.title}</p>
                    <p className="text-xs text-text-secondary mt-0.5">{a.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Makro Skor + Risk Skoru */}
        <section className="grid gap-4 md:grid-cols-2 mb-6">
          {/* Makro Skor */}
          <Card className={`border ${scoreBg(macro.score.score, 'macro')}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-secondary flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Makro Rüzgar Skoru
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center pb-4">
              <MacroGauge score={macro.score.score} label={macro.score.label} />
              <div className="w-full mt-4 space-y-1.5">
                {macro.score.components.map((c) => (
                  <div key={c.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      {c.signal === 'positive' ? <TrendingUp className="h-3 w-3 text-green-400" /> :
                       c.signal === 'negative' ? <TrendingDown className="h-3 w-3 text-red-400" /> :
                       <Minus className="h-3 w-3 text-yellow-400" />}
                      <span className="text-text-secondary">{c.name}</span>
                      <span className="text-text-secondary/60">({(c.weight * 100).toFixed(0)}%)</span>
                    </div>
                    <span className={c.rawScore >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {c.rawScore > 0 ? '+' : ''}{c.rawScore.toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Risk Skoru */}
          {risk && (
            <Card className={`border ${scoreBg(risk.score, 'risk')}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-text-secondary flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Piyasa Risk Skoru
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center pb-4">
                <RiskGaugeSmall score={risk.score} label={risk.label} emoji={risk.emoji} />
                <p className="text-xs text-text-secondary text-center mt-3 max-w-xs">
                  {risk.recommendation}
                </p>
                <div className="w-full mt-4 space-y-1.5">
                  {risk.components.map((c) => (
                    <div key={c.name} className="flex items-center justify-between text-xs">
                      <span className="text-text-secondary">{c.name} <span className="text-text-secondary/60">({(c.weight * 100).toFixed(0)}%)</span></span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-surface overflow-hidden">
                          <div
                            className={`h-full rounded-full ${c.score <= 25 ? 'bg-green-500' : c.score <= 50 ? 'bg-yellow-500' : c.score <= 75 ? 'bg-orange-500' : 'bg-red-500'}`}
                            style={{ width: `${c.score}%` }}
                          />
                        </div>
                        <span className="text-text-secondary w-6 text-right">{c.score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Gösterge Tablosu */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Piyasa Göstergeleri
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'VIX', data: ind.vix, suffix: '' },
              { label: 'DXY', data: ind.dxy, suffix: '' },
              { label: 'US 10Y', data: ind.us10y, suffix: '%' },
              { label: 'USD/TRY', data: ind.usdtry, suffix: '' },
              { label: 'EEM', data: ind.eem, suffix: '' },
              { label: 'Brent', data: ind.brent, suffix: '$' },
            ].map(({ label, data, suffix }) => (
              <Card key={label} className="border-border bg-surface/80">
                <CardContent className="pt-4 pb-3 px-3">
                  <p className="text-xs text-text-secondary mb-1">{label}</p>
                  <p className="text-lg font-semibold text-text-primary">
                    {data ? `${data.price.toFixed(2)}${suffix}` : '—'}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    {data && changeIcon(data.changePercent)}
                    <span className={`text-xs ${changeColor(data?.changePercent)}`}>
                      {data ? formatChange(data.changePercent) : '—'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Türkiye + ABD Makro */}
        <section className="grid gap-4 md:grid-cols-2 mb-6">
          {/* Türkiye */}
          <Card className="border-border bg-surface/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-secondary flex items-center gap-2">
                <span>🇹🇷</span> Türkiye Makro
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">TCMB Politika Faizi</span>
                <span className="text-sm font-medium text-text-primary">
                  {macro.turkey.policyRate != null
                    ? `%${typeof macro.turkey.policyRate === 'object' ? macro.turkey.policyRate.value : macro.turkey.policyRate}`
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">CDS (5Y)</span>
                <span className="text-sm font-medium text-text-primary">
                  {macro.turkey.cds5y != null
                    ? Number(typeof macro.turkey.cds5y === 'object' ? macro.turkey.cds5y.value : macro.turkey.cds5y).toFixed(0)
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">TÜFE</span>
                <span className="text-sm font-medium text-text-primary">
                  {macro.turkey.inflation != null
                    ? `%${Number(typeof macro.turkey.inflation === 'object' ? macro.turkey.inflation.value : macro.turkey.inflation).toFixed(1)}`
                    : '—'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* ABD */}
          <Card className="border-border bg-surface/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-secondary flex items-center gap-2">
                <span>🇺🇸</span> ABD Ekonomisi
                {macro.usEconomy && (
                  <span className={`ml-auto text-xs font-semibold ${
                    macro.usEconomy.color === 'green' ? 'text-green-400' :
                    macro.usEconomy.color === 'yellow' ? 'text-yellow-400' :
                    macro.usEconomy.color === 'red' ? 'text-red-400' : 'text-text-secondary'
                  }`}>
                    {macro.usEconomy.label} ({macro.usEconomy.score})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Fed Funds Rate</span>
                <span className="text-sm font-medium text-text-primary">
                  {macro.fred.fedFundsRate ? `%${Number(macro.fred.fedFundsRate.value).toFixed(2)}` : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">GDP Büyüme</span>
                <span className="text-sm font-medium text-text-primary">
                  {macro.fred.gdpGrowth ? `%${Number(macro.fred.gdpGrowth.value).toFixed(1)}` : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">İşsizlik Oranı</span>
                <span className="text-sm font-medium text-text-primary">
                  {macro.fred.unemployment ? `%${Number(macro.fred.unemployment.value).toFixed(1)}` : '—'}
                </span>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Sektör Heatmap */}
        {sectors && sectors.sectors && (
          <section className="mb-6">
            <h2 className="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Sektör Momentum
              {sectors.bestSector && (
                <span className="ml-auto text-xs text-text-secondary font-normal">
                  En iyi: <span className="text-green-400 font-medium">{sectors.bestSector.shortName}</span>
                  {sectors.worstSector && (
                    <> | En kötü: <span className="text-red-400 font-medium">{sectors.worstSector.shortName}</span></>
                  )}
                </span>
              )}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {sectors.sectors.map((s) => (
                <Card key={s.sectorId} className="border-border bg-surface/80 hover:border-primary/40 transition-colors cursor-default">
                  <CardContent className="pt-4 pb-3 px-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-text-primary">{s.shortName}</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white ${sectorScoreColor(s.compositeScore)}`}>
                        {s.compositeScore > 0 ? '+' : ''}{s.compositeScore.toFixed(0)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mb-1">
                      {changeIcon(s.perf20d)}
                      <span className={`text-xs ${changeColor(s.perf20d)}`}>
                        20g: {formatChange(s.perf20d)}
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary/70 line-clamp-2">{s.reasoning}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-text-secondary/60">
                      <span>{s.symbolCount} hisse</span>
                      <span className={`capitalize ${
                        s.signal.includes('buy') ? 'text-green-400' :
                        s.signal.includes('sell') ? 'text-red-400' : 'text-yellow-400'
                      }`}>
                        {s.signal === 'strong_buy' ? 'Güçlü AL' :
                         s.signal === 'buy' ? 'AL' :
                         s.signal === 'neutral' ? 'Nötr' :
                         s.signal === 'sell' ? 'SAT' : 'Güçlü SAT'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Footer info */}
        <p className="text-xs text-text-secondary/50 text-center mt-8">
          Son güncelleme: {new Date(macro.fetchedAt).toLocaleString('tr-TR')} | Veriler: Yahoo Finance, FRED, TCMB
        </p>
      </main>
    </div>
  );
}
