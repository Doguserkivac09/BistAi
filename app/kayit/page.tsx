'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase';

export default function KayitPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/dashboard` },
      });
      if (err) {
        setError(
          err.message.includes('already registered')
            ? 'Bu e-posta adresi zaten kayıtlı. Giriş yapın.'
            : err.message
        );
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push('/dashboard'), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kayıt oluşturulamadı.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
        <Card className="w-full max-w-md border-border bg-surface/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Ücretsiz Başla</CardTitle>
            <CardDescription>BistAI hesabı oluşturun.</CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="rounded-lg border border-bullish/50 bg-bullish/10 px-3 py-2 text-sm text-bullish">
                Kayıt başarılı. E-posta doğrulama linki gönderildi (veya oturum açıldı). Yönlendiriliyorsunuz...
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
                <div className="space-y-2">
                  <Label htmlFor="password">Şifre</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="border-border bg-surface"
                  />
                  <p className="text-xs text-text-secondary">En az 6 karakter.</p>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Kaydediliyor...' : 'Kayıt Ol'}
                </Button>
              </form>
            )}
            {!success && (
              <p className="mt-4 text-center text-sm text-text-secondary">
                Zaten hesabınız var mı?{' '}
                <Link href="/giris" className="text-primary hover:underline">
                  Giriş yapın
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
