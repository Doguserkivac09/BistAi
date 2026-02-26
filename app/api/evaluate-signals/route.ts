import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchOHLCV } from '@/lib/yahoo';
import type { OHLCVCandle } from '@/types';
import type { SignalPerformanceRecord } from '@/lib/performance-types';

const INTERNAL_TOKEN = process.env.INTERNAL_EVAL_TOKEN;

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase URL veya service role key tanımlı değil.');
  }
  return createClient(url, serviceKey);
}

function daysBetween(startIso: string, end: Date): number {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return 0;
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
}

type Direction = 'yukari' | 'asagi';

/** Close on or after entry + X days. yukari: (close - entry)/entry; asagi: (entry - close)/entry */
function closeReturnOnOrAfter(
  entryPrice: number,
  afterEntry: OHLCVCandle[],
  entryDate: Date,
  days: number,
  direction: Direction
): number | null {
  if (
    entryPrice <= 0 ||
    !Number.isFinite(entryPrice) ||
    !Array.isArray(afterEntry) ||
    afterEntry.length === 0
  ) {
    return null;
  }
  const target = new Date(entryDate);
  target.setDate(target.getDate() + days);

  const candidates = afterEntry
    .filter((c) => c?.date != null && new Date(c.date) >= target)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const close = candidates[0]?.close;
  if (close == null || !Number.isFinite(close)) return null;

  const ret =
    direction === 'yukari'
      ? (close - entryPrice) / entryPrice
      : (entryPrice - close) / entryPrice;
  return Number.isFinite(ret) ? ret : null;
}

/** return_3d, return_7d, return_14d from close on or after entry + X days (direction-aware) */
function computeReturns(
  entryPrice: number,
  afterEntry: OHLCVCandle[],
  entryDateIso: string,
  direction: Direction
): { return_3d: number | null; return_7d: number | null; return_14d: number | null } {
  const entryDate = new Date(entryDateIso);
  if (Number.isNaN(entryDate.getTime())) {
    return { return_3d: null, return_7d: null, return_14d: null };
  }
  return {
    return_3d: closeReturnOnOrAfter(entryPrice, afterEntry, entryDate, 3, direction),
    return_7d: closeReturnOnOrAfter(entryPrice, afterEntry, entryDate, 7, direction),
    return_14d: closeReturnOnOrAfter(entryPrice, afterEntry, entryDate, 14, direction),
  };
}

/** yukari: mfe=max((high-entry)/entry), mae=min((low-entry)/entry). asagi: mfe=max((entry-low)/entry), mae=min((entry-high)/entry) */
function computeMfeMae(
  entryPrice: number,
  afterEntry: OHLCVCandle[],
  direction: Direction
): { mfe: number | null; mae: number | null } {
  if (
    entryPrice <= 0 ||
    !Number.isFinite(entryPrice) ||
    !Array.isArray(afterEntry) ||
    afterEntry.length === 0
  ) {
    return { mfe: null, mae: null };
  }

  let mfe: number | null = null;
  let mae: number | null = null;

  for (const c of afterEntry) {
    if (
      c?.high == null ||
      c?.low == null ||
      !Number.isFinite(c.high) ||
      !Number.isFinite(c.low)
    ) {
      continue;
    }
    const favorable =
      direction === 'yukari'
        ? (c.high - entryPrice) / entryPrice
        : (entryPrice - c.low) / entryPrice;
    const adverse =
      direction === 'yukari'
        ? (c.low - entryPrice) / entryPrice
        : (entryPrice - c.high) / entryPrice;

    if (Number.isFinite(favorable) && (mfe === null || favorable > mfe)) {
      mfe = favorable;
    }
    if (Number.isFinite(adverse) && (mae === null || adverse < mae)) {
      mae = adverse;
    }
  }

  return { mfe, mae };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let updatedCount = 0;

  try {
    if (!INTERNAL_TOKEN) {
      return NextResponse.json(
        { error: 'İç değerlendirme tokenı tanımlı değil.' },
        { status: 500 }
      );
    }

    const headerToken = request.headers.get('x-internal-token');
    if (!headerToken || headerToken !== INTERNAL_TOKEN) {
      return NextResponse.json({ error: 'Yetkisiz istek.' }, { status: 401 });
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('signal_performance')
      .select('*')
      .eq('evaluated', false)
      .limit(200);

    if (error) {
      return NextResponse.json(
        { error: `signal_performance okunamadı: ${error.message}` },
        { status: 500 }
      );
    }

    const records = (data as SignalPerformanceRecord[] | null) ?? [];
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ updated: 0 });
    }

    const now = new Date();

    for (const rec of records) {
      if (
        rec == null ||
        rec.id == null ||
        rec.sembol == null ||
        typeof rec.sembol !== 'string' ||
        rec.sembol.trim() === '' ||
        rec.entry_time == null ||
        rec.entry_price == null ||
        !Number.isFinite(Number(rec.entry_price))
      ) {
        continue;
      }

      const direction = rec.direction;
      if (direction !== 'yukari' && direction !== 'asagi') {
        continue;
      }

      const ageDays = daysBetween(String(rec.entry_time), now);
      if (ageDays < 14) {
        continue;
      }

      try {
        const candles = await fetchOHLCV(rec.sembol.trim(), 120);
        if (!Array.isArray(candles) || candles.length === 0) {
          continue;
        }

        const entryTime = new Date(rec.entry_time);
        if (Number.isNaN(entryTime.getTime())) {
          continue;
        }

        const afterEntry = candles.filter(
          (c) => c?.date != null && new Date(c.date) >= entryTime
        );
        if (afterEntry.length === 0) {
          continue;
        }

        const entryPrice = Number(rec.entry_price);
        if (entryPrice <= 0 || !Number.isFinite(entryPrice)) {
          continue;
        }

        const returns = computeReturns(
          entryPrice,
          afterEntry,
          String(rec.entry_time),
          direction
        );
        const { mfe, mae } = computeMfeMae(entryPrice, afterEntry, direction);

        console.log('evaluate-signals', {
          afterEntry_length: afterEntry.length,
          return_3d: returns.return_3d,
          return_14d: returns.return_14d,
          mfe,
          mae,
        });

        const { error: updateError } = await supabase
          .from('signal_performance')
          .update({
            return_3d: returns.return_3d,
            return_7d: returns.return_7d,
            return_14d: returns.return_14d,
            mfe,
            mae,
            evaluated: true,
          })
          .eq('id', rec.id);

        if (updateError == null) {
          updatedCount += 1;
        }
      } catch {
        continue;
      }
    }

    return NextResponse.json({ updated: updatedCount });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Bilinmeyen hata';
    return NextResponse.json(
      { error: String(message) },
      { status: 500 }
    );
  }
}
