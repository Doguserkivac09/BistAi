/**
 * Kullanıcı Girdi Sanitizasyonu — Prompt Injection Koruması
 *
 * B4 — AI prompt'larına giden kullanıcı kontrollü alanları temizler.
 *
 * Strateji:
 * 1. Uzunluk kısıtı (büyük payload saldırılarını engeller)
 * 2. Kontrol karakterlerini kaldır
 * 3. Açık prompt injection pattern'larını nötrleştir
 */

const INJECTION_PATTERNS: RegExp[] = [
  // "ignore/disregard previous/prior/above instructions"
  /ignore\s+(all\s+)?(previous|prior|above|earlier)?\s*instructions/gi,
  /disregard\s+(all\s+)?(previous|prior|above|earlier)?\s*instructions/gi,
  // "forget everything / the above"
  /forget\s+(everything|all(\s+of\s+the\s+above)?|the\s+above)/gi,
  // "you are now a X" — persona hijack
  /you\s+are\s+now\s+(a\s+|an\s+)?/gi,
  // "new role/persona/instructions:"
  /new\s+(role|persona|identity|instructions?)\s*:/gi,
  // System tag injection
  /\[\s*system\s*\]/gi,
  /<\s*\/?\s*system\s*>/gi,
  /^\s*system\s*:\s*/gim,
  // LLaMA/Mistral style tokens
  /\[INST\]|\[\/INST\]|\[SYS\]|\[\/SYS\]/g,
  // Common jailbreak keywords
  /\bJAILBREAK\b/gi,
  /\bBYPASS\s+SAFETY\b/gi,
  // "reveal/print/show your system prompt"
  /(?:reveal|print|show|output|display)\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions?)/gi,
  // "act as DAN / act as an AI without restrictions"
  /act\s+as\s+(?:dan|an?\s+ai\s+without)/gi,
];

/**
 * Kullanıcı kontrollü metni AI prompt'una koymadan önce temizler.
 *
 * @param input - Ham girdi (kullanıcıdan gelen)
 * @param maxLength - İzin verilen maksimum uzunluk
 * @returns Temizlenmiş metin
 */
export function sanitizeUserInput(input: string, maxLength: number): string {
  if (!input || typeof input !== 'string') return '';

  // 1. Uzunluk kısıtı
  let s = input.slice(0, maxLength);

  // 2. Kontrol karakterlerini kaldır (newline \n ve tab \t korunur)
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 3. Injection pattern'larını nötrleştir
  for (const pattern of INJECTION_PATTERNS) {
    s = s.replace(pattern, '[...]');
  }

  return s.trim();
}

/**
 * Hisse senedi ticker'ını doğrular.
 * BIST ticker'ları: 1-10 büyük harf + rakam (örn: THYAO, GARAN, XU100)
 */
export function sanitizeTicker(input: unknown): string {
  if (typeof input !== 'string') return '';
  return /^[A-Z0-9]{1,10}$/.test(input.trim().toUpperCase())
    ? input.trim().toUpperCase()
    : '';
}
