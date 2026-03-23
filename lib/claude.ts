/**
 * Claude API ile sinyal açıklaması üretimi.
 * Model: claude-3-5-haiku (maliyet verimliliği için)
 *
 * v2 (Phase 6.2): Makro bağlam + sektör + risk bilgisi eklendi.
 * v3 (Phase 8.3): Supabase ai_cache entegrasyonu — aynı sinyal için
 *   24 saat içinde tekrar API çağrısı yapılmaz.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { StockSignal } from '@/types';
import type { CompositeContext } from './composite-signal';

// ── AI Cache (Supabase) ─────────────────────────────────────────────

function createCacheKey(signal: StockSignal, version: 1 | 2): string {
  // Tarih eklendi: her gün yeni açıklama üretilir, eski fiyat referansı kalmaz
  const today = new Date().toISOString().slice(0, 10);
  return `${signal.sembol}:${signal.type}:${signal.direction}:${signal.severity}:${today}:v${version}`;
}

async function getCachedExplanation(cacheKey: string): Promise<string | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return null;

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data } = await supabase
      .from('ai_cache')
      .select('explanation')
      .eq('cache_key', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .single();

    return data?.explanation ?? null;
  } catch {
    return null;
  }
}

async function setCachedExplanation(cacheKey: string, explanation: string, version: 1 | 2): Promise<void> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return;

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, serviceKey);

    await supabase.from('ai_cache').upsert({
      cache_key: cacheKey,
      explanation,
      version,
      hit_count: 0,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'cache_key' });
  } catch {
    // Cache yazma başarısız olursa sessizce devam et
  }
}

// ── System Prompts ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sen BistAI'ın borsa analiz asistanısın. Türk bireysel yatırımcılara ve traderlara teknik analiz sinyallerini sade, anlaşılır Türkçe ile açıklıyorsun. Jargonu minimumda tut, somut ol. Cevabın maksimum 3 cümle olsun.`;

const SYSTEM_PROMPT_V2 = `Sen BistAI'ın borsa analiz asistanısın. Türk bireysel yatırımcılara hem teknik sinyal hem de makroekonomik bağlam ile birlikte yatırım açıklaması üretiyorsun.

Kurallar:
- Maksimum 4 cümle ol. İlk cümle teknik sinyali, ikinci cümle makro rüzgarı, üçüncü cümle sektör durumunu, son cümle özet kararı açıklar.
- Sade ve anlaşılır Türkçe kullan, jargonu minimumda tut.
- Somut ver: "VIX düşük" yerine "VIX 15 seviyesinde, piyasa sakin" gibi.
- Karar cümlesinde güven seviyesini belirt.`;

/**
 * v1: Sadece teknik sinyal açıklaması (geriye uyumlu).
 */
export async function generateSignalExplanation(
  signal: StockSignal,
  priceData?: { lastClose?: number; lastDate?: string }
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return 'AI açıklaması için ANTHROPIC_API_KEY ortam değişkeni tanımlanmalı.';
  }

  // Cache kontrol
  const cacheKey = createCacheKey(signal, 1);
  const cached = await getCachedExplanation(cacheKey);
  if (cached) return cached;

  const data = signal.data as Record<string, unknown>;
  const extraLines: string[] = [];

  if (signal.type === 'Hacim Anomalisi') {
    if (data.volumeRatio)          extraLines.push(`Hacim oranı: ${data.volumeRatio}x (20 günlük ortalama)`);
    if (data.consecutiveHighVolDays) extraLines.push(`Ardışık yüksek hacim günü: ${data.consecutiveHighVolDays}`);
    if (data.relVol5)              extraLines.push(`5 günlük ortalama hacim oranı: ${data.relVol5}x`);
    if (data.priceChange3d != null) extraLines.push(`3 günlük fiyat değişimi: %${data.priceChange3d}`);
    if (data.priceChange != null)  extraLines.push(`Günlük fiyat değişimi: %${data.priceChange}`);
  }

  const priceLines: string[] = [];
  if (priceData?.lastClose !== undefined) {
    priceLines.push(`Güncel fiyat: ${priceData.lastClose}₺`);
  }
  if (priceData?.lastDate) {
    priceLines.push(`Fiyat tarihi: ${priceData.lastDate}`);
  }

  const userPrompt = `Hisse: ${signal.sembol}
Sinyal tipi: ${signal.type}
Sinyal yönü: ${signal.direction}
Sinyal şiddeti: ${signal.severity}
${priceLines.length > 0 ? priceLines.join('\n') : ''}
${extraLines.length > 0 ? extraLines.join('\n') : `Ek veri: ${JSON.stringify(signal.data)}`}
Bu sinyali yatırımcıya kısaca açıkla.`;

  const result = await callClaude(apiKey, SYSTEM_PROMPT, userPrompt);

  // Başarılı sonucu cache'le (fire-and-forget, hata kritik değil)
  if (!result.startsWith('AI açıklaması')) {
    setCachedExplanation(cacheKey, result, 1).catch(() => {});
  }

  return result;
}

/**
 * v2: Teknik + Makro + Sektör + Risk bağlamlı açıklama.
 */
export async function generateCompositeExplanation(
  signal: StockSignal,
  compositeContext: CompositeContext,
  compositeScore: number,
  confidence: number,
  decision: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return 'AI açıklaması için ANTHROPIC_API_KEY ortam değişkeni tanımlanmalı.';
  }

  // Cache kontrol
  const cacheKey = createCacheKey(signal, 2);
  const cached = await getCachedExplanation(cacheKey);
  if (cached) return cached;

  const userPrompt = `Hisse: ${signal.sembol}
Sinyal: ${signal.type} (${signal.direction}, ${signal.severity})
Teknik veri: ${JSON.stringify(signal.data)}

Makro bağlam:
- Makro rüzgar: ${compositeContext.macroLabel} (${compositeContext.macroWind})
- Risk seviyesi: ${compositeContext.riskLevel}

Sektör bağlam:
- Sektör: ${compositeContext.sectorName}
- Sektör sinyali: ${compositeContext.sectorSignal}

Kompozit karar: ${decision}
Kompozit skor: ${compositeScore}
Güven: %${confidence}

Temel faktörler: ${compositeContext.keyFactors.join('; ')}

Bu bilgiler ışığında yatırımcıya kısa ve somut bir açıklama yap.`;

  const result = await callClaude(apiKey, SYSTEM_PROMPT_V2, userPrompt, 384);

  // Başarılı sonucu cache'le
  if (!result.startsWith('AI açıklaması')) {
    setCachedExplanation(cacheKey, result, 2);
  }

  return result;
}

// ── Ortak Claude API çağrısı ────────────────────────────────────────

async function callClaude(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 256
): Promise<string> {
  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (textBlock && 'text' in textBlock) {
      return textBlock.text.trim();
    }
    return 'Açıklama oluşturulamadı.';
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Bilinmeyen hata';

    // Retry bir kez (1s delay)
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      if (textBlock && 'text' in textBlock) {
        return textBlock.text.trim();
      }
    } catch {
      // Retry de başarısız
    }

    return `AI açıklaması alınamadı: ${errMsg}`;
  }
}
