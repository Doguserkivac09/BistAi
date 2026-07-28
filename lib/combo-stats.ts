/**
 * Sinyal BİRLEŞİM (combo) istatistikleri — "confluence"in veriyle ölçümü.
 *
 * Tek sinyaller BIST'te komisyonu zor geçerken (bkz. signal-stats), aynı hisse +
 * aynı gün + aynı yönde ATEŞLEYEN sinyal SETLERİ tarihsel olarak çok daha iyi
 * getiri üretiyor (co-occurrence = confluence). Bu modül o birleşimlerin geçmiş
 * isabet/getiri istatistiğini üretir; kart üzerinde "onaylı kurulum" rozeti +
 * gerçek geçmiş oran (n ile) göstermek için kullanılır.
 *
 * TASARIM KARARLARI (overfitting'e karşı):
 *  - Spesifik combo HARDCODE EDİLMEZ — istatistik geçmişten canlı hesaplanır, cron
 *    periyodik tazeler → ileriye dönük veriyle kendini düzeltir.
 *  - Sağlamlık kapısı: min örneklem (n) + pozitif net beklenti geçmeyen combo
 *    "güçlü" sayılmaz (küçük-n şansını elemek için).
 *  - Ölçüm horizonu SABİT 7g (tüm evaluated satırlarda mevcut → combo'lar arası
 *    kıyaslanabilir; combo üyelerinin kendi kanonik ufkundan bağımsız tek ölçü).
 *  - Getiri yön-düzeltmeli + komisyon dahil net (signal-stats ile aynı tanım).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Komisyon (gidiş-dönüş, decimal kesir ölçeğinde — 0.004 = %0.4) */
const COMMISSION = 0.004;

/** ai_cache anahtarı (migration yok — sector-medians deseni) */
const CACHE_KEY = 'combo-stats:BIST';
/** TTL — haftalık cron tazeler, biraz pay bırak */
const TTL_MS = 10 * 24 * 60 * 60 * 1000;

/** Ölçüm ufku — tüm evaluated satırlarda dolu, combo'lar arası kıyas için sabit */
export const COMBO_HORIZON: 'return_7d' = 'return_7d';

export interface ComboStatsInputRow {
  sembol: string;
  entry_time: string;
  direction: string | null;
  signal_type: string;
  return_7d: number | null;
}

export interface ComboStat {
  /** Sıralı, ' + ' ile birleştirilmiş sinyal tipleri (kanonik anahtar) */
  key: string;
  /** Combo üyeleri (sıralı) */
  members: string[];
  /** Combo büyüklüğü (2 veya 3) */
  size: 2 | 3;
  /** Co-occurrence olay sayısı (örneklem) */
  n: number;
  /** İsabet oranı % (net > 0) */
  winRate: number;
  /** Ortalama net getiri % */
  avgNet: number;
}

export interface ComboStatsThresholds {
  /** İkili için min örneklem */
  minNPair: number;
  /** Üçlü için min örneklem */
  minNTriple: number;
  /** "Güçlü" sayılmak için min ort. net getiri % */
  minAvgNet: number;
}

export const DEFAULT_COMBO_THRESHOLDS: ComboStatsThresholds = {
  minNPair: 50,
  minNTriple: 40,
  minAvgNet: 0.5,
};

// ── Yardımcılar ────────────────────────────────────────────────────────

/** k-kombinasyonları (sıralı girdi → sıralı çıktı) */
function kCombinations<T>(arr: T[], k: number): T[][] {
  const res: T[][] = [];
  const rec = (start: number, cur: T[]) => {
    if (cur.length === k) { res.push([...cur]); return; }
    for (let i = start; i < arr.length; i++) { cur.push(arr[i]!); rec(i + 1, cur); cur.pop(); }
  };
  rec(0, []);
  return res;
}

// ── Ana hesap ──────────────────────────────────────────────────────────

/**
 * Geçmiş satırlardan combo istatistiklerini üretir (TÜM ikili+üçlüler, gate'siz ham).
 * Gate uygulaması için `filterStrongCombos` kullan.
 */
export function computeComboStats(rows: ComboStatsInputRow[]): ComboStat[] {
  // 1) Co-occurrence olayları: sembol|gün|yön → sinyal seti + ortak 7g getiri
  const events = new Map<string, { types: Set<string>; ret: number; dir: string }>();
  for (const r of rows) {
    if (r.return_7d == null || !Number.isFinite(r.return_7d)) continue;
    const day = r.entry_time.slice(0, 10);
    const key = `${r.sembol}|${day}|${r.direction ?? 'yukari'}`;
    if (!events.has(key)) events.set(key, { types: new Set(), ret: r.return_7d, dir: r.direction ?? 'yukari' });
    events.get(key)!.types.add(r.signal_type);
  }

  // 2) Her olayın net getirisini combo'lara dağıt (olay başına tek kez)
  const acc = new Map<string, { members: string[]; size: 2 | 3; nets: number[] }>();
  const add = (members: string[], size: 2 | 3, net: number) => {
    const key = members.join(' + ');
    if (!acc.has(key)) acc.set(key, { members, size, nets: [] });
    acc.get(key)!.nets.push(net);
  };
  for (const ev of events.values()) {
    const net = (ev.dir === 'asagi' ? -ev.ret : ev.ret) - COMMISSION;
    const types = [...ev.types].sort();
    if (types.length < 2) continue;
    for (const c of kCombinations(types, 2)) add(c, 2, net);
    if (types.length >= 3) for (const c of kCombinations(types, 3)) add(c, 3, net);
  }

  // 3) Özetle
  const out: ComboStat[] = [];
  for (const [key, g] of acc) {
    const n = g.nets.length;
    const wins = g.nets.filter((x) => x > 0).length;
    const avg = g.nets.reduce((a, b) => a + b, 0) / n;
    out.push({ key, members: g.members, size: g.size, n, winRate: (wins / n) * 100, avgNet: avg * 100 });
  }
  return out.sort((a, b) => b.avgNet - a.avgNet);
}

/**
 * Sağlamlık kapısını geçen "güçlü" combo'lar (küçük-n şansını + negatifleri eler).
 */
export function filterStrongCombos(
  stats: ComboStat[],
  t: ComboStatsThresholds = DEFAULT_COMBO_THRESHOLDS,
): ComboStat[] {
  return stats
    .filter((s) => s.avgNet >= t.minAvgNet && s.winRate > 50 && s.n >= (s.size === 2 ? t.minNPair : t.minNTriple))
    .sort((a, b) => b.avgNet - a.avgNet);
}

/**
 * Bir hissenin AKTİF sinyalleri arasında bulunan en güçlü combo'yu döndürür.
 * Öncelik: önce üçlü (daha spesifik), sonra ikili; eşit boyutta yüksek avgNet.
 * `strong` = filterStrongCombos çıktısı (yalnız gate geçenler).
 */
export function detectBestCombo(activeSignals: string[], strong: ComboStat[]): ComboStat | null {
  const active = new Set(activeSignals);
  const matched = strong.filter((c) => c.members.every((m) => active.has(m)));
  if (matched.length === 0) return null;
  // Önce boyut (üçlü > ikili), sonra ort. net getiri
  matched.sort((a, b) => (b.size - a.size) || (b.avgNet - a.avgNet));
  return matched[0]!;
}

// ── ai_cache saklama (migration yok) ───────────────────────────────────

/** Güçlü combo tablosunu ai_cache'e yazar. */
export async function storeStrongCombos(sb: SupabaseClient, strong: ComboStat[]): Promise<void> {
  await sb.from('ai_cache').upsert({
    cache_key: CACHE_KEY,
    explanation: JSON.stringify(strong),
    version: 1,
    hit_count: 0,
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
  }, { onConflict: 'cache_key' });
}

/** Saklanan güçlü combo tablosunu okur. Yoksa/eskiyse boş dizi. */
export async function getStoredStrongCombos(sb: SupabaseClient): Promise<ComboStat[]> {
  try {
    const { data } = await sb
      .from('ai_cache')
      .select('explanation')
      .eq('cache_key', CACHE_KEY)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (!data?.explanation) return [];
    const parsed = JSON.parse(data.explanation);
    return Array.isArray(parsed) ? (parsed as ComboStat[]) : [];
  } catch {
    return [];
  }
}
