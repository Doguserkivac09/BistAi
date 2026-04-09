/**
 * Web Push yardımcısı — VAPID ile bildirim gönderir.
 * Sunucu taraflı (API routes / cron) kullanım için.
 */

import webpush from 'web-push';

const VAPID_PUBLIC  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY!;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:admin@investableedge.com';

// Sadece bir kez ayarla
let _initialized = false;
function init() {
  if (_initialized || !VAPID_PUBLIC || !VAPID_PRIVATE) return;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  _initialized = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Tek bir aboneliğe push gönderir.
 * 410 (Gone) → abonelik sona ermiş; caller bunu DB'den silmeli.
 * false dönerse geçici hata — silme.
 */
export async function sendPush(
  subscription: PushSubscription,
  payload: PushPayload
): Promise<'sent' | 'expired' | 'error'> {
  init();
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn('[push] VAPID env eksik — push gönderilmedi');
    return 'error';
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      },
      JSON.stringify(payload),
      { TTL: 86400 } // 24 saat — mesaj 24 saat tutulur, device offline olsa bile
    );
    return 'sent';
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 410 || status === 404) return 'expired';
    console.error('[push] sendNotification hatası:', err);
    return 'error';
  }
}
