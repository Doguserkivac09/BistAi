/**
 * POST /api/tradingview-alert?key=<TRADINGVIEW_WEBHOOK_SECRET>
 *
 * TradingView alarm webhook'u → Telegram özel mesaj köprüsü.
 *
 * TradingView webhook'ları özel HTTP header GÖNDEREMEZ; bu yüzden koruma
 * query param ile yapılır (`?key=`). URL'yi kimseyle paylaşma.
 *
 * Gövde: TradingView alarm mesajını düz metin (text/plain) olarak yollar.
 * JSON gönderirsen `{ "text": "..." }` veya `{ "message": "..." }` da kabul edilir.
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN         — BotFather'dan alınan token
 *   TELEGRAM_CHAT_ID           — mesajın gideceği sohbet (kendi kullanıcı id'in)
 *   TRADINGVIEW_WEBHOOK_SECRET — URL'deki `key` değeri
 *
 * Test: GET /api/tradingview-alert?key=...&test=1 → Telegram'a örnek mesaj atar.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TELEGRAM_MAX = 4000; // Telegram sınırı 4096; güvenlik payı bırakıldı
const BODY_MAX = 20_000; // makul üst sınır — kötü niyetli dev gövdeyi erken kes

// ─── Koruma ────────────────────────────────────────────────────────────────────
function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.TRADINGVIEW_WEBHOOK_SECRET;
  // Secret tanımlı değilse endpoint kapalıdır (changelog route'unun aksine:
  // burası DIŞARIYA açık bir yazma yolu, açık bırakılamaz).
  if (!expected) return false;
  const key = req.nextUrl.searchParams.get('key') ?? req.headers.get('x-webhook-key');
  return key === expected;
}

// ─── Telegram ──────────────────────────────────────────────────────────────────
function splitForTelegram(text: string): string[] {
  if (text.length <= TELEGRAM_MAX) return [text];
  const parts: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    // Tek satır bile sınırı aşıyorsa sert kes
    if (line.length > TELEGRAM_MAX) {
      if (current) {
        parts.push(current);
        current = '';
      }
      for (let i = 0; i < line.length; i += TELEGRAM_MAX) {
        parts.push(line.slice(i, i + TELEGRAM_MAX));
      }
      continue;
    }
    if (current.length + line.length + 1 > TELEGRAM_MAX) {
      parts.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) parts.push(current);
  return parts;
}

async function sendTelegram(text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN veya TELEGRAM_CHAT_ID tanımlı değil.' };
  }

  for (const chunk of splitForTelegram(text)) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        // parse_mode YOK: alarm metni serbest biçimli, Markdown kaçışı hataya açık.
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // Token/chat id sızmaması için detay kısaltılır
      return { ok: false, error: `Telegram ${res.status}: ${detail.slice(0, 200)}` };
    }
  }
  return { ok: true };
}

// ─── Gövde okuma ───────────────────────────────────────────────────────────────
async function readMessage(req: NextRequest): Promise<string> {
  const raw = (await req.text()).slice(0, BODY_MAX).trim();
  if (!raw) return '';
  // TradingView düz metin yollar; kullanıcı JSON yazdıysa onu da destekle
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const candidate = parsed.text ?? parsed.message ?? parsed.msg;
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    } catch {
      // JSON değilse düz metin olarak devam
    }
  }
  return raw;
}

// ─── Handler'lar ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
  }

  const message = await readMessage(req);
  if (!message) {
    return NextResponse.json({ error: 'Boş mesaj.' }, { status: 400 });
  }

  const result = await sendTelegram(message);
  if (!result.ok) {
    console.error('[tradingview-alert] Telegram gönderimi başarısız:', result.error);
    // TradingView'in tekrar denemesi için 502
    return NextResponse.json({ error: 'Telegram gönderilemedi.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
  }

  if (req.nextUrl.searchParams.get('test') !== '1') {
    return NextResponse.json({ ok: true, hint: 'Test için ?test=1 ekleyin.' });
  }

  const result = await sendTelegram(
    'Test — TradingView alarm köprüsü çalışıyor.\n' +
      'Bu mesajı gördüysen webhook URL\'sini TradingView alarmına yapıştırabilirsin.',
  );
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sent: true });
}
