/**
 * Bilanço bildirimi cron (Bilanço B1).
 * GET /api/cron/earnings-notify   (?dryRun=1 → kime gideceğini sayar, GÖNDERMEZ)
 *
 * Kullanıcının takip listesi (watchlist) + portföyündeki (portfolyo_pozisyonlar)
 * hisseler YENİ çeyreklik bilanço açıkladığında (earnings-quality map'inde lastQuarter
 * ilerleyince) e-posta + push bildirimi yollar.
 *
 * GÜVENLİK:
 *  - İlk koşuda state SEED edilir, kimseye bildirim GİTMEZ (toplu blast önlenir).
 *  - Opt-in: yalnız alert_subscriptions.email_enabled olan kullanıcılara e-posta.
 *  - Dedupe: sembol başına lastQuarter state'i → çeyrek başına tek bildirim.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEarningsFlags } from '@/lib/earnings-quality-runner';
import { sendEarningsAlert } from '@/lib/email-service';
import { sendPush } from '@/lib/push';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET;
const STATE_KEY = 'earnings-notify:state';

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env eksik');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!isVercelCron && !(CRON_SECRET && token === CRON_SECRET)) {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
  }
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  const sb = admin();

  // 1) Kâr kalitesi map + son-bildirilen state
  const map = await getEarningsFlags(sb);
  const { data: stateRow } = await sb.from('ai_cache').select('explanation').eq('cache_key', STATE_KEY).maybeSingle();
  let state: Record<string, string> = {};
  try { if (stateRow?.explanation) state = JSON.parse(stateRow.explanation); } catch { /* boş */ }
  const firstRun = Object.keys(state).length === 0;

  // 2) lastQuarter ilerleyen (yeni bilanço) semboller
  const changed: Record<string, { quarter: string; verdict: string; redFlag: string | null }> = {};
  const newState: Record<string, string> = {};
  for (const [sembol, e] of Object.entries(map)) {
    newState[sembol] = e.lastQuarter;
    if (!firstRun && state[sembol] !== e.lastQuarter) {
      changed[sembol] = { quarter: e.lastQuarter, verdict: e.verdict, redFlag: e.redFlag };
    }
  }

  // İlk koşu: yalnız SEED, bildirim yok (blast önleme)
  if (firstRun) {
    await sb.from('ai_cache').upsert({ cache_key: STATE_KEY, explanation: JSON.stringify(newState), version: 1, hit_count: 0, expires_at: new Date(Date.now() + 400 * 864e5).toISOString() }, { onConflict: 'cache_key' });
    return NextResponse.json({ ok: true, seeded: Object.keys(newState).length, notified: 0, note: 'İlk koşu — state seed edildi, bildirim yok.' });
  }

  const changedSymbols = Object.keys(changed);
  if (changedSymbols.length === 0) {
    if (!dryRun) await sb.from('ai_cache').upsert({ cache_key: STATE_KEY, explanation: JSON.stringify(newState), version: 1, hit_count: 0, expires_at: new Date(Date.now() + 400 * 864e5).toISOString() }, { onConflict: 'cache_key' });
    return NextResponse.json({ ok: true, changed: 0, notified: 0 });
  }

  // 3) Bu sembolleri takip/portföyünde tutan kullanıcılar
  const [{ data: poz }, { data: watch }] = await Promise.all([
    sb.from('portfolyo_pozisyonlar').select('user_id, sembol').in('sembol', changedSymbols),
    sb.from('watchlist').select('user_id, sembol').in('sembol', changedSymbols),
  ]);
  const userSymbols = new Map<string, Set<string>>();
  for (const r of [...(poz ?? []), ...(watch ?? [])]) {
    if (!r.user_id || !r.sembol) continue;
    if (!userSymbols.has(r.user_id)) userSymbols.set(r.user_id, new Set());
    userSymbols.get(r.user_id)!.add(r.sembol);
  }
  const userIds = [...userSymbols.keys()];
  if (userIds.length === 0) {
    if (!dryRun) await sb.from('ai_cache').upsert({ cache_key: STATE_KEY, explanation: JSON.stringify(newState), version: 1, hit_count: 0, expires_at: new Date(Date.now() + 400 * 864e5).toISOString() }, { onConflict: 'cache_key' });
    return NextResponse.json({ ok: true, changed: changedSymbols.length, notified: 0 });
  }

  // 4) Tercihler + e-posta + push abonelikleri
  const [{ data: prefs }, { data: profiles }, { data: pushSubs }] = await Promise.all([
    sb.from('alert_subscriptions').select('user_id, email_enabled').in('user_id', userIds),
    sb.from('profiles').select('id, email').in('id', userIds),
    sb.from('push_subscriptions').select('user_id, endpoint, p256dh, auth').in('user_id', userIds),
  ]);
  const emailEnabled = new Map((prefs ?? []).map((p) => [p.user_id, p.email_enabled]));
  const emailMap = new Map((profiles ?? []).map((p) => [p.id, p.email]));
  const pushMap = new Map<string, Array<{ endpoint: string; p256dh: string; auth: string }>>();
  for (const s of (pushSubs ?? [])) { if (!pushMap.has(s.user_id)) pushMap.set(s.user_id, []); pushMap.get(s.user_id)!.push(s); }

  let emailsSent = 0, pushSent = 0, recipients = 0;
  for (const [userId, syms] of userSymbols) {
    const items = [...syms].map((s) => ({ sembol: s, quarter: changed[s]!.quarter, verdict: changed[s]!.verdict, redFlag: changed[s]!.redFlag }));
    if (items.length === 0) continue;
    recipients++;
    if (dryRun) continue;

    // E-posta (opt-in)
    const email = emailMap.get(userId);
    if (email && emailEnabled.get(userId)) {
      const r = await sendEarningsAlert({ to: email, items }).catch(() => ({ success: false }));
      if (r.success) emailsSent++;
    }
    // Push (abonelik varsa)
    for (const sub of (pushMap.get(userId) ?? [])) {
      const title = items.length === 1 ? `${items[0]!.sembol} yeni bilanço` : `${items.length} hissede yeni bilanço`;
      const body = items.map((i) => `${i.sembol}: ${i.verdict}`).join(' · ');
      const res = await sendPush({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, { title, body, url: `/hisse/${items[0]!.sembol}` }).catch(() => 'error' as const);
      if (res === 'sent') pushSent++;
      if (res === 'expired') await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    }
  }

  if (!dryRun) {
    await sb.from('ai_cache').upsert({ cache_key: STATE_KEY, explanation: JSON.stringify(newState), version: 1, hit_count: 0, expires_at: new Date(Date.now() + 400 * 864e5).toISOString() }, { onConflict: 'cache_key' });
  }

  return NextResponse.json({ ok: true, dryRun, changedSymbols: changedSymbols.length, recipients, emailsSent, pushSent });
}
