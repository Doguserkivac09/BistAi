'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { OHLCVCandle } from '@/types';
import type { TimeframeKey } from '@/lib/api-client';

const RSI_LABEL: Record<TimeframeKey, string> = {
  '15m': 'RSI (14) 15dk',
  '30m': 'RSI (14) 30dk',
  '1h':  'RSI (14) 1 Saatlik',
  '1d':  'RSI (14) Günlük',
  '1wk': 'RSI (14) Haftalık',
  '1mo': 'RSI (14) Aylık',
};

const TREND_PERIODS: Record<TimeframeKey, { label: string; sublabel: string; bars: number }[]> = {
  '15m': [{ label: 'Kısa Vade', sublabel: '4 Saat',   bars: 16  }, { label: 'Orta Vade', sublabel: '1 Gün',    bars: 96  }, { label: 'Uzun Vade', sublabel: '3 Gün',    bars: 288 }],
  '30m': [{ label: 'Kısa Vade', sublabel: '4 Saat',   bars: 8   }, { label: 'Orta Vade', sublabel: '1 Gün',    bars: 48  }, { label: 'Uzun Vade', sublabel: '3 Gün',    bars: 144 }],
  '1h':  [{ label: 'Kısa Vade', sublabel: '1 Gün',    bars: 24  }, { label: 'Orta Vade', sublabel: '3 Gün',    bars: 72  }, { label: 'Uzun Vade', sublabel: '1 Hafta',  bars: 120 }],
  '1d':  [{ label: 'Kısa Vade', sublabel: '15 Gün',   bars: 15  }, { label: 'Orta Vade', sublabel: '45 Gün',   bars: 45  }, { label: 'Uzun Vade', sublabel: '90 Gün',   bars: 90  }],
  '1wk': [{ label: 'Kısa Vade', sublabel: '4 Hafta',  bars: 4   }, { label: 'Orta Vade', sublabel: '12 Hafta', bars: 12  }, { label: 'Uzun Vade', sublabel: '26 Hafta', bars: 26  }],
  '1mo': [{ label: 'Kısa Vade', sublabel: '3 Ay',     bars: 3   }, { label: 'Orta Vade', sublabel: '6 Ay',     bars: 6   }, { label: 'Uzun Vade', sublabel: '12 Ay',    bars: 12  }],
};

function calcEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [data[0]!];
  for (let i = 1; i < data.length; i++) result.push(data[i]! * k + result[i - 1]! * (1 - k));
  return result;
}

function calcRSIFull(data: number[], period = 14): number {
  if (data.length < period + 1) return 50;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = data[i]! - data[i - 1]!;
    if (d >= 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < data.length; i++) {
    const d = data[i]! - data[i - 1]!;
    avgGain = (avgGain * (period - 1) + Math.max(0, d))  / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
  }
  if (avgLoss === 0) return 100;
  return Math.round((100 - 100 / (1 + avgGain / avgLoss)) * 100) / 100;
}

export function TeknikGostergelerOzeti({ candles, timeframe }: { candles: OHLCVCandle[]; timeframe: TimeframeKey }) {
  if (candles.length < 26) return null;
  const closes = candles.map((c) => c.close);
  const n = closes.length;

  const rsi = calcRSIFull(closes);
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]!);
  const signalLine = calcEMA(macdLine.slice(-9), 9);
  const macdAboveSignal = macdLine[n - 1]! > signalLine[signalLine.length - 1]!;

  const ema50arr  = closes.length >= 50  ? calcEMA(closes, 50)  : null;
  const ema200arr = closes.length >= 200 ? calcEMA(closes, 200) : null;
  const price  = closes[n - 1]!;
  const ema50  = ema50arr?.[ema50arr.length - 1]   ?? null;
  const ema200 = ema200arr?.[ema200arr.length - 1] ?? null;

  let bbB: number | null = null;
  if (closes.length >= 20) {
    const slice = closes.slice(-20);
    const mean = slice.reduce((s, v) => s + v, 0) / 20;
    const std  = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / 20);
    bbB = std > 0 ? ((price - (mean - 2 * std)) / (4 * std)) * 100 : 50;
  }

  let volRatio: number | null = null;
  if (candles.length >= 21) {
    const avgVol = candles.slice(-21, -1).reduce((s, c) => s + (c.volume || 0), 0) / 20;
    volRatio = avgVol > 0 ? (candles[n - 1]!.volume || 0) / avgVol : null;
  }

  type S = 'bullish' | 'bearish' | 'neutral';
  const rows: { label: string; value: string; detail: string; status: S }[] = [
    { label: RSI_LABEL[timeframe] ?? 'RSI (14)', value: rsi.toFixed(1), detail: rsi >= 70 ? 'Aşırı Alım' : rsi <= 30 ? 'Aşırı Satım' : rsi >= 55 ? 'Güçlü' : rsi <= 45 ? 'Zayıf' : 'Nötr', status: rsi >= 55 ? 'bullish' : rsi <= 45 ? 'bearish' : 'neutral' },
    { label: 'MACD', value: macdAboveSignal ? 'Sinyalin Üstü' : 'Sinyalin Altı', detail: macdAboveSignal ? 'Yükseliş mom.' : 'Düşüş mom.', status: macdAboveSignal ? 'bullish' : 'bearish' },
    ...(ema50 !== null ? [{ label: 'EMA50', value: ema50.toFixed(2) + '₺', detail: price > ema50 ? 'Fiyat üstünde' : 'Fiyat altında', status: (price > ema50 ? 'bullish' : 'bearish') as S }] : []),
    ...(ema200 !== null ? [{ label: 'EMA200', value: ema200.toFixed(2) + '₺', detail: price > ema200 ? 'Uzun vade ↑' : 'Uzun vade ↓', status: (price > ema200 ? 'bullish' : 'bearish') as S }] : []),
    ...(ema50 !== null && ema200 !== null ? [{ label: 'EMA Çapraz', value: ema50 > ema200 ? 'Altın Çapraz' : 'Ölüm Çaprazı', detail: ema50 > ema200 ? 'EMA50 > EMA200' : 'EMA50 < EMA200', status: (ema50 > ema200 ? 'bullish' : 'bearish') as S }] : []),
    ...(bbB !== null ? [{ label: 'Bollinger %B', value: '%' + bbB.toFixed(0), detail: bbB >= 80 ? 'Üst banda yakın' : bbB <= 20 ? 'Alt banda yakın' : 'Orta bant', status: (bbB >= 80 ? 'bearish' : bbB <= 20 ? 'bullish' : 'neutral') as S }] : []),
    ...(volRatio !== null ? [{ label: 'Hacim Oranı', value: volRatio.toFixed(1) + 'x', detail: volRatio >= 1.5 ? 'Yüksek hacim' : volRatio <= 0.5 ? 'Düşük hacim' : 'Normal', status: (volRatio >= 1.5 ? 'bullish' : volRatio <= 0.5 ? 'bearish' : 'neutral') as S }] : []),
  ];

  const bull = rows.filter((r) => r.status === 'bullish').length;
  const bear = rows.filter((r) => r.status === 'bearish').length;

  return (
    <Card>
      <CardHeader className="py-2 px-3 pb-0">
        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">Teknik Göstergeler Özeti</CardTitle>
      </CardHeader>
      <CardContent className="pt-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] text-text-muted">{rows.length} gösterge</span>
          <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${bull > bear ? 'bg-emerald-500/10 text-emerald-400' : bear > bull ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
            {bull} Yükseliş · {bear} Düşüş
          </span>
        </div>
        <div className="divide-y divide-border/40">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between py-2">
              <span className="text-xs text-text-secondary">{row.label}</span>
              <div className="flex items-center gap-2">
                <span className="hidden text-[10px] text-text-muted sm:block">{row.detail}</span>
                <span className={`text-xs font-mono font-semibold ${row.status === 'bullish' ? 'text-emerald-400' : row.status === 'bearish' ? 'text-red-400' : 'text-amber-400'}`}>{row.value}</span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${row.status === 'bullish' ? 'bg-emerald-400' : row.status === 'bearish' ? 'bg-red-400' : 'bg-amber-400'}`} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function TrendOzeti({ candles, timeframe }: { candles: OHLCVCandle[]; timeframe: TimeframeKey }) {
  const periods = TREND_PERIODS[timeframe] ?? TREND_PERIODS['1d'];
  const minBars = periods[0]!.bars;
  if (candles.length < minBars + 1) return null;

  const lastClose = candles[candles.length - 1]!.close;

  function getTrend(bars: number) {
    if (candles.length < bars + 1) return null;
    const oldClose = candles[candles.length - 1 - bars]!.close;
    const pct = ((lastClose - oldClose) / oldClose) * 100;
    const direction = pct > 1 ? 'yükseliş' : pct < -1 ? 'düşüş' : 'yatay';
    const absPct = Math.abs(pct);
    const strength = absPct > 10 ? 'güçlü' : absPct > 3 ? 'orta' : 'zayıf';
    const color = direction === 'yükseliş' ? 'emerald' : direction === 'düşüş' ? 'red' : 'amber';
    return { pct, direction, strength, color };
  }

  const items = periods.map((p) => ({ ...p, trend: getTrend(p.bars) })).filter((p) => p.trend !== null);
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="py-2 px-3 pb-0">
        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-text-muted">Trend Özeti</CardTitle>
      </CardHeader>
      <CardContent className="pt-3 space-y-3">
        {items.map(({ label, sublabel, trend }) => {
          if (!trend) return null;
          const { pct, direction, strength, color } = trend;
          const icon = direction === 'yükseliş' ? '↗' : direction === 'düşüş' ? '↘' : '→';
          const barWidth = Math.min(Math.abs(pct) * 3, 100);
          const colorClass = color === 'emerald' ? 'text-emerald-400' : color === 'red' ? 'text-red-400' : 'text-amber-400';
          const bgClass    = color === 'emerald' ? 'bg-emerald-500'  : color === 'red' ? 'bg-red-500'   : 'bg-amber-500';
          return (
            <div key={label} className="flex items-center gap-3">
              <div className="w-[72px] shrink-0">
                <p className="text-xs font-medium text-text-primary">{label}</p>
                <p className="text-[10px] text-text-muted">{sublabel}</p>
              </div>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-alt">
                <div className={`absolute h-full rounded-full ${bgClass}`} style={{ width: `${barWidth}%`, right: direction === 'düşüş' ? '0' : undefined, left: direction !== 'düşüş' ? '0' : undefined }} />
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className={`text-xs font-semibold ${colorClass}`}>{icon} {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</span>
                <span className={`hidden text-[10px] capitalize sm:block ${colorClass}/70`}>{strength}</span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
