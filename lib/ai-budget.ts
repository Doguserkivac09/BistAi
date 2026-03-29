/**
 * AI Bütçe Limiti — Günlük Global Koruma
 *
 * Tüm AI endpoint'leri için günlük toplam istek sayacı.
 * Limit aşılırsa yeni AI çağrıları reddedilir.
 *
 * Limit: DAILY_AI_REQUEST_LIMIT (default 150 istek/gün)
 * → Sonnet 150 istek × ~$0.02/istek = ~$3/gün
 * → Haiku   150 istek × ~$0.005/istek = ~$0.75/gün
 *
 * Override: AI_DAILY_LIMIT env değişkeni ile değiştirilebilir.
 *
 * Race condition fix (B2): In-memory sayaç yerine PostgreSQL'in atomik
 * INCREMENT fonksiyonu kullanılır. Her istek DB'ye gider; eş zamanlı
 * isteklerde PostgreSQL row lock sayesinde sadece bir istek limiti aşabilir.
 */

import { createClient } from '@supabase/supabase-js';

const DEFAULT_DAILY_LIMIT = 150;

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDailyLimit(): number {
  const env = process.env.AI_DAILY_LIMIT;
  if (env) {
    const n = parseInt(env, 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return DEFAULT_DAILY_LIMIT;
}

/**
 * Yeni AI isteğini atomik olarak kaydet ve günlük limiti kontrol et.
 *
 * increment_ai_budget() Postgres fonksiyonu:
 * - hit_count < limit ise atomik olarak +1 yapar ve (new_count, true) döner
 * - hit_count >= limit ise satırı değiştirmez, (current_count, false) döner
 * - Eş zamanlı isteklerde PG row lock garantisi sağlar
 *
 * @returns { allowed: boolean; used: number; limit: number }
 */
export async function checkAndRecordAiBudget(): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
}> {
  const limit = getDailyLimit();
  const today = getTodayStr();
  const key = `ai_budget:${today}`;
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 2 gün

  try {
    const admin = getAdminClient();
    const { data, error } = await admin.rpc('increment_ai_budget', {
      p_key: key,
      p_limit: limit,
      p_expires_at: expiresAt,
    });

    if (error) {
      // DB hatası → kullanıcıyı bloklamaktan kaçın, ama logla
      console.error('[ai-budget] RPC hatası:', error.message);
      return { allowed: true, used: 0, limit };
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result) {
      return { allowed: true, used: 0, limit };
    }

    return {
      allowed: Boolean(result.allowed),
      used: Number(result.new_count),
      limit,
    };
  } catch (err) {
    console.error('[ai-budget] Beklenmeyen hata:', err);
    return { allowed: true, used: 0, limit };
  }
}
