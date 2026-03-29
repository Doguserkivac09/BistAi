/**
 * Fiyat Alert Cron — Günlük çalışır (vercel.json'a eklenecek)
 * GET /api/cron/price-alerts
 *
 * 1. Tetiklenmemiş tüm alertleri çek
 * 2. Her alert için güncel fiyatı Yahoo'dan al
 * 3. Koşul sağlandıysa email gönder + triggered=true yap
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchQuote } from '@/lib/yahoo';

function isAuthorized(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const CRON_SECRET = process.env.CRON_SECRET;
  const token = req.headers.get('authorization')?.replace('Bearer ', '')?.trim();
  const isManualAuth = CRON_SECRET && token && token === CRON_SECRET;
  return isVercelCron || isManualAuth;
}

type PriceAlert = {
  id: string;
  user_id: string;
  sembol: string;
  target_price: number;
  direction: 'above' | 'below';
  note: string | null;
};

type UserRow = { id: string; email: string };

async function sendPriceAlertEmail(
  email: string,
  alert: PriceAlert,
  currentPrice: number,
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://bistai.vercel.app';
  const dirLabel = alert.direction === 'above' ? 'üzerine çıktı' : 'altına düştü';
  const subject = `BistAI Fiyat Alarmı: ${alert.sembol} ₺${currentPrice.toFixed(2)}`;

  const html = `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="background:#09090b;color:#fafafa;font-family:system-ui,sans-serif;margin:0;padding:0;">
  <div style="max-width:560px;margin:40px auto;padding:32px;background:#18181b;border-radius:12px;border:1px solid #27272a;">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:32px;">🎯</span>
      <h1 style="color:#10b981;font-size:22px;margin:8px 0;">Fiyat Alarmı Tetiklendi</h1>
    </div>
    <div style="background:#09090b;border-radius:8px;padding:20px;margin-bottom:20px;text-align:center;">
      <div style="font-size:28px;font-weight:700;color:#fafafa;">${alert.sembol}</div>
      <div style="font-size:36px;font-weight:800;color:#10b981;margin:8px 0;">₺${currentPrice.toFixed(2)}</div>
      <div style="color:#a1a1aa;font-size:14px;">Hedef fiyat ₺${alert.target_price.toFixed(2)} ${dirLabel}</div>
      ${alert.note ? `<div style="color:#71717a;font-size:13px;margin-top:8px;font-style:italic;">"${alert.note}"</div>` : ''}
    </div>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${appUrl}/hisse/${alert.sembol}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;">${alert.sembol} Sayfasına Git</a>
    </div>
    <p style="color:#52525b;font-size:12px;text-align:center;margin:0;">
      Bu alarm artık pasif durumda. Yeni alarm eklemek için <a href="${appUrl}/fiyat-alertler" style="color:#10b981;">BistAI</a>'ı ziyaret edin.
    </p>
  </div>
</body>
</html>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? 'BistAI <bildirim@bistai.app>',
      to: email,
      subject,
      html,
    }),
  });
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase env eksik.' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Aktif alertleri al
  const { data: alerts, error } = await supabase
    .from('price_alerts')
    .select('id, user_id, sembol, target_price, direction, note')
    .eq('triggered', false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!alerts || alerts.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, triggered: 0 });
  }

  // Benzersiz sembolleri toplu fiyat al
  const uniqueSymbols = [...new Set(alerts.map((a: PriceAlert) => a.sembol))];
  const priceMap = new Map<string, number>();
  await Promise.all(
    uniqueSymbols.map(async (sembol) => {
      const quote = await fetchQuote(sembol);
      if (quote?.regularMarketPrice) priceMap.set(sembol, quote.regularMarketPrice);
    }),
  );

  // Kullanıcı email'lerini toplu al
  const userIds = [...new Set(alerts.map((a: PriceAlert) => a.user_id))];
  const { data: users } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', userIds);
  const userEmailMap = new Map<string, string>(
    (users ?? []).map((u: UserRow) => [u.id, u.email]),
  );

  let triggered = 0;
  const triggeredIds: string[] = [];

  for (const alert of alerts as PriceAlert[]) {
    const price = priceMap.get(alert.sembol);
    if (!price) continue;

    const shouldTrigger =
      (alert.direction === 'above' && price >= alert.target_price) ||
      (alert.direction === 'below' && price <= alert.target_price);

    if (!shouldTrigger) continue;

    triggeredIds.push(alert.id);
    triggered++;

    const email = userEmailMap.get(alert.user_id);
    if (email) {
      await sendPriceAlertEmail(email, alert, price).catch(() => null);
    }
  }

  // Toplu güncelle
  if (triggeredIds.length > 0) {
    await supabase
      .from('price_alerts')
      .update({ triggered: true, triggered_at: new Date().toISOString() })
      .in('id', triggeredIds);
  }

  return NextResponse.json({
    ok: true,
    checked: alerts.length,
    triggered,
    symbols: uniqueSymbols.length,
  });
}
