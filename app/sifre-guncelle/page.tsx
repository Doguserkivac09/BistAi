'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase';

export default function SifreGuncellePage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Supabase recovery token'ı URL hash'inden otomatik olarak session'a çevirir
    const supabase = createClient();
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      }
    });
    // Sayfa yüklendiğinde zaten session varsa da hazır say
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSessionReady(true);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Şifreler eşleşmiyor.');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        setError(err.message);
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push('/dashboard'), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }

  if (!sessionReady) {
    return (
      <div className="min-h-screen bg-background">
        <main className="container mx-auto flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
          <Card className="w-full max-w-md border-border bg-surface/80 backdrop-blur-sm">
            <CardContent className="py-12 text-center">
              <p className="text-text-secondary">Oturum doğrulanıyor...</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
        <Card className="w-full max-w-md border-border bg-surface/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Yeni Şifre Belirle</CardTitle>
            <CardDescription>
              {success
                ? 'Şifreniz başarıyla güncellendi!'
                : 'Yeni şifrenizi girin.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-bullish/50 bg-bullish/10 px-3 py-2 text-sm text-bullish">
                  Şifreniz güncellendi. Dashboard&apos;a yönlendiriliyorsunuz...
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-lg border border-bearish/50 bg-bearish/10 px-3 py-2 text-sm text-bearish">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="password">Yeni Şifre</Label>
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
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Şifre Tekrar</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="border-border bg-surface"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
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
