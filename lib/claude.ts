/**
 * Claude API ile sinyal açıklaması üretimi.
 * Model: claude-3-5-haiku (maliyet verimliliği için)
 *
 * v2 (Phase 6.2): Makro bağlam + sektör + risk bilgisi eklendi.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { StockSignal } from '@/types';
import type { CompositeContext } from './composite-signal';

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
  _priceData?: { lastClose?: number; lastDate?: string }
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return 'AI açıklaması için ANTHROPIC_API_KEY ortam değişkeni tanımlanmalı.';
  }

  const userPrompt = `Hisse: ${signal.sembol}
Sinyal tipi: ${signal.type}
Sinyal yönü: ${signal.direction}
Sinyal şiddeti: ${signal.severity}
Ek veri: ${JSON.stringify(signal.data)}
Bu sinyali yatırımcıya kısaca açıkla.`;

  return callClaude(apiKey, SYSTEM_PROMPT, userPrompt);
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

  return callClaude(apiKey, SYSTEM_PROMPT_V2, userPrompt, 384);
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
      model: 'claude-3-5-haiku-20241022',
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
        model: 'claude-3-5-haiku-20241022',
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
