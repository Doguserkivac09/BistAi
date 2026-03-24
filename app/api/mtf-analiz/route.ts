import { NextRequest, NextResponse } from 'next/server';
import { fetchOHLCVByTimeframe } from '@/lib/yahoo';
import { detectAllSignals } from '@/lib/signals';
import type { YahooTimeframe } from '@/lib/yahoo';

export const runtime = 'nodejs';

// 15 dk cache — timeframe verileri sık değişmez
const cache = new Map<string, { data: MtfResponse; expiry: number }>();
const CACHE_TTL = 15 * 60 * 1000;

export interface MtfRow {
  tf: string;          // '15m' | '1h' | '1d' | '1wk'
  label: string;       // '15 Dakika' vb.
  shortLabel: string;  // '15DK' vb.
  decision: 'AL' | 'SAT' | 'TUT';
  bullCount: number;
  bearCount: number;
  totalSignals: number;
  dominantSignals: string[];  // en güçlü 2 sinyal adı
  strength: 'güçlü' | 'orta' | 'zayıf';
}

export interface MtfResponse {
  sembol: string;
  rows: MtfRow[];
  /** Kaç timeframe aynı yönde: 'güçlü uyum' / 'kısmi uyum' / 'çelişkili' */
  confluenceLabel: string;
  confluenceDir: 'AL' | 'SAT' | 'TUT';
  bullishTfCount: number;
  bearishTfCount: number;
}

const TIMEFRAMES: Array<{ key: YahooTimeframe; label: string; shortLabel: string }> = [
  { key: '15m', label: '15 Dakika', shortLabel: '15DK' },
  { key: '1h',  label: '1 Saat',   shortLabel: '1S'   },
  { key: '1d',  label: '1 Gün',    shortLabel: '1G'   },
  { key: '1wk', label: '1 Hafta',  shortLabel: '1H'   },
];

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: 'symbol gerekli' }, { status: 400 });
  }

  const cached = cache.get(symbol);
  if (cached && Date.now() < cached.expiry) {
    return NextResponse.json(cached.data);
  }

  try {
    const rowResults = await Promise.allSettled(
      TIMEFRAMES.map(async ({ key, label, shortLabel }) => {
        const candles = await fetchOHLCVByTimeframe(symbol, key);
        if (candles.length < 20) {
          return { tf: key, label, shortLabel, decision: 'TUT' as const, bullCount: 0, bearCount: 0, totalSignals: 0, dominantSignals: [], strength: 'zayıf' as const };
        }

        let signals: ReturnType<typeof detectAllSignals> = [];
        try {
          signals = detectAllSignals(symbol, candles);
        } catch {
          // sinyal tespiti başarısız
        }

        const bullish = signals.filter(s => s.direction === 'yukari');
        const bearish = signals.filter(s => s.direction === 'asagi');

        let decision: 'AL' | 'SAT' | 'TUT' = 'TUT';
        if (bullish.length > bearish.length) decision = 'AL';
        else if (bearish.length > bullish.length) decision = 'SAT';

        const total = signals.length;
        const strength: 'güçlü' | 'orta' | 'zayıf' =
          total >= 3 ? 'güçlü' : total >= 2 ? 'orta' : total >= 1 ? 'zayıf' : 'zayıf';

        // En güçlü sinyalleri al (severity önceliği: güçlü > orta > zayıf)
        const sevRank = { güçlü: 3, orta: 2, zayıf: 1 };
        const dominant = [...signals]
          .sort((a, b) => (sevRank[b.severity] ?? 0) - (sevRank[a.severity] ?? 0))
          .slice(0, 2)
          .map(s => s.type);

        return { tf: key, label, shortLabel, decision, bullCount: bullish.length, bearCount: bearish.length, totalSignals: total, dominantSignals: dominant, strength };
      })
    );

    const rows: MtfRow[] = rowResults.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      const tf = TIMEFRAMES[i]!;
      return { tf: tf.key, label: tf.label, shortLabel: tf.shortLabel, decision: 'TUT', bullCount: 0, bearCount: 0, totalSignals: 0, dominantSignals: [], strength: 'zayıf' };
    });

    const bullishTfCount = rows.filter(r => r.decision === 'AL').length;
    const bearishTfCount = rows.filter(r => r.decision === 'SAT').length;
    const total = rows.length;

    let confluenceLabel = 'Çelişkili';
    let confluenceDir: 'AL' | 'SAT' | 'TUT' = 'TUT';

    if (bullishTfCount === total) {
      confluenceLabel = 'Tüm zaman dilimleri AL';
      confluenceDir = 'AL';
    } else if (bearishTfCount === total) {
      confluenceLabel = 'Tüm zaman dilimleri SAT';
      confluenceDir = 'SAT';
    } else if (bullishTfCount >= total - 1 && bullishTfCount > bearishTfCount) {
      confluenceLabel = 'Güçlü AL uyumu';
      confluenceDir = 'AL';
    } else if (bearishTfCount >= total - 1 && bearishTfCount > bullishTfCount) {
      confluenceLabel = 'Güçlü SAT uyumu';
      confluenceDir = 'SAT';
    } else if (bullishTfCount > bearishTfCount) {
      confluenceLabel = 'Kısmi AL uyumu';
      confluenceDir = 'AL';
    } else if (bearishTfCount > bullishTfCount) {
      confluenceLabel = 'Kısmi SAT uyumu';
      confluenceDir = 'SAT';
    }

    const response: MtfResponse = { sembol: symbol, rows, confluenceLabel, confluenceDir, bullishTfCount, bearishTfCount };
    cache.set(symbol, { data: response, expiry: Date.now() + CACHE_TTL });

    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
