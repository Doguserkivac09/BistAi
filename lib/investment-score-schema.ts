/**
 * Investment Score — AI Yorum Yanıt Şeması
 *
 * Claude'un döndüreceği JSON'un katı validasyonu.
 * Herhangi bir alan eksik/bozuksa endpoint fallback mesajla döner.
 */

import { z } from 'zod';

export const AiInvestmentYorumSchema = z.object({
  summary: z.string().min(20).max(700),
  risks: z.array(z.string().min(5).max(220)).min(0).max(5),
  opportunities: z.array(z.string().min(5).max(220)).min(0).max(5),
});

export type AiInvestmentYorum = z.infer<typeof AiInvestmentYorumSchema>;

/**
 * AI hata durumunda kullanılan nötr fallback yorum.
 * Skor yine gösterilir, yorum alanları "şu an kullanılamıyor" mesajı verir.
 */
export const FALLBACK_YORUM: AiInvestmentYorum = {
  summary:
    'AI yorumu şu an üretilemedi. Skor, yukarıdaki deterministik hesaplamayla oluşturulmuştur; alt-skorları inceleyebilirsiniz.',
  risks: [],
  opportunities: [],
};

/**
 * Claude yanıtından JSON objesini dikkatli çıkar.
 * Model bazen ```json ... ``` code fence içinde gönderebilir; bunu soyar.
 * Hata durumunda null döner.
 */
export function safeExtractJson(text: string): unknown {
  if (!text || typeof text !== 'string') return null;

  // Code fence varsa soy
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }

  // İlk { ile son } arasını al
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) return null;

  const slice = cleaned.slice(first, last + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}
