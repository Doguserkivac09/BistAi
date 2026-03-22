import { NextRequest, NextResponse } from 'next/server';
import { generateSignalExplanation } from '@/lib/claude';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { createServerClient } from '@/lib/supabase-server';
import type { StockSignal } from '@/types';

// Claude API — IP başına dakikada 100 istek (tarama sonuçları eş zamanlı gelir)
const RATE_LIMIT = 100;
const WINDOW_MS = 60_000;
const MAX_PRICE_DATA_LENGTH = 500; // max 500 mum verisi

export async function POST(request: NextRequest) {
  const ip = getClientIP(request.headers);
  const { allowed, resetMs } = checkRateLimit(`explain:${ip}`, RATE_LIMIT, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Çok fazla açıklama isteği. Lütfen biraz bekleyin.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(resetMs / 1000)) } }
    );
  }

  // Auth kontrolü — Claude API kredilerini korumak için
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Giriş yapmanız gerekiyor.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const signal = body.signal as StockSignal;

    // Payload boyut kontrolü
    if (Array.isArray(body.priceData) && body.priceData.length > MAX_PRICE_DATA_LENGTH) {
      return NextResponse.json({ error: 'Çok fazla fiyat verisi gönderildi.' }, { status: 400 });
    }

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
