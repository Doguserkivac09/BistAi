'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Save, AlertTriangle, CheckCircle, CreditCard, ExternalLink,
  Bell, BellOff, Lock, Mail, Calendar, Clock, Shield, Zap,
  ChevronRight, Settings, TrendingUp, Star, BarChart2, Pencil, X,
  Upload, ImageIcon,
} from 'lucide-react';

const DEFAULT_AVATARS = [
  '/avatars/avatar-1.svg',
  '/avatars/avatar-2.svg',
  '/avatars/avatar-3.svg',
  '/avatars/avatar-4.svg',
];

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

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  free:    { label: 'Ücretsiz', color: 'text-gray-400',   bg: 'from-gray-500/20 to-gray-600/10 border-gray-500/30',  icon: '🆓' },
  pro:     { label: 'Pro',      color: 'text-blue-400',   bg: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',  icon: '⚡' },
  premium: { label: 'Premium',  color: 'text-yellow-400', bg: 'from-yellow-500/20 to-amber-600/10 border-yellow-500/30', icon: '👑' },
};

function getInitials(name: string | null, email: string | null): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length > 1
      ? (parts[0]![0]! + parts[1]![0]!).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return '??';
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({
  icon: Icon, title, children, className = '',
}: {
  icon: React.ElementType; title: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-surface/50 backdrop-blur-sm ${className}`}>
      <div className="flex items-center gap-2.5 border-b border-border/60 px-5 py-3.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Avatar Edit Modal ───────────────────────────────────────────────────────

function AvatarEditModal({
  currentUrl, onClose, onSave,
}: {
  currentUrl: string | null;
  onClose: () => void;
  onSave: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(currentUrl);

  async function handleFileUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/profile/avatar', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Yükleme başarısız.');
      onSave(data.avatar_url);
      onClose();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Yükleme hatası');
    } finally { setUploading(false); }
  }

  async function handleDefaultSelect(url: string) {
    setSelected(url);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Güncelleme başarısız.');
      onSave(url);
      onClose();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Güncelleme hatası');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-2xl animate-fade-in-up-sm">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Profil Fotoğrafı</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-text-muted hover:text-text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>

        {uploadError && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {uploadError}
          </div>
        )}

        {/* Upload butonu */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-background/50 px-4 py-6 text-sm text-text-secondary hover:border-primary/50 hover:text-text-primary transition-all disabled:opacity-50"
        >
          <Upload className="h-5 w-5" />
          {uploading ? 'Yükleniyor...' : 'Bilgisayardan Fotoğraf Yükle'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
            e.target.value = '';
          }}
        />
        <p className="mt-2 text-center text-[11px] text-text-muted">JPEG, PNG veya WebP, maks. 2MB</p>

        {/* Hazır avatarlar */}
        <div className="mt-5">
          <p className="mb-3 text-xs font-medium text-text-secondary flex items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5" />
            Hazır Avatarlar
          </p>
          <div className="grid grid-cols-4 gap-3">
            {DEFAULT_AVATARS.map((url) => (
              <button
                key={url}
                onClick={() => handleDefaultSelect(url)}
                className={`relative overflow-hidden rounded-xl border-2 transition-all hover:scale-105 ${
                  selected === url
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <Image
                  src={url}
                  alt="Avatar"
                  width={80}
                  height={80}
                  className="h-full w-full"
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function ProfilPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [emailEnabled, setEmailEnabled]   = useState(true);
  const [minSeverity, setMinSeverity]     = useState<'güçlü' | 'orta' | 'zayıf'>('orta');
  const [signalTypes, setSignalTypes]     = useState<string[]>([]);
  const [prefSaving, setPrefSaving]       = useState(false);
  const searchParams = useSearchParams();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [showAvatarModal, setShowAvatarModal] = useState(false);

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
    return () => { cancelled = true; controller.abort(); };
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
    } catch {} finally { setPrefSaving(false); }
  }

  useEffect(() => {
    if (searchParams.get('checkout') === 'success') {
      setSuccess('Aboneliğiniz başarıyla oluşturuldu! Profil bilgileriniz güncelleniyor...');
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
    } finally { setPortalLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName, bio }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Profil güncellenemedi');
      setProfile(data);
      setSuccess('Profil güncellendi.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profil güncellenemedi');
    } finally { setSaving(false); }
  };

  const hasChanges = profile && (
    displayName !== (profile.display_name ?? '') ||
    bio !== (profile.bio ?? '')
  );

  // Loading skeleton
  if (loading) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <Skeleton className="h-48 rounded-2xl mb-6" />
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center max-w-md">
          <AlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-4" />
          <p className="text-red-400 font-medium mb-4">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchProfile}>Tekrar Dene</Button>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const tier = TIER_CONFIG[profile.tier] ?? TIER_CONFIG.free!;
  const initials = getInitials(profile.display_name, profile.email);
  const memberSince = new Date(profile.created_at).toLocaleDateString('tr-TR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-3xl">

        {/* Feedback messages */}
        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 animate-fade-in">
            <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
            <span className="text-sm text-green-400">{success}</span>
          </div>
        )}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 animate-fade-in">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <span className="text-sm text-red-400">{error}</span>
          </div>
        )}

        {/* ── Hero Card ── */}
        <div className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${tier.bg} p-6 mb-6`}>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
          <div className="relative flex flex-col sm:flex-row items-center gap-5">
            {/* Avatar */}
            <div className="relative group">
              {profile.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt="Profil"
                  width={80}
                  height={80}
                  className="h-20 w-20 rounded-2xl border-2 border-primary/30 object-cover shadow-lg shadow-primary/10"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/15 border-2 border-primary/30 text-2xl font-bold text-primary shadow-lg shadow-primary/10">
                  {initials}
                </div>
              )}
              <button
                onClick={() => setShowAvatarModal(true)}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-primary text-white shadow-md hover:bg-primary/90 transition-colors"
                title="Fotoğrafı değiştir"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-xl font-bold text-text-primary">
                {profile.display_name || 'İsimsiz Kullanıcı'}
              </h1>
              {profile.bio && (
                <p className="mt-1 text-sm text-text-secondary line-clamp-2">{profile.bio}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-3 text-xs text-text-muted">
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {profile.email}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {memberSince}
                </span>
                <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${tier.color} border-current/30`}>
                  {tier.label}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 2-Column Grid ── */}
        <div className="grid gap-6 md:grid-cols-2">

          {/* Profil Bilgileri */}
          <Section icon={Settings} title="Profil Bilgileri">
            <div className="space-y-4">
              <div>
                <label htmlFor="displayName" className="block text-xs font-medium text-text-secondary mb-1.5">
                  Görünen Ad
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={50}
                  placeholder="Adınızı girin..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                />
                <p className="text-[11px] text-text-muted mt-1">{displayName.length}/50</p>
              </div>

              <div>
                <label htmlFor="bio" className="block text-xs font-medium text-text-secondary mb-1.5">
                  Hakkında
                </label>
                <textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Kendinizi kısaca tanıtın..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none transition-colors"
                />
                <p className="text-[11px] text-text-muted mt-1">{bio.length}/500</p>
              </div>

              <div className="flex items-center justify-between pt-1">
                <p className="text-[11px] text-text-muted flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Son güncelleme: {new Date(profile.updated_at).toLocaleDateString('tr-TR')}
                </p>
                <Button
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                  size="sm"
                  className="gap-1.5"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </Button>
              </div>
            </div>
          </Section>

          {/* Abonelik & Güvenlik */}
          <div className="space-y-6">
            {/* Abonelik */}
            <Section icon={CreditCard} title="Abonelik">
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-background/50 px-3 py-2.5">
                  <span className="text-sm text-text-secondary">Mevcut Plan</span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tier.color} border-current/30`}>
                    {tier.icon} {tier.label}
                  </span>
                </div>

                {profile.tier === 'free' ? (
                  <Button size="sm" className="w-full gap-2" asChild>
                    <Link href="/fiyatlandirma">
                      <Zap className="h-3.5 w-3.5" />
                      Planını Yükselt
                      <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                    </Link>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-2"
                    onClick={handleManageSubscription}
                    disabled={portalLoading}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {portalLoading ? 'Yönlendiriliyor...' : 'Aboneliği Yönet'}
                  </Button>
                )}
              </div>
            </Section>

            {/* Güvenlik */}
            <Section icon={Shield} title="Güvenlik">
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-background/50 px-3 py-2.5">
                  <div>
                    <p className="text-sm text-text-primary">Şifre</p>
                    <p className="text-[11px] text-text-muted mt-0.5">Hesap şifreni değiştir</p>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5 shrink-0" asChild>
                    <Link href="/sifre-guncelle">
                      <Lock className="h-3 w-3" />
                      Değiştir
                    </Link>
                  </Button>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-background/50 px-3 py-2.5">
                  <div>
                    <p className="text-sm text-text-primary">E-posta</p>
                    <p className="text-[11px] text-text-muted mt-0.5">{profile.email}</p>
                  </div>
                  <span className="text-[10px] text-text-muted border border-border rounded px-1.5 py-0.5">Salt okunur</span>
                </div>
              </div>
            </Section>
          </div>
        </div>

        {/* ── Bildirim Ayarları (full-width) ── */}
        <div className="mt-6">
          <Section icon={Bell} title="E-posta Bildirimleri">
            <div className="space-y-4">
              <p className="text-xs text-text-secondary">
                Portföyündeki veya watchlist&apos;indeki hisselerde sinyal çıktığında e-posta al.
                Her iş günü sabah 10:00&apos;da gönderilir.
              </p>

              {/* Toggle */}
              <div className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-4 py-3">
                <div className="flex items-center gap-2.5">
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
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    emailEnabled ? 'bg-primary' : 'bg-border'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    emailEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {emailEnabled && (
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Minimum seviye */}
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">Minimum Sinyal Gücü</label>
                    <select
                      value={minSeverity}
                      onChange={(e) => {
                        const v = e.target.value as 'güçlü' | 'orta' | 'zayıf';
                        setMinSeverity(v);
                        savePref(emailEnabled, v, signalTypes);
                      }}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="zayıf">Tümü (Zayıf + Orta + Güçlü)</option>
                      <option value="orta">Orta ve üstü</option>
                      <option value="güçlü">Sadece Güçlü</option>
                    </select>
                  </div>

                  {/* Sinyal tipleri */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-text-secondary">Sinyal Tipleri</label>
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
                    <p className="text-[11px] text-text-muted mb-2">
                      {signalTypes.length === 0
                        ? 'Tüm sinyal tipleri için bildirim alınıyor.'
                        : `${signalTypes.length} tip seçili.`}
                    </p>
                  </div>
                </div>
              )}

              {emailEnabled && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {ALL_SIGNAL_TYPES.map((t) => {
                    const checked = signalTypes.length === 0 || signalTypes.includes(t);
                    return (
                      <label
                        key={t}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 cursor-pointer transition-all ${
                          checked
                            ? 'border-primary/40 bg-primary/5 text-text-primary'
                            : 'border-border bg-background/30 text-text-muted hover:border-border/80'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            let next: string[];
                            if (signalTypes.length === 0) {
                              next = ALL_SIGNAL_TYPES.filter((x) => x !== t);
                            } else if (checked) {
                              next = signalTypes.filter((x) => x !== t);
                              if (next.length === 0) next = [];
                            } else {
                              next = [...signalTypes, t];
                              if (next.length === ALL_SIGNAL_TYPES.length) next = [];
                            }
                            setSignalTypes(next);
                            savePref(emailEnabled, minSeverity, next);
                          }}
                          className="sr-only"
                        />
                        <span className={`h-3.5 w-3.5 shrink-0 rounded border flex items-center justify-center transition-colors ${
                          checked ? 'border-primary bg-primary' : 'border-border bg-background'
                        }`}>
                          {checked && (
                            <svg viewBox="0 0 10 8" fill="none" className="h-2 w-2">
                              <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </span>
                        <span className="text-[11px] leading-tight">{t}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </Section>
        </div>

        {/* ── Hızlı Erişim ── */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: '/portfolyo',  icon: TrendingUp, label: 'Portföyüm' },
            { href: '/watchlist',   icon: Star,        label: 'Watchlist' },
            { href: '/tarama',      icon: Zap,         label: 'Tarama' },
            { href: '/backtesting', icon: BarChart2,   label: 'Backtest' },
          ].map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 rounded-xl border border-border bg-surface/50 px-4 py-3 text-sm text-text-secondary hover:border-primary/40 hover:text-text-primary hover:bg-surface transition-all group"
            >
              <Icon className="h-4 w-4 text-text-muted group-hover:text-primary transition-colors" />
              <span>{label}</span>
              <ChevronRight className="h-3.5 w-3.5 ml-auto opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
            </Link>
          ))}
        </div>

        {/* Avatar Edit Modal */}
        {showAvatarModal && (
          <AvatarEditModal
            currentUrl={profile.avatar_url}
            onClose={() => setShowAvatarModal(false)}
            onSave={(url) => setProfile({ ...profile, avatar_url: url })}
          />
        )}

      </div>
    </div>
  );
}
