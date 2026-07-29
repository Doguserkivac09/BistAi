/**
 * Kâr Kalitesi precompute runner (Bilanço B1 → Fırsatlar risk uyarısı).
 *
 * DOĞRULAMA KARARI (28 Tem 2026): kâr kalitesi skoru getiri-ALFA değil, RİSK merceği.
 * Skoru Fırsatlar sıralamasına BAĞLAMAYIZ. Yalnız doğrulanmış robust parçayı —
 * "finansman yükü" + kırmızı bayraklar — kartta RİSK UYARISI olarak gösteririz.
 *
 * İş Yatırım fan-out ağır → cron precompute, tek konsolide ai_cache satırı (map),
 * firsatlar tek okur (istek-anı fan-out YOK). growth-momentum-runner deseni.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchIsyFinancials, toStandaloneQuarters, recentQuarterRefs } from '@/lib/isyatirim-financials';
import { computeEarningsQuality } from '@/lib/earnings-quality-engine';

const CACHE_KEY = 'earnings-quality:MAP:BIST';
const TTL_MS = 10 * 24 * 60 * 60 * 1000;

/** Kart için sadeleştirilmiş kayıt (yalnız risk-ilgili alanlar). */
export interface EarningsFlagEntry {
  verdict: string;
  score: number;
  financeBurden: boolean;   // "finansman-yükü" flag'i (DOĞRULANMIŞ robust risk)
  redFlag: string | null;   // ilk kırmızı bayrak etiketi (kağıt-üstü/faaliyet-zararı/parasal-şişkin)
  lastQuarter: string;
}

export type EarningsFlagMap = Record<string, EarningsFlagEntry>;

/** Bir sembol grubu için kâr-kalitesi risk kayıtlarını hesaplar. */
export async function runEarningsQuality(
  symbols: string[],
  opts: { inflationRate?: number; concurrency?: number } = {},
): Promise<{ map: EarningsFlagMap; ok: number; skipped: number }> {
  const map: EarningsFlagMap = {};
  let ok = 0, skipped = 0;
  const conc = opts.concurrency ?? 4;
  const now = new Date();
  const m = now.getUTCMonth();
  const nowQ = (m < 3 ? 1 : m < 6 ? 2 : m < 9 ? 3 : 4) as 1 | 2 | 3 | 4;
  const refs = recentQuarterRefs(now.getUTCFullYear(), nowQ, 8);

  for (let i = 0; i < symbols.length; i += conc) {
    const chunk = symbols.slice(i, i + conc);
    await Promise.all(chunk.map(async (sembol) => {
      try {
        const { isBank, periods } = await fetchIsyFinancials(sembol, refs);
        if (isBank) { skipped++; return; }
        const quarters = toStandaloneQuarters(periods).filter((q) => q.fields.revenue != null);
        if (quarters.length === 0) { skipped++; return; }
        const r = computeEarningsQuality(quarters, { inflationRate: opts.inflationRate });
        if (!r.applicable) { skipped++; return; }
        const redFlag = r.flags.find((f) => f.tone === 'kırmızı')?.label ?? null;
        map[sembol] = {
          verdict: r.verdict, score: r.score,
          financeBurden: r.flags.some((f) => f.code === 'finansman-yükü'),
          redFlag, lastQuarter: quarters[quarters.length - 1]!.label,
        };
        ok++;
      } catch { skipped++; }
    }));
  }
  return { map, ok, skipped };
}

/** ai_cache'e MERGE ederek yazar (part-bazlı cron için). */
export async function storeEarningsFlags(sb: SupabaseClient, partial: EarningsFlagMap): Promise<void> {
  const existing = await getEarningsFlags(sb);
  const merged = { ...existing, ...partial };
  await sb.from('ai_cache').upsert({
    cache_key: CACHE_KEY, explanation: JSON.stringify(merged), version: 1, hit_count: 0,
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
  }, { onConflict: 'cache_key' });
}

/** Saklanan risk map'ini okur (yoksa boş). expires kontrolü YOK — stale bile faydalı (çeyreklik). */
export async function getEarningsFlags(sb: SupabaseClient): Promise<EarningsFlagMap> {
  try {
    const { data } = await sb.from('ai_cache').select('explanation').eq('cache_key', CACHE_KEY).maybeSingle();
    if (!data?.explanation) return {};
    const parsed = JSON.parse(data.explanation);
    return parsed && typeof parsed === 'object' ? parsed as EarningsFlagMap : {};
  } catch { return {}; }
}
