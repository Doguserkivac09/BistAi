/**
 * Tier-gating helper.
 * Kullanıcının tier'ına göre özellik erişimini kontrol eder.
 *
 * Phase 11.6
 */

export type Tier = 'free' | 'pro' | 'premium';

/**
 * ⚠️ GEÇİCİ TANITIM MODU — pro/premium özellikler HERKESE AÇIK.
 *
 * Özellikler "PREMIUM" rozetiyle işaretli kalmaya devam eder (kullanıcı bunun
 * ücretli bir özellik olduğunu görür, ileride kapanınca sürpriz olmaz), yalnız
 * erişim engeli kalkar.
 *
 * KAPATMAK İÇİN: aşağıyı `false` yap ve deploy et. Başka hiçbir dosyaya
 * dokunmaya gerek yok — tüm kapılar (hasTierAccess / getFeatureLimits /
 * topluluk AI yorumları / UI rozetleri) bu tek bayrağı okur.
 */
export const PREMIUM_PREVIEW = true;

const TIER_LEVEL: Record<Tier, number> = {
  free: 0,
  pro: 1,
  premium: 2,
};

/** Kullanıcının tier'ı gereken minimum tier'a eşit veya üstünde mi? */
export function hasTierAccess(userTier: Tier, requiredTier: Tier): boolean {
  if (PREMIUM_PREVIEW) return true; // tanıtım modu — erişim açık
  return TIER_LEVEL[userTier] >= TIER_LEVEL[requiredTier];
}

/** Özellik bazlı limit tanımları */
export interface FeatureLimits {
  signalScansPerDay: number;
  aiExplanationsPerDay: number;
  backtestingDays: number;
  communityWrite: boolean;
  communityAiBot: boolean;
  macroHistory: boolean;
}

export const TIER_LIMITS: Record<Tier, FeatureLimits> = {
  free: {
    signalScansPerDay: 5,
    aiExplanationsPerDay: 5,
    backtestingDays: 30,
    communityWrite: false,
    communityAiBot: false,
    macroHistory: false,
  },
  pro: {
    signalScansPerDay: Infinity,
    aiExplanationsPerDay: 50,
    backtestingDays: 365,
    communityWrite: true,
    communityAiBot: false,
    macroHistory: true,
  },
  premium: {
    signalScansPerDay: Infinity,
    aiExplanationsPerDay: Infinity,
    backtestingDays: 365,
    communityWrite: true,
    communityAiBot: true,
    macroHistory: true,
  },
};

/** Kullanıcının belirli bir özelliğe erişimi var mı? */
export function getFeatureLimits(tier: Tier): FeatureLimits {
  // Tanıtım modunda günlük limitler de premium seviyede (erişim açıkken günde 5
  // AI açıklaması ile sınırlamak tutarsız olurdu). Global AI harcama koruması
  // (lib/ai-budget) bundan bağımsız çalışmaya devam eder.
  if (PREMIUM_PREVIEW) return TIER_LIMITS.premium;
  return TIER_LIMITS[tier] ?? TIER_LIMITS.free;
}

/** Upgrade gerekli mi? (UI'da "Upgrade" CTA göstermek için) */
export function needsUpgrade(userTier: Tier, feature: keyof FeatureLimits): boolean {
  // Bilinçli olarak getFeatureLimits DEĞİL: bu bir UI göstergesi ("bu özellik
  // ücretli mi?"). Tanıtım modunda erişim açık olsa da rozet/CTA gerçek tier'a
  // göre görünmeli — kullanıcı özelliğin premium olduğunu bilmeye devam etsin.
  const limits = TIER_LIMITS[userTier] ?? TIER_LIMITS.free;
  const value = limits[feature];
  if (typeof value === 'boolean') return !value;
  if (typeof value === 'number') return value <= 0;
  return false;
}
