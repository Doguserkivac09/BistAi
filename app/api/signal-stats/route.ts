import { NextRequest, NextResponse } from 'next/server';
import type { SignalPerformanceRecord } from '@/lib/performance-types';
import { computeSignalEdge, type SignalEdgeStats } from '@/lib/edge-engine';
import { createClient } from '@/lib/supabase';

export type SignalTypeStatsResponse = { signal_type: string } & SignalEdgeStats;

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
    const supabase = createClient();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const { data, error } = await supabase
      .from('signal_performance')
      .select('*')
      .eq('evaluated', true)
      .gte('entry_time', cutoff.toISOString());

    if (error) {
      return NextResponse.json(
        { error: `signal_performance okunamadı: ${error.message}` },
        { status: 500 }
      );
    }

    const records = (data as SignalPerformanceRecord[]) ?? [];
    if (records.length === 0) {
      return NextResponse.json<SignalTypeStatsResponse[]>([]);
    }

    const byType = new Map<string, SignalPerformanceRecord[]>();
    for (const rec of records) {
      const list = byType.get(rec.signal_type) ?? [];
      list.push(rec);
      byType.set(rec.signal_type, list);
    }

    const results: SignalTypeStatsResponse[] = [];
    for (const [signalType, rows] of byType.entries()) {
      const edge = computeSignalEdge(rows);
      results.push({ signal_type: signalType, ...edge });
    }

    return NextResponse.json<SignalTypeStatsResponse[]>(results);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
