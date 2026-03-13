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
    let explanation: string;
    try {
      explanation = await generateSignalExplanation(signal, body.priceData);
    } catch (firstErr) {
      // 1 kez retry, 1s delay
      await new Promise((r) => setTimeout(r, 1000));
      try {
        explanation = await generateSignalExplanation(signal, body.priceData);
      } catch (retryErr) {
        const message = retryErr instanceof Error ? retryErr.message : 'Bilinmeyen hata';
        console.error('[explain] Claude API retry sonrası başarısız:', message);
        return NextResponse.json(
          { error: `Açıklama alınamadı: ${message}` },
          { status: 500 }
        );
      }
    }
    return NextResponse.json({ explanation });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    console.error('[explain] Hata:', message);
    return NextResponse.json(
      { error: `Açıklama alınamadı: ${message}` },
      { status: 500 }
    );
  }
}
