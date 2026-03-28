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
 */

import { createClient } from '@supabase/supabase-js';

const DEFAULT_DAILY_LIMIT = 150;

// In-memory sayaç (cold start'ta sıfırlanır ama Supabase'den sync edilir)
let dailyCount = 0;
let lastSyncDate = '';
let lastSyncTs   = 0;
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 dakikada bir Supabase'den sync et

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
 * Günlük sayacı Supabase'den çek (cache ile).
 * ai_cache tablosunu kullanır — ayrı tablo gerektirmez.
 */
async function syncFromDb(): Promise<void> {
  const today = getTodayStr();
  if (today !== lastSyncDate || Date.now() - lastSyncTs > SYNC_INTERVAL_MS) {
    try {
      const admin = getAdminClient();
      const key = `ai_budget:${today}`;
      const { data } = await admin
        .from('ai_cache')
        .select('hit_count')
        .eq('cache_key', key)
        .single();

      if (today !== lastSyncDate) {
        // Yeni gün — sayacı sıfırla
        dailyCount = data?.hit_count ?? 0;
      } else {
        dailyCount = data?.hit_count ?? dailyCount;
      }
      lastSyncDate = today;
      lastSyncTs   = Date.now();
    } catch { /* sessizce geç — in-memory sayacı kullan */ }
  }
}

/**
 * Yeni AI isteğini kaydet ve günlük limiti kontrol et.
 * @returns { allowed: boolean; used: number; limit: number }
 */
export async function checkAndRecordAiBudget(): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
}> {
  await syncFromDb();

  const limit = getDailyLimit();
  const today = getTodayStr();

  if (dailyCount >= limit) {
    return { allowed: false, used: dailyCount, limit };
  }

  // Sayacı artır
  dailyCount++;

  // Supabase'e asenkron yaz (fire & forget — gecikme ekleme)
  const key = `ai_budget:${today}`;
  const admin = getAdminClient();
  void admin.from('ai_cache').upsert({
    cache_key: key,
    explanation: 'budget_counter',
    version: 0,
    hit_count: dailyCount,
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 2 gün
  }, { onConflict: 'cache_key' });

  return { allowed: true, used: dailyCount, limit };
}
