import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { stripe, PLANS } from '@/lib/stripe';

/**
 * Stripe Checkout Session oluşturma.
 *
 * POST /api/stripe/checkout
 * Body: { tier: "pro" | "premium" }
 *
 * Phase 11.3
 */

export async function POST(request: NextRequest) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Ödeme sistemi henüz yapılandırılmadı.' }, { status: 503 });
    }

    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Giriş yapmanız gerekiyor.' }, { status: 401 });
    }

    const body = await request.json();
    const tier = body.tier as string;

    const plan = PLANS.find((p) => p.tier === tier);
    if (!plan || !plan.priceId) {
      return NextResponse.json({ error: 'Geçersiz paket.' }, { status: 400 });
    }

    // Profili çek
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, tier')
      .eq('id', user.id)
      .single();

    // Zaten bu tier'daysa
    if (profile?.tier === tier) {
      return NextResponse.json({ error: 'Zaten bu pakete sahipsiniz.' }, { status: 400 });
    }

    // Stripe customer oluştur veya mevcut olanı kullan
    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      // Customer ID'yi kaydet
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // Checkout session oluştur
    const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: plan.priceId, quantity: 1 }],
      success_url: `${origin}/profil?checkout=success`,
      cancel_url: `${origin}/fiyatlandirma?checkout=canceled`,
      metadata: {
        supabase_user_id: user.id,
        tier,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
