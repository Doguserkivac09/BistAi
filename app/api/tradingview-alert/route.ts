/**
 * POST /api/tradingview-alert?key=<TRADINGVIEW_WEBHOOK_SECRET>
 *
 * TradingView alarm webhook'u → Supabase kaydı + Telegram mesajı.
 *
 * TradingView webhook'ları özel HTTP header GÖNDEREMEZ; bu yüzden koruma
 * query param ile yapılır (`?key=`). URL'yi kimseyle paylaşma.
 *
 * İKİ GÖVDE BİÇİMİ:
 *   1) JSON (tercih edilen) — tarayıcı betikleri bunu üretir. Her sembol
 *      `scanner_signals` tablosuna tek satır olarak yazılır (backtest için),
 *      Telegram mesajı da BURADA formatlanır. Şema için ScannerPayload'a bak.
 *   2) Düz metin — eski/serbest alarmlar. Kayıt YAPILMAZ, olduğu gibi iletilir.
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN         — BotFather'dan alınan token
 *   TELEGRAM_CHAT_ID           — hedef sohbet(ler). VİRGÜLLE birden fazla yazılabilir:
 *                                "1042817562,-1001234567890" → hem özel sohbet hem grup.
 *                                Grup id'leri NEGATİF olur (supergroup: -100... ile başlar).
 *   TRADINGVIEW_WEBHOOK_SECRET — URL'deki `key` değeri
 *   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — kayıt için
 *
 * Test: GET /api/tradingview-alert?key=...&test=1 → Telegram'a örnek mesaj atar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TELEGRAM_MAX = 4000; // Telegram sınırı 4096; güvenlik payı bırakıldı
const BODY_MAX = 40_000;

// ─── Koruma ────────────────────────────────────────────────────────────────────
function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.TRADINGVIEW_WEBHOOK_SECRET;
  // Secret tanımlı değilse endpoint kapalıdır (dışarıya açık yazma yolu).
  if (!expected) return false;
  const key = req.nextUrl.searchParams.get('key') ?? req.headers.get('x-webhook-key');
  return key === expected;
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

// ─── Tarayıcı payload şeması ───────────────────────────────────────────────────
// Pine tarafında kısa anahtar kullanılır (alarm metni 4096 karakterle sınırlı).
interface ScannerItem {
  s: string;   // sembol
  d: number;   // yön: 1 | -1
  m: number;   // sinyal bit maskesi
  sc?: number; // skor
  adx?: number;
  rv?: number; // bağıl hacim
  tl?: number; // TL cirosu (mn)
  cmf?: number;
  vw?: number; // VWAP tarafı
  rs?: number; // göreli güç (hisse% − endeks%)
  ld?: number; // en yakın seviyeye ATR uzaklığı
  ft?: number; // follow-through (1/0)
  vs?: number; // iFVG yapı kalitesi (0-100) — "V"ye benzerlik
  p: number;   // fiyat
  atr?: number;
}

interface ScannerPayload {
  v: number;
  src?: string;   // "B1" | "B2"
  tf: string;     // "15" | "60" | "D"
  kz?: string;    // killzone adı
  reg?: number;   // endeks rejimi
  sp?: string;    // seans fazı: acilis | govde | ogle | kapanis | disi
  bso?: number;   // BIST açılışından geçen dakika
  t?: number;     // bar kapanış zamanı (ms)
  items: ScannerItem[];
}

// Bit maskesi → okunabilir etiket. Pine tarafıyla AYNI sırada olmalı.
const SIGNAL_LABELS: [number, string][] = [
  [1, 'Yutan'],
  [2, 'VIkes'],
  [4, 'VIyakn'],
  [8, 'DIkes'],
  [16, 'Kirilim'],
  [32, 'FVG'],
  [64, 'iFVG'],
];

function maskToText(mask: number): string {
  return SIGNAL_LABELS.filter(([bit]) => (mask & bit) !== 0)
    .map(([, label]) => label)
    .join(' ');
}

function maskToCount(mask: number): number {
  return SIGNAL_LABELS.reduce((n, [bit]) => n + ((mask & bit) !== 0 ? 1 : 0), 0);
}

function isScannerPayload(x: unknown): x is ScannerPayload {
  if (typeof x !== 'object' || x === null) return false;
  const p = x as Record<string, unknown>;
  return typeof p.tf === 'string' && Array.isArray(p.items);
}

// ─── Telegram mesajı ───────────────────────────────────────────────────────────
function fmt(n: number | undefined, digits = 1): string {
  return typeof n === 'number' && Number.isFinite(n) ? n.toFixed(digits) : '—';
}

function buildMessage(p: ScannerPayload): string {
  const head =
    `📊 VIOP Fırsat Tarayıcı${p.src ? ' · ' + p.src : ''} (${p.tf})` +
    (p.kz ? ` · ${p.kz}` : '') +
    (p.reg === 1 ? ' · endeks+' : p.reg === -1 ? ' · endeks−' : '');

  const rows = p.items
    .slice()
    .sort((a, b) => (b.sc ?? 0) - (a.sc ?? 0))
    .slice(0, 10)
    .map((it) => {
      const arrow = it.d === 1 ? '↑ YUKARI' : '↓ AŞAĞI';
      const sig = maskToText(it.m) || '—';
      // Seviye bağlamı: 0.5 ATR altı "seviyede", 1.5 altı "yakın", üstü "boşlukta"
      const lvl =
        typeof it.ld !== 'number' ? ''
          : it.ld <= 0.5 ? ' · seviyede'
          : it.ld <= 1.5 ? ' · seviyeye yakın'
          : ' · boşlukta';
      const rs =
        typeof it.rs !== 'number' ? ''
          : it.rs > 0 ? ` · endeksten güçlü (+${fmt(it.rs)}%)`
          : ` · endeksten zayıf (${fmt(it.rs)}%)`;
      const ft = it.ft === 1 ? ' · teyitli' : '';
      // V-skor yalnızca iFVG (bit 64) varken anlamlı
      const vs = (it.m & 64) !== 0 && typeof it.vs === 'number' ? ` · V-skor ${fmt(it.vs, 0)}` : '';
      return (
        `${it.s} ${arrow} · ${sig}\n` +
        `skor ${fmt(it.sc, 0)} · hacim ${fmt(it.rv)}x${lvl}${rs}${ft}${vs}\n` +
        `https://www.tradingview.com/chart/?symbol=BIST%3A${it.s}`
      );
    })
    .join('\n\n');

  return `${head}\n\n${rows}\n\n⚠️ Otomatik tarama çıktısıdır; yatırım tavsiyesi değildir.`;
}

// ─── Supabase kaydı ────────────────────────────────────────────────────────────
async function persist(p: ScannerPayload): Promise<{ saved: number; error?: string }> {
  const supabase = createAdminClient();
  if (!supabase) return { saved: 0, error: 'Supabase env tanımlı değil.' };

  const barTime = typeof p.t === 'number' && p.t > 0 ? new Date(p.t).toISOString() : null;

  const rows = p.items.map((it) => ({
    bar_time: barTime,
    scan_tf: p.tf,
    source: p.src ?? 'bilinmiyor',
    symbol: it.s,
    direction: it.d,
    signal_mask: it.m,
    signal_text: maskToText(it.m),
    signal_count: maskToCount(it.m),
    score: it.sc ?? null,
    adx: it.adx ?? null,
    rvol: it.rv ?? null,
    tl_mn: it.tl ?? null,
    cmf: it.cmf ?? null,
    vwap_side: it.vw ?? null,
    index_regime: p.reg ?? null,
    killzone: p.kz ?? null,
    rel_strength: it.rs ?? null,
    level_dist_atr: it.ld ?? null,
    follow_through: it.ft ?? null,
    // V-skor yalnızca iFVG içeren sinyalde anlamlı; diğerlerinde null bırakılır
    // ki istatistikte 0'lar ortalamayı bozmasın.
    v_score: (it.m & 64) !== 0 ? it.vs ?? null : null,
    session_phase: p.sp ?? null,
    mins_since_open: typeof p.bso === 'number' ? Math.round(p.bso) : null,
    price: it.p,
    atr: it.atr ?? null,
  }));

  // Aynı bar için tekrar gelen alarm sessizce yok sayılır (unique constraint).
  const { error, count } = await supabase
    .from('scanner_signals')
    .upsert(rows, { onConflict: 'source,scan_tf,symbol,bar_time', ignoreDuplicates: true, count: 'exact' });

  if (error) return { saved: 0, error: error.message };
  return { saved: count ?? rows.length };
}

// ─── Telegram ──────────────────────────────────────────────────────────────────
function splitForTelegram(text: string): string[] {
  if (text.length <= TELEGRAM_MAX) return [text];
  const parts: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
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
  const chatIdRaw = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatIdRaw) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN veya TELEGRAM_CHAT_ID tanımlı değil.' };
  }

  const chatIds = chatIdRaw.split(',').map((id) => id.trim()).filter(Boolean);
  if (!chatIds.length) return { ok: false, error: 'TELEGRAM_CHAT_ID boş.' };

  const chunks = splitForTelegram(text);
  const errors: string[] = [];

  for (const chatId of chatIds) {
    for (const chunk of chunks) {
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
        // Bir hedef başarısız olsa da diğerlerine gönderim SÜRER.
        errors.push(`${chatId} → ${res.status}: ${detail.slice(0, 120)}`);
        break;
      }
    }
  }

  if (errors.length === chatIds.length) return { ok: false, error: errors.join(' | ') };
  if (errors.length) console.warn('[tradingview-alert] Bazı hedeflere gönderilemedi:', errors.join(' | '));
  return { ok: true };
}

// ─── Handler'lar ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
  }

  const raw = (await req.text()).slice(0, BODY_MAX).trim();
  if (!raw) return NextResponse.json({ error: 'Boş mesaj.' }, { status: 400 });

  // --- JSON mu? ---
  let parsed: unknown = null;
  if (raw.startsWith('{')) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null; // düz metin olarak devam
    }
  }

  if (isScannerPayload(parsed)) {
    const payload = parsed;
    // Kayıt Telegram'dan ÖNCE denenir ama başarısız olursa mesaj yine gider:
    // ölçüm kaybı, bildirim kaybından iyidir.
    const saveResult = await persist(payload);
    if (saveResult.error) {
      console.error('[tradingview-alert] Supabase kaydı başarısız:', saveResult.error);
    }

    const sendResult = await sendTelegram(buildMessage(payload));
    if (!sendResult.ok) {
      console.error('[tradingview-alert] Telegram gönderimi başarısız:', sendResult.error);
      return NextResponse.json({ error: 'Telegram gönderilemedi.', saved: saveResult.saved }, { status: 502 });
    }
    return NextResponse.json(
      { ok: true, saved: saveResult.saved, items: payload.items.length },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // --- Düz metin / bilinmeyen JSON: sadece ilet, kaydetme ---
  let message = raw;
  if (parsed && typeof parsed === 'object') {
    const p = parsed as Record<string, unknown>;
    const cand = p.text ?? p.message ?? p.msg;
    if (typeof cand === 'string' && cand.trim()) message = cand.trim();
  }

  const result = await sendTelegram(message);
  if (!result.ok) {
    console.error('[tradingview-alert] Telegram gönderimi başarısız:', result.error);
    return NextResponse.json({ error: 'Telegram gönderilemedi.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, saved: 0 }, { headers: { 'Cache-Control': 'no-store' } });
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
      "Bu mesajı gördüysen webhook URL'sini TradingView alarmına yapıştırabilirsin.",
  );
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sent: true });
}
