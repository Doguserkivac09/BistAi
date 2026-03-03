import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import type { SignalPerformanceRecord } from '@/lib/performance-types';
import { computeSignalEdge, type SignalEdgeStats } from '@/lib/edge-engine';

const supabaseAdminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function createAdminClient() {
  return createSupabaseAdminClient(supabaseAdminUrl, supabaseServiceRoleKey);
}

export type SignalTypeRegimeStatsResponse = {
  signal_type: string;
  regime: string;
} & SignalEdgeStats;

function parseDaysParam(request: NextRequest): number {
  const param = request.nextUrl.searchParams.get('days');
  if (!param) return 90;
  const parsed = Number.parseInt(param, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return 90;
  return Math.min(parsed, 365);
}

export async function GET(request: NextRequest) {
  try {
    const days = parseDaysParam(request);
    const supabase = createAdminClient();
    console.log('SUPABASE URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    console.log('TABLE NAME: signal_performance');
    const { data, error } = await supabase
      .from('signal_performance')
      .select('*')
      .eq('evaluated', true);

    const rows = data;
    console.log('SUPABASE RAW ROW COUNT:', rows?.length);

    if (error) {
      return NextResponse.json(
        { error: `signal_performance okunamadı: ${error.message}` },
        { status: 500 }
      );
    }

    const records = (data as SignalPerformanceRecord[]) ?? [];
    if (records.length === 0) {
      return NextResponse.json<SignalTypeRegimeStatsResponse[]>([]);
    }

    const groupKey = (signalType: string, regime: string) =>
      `${signalType}|${regime}`;
    const groups = new Map<
      string,
      { signalType: string; regime: string; rows: SignalPerformanceRecord[] }
    >();
    for (const rec of records) {
      const st = rec.signal_type;
      const reg = rec.regime ?? 'unknown';
      const key = groupKey(st, reg);
      const existing = groups.get(key);
      if (existing) existing.rows.push(rec);
      else groups.set(key, { signalType: st, regime: reg, rows: [rec] });
    }

    const results: SignalTypeRegimeStatsResponse[] = [];
    for (const { signalType, regime, rows } of groups.values()) {
      const edge = computeSignalEdge(rows);
      results.push({ signal_type: signalType, regime, ...edge });
    }

    return NextResponse.json<SignalTypeRegimeStatsResponse[]>(results);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
