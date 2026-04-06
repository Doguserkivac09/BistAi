'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Crown, Zap, Star, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlanCard {
  tier: 'free' | 'pro' | 'premium';
  name: string;
  price: number;
  icon: React.ReactNode;
  features: string[];
  popular?: boolean;
}

const plans: PlanCard[] = [
  {
    tier: 'free',
    name: 'Ücretsiz',
    price: 0,
    icon: <Star className="h-6 w-6 text-gray-400" />,
    features: [
      '5 sinyal tarama/gün',
      'Makro radar görüntüleme',
      '30 gün backtesting',
      'Topluluk okuma',
      '5 AI sinyal açıklaması/gün',
      '7 AI asistan mesajı/gün',
    ],
  },
  {
    tier: 'pro',
    name: 'Pro',
    price: 199,
    icon: <Zap className="h-6 w-6 text-blue-400" />,
    popular: true,
    features: [
      'Sınırsız sinyal tarama',
      'Tam makro radar + tarihsel veri',
      'Tam backtesting geçmişi',
      'Topluluk okuma + yazma',
      '50 AI sinyal açıklaması/gün',
      '20 AI asistan mesajı/gün',
      'Detaylı AI yanıtları',
    ],
  },
  {
    tier: 'premium',
    name: 'Premium',
    price: 399,
    icon: <Crown className="h-6 w-6 text-yellow-400" />,
    features: [
      'Pro\'daki her şey',
      'Sınırsız AI sinyal açıklaması',
      '50 AI asistan mesajı/gün',
      'En kapsamlı AI yanıtları',
      'AI Topluluk Botu',
      'Öncelikli destek',
      'Erken erişim yeni özellikler',
    ],
  },
];

export default function FiyatlandirmaPage() {
  const searchParams = useSearchParams();
  const [currentTier, setCurrentTier] = useState<string>('free');
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutCanceled, setCheckoutCanceled] = useState(false);

  // Mevcut tier'ı al
  useEffect(() => {
    async function fetchTier() {
      try {
        const res = await fetch('/api/profile');
        if (res.ok) {
          const data = await res.json();
          setCurrentTier(data.tier ?? 'free');
        }
      } catch {
        // ignore
      }
    }
    fetchTier();
  }, []);

  // Checkout iptal durumu
  useEffect(() => {
    if (searchParams.get('checkout') === 'canceled') {
      setCheckoutCanceled(true);
      setTimeout(() => setCheckoutCanceled(false), 5000);
    }
  }, [searchParams]);

  const handleCheckout = async (tier: string) => {
    if (tier === 'free' || tier === currentTier) return;
    setLoading(tier);
    setError(null);

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? 'Ödeme başlatılamadı');

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ödeme başlatılamadı');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-5xl px-4 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-text-primary mb-3">
            Planını Seç
          </h1>
          <p className="text-text-secondary max-w-lg mx-auto">
            BIST analizlerinde bir adım öne geç. İstediğin zaman iptal et.
          </p>
        </div>

        {/* Feedback */}
        {checkoutCanceled && (
          <div className="mb-6 flex items-center justify-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 max-w-md mx-auto">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <span className="text-sm text-yellow-400">Ödeme iptal edildi.</span>
          </div>
        )}
        {error && (
          <div className="mb-6 flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 max-w-md mx-auto">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span className="text-sm text-red-400">{error}</span>
          </div>
        )}

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = currentTier === plan.tier;
            const isDowngrade =
              (currentTier === 'premium' && plan.tier !== 'premium') ||
              (currentTier === 'pro' && plan.tier === 'free');

            return (
              <Card
                key={plan.tier}
                className={cn(
                  'border-border relative',
                  plan.popular && 'border-primary ring-1 ring-primary'
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-background">
                    Popüler
                  </div>
                )}
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto mb-2">{plan.icon}</div>
                  <CardTitle className="text-lg font-bold text-text-primary">
                    {plan.name}
                  </CardTitle>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-text-primary">
                      {plan.price === 0 ? 'Ücretsiz' : `₺${plan.price}`}
                    </span>
                    {plan.price > 0 && (
                      <span className="text-sm text-text-secondary">/ay</span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2.5 mb-6">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                        <Check className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>
                      <CheckCircle className="h-4 w-4 mr-1.5" />
                      Mevcut Planınız
                    </Button>
                  ) : isDowngrade ? (
                    <Button variant="outline" className="w-full" disabled>
                      Downgrade
                    </Button>
                  ) : plan.tier === 'free' ? (
                    <Button variant="outline" className="w-full" disabled>
                      Ücretsiz
                    </Button>
                  ) : (
                    <Button
                      className={cn('w-full', plan.popular && 'bg-primary hover:bg-primary/90')}
                      onClick={() => handleCheckout(plan.tier)}
                      disabled={loading !== null}
                    >
                      {loading === plan.tier ? 'Yönlendiriliyor...' : 'Başla'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* FAQ / Note */}
        <div className="mt-12 text-center">
          <p className="text-xs text-text-secondary max-w-lg mx-auto">
            Tüm ödemeler Stripe üzerinden güvenle işlenir. İstediğiniz zaman profil sayfanızdan aboneliğinizi yönetebilirsiniz.
          </p>
        </div>
      </main>
    </div>
  );
}
