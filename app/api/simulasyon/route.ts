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

function simCacheKey(scenario: { type: string; magnitude: string; customNote?: string }): string {
  const date = new Date().toISOString().slice(0, 10);
  // customNote varsa cache'e dahil et — farklı bağlam = farklı yanıt
  const noteHash = scenario.customNote
    ? `:${scenario.customNote.trim().slice(0, 40).replace(/\s+/g, '_')}`
    : '';
  return `sim:${date}:${scenario.type}:${scenario.magnitude}${noteHash}`;
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

// ── Canlı makro veri özeti ───────────────────────────────────────────

async function getLiveMacroContext(): Promise<string> {
  try {
    const { getMacroFull } = await import('@/lib/macro-service');
    const { bundle, macroScore } = await getMacroFull();
    const { yahoo, turkey } = bundle;

    const lines: string[] = [];
    if (yahoo.usdtry) lines.push(`USD/TRY: ${yahoo.usdtry.price.toFixed(2)} (${yahoo.usdtry.changePercent > 0 ? '+' : ''}${yahoo.usdtry.changePercent.toFixed(2)}% bugün)`);
    if (yahoo.vix)    lines.push(`VIX: ${yahoo.vix.price.toFixed(1)}`);
    if (yahoo.brent)  lines.push(`Brent: $${yahoo.brent.price.toFixed(1)}`);
    if (yahoo.gold)   lines.push(`Altın: $${yahoo.gold.price.toFixed(0)}`);
    if (yahoo.bist100) lines.push(`BIST100: ${yahoo.bist100.price.toFixed(0)} (${yahoo.bist100.changePercent > 0 ? '+' : ''}${yahoo.bist100.changePercent.toFixed(2)}%)`);
    if (turkey?.policyRate) lines.push(`TCMB Faizi: %${turkey.policyRate.value}`);
    if (turkey?.inflation)  lines.push(`TÜFE: %${turkey.inflation.value}`);
    if (turkey?.cds5y)      lines.push(`Türkiye CDS 5Y: ${turkey.cds5y.value} bps`);
    lines.push(`Makro Skor: ${macroScore.score > 0 ? '+' : ''}${macroScore.score} (${macroScore.label})`);

    return lines.length > 0 ? `MEVCUT PİYASA KOŞULLARI:\n${lines.join(' | ')}` : '';
  } catch {
    return '';
  }
}

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

function buildPrompt(scenario: SimulationScenario, portfolioStr: string, macroContext: string): string {
  const label = SCENARIO_LABELS[scenario.type] ?? scenario.type;
  const mag   = MAGNITUDE_LABELS[scenario.magnitude];
  const now   = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

  return `Sen Türkiye finansal piyasaları uzmanı bir makroekonomist ve portföy stratejistisin.
Bugünün tarihi: ${now}
${macroContext ? `\n${macroContext}\n` : ''}
GÖREV: Aşağıdaki makro senaryonun BIST üzerindeki etkisini analiz et. Mevcut piyasa koşullarını dikkate al.

SENARYO: ${label} — ${mag} büyüklükte
${scenario.customNote ? `EK NOT: ${scenario.customNote}` : ''}
${portfolioStr ? `\nKULLANICININ PORTFÖYÜ: ${portfolioStr}` : ''}

KISA VE ÖPÜZ yaz — her bölüm maksimum 3-4 cümle veya satır. Markdown kullan.

## 📊 Senaryo Özeti
2-3 cümle: ne anlama geliyor, mevcut koşullarda önemi ne.

## 🏭 Sektör Etkileri
| Sektör | Etki | Neden (1 cümle) |
|--------|------|-----------------|
Bankacılık, Sanayi, Enerji, Perakende, Teknoloji, İhracatçılar, Savunma — 🟢/🔴/🟡

## 📜 Tarihsel Örnekler
2 örnek — her biri 2 cümle max (yıl + ne oldu + BIST tepkisi).

## ⚡ Dikkat Edilmesi Gereken Hisseler
${portfolioStr
  ? '**Portföy yorumu** (1-2 cümle) + bu senaryoda öne çıkan/riskli hisse tipleri (3-4 madde).'
  : 'Bu senaryoda öne çıkan ve riskli hisse tipleri — 3-4 kısa madde.'
}

## 🎯 Aksiyon Noktaları
3 madde — kısa ve somut, zaman ufkuyla.

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

  const [portfolioStr, macroContext] = await Promise.all([
    getPortfolioSummary(user.id),
    getLiveMacroContext(),
  ]);

  // Cache kontrolü (customNote yoksa cache'lenebilir)
  const cKey = !scenario.customNote ? simCacheKey(scenario) : null;
  if (cKey) {
    const mem = simCache.get(cKey);
    const cached = mem && Date.now() - mem.ts < CACHE_TTL ? mem.result : null;
    const dbCached = cached ? null : await getDbCache(cKey);
    const cachedResult = cached ?? dbCached;
    if (cachedResult) {
      if (dbCached) simCache.set(cKey, { result: cachedResult, ts: Date.now() });
      // Cache'den dönerken de SSE formatında dön — frontend her zaman stream okur
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: cachedResult })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }
  }

  const prompt = buildPrompt(scenario, portfolioStr, macroContext);
  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let acc = '';
        const s = client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 1800,
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
