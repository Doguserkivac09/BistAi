import { NextRequest, NextResponse } from 'next/server';
import { generateSignalExplanation } from '@/lib/claude';
import type { StockSignal } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const signal = body.signal as StockSignal;
    if (!signal?.type || !signal?.sembol) {
      return NextResponse.json(
        { error: 'Geçersiz sinyal verisi.' },
        { status: 400 }
      );
    }
    const explanation = await generateSignalExplanation(signal, body.priceData);
    return NextResponse.json({ explanation });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json(
      { error: `Açıklama alınamadı: ${message}` },
      { status: 500 }
    );
  }
}
