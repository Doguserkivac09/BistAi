import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

/**
 * Stripe Webhook Handler.
 * Abonelik oluşturma, güncelleme, iptal olaylarını dinler.
 *
 * POST /api/stripe/webhook
 *
 * Phase 11.4
 */

// Service role client (RLS bypass) — webhook'larda user context yok
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return createClient(url, serviceKey);
}

// Tier mapping from Stripe Price ID
function getTierFromPriceId(priceId: string): 'pro' | 'premium' | null {
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro';
  if (priceId === process.env.STRIPE_PRICE_PREMIUM) return 'premium';
  return null;
}

async function handleSubscriptionEvent(subscription: Stripe.Subscription) {
  const supabase = getServiceClient();
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id;

  // Price ID'den tier belirle
  const priceId = subscription.items.data[0]?.price?.id ?? '';
  const tier = getTierFromPriceId(priceId);

  // Status mapping
  const status = subscription.status; // active, past_due, canceled, trialing, etc.
  const mappedStatus = ['active', 'past_due', 'canceled', 'trialing'].includes(status)
    ? status
    : 'none';

  // Period end: subscription item'dan veya cancel_at'dan al
  const periodEnd = subscription.items?.data?.[0]?.current_period_end
    ?? subscription.cancel_at
    ?? null;

  const updates: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    subscription_status: mappedStatus,
    tier_expires_at: periodEnd
      ? new Date(periodEnd * 1000).toISOString()
      : null,
  };

  // Tier güncelle (active veya trialing ise)
  if (tier && (status === 'active' || status === 'trialing')) {
    updates.tier = tier;
  } else if (status === 'canceled' || status === 'unpaid') {
    updates.tier = 'free';
  }

  await supabase
    .from('profiles')
    .update(updates)
    .eq('stripe_customer_id', customerId);
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Session metadata'dan user ID al
  const userId = session.metadata?.supabase_user_id;
  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id;

  if (userId && customerId) {
    const supabase = getServiceClient();
    // stripe_customer_id'yi güncelle (checkout sırasında da yapılıyor ama emin ol)
    await supabase
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', userId);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Webhook yapılandırması eksik.' }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch {
      return NextResponse.json({ error: 'Geçersiz webhook imzası.' }, { status: 400 });
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionEvent(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_failed':
        // Ödeme başarısız — tier'ı hemen değiştirme, Stripe retry edecek
        // past_due durumu subscription.updated ile gelecek
        break;

      default:
        // Diğer event'ler ignore
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook hatası';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
