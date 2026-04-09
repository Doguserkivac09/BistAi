/**
 * Günlük portföy sinyal uyarıları cron'u.
 * Her iş günü sabah 10:00 TRT (UTC 07:00) çalışır.
 *
 * GET /api/cron/alerts
 * Header: Authorization: Bearer <CRON_SECRET>
 *
 * Akış:
 * 1. portfolyo_pozisyonlar'dan tüm (user_id, sembol) çiftlerini çek
 * 2. Benzersiz semboller için OHLCV + sinyal tespiti
 * 3. Her kullanıcı için sinyaller varsa + tercih açıksa → e-posta gönder
 * 4. alert_history'e kayıt yaz (duplicate önleme)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchOHLCV } from '@/lib/yahoo';
import { detectAllSignals } from '@/lib/signals';
import { sendSignalAlert } from '@/lib/email-service';
import { sendPush } from '@/lib/push';
import type { StockSignal } from '@/types';

const CRON_SECRET = process.env.CRON_SECRET;
const SEVERITY_ORDER = { güçlü: 3, orta: 2, zayıf: 1 } as const;

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function meetsMinSeverity(sig: StockSignal, minSeverity: string): boolean {
  const sigLevel  = SEVERITY_ORDER[sig.severity as keyof typeof SEVERITY_ORDER] ?? 0;
  const minLevel  = SEVERITY_ORDER[minSeverity as keyof typeof SEVERITY_ORDER] ?? 1;
  return sigLevel >= minLevel;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function GET(req: NextRequest) {
  // ── Yetkilendirme ──────────────────────────────────────────────────────────
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const token = req.headers.get('authorization')?.replace('Bearer ', '')?.trim();
  const isManualAuth = CRON_SECRET && token && token === CRON_SECRET;
  if (!isVercelCron && !isManualAuth) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const admin = createAdmin();
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  // ── 1. Portföy + Watchlist hisselerini çek ────────────────────────────────
  const [
    { data: pozisyonlar, error: pozErr },
    { data: watchItems, error: watchErr },
  ] = await Promise.all([
    admin.from('portfolyo_pozisyonlar').select('user_id, sembol'),
    admin.from('watchlist').select('user_id, sembol'),
  ]);

  if (pozErr) console.error('[cron/alerts] portfolyo sorgu hatası:', pozErr.message);
  if (watchErr) console.error('[cron/alerts] watchlist sorgu hatası:', watchErr.message);

  const allRows = [...(pozisyonlar ?? []), ...(watchItems ?? [])];
  if (!allRows.length) {
    return NextResponse.json({ ok: true, message: 'Takip edilen hisse yok', sent: 0 });
  }

  // ── 2. Benzersiz sembolleri tespit et ──────────────────────────────────────
  const uniqueSymbols = Array.from(new Set(allRows.map((p) => p.sembol)));

  // ── 3. Her sembol için sinyal tespit et (batch 5) ──────────────────────────
  const signalMap: Record<string, StockSignal[]> = {};

  for (let i = 0; i < uniqueSymbols.length; i += 5) {
    const batch = uniqueSymbols.slice(i, i + 5);
    await Promise.allSettled(
      batch.map(async (sembol) => {
        try {
          const { candles } = await fetchOHLCV(sembol, 90);
          if (!candles?.length) return;
          const signals = detectAllSignals(sembol, candles);
          if (signals.length > 0) signalMap[sembol] = signals;
        } catch {
          // sessizce devam
        }
      })
    );
    if (i + 5 < uniqueSymbols.length) await sleep(400);
  }

  if (Object.keys(signalMap).length === 0) {
    return NextResponse.json({ ok: true, message: 'Sinyal tespit edilmedi', sent: 0 });
  }

  // ── 4. Kullanıcıları grupla ────────────────────────────────────────────────
  const userSymbols: Record<string, string[]> = {};
  for (const { user_id, sembol } of allRows) {
    if (!userSymbols[user_id]) userSymbols[user_id] = [];
    if (signalMap[sembol]) userSymbols[user_id].push(sembol);
  }

  const userIds = Object.keys(userSymbols).filter((id) => userSymbols[id].length > 0);
  if (!userIds.length) {
    return NextResponse.json({ ok: true, message: 'Gönderilecek sinyal yok', sent: 0 });
  }

  // ── 5. Batch: tüm tercihleri + geçmişi + push aboneliklerini çek ──────────
  const [{ data: allPrefs }, { data: allHistory }, { data: allPushSubs }] = await Promise.all([
    admin
      .from('alert_subscriptions')
      .select('user_id, email_enabled, min_severity, signal_types')
      .in('user_id', userIds),
    admin
      .from('alert_history')
      .select('user_id, sembol, signal_type')
      .in('user_id', userIds)
      .gte('sent_at', today + 'T00:00:00Z'),
    admin
      .from('push_subscriptions')
      .select('user_id, endpoint, p256dh, auth')
      .in('user_id', userIds),
  ]);

  // user_id → push abonelikleri map
  const pushSubsMap = new Map<string, Array<{ endpoint: string; p256dh: string; auth: string }>>();
  for (const sub of allPushSubs ?? []) {
    if (!pushSubsMap.has(sub.user_id)) pushSubsMap.set(sub.user_id, []);
    pushSubsMap.get(sub.user_id)!.push({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth });
  }

  const prefsMap = new Map((allPrefs ?? []).map((p) => [p.user_id, p]));

  // Bugün gönderilenleri user bazında grupla
  const historyMap = new Map<string, Set<string>>();
  for (const row of allHistory ?? []) {
    if (!historyMap.has(row.user_id)) historyMap.set(row.user_id, new Set());
    historyMap.get(row.user_id)!.add(`${row.sembol}::${row.signal_type}`);
  }

  // ── 6. Bildirim gönder ─────────────────────────────────────────────────────
  let sentCount = 0;

  // Kullanıcı e-postalarını paralel çek
  const emailResults = await Promise.allSettled(
    userIds.map((id) => admin.auth.admin.getUserById(id))
  );
  const emailMap = new Map<string, string>();
  userIds.forEach((id, idx) => {
    const r = emailResults[idx];
    if (r?.status === 'fulfilled') {
      const email = r.value.data?.user?.email;
      if (email) emailMap.set(id, email);
    }
  });

  for (const userId of userIds) {
    const prefs        = prefsMap.get(userId);
    const emailEnabled = prefs?.email_enabled ?? true;
    const minSeverity  = prefs?.min_severity  ?? 'orta';
    const allowedTypes: string[] = prefs?.signal_types ?? [];

    const sentSet  = historyMap.get(userId) ?? new Set<string>();
    const semboller = userSymbols[userId] ?? [];

    const stocksToSend: Array<{ sembol: string; signals: StockSignal[] }> = [];
    const newHistoryRows: Array<{ user_id: string; sembol: string; signal_type: string }> = [];

    for (const sembol of semboller) {
      const signals = (signalMap[sembol] ?? []).filter(
        (sig) =>
          meetsMinSeverity(sig, minSeverity) &&
          !sentSet.has(`${sembol}::${sig.type}`) &&
          (allowedTypes.length === 0 || allowedTypes.includes(sig.type))
      );
      if (signals.length > 0) {
        stocksToSend.push({ sembol, signals });
        for (const sig of signals) {
          newHistoryRows.push({ user_id: userId, sembol, signal_type: sig.type });
        }
      }
    }

    if (!stocksToSend.length) continue;

    let notified = false;

    // ── Email ────────────────────────────────────────────────────────────────
    if (emailEnabled) {
      const email = emailMap.get(userId);
      if (email) {
        try {
          const result = await sendSignalAlert({ to: email, stocks: stocksToSend });
          if (result?.success) notified = true;
        } catch (emailErr) {
          console.error(`[cron/alerts] E-posta gönderilemedi (${userId}):`, emailErr);
        }
      }
    }

    // ── Web Push ─────────────────────────────────────────────────────────────
    const pushSubs = pushSubsMap.get(userId) ?? [];
    if (pushSubs.length > 0) {
      const firstSembol  = stocksToSend[0]!.sembol;
      const totalCount   = stocksToSend.reduce((s, x) => s + x.signals.length, 0);
      const pushTitle    = stocksToSend.length === 1
        ? `${firstSembol} — Yeni Sinyal`
        : `${stocksToSend.length} hissede ${totalCount} yeni sinyal`;
      const firstSig     = stocksToSend[0]!.signals[0]!;
      const pushBody     = stocksToSend.length === 1
        ? `${firstSig.type} · ${firstSig.severity}`
        : stocksToSend.map((s) => s.sembol).join(', ');

      const expiredEndpoints: string[] = [];
      await Promise.allSettled(
        pushSubs.map(async (sub) => {
          const result = await sendPush(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            { title: pushTitle, body: pushBody, url: '/tarama', tag: 'signal-alert' }
          );
          if (result === 'sent') notified = true;
          if (result === 'expired') expiredEndpoints.push(sub.endpoint);
        })
      );

      // Süresi dolan abonelikleri temizle
      if (expiredEndpoints.length > 0) {
        await admin
          .from('push_subscriptions')
          .delete()
          .eq('user_id', userId)
          .in('endpoint', expiredEndpoints);
      }
    }

    // ── Geçmişe kaydet ───────────────────────────────────────────────────────
    if (notified) {
      await admin.from('alert_history').insert(newHistoryRows);
      sentCount++;
    }
  }

  return NextResponse.json({
    ok: true,
    date: today,
    signalsFound: Object.keys(signalMap).length,
    sent: sentCount,
  });
}
