import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { fetchOHLCV } from '@/lib/yahoo';
import type { SignalPerformanceRecord } from '@/lib/performance-types';
import {
  runBacktest,
  generatePerformanceMatrix,
  generateStandardComparisons,
  calculateEquityCurve,
  computeRandomBaseline,
  type BacktestResult,
  type BacktestComparison,
  type PerformanceMatrixRow,
  type EquityPoint,
} from '@/lib/backtesting';

// ── Supabase Admin ──────────────────────────────────────────────────

const supabaseAdminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function createAdminClient() {
  return createSupabaseAdminClient(supabaseAdminUrl, supabaseServiceRoleKey);
}

// ── Helpers ─────────────────────────────────────────────────────────

function parseDaysParam(request: NextRequest): number {
  const param = request.nextUrl.searchParams.get('days');
  if (!param) return 90;
  const parsed = Number.parseInt(param, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return 90;
  return Math.min(parsed, 730);
}

function parseDirectionParam(
  request: NextRequest
): 'yukari' | 'asagi' | undefined {
  const param = request.nextUrl.searchParams.get('direction');
  if (param === 'yukari' || param === 'asagi') return param;
  return undefined;
}

function parseMinConfluenceParam(request: NextRequest): number | undefined {
  const param = request.nextUrl.searchParams.get('minConfluence');
  if (!param) return undefined;
  const parsed = Number.parseInt(param, 10);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) return undefined;
  return parsed;
}

// ── GET /api/backtesting ────────────────────────────────────────────

export interface BenchmarkData {
  /** Seçilen dönemde BIST100 buy-and-hold getirisi (%) */
  xu100Return: number | null;
  /** Seçilen dönemin ilk XU100 kapanışı */
  xu100Start: number | null;
  /** Seçilen dönemin son XU100 kapanışı */
  xu100End: number | null;
}

export interface BacktestingResponse {
  summary: BacktestResult;
  matrix: PerformanceMatrixRow[];
  comparisons: BacktestComparison[];
  totalRecords: number;
  equityCurve: EquityPoint[];
  benchmark: BenchmarkData;
  randomBaseline: { randomWinRate: number | null; signalEdge: number | null };
}

export async function GET(request: NextRequest) {
  try {
    // ── Auth kontrolü ────────────────────────────────────────────────
    // Rate limit: 10 istek/dakika per IP (DB'den 1000+ kayıt çekiyor)
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`${ip}:backtesting`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Çok fazla istek. Lütfen bekleyin.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } }
      );
    }

    const authClient = await createServerClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401 });
    }

    const days = parseDaysParam(request);
    const direction = parseDirectionParam(request);
    const minConfluence = parseMinConfluenceParam(request);
    const supabase = createAdminClient();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffIso = cutoff.toISOString();

    const PAGE_SIZE = 1000;

    // Önce toplam kayıt sayısını çek (1 istek)
    const { count, error: countError } = await supabase
      .from('signal_performance')
      .select('*', { count: 'exact', head: true })
      .eq('evaluated', true)
      .gte('entry_time', cutoffIso);

    if (countError) {
      return NextResponse.json({ error: `signal_performance sayılamadı: ${countError.message}` }, { status: 500 });
    }

    const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

    // Tüm sayfaları paralel olarak çek
    const pagePromises = Array.from({ length: totalPages }, (_, i) => {
      let q = supabase
        .from('signal_performance')
        .select('id, sembol, signal_type, direction, entry_price, entry_time, return_3d, return_7d, return_14d, return_30d, mfe, mae, evaluated, regime, confluence_score, created_at')
        .eq('evaluated', true)
        .gte('entry_time', cutoffIso)
        .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1);
      if (direction) q = q.eq('direction', direction);
      return q;
    });

    const pageResults = await Promise.all(pagePromises);

    for (const { error } of pageResults) {
      if (error) {
        return NextResponse.json({ error: `signal_performance okunamadı: ${error.message}` }, { status: 500 });
      }
    }

    let records = pageResults.flatMap((r) => (r.data as SignalPerformanceRecord[]) ?? []);

    // Confluence filtresi
    if (minConfluence !== undefined) {
      records = records.filter((r) => (r.confluence_score ?? 0) >= minConfluence);
    }

    if (records.length === 0) {
      return NextResponse.json<BacktestingResponse>({
        summary: {
          filterDescription: 'Tüm sinyaller',
          totalSignals: 0,
          sufficientSample: false,
          winRates: { '3d': null, '7d': null, '14d': null, '30d': null },
          avgReturns: { '3d': null, '7d': null, '14d': null, '30d': null },
          avgMfe: null,
          avgMae: null,
          expectancy: null,
          profitFactor: null,
          maxDrawdown: null,
          sharpeRatio: null,
          tStat: null,
          pValue: null,
          canonicalHorizon: '7d',
          canonicalWinRate: null,
          canonicalAvgReturn: null,
        },
        matrix: [],
        comparisons: [],
        totalRecords: 0,
        equityCurve: [],
        benchmark: { xu100Return: null, xu100Start: null, xu100End: null },
        randomBaseline: { randomWinRate: null, signalEdge: null },
      });
    }

    // Genel özet
    const summary = runBacktest(records);

    // Sinyal tipi × Rejim performans matrisi
    const matrix = generatePerformanceMatrix(records);

    // Standart karşılaştırmalar
    const comparisons = generateStandardComparisons(records);

    // Equity curve
    const equityCurve = calculateEquityCurve(records);

    // BIST100 benchmark — seçili dönem için buy-and-hold getirisi
    let benchmark: BenchmarkData = { xu100Return: null, xu100Start: null, xu100End: null };
    try {
      const { candles: xu100 } = await fetchOHLCV('XU100', days + 10);
      if (xu100.length >= 2) {
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        const periodCandles = xu100.filter((c) => (c.date as string) >= cutoffStr);
        if (periodCandles.length >= 2) {
          const first = periodCandles[0]!.close;
          const last  = periodCandles[periodCandles.length - 1]!.close;
          benchmark = {
            xu100Start:  Math.round(first),
            xu100End:    Math.round(last),
            xu100Return: Math.round(((last - first) / first) * 10000) / 100,
          };
        }
      }
    } catch { /* benchmark opsiyonel */ }

    // Random baseline — sinyal edge'ini ölç
    const randomBaseline = computeRandomBaseline(records, '7d');

    return NextResponse.json<BacktestingResponse>({
      summary,
      matrix,
      comparisons,
      totalRecords: records.length,
      equityCurve,
      benchmark,
      randomBaseline,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
