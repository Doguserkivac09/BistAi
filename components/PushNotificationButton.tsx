'use client';

/**
 * Tarayıcı push bildirim abonelik butonu.
 * Profil sayfasına veya istenen yere yerleştirilebilir.
 *
 * Durum makinesi:
 *   unsupported → tarayıcı push desteklemiyor (Safari eski sürüm vb.)
 *   loading     → durum kontrol ediliyor
 *   denied      → kullanıcı izin reddetti
 *   subscribed  → aktif abonelik var
 *   unsubscribed → abonelik yok / iptal edildi
 */

import { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, BellRing, Loader2, Smartphone } from 'lucide-react';

type PushState = 'unsupported' | 'ios-pwa-required' | 'loading' | 'denied' | 'subscribed' | 'unsubscribed';

function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  return typeof window !== 'undefined' && (
    ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true) ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  const arr     = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}

export default function PushNotificationButton({ className = '' }: { className?: string }) {
  const [state, setState] = useState<PushState>('loading');
  const [busy,  setBusy]  = useState(false);

  // ── Başlangıç durumu ──────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // iOS: push sadece PWA (Ana Ekrana Ekle) modunda çalışır
    if (isIos() && !isInStandaloneMode()) {
      setState('ios-pwa-required');
      return;
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }

    // Sunucudan aktif abonelik var mı?
    fetch('/api/push/subscribe')
      .then((r) => r.json())
      .then((d) => setState(d.subscribed ? 'subscribed' : 'unsubscribed'))
      .catch(() => setState('unsubscribed'));
  }, []);

  // ── Abone ol ─────────────────────────────────────────────────────────────
  const subscribe = useCallback(async () => {
    if (!VAPID_PUBLIC) {
      console.error('[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY eksik');
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });

      const json = sub.toJSON();
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys:     { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        }),
      });

      setState('subscribed');
    } catch (err) {
      console.error('[push] subscribe hatası:', err);
    } finally {
      setBusy(false);
    }
  }, []);

  // ── Abonelikten çık ───────────────────────────────────────────────────────
  const unsubscribe = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();

      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }

      setState('unsubscribed');
    } catch (err) {
      console.error('[push] unsubscribe hatası:', err);
    } finally {
      setBusy(false);
    }
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (state === 'ios-pwa-required') {
    return (
      <div className={`rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-3 ${className}`}>
        <div className="flex items-start gap-2.5">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
          <div>
            <p className="text-xs font-medium text-blue-300">iPhone&apos;da bildirim almak için</p>
            <ol className="mt-1.5 space-y-0.5 text-[11px] text-text-muted list-none">
              <li>1. Safari&apos;de bu sayfayı açın</li>
              <li>2. Alt menüden <span className="text-text-secondary font-medium">Paylaş</span> simgesine dokunun</li>
              <li>3. <span className="text-text-secondary font-medium">Ana Ekrana Ekle</span> seçeneğini seçin</li>
              <li>4. Uygulamayı ana ekrandan açıp bildirimleri etkinleştirin</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'unsupported') {
    return (
      <div className={`flex items-center gap-2 text-xs text-text-muted ${className}`}>
        <BellOff className="h-3.5 w-3.5" />
        <span>Bu tarayıcı push bildirimleri desteklemiyor</span>
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div className={`flex items-center gap-2 text-xs text-text-muted ${className}`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Yükleniyor...</span>
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className={`rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5 ${className}`}>
        <div className="flex items-start gap-2.5">
          <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
          <div>
            <p className="text-xs font-medium text-yellow-300">Bildirim izni reddedildi</p>
            <p className="mt-0.5 text-[11px] text-text-muted">
              Tarayıcı ayarlarından bu site için bildirimlere izin verin.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'subscribed') {
    return (
      <div className={`flex items-center justify-between ${className}`}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/15">
            <BellRing className="h-4 w-4 text-green-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">Bildirimler Aktif</p>
            <p className="text-[11px] text-text-muted">Yeni sinyallerde anında bildirim alırsınız</p>
          </div>
        </div>
        <button
          onClick={unsubscribe}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted transition hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellOff className="h-3.5 w-3.5" />}
          Kapat
        </button>
      </div>
    );
  }

  // unsubscribed
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface border border-border">
          <Bell className="h-4 w-4 text-text-muted" />
        </div>
        <div>
          <p className="text-sm font-medium text-text-primary">Browser Bildirimleri</p>
          <p className="text-[11px] text-text-muted">Sinyal gelince tarayıcıda bildirim al</p>
        </div>
      </div>
      <button
        onClick={subscribe}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
        Aç
      </button>
    </div>
  );
}
