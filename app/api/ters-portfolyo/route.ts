/**
 * Ters Portföy AI Öneri Motoru
 *
 * POST /api/ters-portfolyo
 *
 * Kullanıcının portföyü + izleme listesi + sektör momentumu → AI'dan
 * kişiselleştirilmiş "portföy dışı fırsatlar" analizi:
 * - Mevcut portföyde hangi sektörler eksik?
 * - Momentum güçlü sektörlerden hangi hisseler öne çıkıyor?
 * - Çeşitlendirme fırsatları nerede?
 *
 * Model: claude-sonnet-4-6 (portföy analizi için dengeli seçim)
 * Cache: 6 saat (portföy değişmediği sürece geçerli)
 * Rate limit: 10 req/dakika per IP
 * Auth: zorunlu
 */

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { getMacroFull } from '@/lib/macro-service';
import { getSectorId, getSector } from '@/lib/sectors';

const RATE_LIMIT = 10;
const WINDOW_MS  = 60_000;
const CACHE_TTL  = 6 * 60 * 60 * 1000; // 6 saat

// ── In-memory cache ───────────────────────────────────────────────────

const analysisCache = new Map<string, { analysis: string; ts: number }>();

// ── Veri çekme yardımcıları ───────────────────────────────────────────

interface PozRow { sembol: string; miktar: number; alis_fiyati: number; }
interface WatchRow { sembol: string; }

async function getUserData(userId: string): Promise<{ portfoy: PozRow[]; watchlist: WatchRow[] }> {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [{ data: poz }, { data: watch }] = await Promise.all([
    admin.from('portfolyo_pozisyonlar').select('sembol,miktar,alis_fiyati').eq('user_id', userId).limit(30),
    admin.from('watchlist').select('sembol').eq('user_id', userId).limit(30),
  ]);

  return {
    portfoy:   (poz   ?? []) as PozRow[],
    watchlist: (watch ?? []) as WatchRow[],
  };
}

interface SectorInfo {
  id: string;
  name: string;
  direction: string;
  compositeScore: number;
  symbols?: string[];
}

async function getSectorData(): Promise<SectorInfo[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/sectors`, { next: { revalidate: 900 } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.sectors ?? []) as SectorInfo[];
  } catch {
    return [];
  }
}

// ── Prompt ────────────────────────────────────────────────────────────

interface MacroCtx {
  score: number | null;
  wind: string | null;
  regime: string | null;
}

function buildPrompt(
  portfoy: PozRow[],
  watchlist: WatchRow[],
  sektorler: SectorInfo[],
  macro: MacroCtx,
): string {
  const now = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

  const portfoySemboller = portfoy.map(p => p.sembol);
  const watchSemboller   = watchlist.map(w => w.sembol);
  const tumTakip = new Set([...portfoySemboller, ...watchSemboller]);

  const portfoyText = portfoy.length > 0
    ? portfoy.map(p => `${p.sembol}(${p.miktar}lot @ ${p.alis_fiyati}₺)`).join(', ')
    : 'Portföy boş';

  const watchText = watchlist.length > 0
    ? watchlist.map(w => w.sembol).join(', ')
    : 'Watchlist boş';

  // Portföy sektör dağılımı (lib/sectors.ts üzerinden gerçek mapping)
  const sektorYogunluk = new Map<string, { ad: string; sayi: number; semboller: string[] }>();
  for (const sembol of portfoySemboller) {
    const sid = getSectorId(sembol);
    const meta = getSector(sid);
    if (!sektorYogunluk.has(sid)) sektorYogunluk.set(sid, { ad: meta.name, sayi: 0, semboller: [] });
    const entry = sektorYogunluk.get(sid)!;
    entry.sayi += 1;
    entry.semboller.push(sembol);
  }
  const sektorYogunlukText = portfoy.length > 0
    ? [...sektorYogunluk.values()]
        .sort((a, b) => b.sayi - a.sayi)
        .map(s => `${s.ad}: ${s.sayi} (${s.semboller.join(', ')})`)
        .join(' · ')
    : 'Portföy boş';

  // Tüm sektör listesi (kullanıcının portföyünde OLMAYAN sektörleri tespit için)
  const portfoySektorIdSet = new Set(sektorYogunluk.keys());
  const eksikSektorler = sektorler
    .filter(s => !portfoySektorIdSet.has(s.id))
    .filter(s => s.compositeScore > 0)
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, 5)
    .map(s => `${s.name} (+${s.compositeScore})`)
    .join(', ');

  // Güçlü/zayıf sektörler
  const gucluSektor = sektorler
    .filter(s => s.direction === 'yukari' || s.compositeScore > 10)
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, 5)
    .map(s => `${s.name} (skor: ${s.compositeScore > 0 ? '+' : ''}${s.compositeScore})`)
    .join(', ');

  const zayifSektor = sektorler
    .filter(s => s.direction === 'asagi' || s.compositeScore < -10)
    .sort((a, b) => a.compositeScore - b.compositeScore)
    .slice(0, 3)
    .map(s => `${s.name} (skor: ${s.compositeScore})`)
    .join(', ');

  // Konsantrasyon riski tespiti
  const enYogunSektor = [...sektorYogunluk.values()].sort((a, b) => b.sayi - a.sayi)[0];
  const konsantrasyonRiski = enYogunSektor && portfoy.length >= 3 && (enYogunSektor.sayi / portfoy.length) >= 0.5
    ? `⚠️ ${enYogunSektor.ad} sektöründe yoğunlaşma var (${enYogunSektor.sayi}/${portfoy.length} hisse)`
    : null;

  // Makro bağlam
  const makroText = macro.score !== null
    ? `Makro skor: ${macro.score > 0 ? '+' : ''}${macro.score} (${macro.wind ?? 'nötr'})${macro.regime ? `, XU100 rejimi: ${macro.regime}` : ''}`
    : 'Makro veri henüz yüklenmedi';

  return `Sen Türkiye Borsa İstanbul (BIST) portföy stratejisti ve çeşitlendirme uzmanısın.
Bugün: ${now}

KULLANICININ MEVCUT DURUMU:
- Portföy (${portfoy.length} pozisyon): ${portfoyText}
- Watchlist (${watchlist.length} hisse): ${watchText}
- Toplam takip: ${tumTakip.size} hisse

PORTFÖY SEKTÖR DAĞILIMI:
${sektorYogunlukText}
${konsantrasyonRiski ? `\n${konsantrasyonRiski}` : ''}

MAKRO BAĞLAM:
${makroText}

GÜNCEL SEKTÖR MOMENTUMU:
- Güçlü sektörler: ${gucluSektor || 'veri yok'}
- Zayıf sektörler: ${zayifSektor || 'veri yok'}
- Portföyde OLMAYAN güçlü sektörler: ${eksikSektorler || 'tüm güçlü sektörlerde varlık var'}

GÖREV: Kullanıcıya portföyünün DIŞINDA kalan fırsatları somut, aksiyon odaklı anlat.
Önemli: Spesifik hisse önerirken makro bağlamı ve sektör momentumunu birlikte değerlendir.

YANIT FORMATI (Türkçe, pratik, kısa cümleler — toplam ~400-500 kelime):

## 🎯 Portföy Analizi
Mevcut portföyün güçlü yanları + eksiklikler + makro koşullarla uyumu (3-4 cümle).
${portfoy.length === 0 ? 'Portföy boş — başlangıç stratejisi öner.' : ''}
${konsantrasyonRiski ? 'Konsantrasyon riskini açıkça vurgula.' : ''}

## 🏆 Kaçırılan Fırsatlar
Portföyde olmayan ama momentum güçlü 3-4 sektör/hisse:
- Her biri için: neden fırsat (makro + sektör + teknik), dikkat edilmesi gereken risk
- Spesifik hisse adı öner — neden o hisse spesifik olarak (sadece analiz — yatırım tavsiyesi değil)

## ⚖️ Çeşitlendirme Boşlukları
Eksik 2-3 tema (ör: döviz koruması, defansif, büyüme, ihracatçı).
Mevcut makro koşullarda hangi tema öncelikli — kısa gerekçe.

## ⚠️ Dikkat: Riskli Alanlar
Şu an momentum zayıf veya makroya ters duran sektörler — bunlardan kaçın gerekçesi.

*Bu analiz genel bilgi amaçlıdır, yatırım tavsiyesi değildir.*`;
}

// ── Handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ip = getClientIP(request.headers);
  const rl = checkRateLimit(`ters-portfolyo:${ip}`, RATE_LIMIT, WINDOW_MS);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Çok fazla istek.' }), {
      status: 429, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Giriş yapmanız gerekiyor.' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Tier gate — sadece Pro/Premium
  const { data: profile } = await supabase
    .from('profiles')
    .select('tier')
    .eq('id', user.id)
    .single();
  const tier = (profile?.tier as string) ?? 'free';
  if (tier === 'free') {
    return new Response(JSON.stringify({
      error: 'AI Portföy Analizi Pro ve Premium planlarda kullanılabilir.',
      upgrade: true,
    }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AI servisi yapılandırılmamış.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Cache kontrolü
  const cacheKey = `ters:${user.id}:${new Date().toISOString().slice(0, 13)}`; // saatlik cache
  const cached = analysisCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return Response.json({ analysis: cached.analysis, cached: true });
  }

  const [userData, sektorler, macroFull] = await Promise.all([
    getUserData(user.id),
    getSectorData(),
    getMacroFull().catch(() => null),
  ]);

  const macroCtx: MacroCtx = {
    score:  macroFull?.macroScore?.score ?? null,
    wind:   macroFull?.macroScore?.wind ?? null,
    regime: null, // regime ayrı bir kaynak — getMacroFull içermez
  };

  const prompt = buildPrompt(userData.portfoy, userData.watchlist, sektorler, macroCtx);
  const client = new Anthropic({ apiKey });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let accumulated = '';
        const s = client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        });

        for await (const chunk of s) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            accumulated += chunk.delta.text;
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`
            ));
          }
        }

        // Cache'e yaz
        analysisCache.set(cacheKey, { analysis: accumulated, ts: Date.now() });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI yanıt üretemedi.';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
