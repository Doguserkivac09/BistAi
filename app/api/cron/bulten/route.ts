/**
 * Haftalık Piyasa Bülteni Cron
 *
 * Her Pazartesi 06:30 UTC'de çalışır.
 * newsletter_enabled=true olan kullanıcılara:
 *   - Portföy özeti (toplam K/Z, en iyi/kötü hisse)
 *   - Son 7 günde tespit edilen en güçlü sinyaller
 * gönderir.
 *
 * Step 10 — Sonnet kısmı (template + dağıtım)
 */

import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { fetchOHLCV } from '@/lib/yahoo';
import { detectAllSignals } from '@/lib/signals';

const FROM    = process.env.RESEND_FROM    ?? 'BistAI <bildirim@bistai.app>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://bistai.vercel.app';

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dirColor(d: string) {
  return d === 'yukari' ? '#10b981' : d === 'asagi' ? '#ef4444' : '#6b7280';
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortfolioSummary {
  totalCost: number;
  totalValue: number;
  karZarar: number;
  karZararPct: number;
  topWinner: { sembol: string; pct: number } | null;
  topLoser:  { sembol: string; pct: number } | null;
}

interface TopSignal {
  sembol: string;
  type: string;
  direction: string;
  severity: string;
}

interface PozRow {
  sembol: string;
  miktar: number;
  alis_fiyati: number;
}

interface PozStat {
  sembol: string;
  maliyet: number;
  guncelDeger: number;
  pct: number;
}

// ─── Email HTML ────────────────────────────────────────────────────────────────

function buildHtml(portfolio: PortfolioSummary | null, topSignals: TopSignal[], aiYorum?: string) {
  const profit = (portfolio?.karZarar ?? 0) >= 0;
  const kzColor = profit ? '#10b981' : '#ef4444';
  const weekStr = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

  const portfolioHtml = portfolio ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0; border-collapse:collapse;">
      <tr>
        <td style="padding:12px; background:#1c1c1f; border-radius:8px 0 0 8px; border:1px solid #27272a; text-align:center;">
          <p style="margin:0; font-size:11px; color:#71717a; text-transform:uppercase; letter-spacing:.05em;">Portföy Değeri</p>
          <p style="margin:4px 0 0; font-size:18px; font-weight:700; color:#f4f4f5;">₺${fmt(portfolio.totalValue)}</p>
        </td>
        <td style="padding:12px; background:#1c1c1f; border:1px solid #27272a; border-left:none; text-align:center;">
          <p style="margin:0; font-size:11px; color:#71717a; text-transform:uppercase; letter-spacing:.05em;">Toplam K/Z</p>
          <p style="margin:4px 0 0; font-size:18px; font-weight:700; color:${kzColor};">${profit ? '+' : ''}₺${fmt(portfolio.karZarar)}</p>
        </td>
        <td style="padding:12px; background:#1c1c1f; border-radius:0 8px 8px 0; border:1px solid #27272a; border-left:none; text-align:center;">
          <p style="margin:0; font-size:11px; color:#71717a; text-transform:uppercase; letter-spacing:.05em;">Getiri</p>
          <p style="margin:4px 0 0; font-size:18px; font-weight:700; color:${kzColor};">${profit ? '+' : ''}${fmt(portfolio.karZararPct)}%</p>
        </td>
      </tr>
    </table>
    ${portfolio.topWinner ? `<p style="margin:4px 0; font-size:12px; color:#10b981;">🏆 En iyi: <strong>${portfolio.topWinner.sembol}</strong> +${fmt(portfolio.topWinner.pct)}%</p>` : ''}
    ${portfolio.topLoser  ? `<p style="margin:4px 0; font-size:12px; color:#ef4444;">📉 En kötü: <strong>${portfolio.topLoser.sembol}</strong> ${fmt(portfolio.topLoser.pct)}%</p>` : ''}
  ` : `<p style="font-size:13px; color:#71717a;">Portföyünüzde henüz hisse yok. <a href="${APP_URL}/portfolyo" style="color:#10b981;">Portföy ekleyin →</a></p>`;

  const signalsHtml = topSignals.length === 0
    ? `<p style="font-size:13px; color:#71717a;">Bu hafta güçlü sinyal tespit edilmedi.</p>`
    : topSignals.map(s => `
      <tr>
        <td style="padding:10px 12px; border-bottom:1px solid #27272a;">
          <a href="${APP_URL}/hisse/${s.sembol}" style="font-weight:700; color:#f4f4f5; text-decoration:none;">${s.sembol}</a>
        </td>
        <td style="padding:10px 12px; border-bottom:1px solid #27272a; font-size:12px; color:#a1a1aa;">${s.type}</td>
        <td style="padding:10px 12px; border-bottom:1px solid #27272a; font-size:12px; font-weight:600; color:${dirColor(s.direction)};">
          ${s.direction === 'yukari' ? '▲ Yukarı' : s.direction === 'asagi' ? '▼ Aşağı' : '→ Nötr'}
        </td>
        <td style="padding:10px 12px; border-bottom:1px solid #27272a; font-size:11px; color:#a1a1aa;">${s.severity}</td>
      </tr>
    `).join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background:#09090b; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">
        <tr><td style="padding:24px; background:#10b981; border-radius:12px 12px 0 0; text-align:center;">
          <h1 style="margin:0; font-size:22px; font-weight:800; color:#fff; letter-spacing:-.02em;">📊 BistAI Haftalık Bülten</h1>
          <p style="margin:6px 0 0; font-size:13px; color:rgba(255,255,255,.8);">${weekStr}</p>
        </td></tr>
        <tr><td style="padding:24px; background:#18181b; border:1px solid #27272a; border-top:none; border-radius:0 0 12px 12px;">

          ${aiYorum ? `
          <div style="margin-bottom:20px; padding:16px; background:#1a1025; border:1px solid #4c1d95; border-radius:10px;">
            <p style="margin:0 0 8px; font-size:11px; font-weight:700; color:#a78bfa; text-transform:uppercase; letter-spacing:.07em;">✨ AI Piyasa Yorumu</p>
            <div style="font-size:13px; color:#d4d4d8; line-height:1.65; white-space:pre-line;">${aiYorum.replace(/#{1,3}\s/g, '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>
          </div>
          <hr style="border:none; border-top:1px solid #27272a; margin:20px 0;" />
          ` : ''}
          <h2 style="margin:0 0 12px; font-size:14px; font-weight:700; color:#f4f4f5; text-transform:uppercase; letter-spacing:.06em;">📁 Portföy Durumu</h2>
          ${portfolioHtml}

          <hr style="border:none; border-top:1px solid #27272a; margin:20px 0;" />

          <h2 style="margin:0 0 12px; font-size:14px; font-weight:700; color:#f4f4f5; text-transform:uppercase; letter-spacing:.06em;">⚡ Bu Haftanın Güçlü Sinyalleri</h2>
          ${topSignals.length > 0 ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #27272a; border-radius:8px; overflow:hidden; border-collapse:collapse;">
            <thead>
              <tr style="background:#1c1c1f;">
                <th style="padding:8px 12px; text-align:left; font-size:11px; color:#71717a; font-weight:600;">Hisse</th>
                <th style="padding:8px 12px; text-align:left; font-size:11px; color:#71717a; font-weight:600;">Sinyal</th>
                <th style="padding:8px 12px; text-align:left; font-size:11px; color:#71717a; font-weight:600;">Yön</th>
                <th style="padding:8px 12px; text-align:left; font-size:11px; color:#71717a; font-weight:600;">Güç</th>
              </tr>
            </thead>
            <tbody>${signalsHtml}</tbody>
          </table>
          ` : signalsHtml}

          <p style="margin:20px 0 0; font-size:13px; color:#71717a; text-align:center;">
            <a href="${APP_URL}/tarama" style="color:#10b981; text-decoration:none; font-weight:600;">Tüm sinyalleri gör →</a>
          </p>

          <hr style="border:none; border-top:1px solid #27272a; margin:20px 0;" />

          <p style="margin:0; font-size:11px; color:#52525b; text-align:center; line-height:1.6;">
            BistAI · BIST Sinyal Analiz Platformu<br/>
            Bülten almak istemiyorsanız <a href="${APP_URL}/profil" style="color:#71717a;">profil sayfanızdan</a> devre dışı bırakabilirsiniz.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Cron Handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.RESEND_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ skipped: true, reason: 'env eksik' });
  }

  try {
    const admin = createAdmin();

    // 1. Newsletter açık kullanıcıları çek
    const { data: subscribers } = await admin
      .from('profiles')
      .select('id')
      .eq('newsletter_enabled', true)
      .limit(200);

    if (!subscribers?.length) {
      return NextResponse.json({ sent: 0, reason: 'abone yok' });
    }

    // 2. Haftanın güçlü sinyallerini bul (BIST100'den ilk 30 hisse)
    const { BIST_SYMBOLS } = await import('@/types');
    const SAMPLE = (BIST_SYMBOLS as readonly string[]).slice(0, 30);
    const topSignals: TopSignal[] = [];

    await Promise.allSettled(
      SAMPLE.map(async (sembol) => {
        try {
          const { candles } = await fetchOHLCV(sembol, 30);
          if (candles.length < 20) return;
          const sigs = detectAllSignals(sembol, candles);
          sigs.filter(s => s.severity === 'güçlü').forEach(s => {
            topSignals.push({ sembol, type: s.type, direction: s.direction, severity: s.severity });
          });
        } catch { /* sessizce geç */ }
      })
    );
    const signals = topSignals.slice(0, 8);

    // 3. AI Piyasa Yorumu üret (tüm abonelere ortak, bir kez çağır)
    let aiYorum = '';
    try {
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (anthropicKey) {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic({ apiKey: anthropicKey });
        const weekStr = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
        const signalSummary = signals.length > 0
          ? signals.map(s => `${s.sembol}: ${s.type} (${s.direction === 'yukari' ? '↑' : '↓'} ${s.severity})`).join(', ')
          : 'Bu hafta güçlü sinyal yok';
        const prompt = `Sen BistAI haftalık bülten editörüsün. Bugün ${weekStr}.
Bu haftanın BIST sinyal özeti: ${signalSummary}

Aboneler için kişisel, samimi ve aksiyon odaklı 3-4 cümlelik Türkçe haftalık piyasa yorumu yaz.
- Genel piyasa havasını değerlendir
- Bu haftaki öne çıkan sinyal/sektör varsa belirt
- Yatırımcıya pratik bir bakış açısı sun
- "Bu analiz yatırım tavsiyesi değildir" ile bitir
Sadece yorumu yaz, başlık veya açıklama ekleme.`;
        const msg = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{ role: 'user', content: prompt }],
        });
        aiYorum = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
      }
    } catch { /* AI yorum opsiyonel — hata durumunda devam */ }

    // 4. Her abone için email gönder
    const resend = getResend();
    let sentCount = 0;

    // Email adreslerini toplu çek
    const emailResults = await Promise.allSettled(
      subscribers.map((s: { id: string }) => admin.auth.admin.getUserById(s.id))
    );
    const emailMap = new Map<string, string>();
    subscribers.forEach((s: { id: string }, idx: number) => {
      const r = emailResults[idx];
      if (r?.status === 'fulfilled') {
        const email = r.value.data?.user?.email;
        if (email) emailMap.set(s.id, email);
      }
    });

    for (const sub of subscribers as Array<{ id: string }>) {
      const userEmail = emailMap.get(sub.id);
      if (!userEmail) continue;

      try {
        // Portföy verisi
        const { data: pozisyonlar } = await admin
          .from('portfolyo_pozisyonlar')
          .select('sembol, miktar, alis_fiyati')
          .eq('user_id', sub.id)
          .limit(20);

        let portfolio: PortfolioSummary | null = null;

        if (pozisyonlar?.length) {
          const stats: PozStat[] = await Promise.all(
            (pozisyonlar as PozRow[]).map(async (p) => {
              try {
                const { candles } = await fetchOHLCV(p.sembol, 5);
                const guncelFiyat = candles[candles.length - 1]?.close ?? p.alis_fiyati;
                const maliyet = p.miktar * p.alis_fiyati;
                const guncelDeger = p.miktar * guncelFiyat;
                const pct = ((guncelFiyat - p.alis_fiyati) / p.alis_fiyati) * 100;
                return { sembol: p.sembol, maliyet, guncelDeger, pct };
              } catch {
                return { sembol: p.sembol, maliyet: p.miktar * p.alis_fiyati, guncelDeger: p.miktar * p.alis_fiyati, pct: 0 };
              }
            })
          );
          const totalCost  = stats.reduce((acc, x) => acc + x.maliyet, 0);
          const totalValue = stats.reduce((acc, x) => acc + x.guncelDeger, 0);
          const karZarar   = totalValue - totalCost;
          const topWinner  = stats.reduce((a, b) => a.pct > b.pct ? a : b);
          const topLoser   = stats.reduce((a, b) => a.pct < b.pct ? a : b);
          portfolio = {
            totalCost, totalValue, karZarar,
            karZararPct: totalCost > 0 ? (karZarar / totalCost) * 100 : 0,
            topWinner: topWinner.pct > 0 ? { sembol: topWinner.sembol, pct: topWinner.pct } : null,
            topLoser:  topLoser.pct  < 0 ? { sembol: topLoser.sembol,  pct: topLoser.pct  } : null,
          };
        }

        const html = buildHtml(portfolio, signals, aiYorum);
        await resend.emails.send({
          from: FROM,
          to: userEmail,
          subject: `📊 BistAI Haftalık Bülten — ${new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}`,
          html,
        });
        sentCount++;
      } catch { /* bir kullanıcı başarısız olursa diğerlerine devam et */ }
    }

    return NextResponse.json({ sent: sentCount, signals: signals.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
