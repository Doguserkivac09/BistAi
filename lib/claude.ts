/**
 * Claude API ile sinyal açıklaması üretimi.
 * Model: claude-3-5-haiku (maliyet verimliliği için)
 */

import Anthropic from '@anthropic-ai/sdk';
import type { StockSignal } from '@/types';

const SYSTEM_PROMPT = `Sen BistAI'ın borsa analiz asistanısın. Türk bireysel yatırımcılara ve traderlara teknik analiz sinyallerini sade, anlaşılır Türkçe ile açıklıyorsun. Jargonu minimumda tut, somut ol. Cevabın maksimum 3 cümle olsun.`;

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

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (textBlock && 'text' in textBlock) {
      return textBlock.text.trim();
    }
    return 'Açıklama oluşturulamadı.';
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return `AI açıklaması alınamadı: ${message}`;
  }
}
