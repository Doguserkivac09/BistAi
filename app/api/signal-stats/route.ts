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

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const { data, error } = await supabase
      .from('signal_performance')
      .select('id, sembol, signal_type, direction, entry_price, entry_time, return_3d, return_7d, return_14d, mfe, mae, evaluated, regime, created_at')
      .eq('evaluated', true);

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

    // Sadece signal_type bazında grupla — regime'e göre bölmek grup başına düşen
    // kayıt sayısını düşürür ve sufficient_sample eşiğinin (20) altında kalır.
    const groups = new Map<string, SignalPerformanceRecord[]>();
    for (const rec of records) {
      const list = groups.get(rec.signal_type) ?? [];
      list.push(rec);
      groups.set(rec.signal_type, list);
    }

    const results: SignalTypeRegimeStatsResponse[] = [];
    for (const [signalType, rows] of Array.from(groups.entries())) {
      const edge = computeSignalEdge(rows);
      results.push({ signal_type: signalType, ...edge });
    }

    return NextResponse.json<SignalTypeRegimeStatsResponse[]>(results);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
