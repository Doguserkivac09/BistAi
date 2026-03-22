'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { User, Save, AlertTriangle, CheckCircle, CreditCard, ExternalLink, Bell, BellOff, Lock } from 'lucide-react';

interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  tier: 'free' | 'pro' | 'premium';
  email: string | null;
  created_at: string;
  updated_at: string;
}

const ALL_SIGNAL_TYPES = [
  'RSI Uyumsuzluğu',
  'Hacim Anomalisi',
  'Trend Başlangıcı',
  'Destek/Direnç Kırılımı',
  'MACD Kesişimi',
  'RSI Seviyesi',
  'Altın Çapraz',
  'Bollinger Sıkışması',
] as const;

const TIER_LABELS: Record<string, { label: string; color: string }> = {
  free: { label: 'Ücretsiz', color: 'bg-gray-500/10 text-gray-400 border-gray-500/30' },
  pro: { label: 'Pro', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  premium: { label: 'Premium', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' },
};

export default function ProfilPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [emailEnabled, setEmailEnabled]   = useState(true);
  const [minSeverity, setMinSeverity]     = useState<'güçlü' | 'orta' | 'zayıf'>('orta');
  const [signalTypes, setSignalTypes]     = useState<string[]>([]); // boş = tüm tipler
  const [prefSaving, setPrefSaving]       = useState(false);
  const searchParams = useSearchParams();

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/profile');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Profil yüklenemedi');
      setProfile(data);
      setDisplayName(data.display_name ?? '');
      setBio(data.bio ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profil yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  // Bildirim tercihlerini yükle
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetch('/api/user/alert-preferences', { signal: controller.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (cancelled || !d) return;
        setEmailEnabled(d.email_enabled ?? true);
        setMinSeverity(d.min_severity ?? 'orta');
        setSignalTypes(d.signal_types ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  async function savePref(
    enabled: boolean,
    severity: 'güçlü' | 'orta' | 'zayıf',
    types: string[] = signalTypes,
  ) {
    setPrefSaving(true);
    try {
      await fetch('/api/user/alert-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_enabled: enabled, min_severity: severity, signal_types: types }),
      });
    } catch {} finally {
      setPrefSaving(false);
    }
  }

  // Checkout success mesajı
  useEffect(() => {
    if (searchParams.get('checkout') === 'success') {
      setSuccess('Aboneliğiniz başarıyla oluşturuldu! Profil bilgileriniz güncelleniyor...');
      // Profili yeniden yükle (webhook'tan tier güncellemesi gelmiş olabilir)
      setTimeout(() => fetchProfile(), 2000);
    }
  }, [searchParams, fetchProfile]);

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? 'Portal açılamadı.');
      }
    } catch {
      setError('Portal açılamadı.');
    } finally {
      setPortalLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName,
          bio,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Profil güncellenemedi');
      setProfile(data);
      setSuccess('Profil güncellendi.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profil güncellenemedi');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = profile && (
    displayName !== (profile.display_name ?? '') ||
    bio !== (profile.bio ?? '')
  );

  // Loading skeleton
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <main className="container mx-auto max-w-2xl px-4 py-6">
          <Skeleton className="h-8 w-40 mb-6" />
          <Skeleton className="h-64 rounded-lg mb-4" />
          <Skeleton className="h-40 rounded-lg" />
        </main>
      </div>
    );
  }

  // Error state
  if (error && !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="border-red-500/30 bg-red-500/5 max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-3" />
            <p className="text-red-400 font-medium">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={fetchProfile}>
              Tekrar Dene
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!profile) return null;

  const tier = TIER_LABELS[profile.tier] ?? TIER_LABELS.free;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-2xl px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <User className="h-6 w-6 text-primary" />
            Profilim
          </h1>
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${tier.color}`}>
            {tier.label}
          </span>
        </div>

        {/* Feedback messages */}
        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3">
            <CheckCircle className="h-4 w-4 text-green-400" />
            <span className="text-sm text-green-400">{success}</span>
          </div>
        )}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span className="text-sm text-red-400">{error}</span>
          </div>
        )}

        {/* Profil Bilgileri */}
        <Card className="border-border mb-6">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-text-secondary">Profil Bilgileri</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Email (read-only) */}
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">E-posta</label>
              <div className="rounded-lg border border-border bg-surface/50 px-3 py-2 text-sm text-text-secondary">
                {profile.email ?? '—'}
              </div>
              <p className="text-[11px] text-text-secondary/60 mt-1">E-posta adresi değiştirilemez.</p>
            </div>

            {/* Display Name */}
            <div>
              <label htmlFor="displayName" className="block text-xs text-text-secondary mb-1.5">
                Görünen Ad
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
                placeholder="Adınızı girin..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-[11px] text-text-secondary/60 mt-1">{displayName.length}/50</p>
            </div>

            {/* Bio */}
            <div>
              <label htmlFor="bio" className="block text-xs text-text-secondary mb-1.5">
                Hakkında
              </label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={500}
                rows={4}
                placeholder="Kendinizi kısaca tanıtın..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              <p className="text-[11px] text-text-secondary/60 mt-1">{bio.length}/500</p>
            </div>

            {/* Save button */}
            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                size="sm"
              >
                <Save className="h-4 w-4 mr-1.5" />
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Hesap Bilgileri */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-text-secondary">Hesap Bilgileri</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-text-secondary">Üyelik</span>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tier.color}`}>
                {tier.label}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-text-secondary">Kayıt Tarihi</span>
              <span className="text-text-primary">
                {new Date(profile.created_at).toLocaleDateString('tr-TR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-text-secondary">Son Güncelleme</span>
              <span className="text-text-primary">
                {new Date(profile.updated_at).toLocaleDateString('tr-TR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Abonelik Yönetimi */}
        <Card className="border-border mt-6">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-text-secondary flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Abonelik
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-text-secondary">Mevcut Plan</span>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tier.color}`}>
                {tier.label}
              </span>
            </div>

            <div className="flex gap-2 pt-2">
              {profile.tier === 'free' ? (
                <Button size="sm" asChild>
                  <Link href="/fiyatlandirma">
                    Planını Yükselt
                  </Link>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  {portalLoading ? 'Yönlendiriliyor...' : 'Aboneliği Yönet'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* E-posta Bildirimleri */}
        <Card className="border-border mt-6">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-text-secondary flex items-center gap-2">
              <Bell className="h-4 w-4" />
              E-posta Bildirimleri
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-text-secondary">
              Portföyündeki veya watchlist&apos;indeki hisselerde sinyal çıktığında e-posta al.
              Her iş günü sabah 10:00&apos;da gönderilir.
            </p>

            {/* Toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface/40 px-3 py-2.5">
              <div className="flex items-center gap-2">
                {emailEnabled
                  ? <Bell className="h-4 w-4 text-primary" />
                  : <BellOff className="h-4 w-4 text-text-muted" />
                }
                <span className={`text-sm font-medium ${emailEnabled ? 'text-text-primary' : 'text-text-muted'}`}>
                  {prefSaving ? 'Kaydediliyor...' : emailEnabled ? 'Bildirimler Açık' : 'Bildirimler Kapalı'}
                </span>
              </div>
              <button
                onClick={() => {
                  const next = !emailEnabled;
                  setEmailEnabled(next);
                  savePref(next, minSeverity, signalTypes);
                }}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  emailEnabled ? 'bg-primary' : 'bg-border'
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  emailEnabled ? 'translate-x-4' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Minimum seviye */}
            {emailEnabled && (
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Minimum Sinyal Gücü</label>
                <select
                  value={minSeverity}
                  onChange={(e) => {
                    const v = e.target.value as 'güçlü' | 'orta' | 'zayıf';
                    setMinSeverity(v);
                    savePref(emailEnabled, v, signalTypes);
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="zayıf">Tümü (Zayıf + Orta + Güçlü)</option>
                  <option value="orta">Orta ve üstü</option>
                  <option value="güçlü">Sadece Güçlü</option>
                </select>
              </div>
            )}

            {/* Sinyal tipleri */}
            {emailEnabled && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-text-secondary">Sinyal Tipleri</label>
                  <button
                    type="button"
                    onClick={() => {
                      const next: string[] = [];
                      setSignalTypes(next);
                      savePref(emailEnabled, minSeverity, next);
                    }}
                    className="text-[11px] text-primary hover:underline"
                  >
                    Tümünü Seç
                  </button>
                </div>
                <p className="text-[11px] text-text-secondary/60 mb-2">
                  {signalTypes.length === 0
                    ? 'Tüm sinyal tipleri için bildirim alınıyor.'
                    : `${signalTypes.length} tip seçili.`}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {ALL_SIGNAL_TYPES.map((t) => {
                    const checked = signalTypes.length === 0 || signalTypes.includes(t);
                    return (
                      <label
                        key={t}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 cursor-pointer transition-colors ${
                          checked
                            ? 'border-primary/40 bg-primary/5 text-text-primary'
                            : 'border-border bg-surface/30 text-text-muted'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            let next: string[];
                            if (signalTypes.length === 0) {
                              // Tümü seçiliyken → tıklananı kaldır (diğerleri seçili)
                              next = ALL_SIGNAL_TYPES.filter((x) => x !== t);
                            } else if (checked) {
                              next = signalTypes.filter((x) => x !== t);
                              if (next.length === 0) next = []; // hepsi çıkarılırsa = tümü
                            } else {
                              next = [...signalTypes, t];
                              if (next.length === ALL_SIGNAL_TYPES.length) next = []; // hepsi seçiliyse = tümü
                            }
                            setSignalTypes(next);
                            savePref(emailEnabled, minSeverity, next);
                          }}
                          className="sr-only"
                        />
                        <span className={`h-3.5 w-3.5 shrink-0 rounded border flex items-center justify-center ${
                          checked ? 'border-primary bg-primary' : 'border-border bg-background'
                        }`}>
                          {checked && (
                            <svg viewBox="0 0 10 8" fill="none" className="h-2 w-2">
                              <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </span>
                        <span className="text-xs leading-tight">{t}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Güvenlik */}
        <Card className="border-border mt-6">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-text-secondary flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Güvenlik
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-primary">Şifre</p>
                <p className="text-xs text-text-secondary mt-0.5">Son girişte kullandığın şifreyi değiştir</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/sifre-guncelle">
                  <Lock className="h-3.5 w-3.5 mr-1.5" />
                  Şifre Değiştir
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
