/**
 * Tier-gating helper.
 * Kullanıcının tier'ına göre özellik erişimini kontrol eder.
 *
 * Phase 11.6
 */

export type Tier = 'free' | 'pro' | 'premium';

const TIER_LEVEL: Record<Tier, number> = {
  free: 0,
  pro: 1,
  premium: 2,
};

/** Kullanıcının tier'ı gereken minimum tier'a eşit veya üstünde mi? */
export function hasTierAccess(userTier: Tier, requiredTier: Tier): boolean {
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
  return TIER_LIMITS[tier] ?? TIER_LIMITS.free;
}

/** Upgrade gerekli mi? (UI'da "Upgrade" CTA göstermek için) */
export function needsUpgrade(userTier: Tier, feature: keyof FeatureLimits): boolean {
  const limits = getFeatureLimits(userTier);
  const value = limits[feature];
  if (typeof value === 'boolean') return !value;
  if (typeof value === 'number') return value <= 0;
  return false;
}
