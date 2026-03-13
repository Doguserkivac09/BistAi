'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase';

export default function SifreSifirlaPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/sifre-guncelle`,
      });
      if (err) {
        setError(err.message);
        return;
      }
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
        <Card className="w-full max-w-md border-border bg-surface/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Şifre Sıfırlama</CardTitle>
            <CardDescription>
              {sent
                ? 'E-posta adresinize şifre sıfırlama bağlantısı gönderildi.'
                : 'Kayıtlı e-posta adresinizi girin.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-bullish/50 bg-bullish/10 px-3 py-2 text-sm text-bullish">
                  Şifre sıfırlama bağlantısı <strong>{email}</strong> adresine gönderildi.
                  Gelen kutunuzu kontrol edin.
                </div>
                <Link href="/giris">
                  <Button variant="outline" className="w-full">
                    Giriş sayfasına dön
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-lg border border-bearish/50 bg-bearish/10 px-3 py-2 text-sm text-bearish">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">E-posta</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="ornek@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="border-border bg-surface"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Gönderiliyor...' : 'Sıfırlama Bağlantısı Gönder'}
                </Button>
              </form>
            )}
            <p className="mt-4 text-center text-sm text-text-secondary">
              <Link href="/giris" className="text-primary hover:underline">
                Giriş sayfasına dön
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
