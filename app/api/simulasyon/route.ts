/**
 * Makro Simülatör API — Streaming
 *
 * POST /api/simulasyon
 * Body: { scenario: SimulationScenario }
 *
 * Kullanıcının seçtiği makro senaryoyu (ör: USD/TRY +20%) analiz eder:
 * - Hangi BIST sektörleri kazanır/kaybeder?
 * - Tarihsel örnekler (2018 kur krizi, 2021 faiz şoku vb.)
 * - Portföy etki tahmini (varsa)
 * - Aksiyon önerileri
 *
 * Model: claude-sonnet-4-6 (maliyet/kalite dengesi)
 * Rate limit: 10 req/dakika per IP
 * Auth: zorunlu
 * Tier: Pro/Premium (free kullanıcılar erişemez)
 * Cache: 6 saat (aynı senaryo + büyüklük için)
 */

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { checkAndRecordAiBudget } from '@/lib/ai-budget';
import { sanitizeUserInput } from '@/lib/sanitize';

const RATE_LIMIT = 10;
const WINDOW_MS  = 60_000;
const CACHE_TTL  = 6 * 60 * 60 * 1000; // 6 saat

const simCache = new Map<string, { result: string; ts: number }>();

function simCacheKey(scenario: { type: string; magnitude: string }): string {
  const date = new Date().toISOString().slice(0, 10);
  return `sim:${date}:${scenario.type}:${scenario.magnitude}`;
}

async function getDbCache(key: string): Promise<string | null> {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data } = await admin
      .from('ai_cache')
      .select('explanation')
      .eq('cache_key', key)
      .gt('expires_at', new Date().toISOString())
      .single();
    return data?.explanation ?? null;
  } catch { return null; }
}

async function setDbCache(key: string, result: string): Promise<void> {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await admin.from('ai_cache').upsert({
      cache_key: key,
      explanation: result,
      version: 5,
      hit_count: 0,
      expires_at: new Date(Date.now() + CACHE_TTL).toISOString(),
    }, { onConflict: 'cache_key' });
  } catch { /* sessizce geç */ }
}

// ── Senaryo tipleri ─────────────────────────────────────────────────

export interface SimulationScenario {
  type: ScenarioType;
  magnitude: 'hafif' | 'orta' | 'sert';  // +5% / +15% / +30% gibi
  customNote?: string;                     // Ek bağlam
}

export type ScenarioType =
  | 'usdtry_yukselis'    // USD/TRY artışı
  | 'usdtry_dusus'       // USD/TRY düşüşü (TL güçlenir)
  | 'faiz_artis'         // TCMB faiz artışı
  | 'faiz_dusus'         // TCMB faiz indirimi
  | 'vix_yukselis'       // Global risk-off (VIX artışı)
  | 'vix_dusus'          // Global risk-on (VIX düşüşü)
  | 'enflasyon_artis'    // Türkiye enflasyon artışı
  | 'cds_yukselis'       // Türkiye CDS artışı (ülke riski)
  | 'fed_artis'          // Fed faiz artışı
  | 'petrol_yukselis'    // Ham petrol fiyat artışı
  | 'petrol_dusus'       // Ham petrol düşüşü
  | 'resesyon_kaygisi';  // Global resesyon endişesi

const SCENARIO_LABELS: Record<ScenarioType, string> = {
  usdtry_yukselis:   'USD/TRY Yükselişi (TL Zayıflıyor)',
  usdtry_dusus:      'USD/TRY Düşüşü (TL Güçleniyor)',
  faiz_artis:        'TCMB Faiz Artışı',
  faiz_dusus:        'TCMB Faiz İndirimi',
  vix_yukselis:      'Global Risk-Off (VIX Yükseliyor)',
  vix_dusus:         'Global Risk-On (VIX Düşüyor)',
  enflasyon_artis:   'Türkiye Enflasyon Artışı',
  cds_yukselis:      'Türkiye CDS Artışı (Ülke Riski)',
  fed_artis:         'Fed Faiz Artışı',
  petrol_yukselis:   'Ham Petrol Fiyat Artışı',
  petrol_dusus:      'Ham Petrol Düşüşü',
  resesyon_kaygisi:  'Global Resesyon Endişesi',
};

const MAGNITUDE_LABELS: Record<SimulationScenario['magnitude'], string> = {
  hafif: 'Hafif (%5-10)',
  orta:  'Orta (%10-20)',
  sert:  'Sert (%20+)',
};

// ── Portföy özeti ────────────────────────────────────────────────────

async function getPortfolioSummary(userId: string): Promise<string> {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data } = await admin
      .from('portfolyo_pozisyonlar')
      .select('sembol, miktar, alis_fiyati')
      .eq('user_id', userId)
      .limit(15);
    if (!data || data.length === 0) return 'Portföy bilgisi yok.';
    const lines = (data as Array<{ sembol: string; miktar: number; alis_fiyati: number }>)
      .map(p => `${p.sembol}(${p.miktar}lot@${p.alis_fiyati.toFixed(0)}₺)`)
      .join(', ');
    return `${data.length} pozisyon: ${lines}`;
  } catch {
    return '';
  }
}

// ── System Prompt ────────────────────────────────────────────────────

function buildPrompt(scenario: SimulationScenario, portfolioStr: string): string {
  const label = SCENARIO_LABELS[scenario.type] ?? scenario.type;
  const mag   = MAGNITUDE_LABELS[scenario.magnitude];
  const now   = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

  return `Sen Türkiye finansal piyasaları uzmanı bir makroekonomist ve portföy stratejistisin.
Bugünün tarihi: ${now}

GÖREV: Aşağıdaki makro senaryonun BIST üzerindeki etkisini analiz et.

SENARYO: ${label} — ${mag} büyüklükte
${scenario.customNote ? `EK NOT: ${scenario.customNote}` : ''}
${portfolioStr ? `\nKULLANICININ PORTFÖYÜ: ${portfolioStr}` : ''}

ANALİZİ ŞÖYLE YAPILANDIR (markdown kullan):

## 📊 Senaryo Özeti
Tek paragraf: senaryonun ne anlama geldiği ve neden önemli olduğu.

## 🏭 Sektör Etkileri

| Sektör | Etki | Neden |
|--------|------|-------|
Tablo şeklinde: Bankacılık, Sanayi, Enerji, Perakende, Teknoloji, İhracatçılar, Savunma/Defansif sektörler — her biri için 🟢 Olumlu / 🔴 Olumsuz / 🟡 Nötr ve kısa açıklama.

## 📜 Tarihsel Örnekler
Türkiye'den 2-3 somut tarihsel örnek (yıl + ne oldu + BIST tepkisi).

## ⚡ Dikkat Edilmesi Gereken Hisseler
${portfolioStr
  ? '**Portföydeki hisseler için özel yorum** + genel olarak bu senaryoda öne çıkabilecek/riskli hisseler.'
  : 'Bu senaryoda öne çıkabilecek ve riskli olabilecek hisse tipleri (spesifik tavsiye değil, analiz).'
}

## 🎯 Aksiyon Noktaları
3-5 madde halinde yatırımcının göz önünde bulundurması gerekenler.

---
*Bu analiz genel bilgi amaçlıdır, yatırım tavsiyesi değildir.*`;
}

// ── Handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ip = getClientIP(request.headers);
  const rl = checkRateLimit(`simulasyon:${ip}`, RATE_LIMIT, WINDOW_MS);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Çok fazla istek. Lütfen bekleyin.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) },
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
      error: 'Makro Simülatör Pro ve Premium planlarda kullanılabilir.',
      upgrade: true,
    }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  // Global günlük bütçe kontrolü
  const budget = await checkAndRecordAiBudget();
  if (!budget.allowed) {
    return new Response(JSON.stringify({
      error: 'AI servisi bugün günlük limitine ulaştı. Yarın tekrar deneyin.',
    }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  let scenario: SimulationScenario;
  try {
    const body = await request.json();
    const raw = body.scenario;
    if (!raw?.type || !raw?.magnitude) throw new Error('invalid');

    // Whitelist validation — enum değerleri dışında hiçbir şey geçemez
    if (!(raw.type in SCENARIO_LABELS)) {
      throw new Error('invalid scenario type');
    }
    const validMagnitudes: SimulationScenario['magnitude'][] = ['hafif', 'orta', 'sert'];
    if (!validMagnitudes.includes(raw.magnitude)) {
      throw new Error('invalid magnitude');
    }

    scenario = {
      type: raw.type as ScenarioType,
      magnitude: raw.magnitude as SimulationScenario['magnitude'],
      // customNote: kullanıcı kontrollü — sanitize et (max 200 karakter)
      customNote: raw.customNote
        ? sanitizeUserInput(String(raw.customNote), 200)
        : undefined,
    };
  } catch {
    return new Response(JSON.stringify({ error: 'Geçersiz senaryo.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AI servisi yapılandırılmamış.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const portfolioStr = await getPortfolioSummary(user.id);

  // Cache kontrolü (customNote yoksa cache'lenebilir)
  const cKey = !scenario.customNote ? simCacheKey(scenario) : null;
  if (cKey) {
    const mem = simCache.get(cKey);
    if (mem && Date.now() - mem.ts < CACHE_TTL) {
      return Response.json({ result: mem.result, cached: true });
    }
    const db = await getDbCache(cKey);
    if (db) {
      simCache.set(cKey, { result: db, ts: Date.now() });
      return Response.json({ result: db, cached: true });
    }
  }

  const prompt = buildPrompt(scenario, portfolioStr);
  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let acc = '';
        const s = client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 1200,
          messages: [{ role: 'user', content: prompt }],
        });

        for await (const chunk of s) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            acc += chunk.delta.text;
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`
            ));
          }
        }
        if (cKey && acc) {
          simCache.set(cKey, { result: acc, ts: Date.now() });
          await setDbCache(cKey, acc);
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch (err) {
        console.error('[api/simulasyon] AI stream hatası:', err);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Teknik bir hata oluştu, lütfen tekrar deneyin.' })}\n\n`));
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
