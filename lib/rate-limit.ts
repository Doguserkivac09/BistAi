/**
 * In-memory sliding window rate limiter.
 * Production'da Redis'e geçilebilir; şimdilik serverless-friendly Map kullanıyoruz.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Bellek sızıntısını önlemek için periyodik temizlik
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  for (const [key, entry] of Array.from(store.entries())) {
    entry.timestamps = entry.timestamps.filter((t: number) => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

/**
 * IP bazlı rate limit kontrolü.
 * @param key - Genellikle IP adresi veya "IP:endpoint"
 * @param maxRequests - Window içinde izin verilen max istek sayısı
 * @param windowMs - Sliding window süresi (ms)
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  cleanup(windowMs);

  const now = Date.now();
  const cutoff = now - windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Eski timestamp'leri temizle
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      resetMs: oldest + windowMs - now,
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: maxRequests - entry.timestamps.length,
    resetMs: windowMs,
  };
}

/**
 * Next.js API route'ları için IP çıkarma.
 * Güvenilir header öncelik sırası: cf-connecting-ip → x-real-ip → x-forwarded-for (ilk IP)
 * x-forwarded-for proxy arkasında spooflanabilir, bu yüzden son tercih.
 */
function isValidIPv4(ip: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
}

export function getClientIP(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip')?.trim();
  if (cf && isValidIPv4(cf)) return cf;

  const real = headers.get('x-real-ip')?.trim();
  if (real && isValidIPv4(real)) return real;

  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded && isValidIPv4(forwarded)) return forwarded;

  return '127.0.0.1';
}
