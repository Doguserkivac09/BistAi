import Stripe from 'stripe';

/**
 * Stripe server-side client.
 * Test mode kullanılır, production'da live key'e geçilir.
 *
 * Env:
 *   STRIPE_SECRET_KEY       — sk_test_... veya sk_live_...
 *   STRIPE_WEBHOOK_SECRET   — whsec_...
 *   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — pk_test_... veya pk_live_...
 *
 * Phase 11.1
 */

let _stripe: Stripe | null = null;

/** Lazy-init Stripe client — build time'da çağrılmaz. */
export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY tanımlı değil.');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-02-25.clover',
      typescript: true,
    });
  }
  return _stripe;
}

/** Uyumluluk için eski export (runtime'da çağrılacak yerlerde kullanılır) */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/**
 * Paket tanımları — Stripe Price ID'leri env'den veya sabit değerden gelir.
 * Test modda Stripe Dashboard'dan oluşturulan Price ID'ler buraya yazılır.
 */
export interface PricePlan {
  tier: 'pro' | 'premium';
  name: string;
  price: number; // TL / ay
  priceId: string; // Stripe Price ID
  features: string[];
}

export const PLANS: PricePlan[] = [
  {
    tier: 'pro',
    name: 'Pro',
    price: 149,
    priceId: process.env.STRIPE_PRICE_PRO ?? '',
    features: [
      'Sınırsız sinyal tarama',
      'Tam makro radar + tarihsel veri',
      'Tam backtesting geçmişi',
      'Topluluk okuma + yazma',
      '50 AI açıklama/gün',
    ],
  },
  {
    tier: 'premium',
    name: 'Premium',
    price: 299,
    priceId: process.env.STRIPE_PRICE_PREMIUM ?? '',
    features: [
      'Pro\'daki her şey',
      'Sınırsız AI açıklama',
      'AI Topluluk Botu (yakında)',
      'Öncelikli destek',
      'Erken erişim yeni özellikler',
    ],
  },
];

export const FREE_PLAN = {
  tier: 'free' as const,
  name: 'Ücretsiz',
  price: 0,
  features: [
    '5 sinyal tarama/gün',
    'Makro radar görüntüleme',
    '30 gün backtesting',
    'Topluluk okuma',
    '5 AI açıklama/gün',
  ],
};
