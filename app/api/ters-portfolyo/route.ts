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
 * Model: claude-opus-4-6
 * Cache: 6 saat (portföy değişmediği sürece geçerli)
 * Rate limit: 10 req/dakika per IP
 * Auth: zorunlu
 */

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

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

function buildPrompt(
  portfoy: PozRow[],
  watchlist: WatchRow[],
  sektorler: SectorInfo[]
): string {
  const now = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

  // Portföy sektör dağılımı özeti (basit — sembol prefix'ten tahmin)
  const portfoySemboller = portfoy.map(p => p.sembol);
  const watchSemboller   = watchlist.map(w => w.sembol);
  const tumTakip = new Set([...portfoySemboller, ...watchSemboller]);

  const portfoyText = portfoy.length > 0
    ? portfoy.map(p => `${p.sembol}(${p.miktar}lot)`).join(', ')
    : 'Portföy boş';

  const watchText = watchlist.length > 0
    ? watchlist.map(w => w.sembol).join(', ')
    : 'Watchlist boş';

  // Güçlü sektörler
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

  return `Sen Türkiye Borsa İstanbul (BIST) portföy stratejisti ve çeşitlendirme uzmanısın.
Bugün: ${now}

KULLANICININ MEVCUT DURUMU:
- Portföy (${portfoy.length} hisse): ${portfoyText}
- Watchlist (${watchlist.length} hisse): ${watchText}
- Toplam takip edilen: ${tumTakip.size} hisse

GÜNCEL SEKTÖR MOMENTUMU:
- Güçlü sektörler: ${gucluSektor || 'veri yok'}
- Zayıf sektörler: ${zayifSektor || 'veri yok'}

GÖREV: Bu kullanıcıya portföyünün DIŞINDA kalan fırsatları anlat.

YANIT FORMATI (Türkçe, pratik odaklı):

## 🎯 Portföy Analizi
Kullanıcının mevcut portföyünün güçlü yanları ve eksikleri (2-3 cümle).
${portfoy.length === 0 ? 'Portföy boş — başlangıç için önerileri ver.' : ''}

## 🏆 Kaçırılan Fırsatlar
Portföyde olmayan ama momentum güçlü 3-4 sektör/hisse tipi:
- Her biri için: neden fırsat olduğu, dikkat edilmesi gereken risk
- Spesifik hisse adı öner (sadece analiz — yatırım tavsiyesi değil)

## ⚖️ Çeşitlendirme Boşlukları
Portföyde eksik olan 2-3 sektör/tema (ör: döviz koruma, defansif, büyüme).
Bu boşlukları doldurmak için ne bakılabilir?

## ⚠️ Dikkat: Riskli Alanlar
Şu an momentum zayıf olan ve portföyde eklenebilecek ama riskli sektörler.

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

  const [userData, sektorler] = await Promise.all([
    getUserData(user.id),
    getSectorData(),
  ]);

  const prompt = buildPrompt(userData.portfoy, userData.watchlist, sektorler);
  const client = new Anthropic({ apiKey });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let accumulated = '';
        const s = client.messages.stream({
          model: 'claude-opus-4-6',
          max_tokens: 1536,
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
