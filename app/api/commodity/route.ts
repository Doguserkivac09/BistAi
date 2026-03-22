import { NextResponse } from 'next/server';
import { fetchAllCommodities } from '@/lib/commodity';

export const runtime = 'nodejs';
export const revalidate = 300; // 5 dk cache

export async function GET() {
  try {
    const data = await fetchAllCommodities();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
    });
  } catch (err) {
    console.error('[commodity]', err);
    return NextResponse.json([], { status: 200 });
  }
}
