/**
 * Kullanıcı Girdi Sanitizasyonu — Prompt Injection Koruması
 *
 * B4 — AI prompt'larına giden kullanıcı kontrollü alanları temizler.
 *
 * Strateji:
 * 1. Uzunluk kısıtı (büyük payload saldırılarını engeller)
 * 2. Kontrol karakterlerini kaldır
 * 3. Açık prompt injection pattern'larını nötrleştir (EN + TR + unicode)
 * 4. HTML/Markdown injection koruması
 */

const INJECTION_PATTERNS: RegExp[] = [
  // ── English patterns ──────────────────────────────────────────────
  // "ignore/disregard previous/prior/above instructions"
  /ignore\s+(all\s+)?(previous|prior|above|earlier)?\s*instructions/gi,
  /disregard\s+(all\s+)?(previous|prior|above|earlier)?\s*instructions/gi,
  // "forget everything / the above"
  /forget\s+(everything|all(\s+of\s+the\s+above)?|the\s+above)/gi,
  // "you are now a X" — persona hijack
  /you\s+are\s+now\s+(a\s+|an\s+)?/gi,
  // "new role/persona/instructions:"
  /new\s+(role|persona|identity|instructions?)\s*:/gi,
  // "reveal/print/show your system prompt"
  /(?:reveal|print|show|output|display|repeat|dump)\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions?|rules?)/gi,
  // "act as DAN / act as an AI without restrictions"
  /act\s+as\s+(?:dan|an?\s+ai\s+without)/gi,
  // Common jailbreak keywords
  /\bJAILBREAK\b/gi,
  /\bBYPASS\s+SAFETY\b/gi,
  /\bDO\s+ANYTHING\s+NOW\b/gi,

  // ── Turkish patterns ──────────────────────────────────────────────
  // "önceki talimatları unut/yoksay/görmezden gel"
  /(?:önceki|yukarıdaki|üstteki|eski)\s+(?:talimatları?|kuralları?|yönergeleri?)\s*(?:unut|yoksay|görmezden\s+gel|iptal\s+et)/gi,
  // "yeni görevin/rolün şu"
  /yeni\s+(?:görevin?|rolün?|kimliğin?)\s*[:=]/gi,
  // "artık sen bir..."
  /artık\s+sen\s+(?:bir?\s+)?/gi,
  // "herşeyi unut"
  /her\s*(?:ş|s)eyi?\s+unut/gi,
  // "sistem promptunu göster"
  /(?:sistem|system)\s+(?:promptunu?|talimatlarını?|kurallarını?)\s*(?:göster|yaz|tekrarla|paylaş)/gi,

  // ── System/role tag injection ─────────────────────────────────────
  /\[\s*system\s*\]/gi,
  /<\s*\/?\s*system\s*>/gi,
  /^\s*system\s*:\s*/gim,
  /^\s*assistant\s*:\s*/gim,
  /^\s*human\s*:\s*/gim,
  // LLaMA/Mistral style tokens
  /\[INST\]|\[\/INST\]|\[SYS\]|\[\/SYS\]/g,
  // Anthropic XML tags
  /<\s*\/?\s*(?:function_calls|antml|tool_use|result|thinking)\s*>/gi,

  // ── HTML/script injection ─────────────────────────────────────────
  /<\s*script\b[^>]*>/gi,
  /<\s*iframe\b[^>]*>/gi,
  /<\s*img\b[^>]*\bonerror\b/gi,
];

/**
 * Normalize unicode homoglyphs — Kiril, Greek gibi lookalike harfleri Latin'e çevir.
 * Injection'ı "іgnore" (Kiril і) yerine "ignore" yaparak regex'lerin yakalamasını sağlar.
 */
function normalizeHomoglyphs(s: string): string {
  // Common Cyrillic → Latin lookalikes
  const map: Record<string, string> = {
    '\u0430': 'a', '\u0435': 'e', '\u043E': 'o', '\u0440': 'p',
    '\u0441': 'c', '\u0443': 'y', '\u0456': 'i', '\u0445': 'x',
    '\u043A': 'k', '\u043C': 'm', '\u0442': 't', '\u043D': 'n',
    // Uppercase
    '\u0410': 'A', '\u0415': 'E', '\u041E': 'O', '\u0420': 'P',
    '\u0421': 'C', '\u0423': 'Y', '\u0406': 'I', '\u0425': 'X',
  };
  return s.replace(/[\u0400-\u04FF]/g, ch => map[ch] ?? ch);
}

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

  // 3. Unicode homoglyph normalizasyonu
  s = normalizeHomoglyphs(s);

  // 4. Injection pattern'larını nötrleştir
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

/**
 * KAP duyuru alanlarını sanitize et (başlık, şirket adı vb.)
 * Bu alanlar client'tan gelip doğrudan prompt'a ekleniyor.
 */
export function sanitizeKapField(input: string, maxLength = 200): string {
  return sanitizeUserInput(input, maxLength);
}
