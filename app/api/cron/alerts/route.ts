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
  const auth = req.headers.get('authorization') ?? '';
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdmin();
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  // ── 1. Portföy + Watchlist hisselerini çek ────────────────────────────────
  const [{ data: pozisyonlar }, { data: watchItems }] = await Promise.all([
    admin.from('portfolyo_pozisyonlar').select('user_id, sembol'),
    admin.from('watchlist').select('user_id, sembol'),
  ]);

  const allRows = [
    ...(pozisyonlar ?? []),
    ...(watchItems ?? []),
  ];

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
          const candles = await fetchOHLCV(sembol, 90);
          if (!candles?.length) return;
          const signals = detectAllSignals(sembol, candles);
          if (signals.length > 0) signalMap[sembol] = signals;
        } catch {
          // Sessizce devam
        }
      })
    );

    if (i + 5 < uniqueSymbols.length) await sleep(400);
  }

  if (Object.keys(signalMap).length === 0) {
    return NextResponse.json({ ok: true, message: 'Sinyal tespit edilmedi', sent: 0 });
  }

  // ── 4. Kullanıcıları grupla ────────────────────────────────────────────────
  // user_id → semboller[]
  const userSymbols: Record<string, string[]> = {};
  for (const { user_id, sembol } of allRows) {
    if (!userSymbols[user_id]) userSymbols[user_id] = [];
    if (signalMap[sembol]) userSymbols[user_id].push(sembol);
  }

  // ── 5. Bildirim gönder ─────────────────────────────────────────────────────
  let sentCount = 0;

  for (const [userId, semboller] of Object.entries(userSymbols)) {
    if (!semboller.length) continue;

    // Kullanıcı tercihleri
    const { data: prefs } = await admin
      .from('alert_subscriptions')
      .select('email_enabled, min_severity')
      .eq('user_id', userId)
      .single();

    const emailEnabled = prefs?.email_enabled ?? true;
    const minSeverity  = prefs?.min_severity  ?? 'orta';

    if (!emailEnabled) continue;

    // Daha önce bugün gönderildi mi? (alert_history)
    const { data: sentToday } = await admin
      .from('alert_history')
      .select('sembol, signal_type')
      .eq('user_id', userId)
      .gte('sent_at', today + 'T00:00:00Z');

    const sentSet = new Set(
      (sentToday ?? []).map((r) => `${r.sembol}::${r.signal_type}`)
    );

    // Gönderilebilecek sinyaller
    const stocksToSend: Array<{ sembol: string; signals: StockSignal[] }> = [];
    const newHistoryRows: Array<{ user_id: string; sembol: string; signal_type: string }> = [];

    for (const sembol of semboller) {
      const signals = (signalMap[sembol] ?? []).filter(
        (sig) =>
          meetsMinSeverity(sig, minSeverity) &&
          !sentSet.has(`${sembol}::${sig.type}`)
      );
      if (signals.length > 0) {
        stocksToSend.push({ sembol, signals });
        for (const sig of signals) {
          newHistoryRows.push({ user_id: userId, sembol, signal_type: sig.type });
        }
      }
    }

    if (!stocksToSend.length) continue;

    // Kullanıcı e-postasını çek
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    const email = authUser?.user?.email;
    if (!email) continue;

    // E-posta gönder
    const result = await sendSignalAlert({ to: email, stocks: stocksToSend });

    if (result.success) {
      // History kayıt
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
