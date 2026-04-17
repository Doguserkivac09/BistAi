/**
 * Investable Edge — Investment Score Endpoint
 *
 * GET  /api/investment-score?sembol=THYAO
 * POST /api/investment-score  { sembol }
 *
 * Akış (Context'te tanımlı hibrit mimari):
 *   1. Auth + rate limit + IP check
 *   2. Yahoo Fundamentals çek (24h in-memory cache)
 *   3. Deterministik skor hesapla (computeInvestableScore) → SKOR BURADA KESİNLEŞİR
 *   4. ai_cache'de 24h yorumu ara
 *   5. Yoksa Claude Haiku'ya ham metrik + skor gönder (prompt skoru değiştirmemesi için kilitli)
 *   6. Zod validate → başarısızsa 1 retry → yine başarısızsa FALLBACK_YORUM
 *   7. Yanıtı cache'e yaz, client'a ver
 *
 * Model: claude-haiku-4-5 (özetleme için yeterli, ucuz, hızlı)
 * Rate limit: 30 req/dakika per IP
 * Auth: zorunlu (skoru herkese açmak vs kullanıcı ziyaretine bağlamak tartışması,
 *              v1'de auth zorunlu — anonim gezinti için fallback eklenebilir).
 */

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { checkAndRecordAiBudget } from '@/lib/ai-budget';
import { createServerClient } from '@/lib/supabase-server';
import { sanitizeTicker } from '@/lib/sanitize';
import { fetchYahooFundamentals } from '@/lib/yahoo-fundamentals';
import { computeInvestableScore } from '@/lib/investment-score';
import { buildInvestmentScorePrompt } from '@/lib/investment-score-prompt';
import {
  AiInvestmentYorumSchema,
  FALLBACK_YORUM,
  safeExtractJson,
  type AiInvestmentYorum,
} from '@/lib/investment-score-schema';

const RATE_LIMIT = 30;
const WINDOW_MS  = 60_000;
const AI_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat

// ── Supabase ai_cache (mevcut tablo reuse) ──────────────────────────────

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function getAiCache(cacheKey: string): Promise<AiInvestmentYorum | null> {
  try {
    const admin = getAdminClient();
    const { data } = await admin
      .from('ai_cache')
      .select('explanation')
      .eq('cache_key', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (!data?.explanation) return null;
    const parsed = JSON.parse(data.explanation);
    const validated = AiInvestmentYorumSchema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

async function setAiCache(cacheKey: string, yorum: AiInvestmentYorum): Promise<void> {
  try {
    const admin = getAdminClient();
    await admin.from('ai_cache').upsert({
      cache_key: cacheKey,
      explanation: JSON.stringify(yorum),
      version: 1,
      hit_count: 0,
      expires_at: new Date(Date.now() + AI_CACHE_TTL_MS).toISOString(),
    }, { onConflict: 'cache_key' });
  } catch { /* sessiz geç */ }
}

// ── Claude çağrısı + retry ──────────────────────────────────────────────

async function callClaudeForYorum(prompt: string, apiKey: string): Promise<AiInvestmentYorum | null> {
  const client = new Anthropic({ apiKey });

  const attempt = async (): Promise<AiInvestmentYorum | null> => {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      temperature: 0.2, // Halüsinasyonu düşür, tutarlılığı artır
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
    if (!text) return null;

    const parsed = safeExtractJson(text);
    if (!parsed) return null;

    const validated = AiInvestmentYorumSchema.safeParse(parsed);
    return validated.success ? validated.data : null;
  };

  try {
    const first = await attempt();
    if (first) return first;

    // 1 retry — model bazen ilk seferde JSON'u bozabilir
    const retry = await attempt();
    return retry;
  } catch (err) {
    console.error('[investment-score] Claude hatası:', err);
    return null;
  }
}

// ── Handler ─────────────────────────────────────────────────────────────

async function resolveSembol(request: NextRequest): Promise<string> {
  if (request.method === 'GET') {
    return sanitizeTicker(request.nextUrl.searchParams.get('sembol') ?? '');
  }
  try {
    const body = await request.json();
    return sanitizeTicker(typeof body?.sembol === 'string' ? body.sembol : '');
  } catch {
    return '';
  }
}

async function handle(request: NextRequest) {
  // Rate limit (IP bazlı)
  const ip = getClientIP(request.headers);
  const rl = checkRateLimit(`inv-score:${ip}`, RATE_LIMIT, WINDOW_MS);
  if (!rl.allowed) {
    return Response.json({ error: 'Çok fazla istek. Birazdan tekrar deneyin.' }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) },
    });
  }

  // Auth
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: 'Giriş yapmanız gerekiyor.' }, { status: 401 });
  }

  // Sembol
  const sembol = await resolveSembol(request);
  if (!sembol) {
    return Response.json({ error: 'Geçerli bir hisse sembolü gerekli.' }, { status: 400 });
  }

  // Fundamentals + deterministik skor
  let fundamentals;
  try {
    fundamentals = await fetchYahooFundamentals(sembol);
  } catch (err) {
    console.error(`[investment-score] Fundamentals hatası (${sembol}):`, err);
    return Response.json({ error: 'Temel veri alınamadı.' }, { status: 404 });
  }

  const score = computeInvestableScore(fundamentals);

  // Cache key — fundamentals.reportedDate boş olduğundan güne bağlı TTL
  // (aynı gün + aynı sembol → aynı yorum)
  const gunluk = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const cacheKey = `invscore:${sembol}:${gunluk}:${score.score}`;

  // 1. ai_cache'te var mı?
  let yorum = await getAiCache(cacheKey);

  if (!yorum) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // AI servisi yok → skor + fallback yorum
      return Response.json({
        sembol,
        shortName: fundamentals.shortName,
        sector: fundamentals.sector,
        ...score,
        ...FALLBACK_YORUM,
        aiGenerated: false,
        cached: false,
      });
    }

    // Günlük AI bütçesi kontrol
    const budget = await checkAndRecordAiBudget();
    if (!budget.allowed) {
      return Response.json({
        sembol,
        shortName: fundamentals.shortName,
        sector: fundamentals.sector,
        ...score,
        ...FALLBACK_YORUM,
        summary: 'Bugünkü AI yorum bütçesi doldu, lütfen yarın tekrar deneyin. Skor aşağıdaki deterministik motorla hesaplanmıştır.',
        aiGenerated: false,
        cached: false,
      });
    }

    // Claude çağrısı
    const prompt = buildInvestmentScorePrompt(sembol, fundamentals, score);
    yorum = await callClaudeForYorum(prompt, apiKey);

    if (yorum) {
      await setAiCache(cacheKey, yorum);
    } else {
      yorum = FALLBACK_YORUM;
    }
  }

  return Response.json({
    sembol,
    shortName: fundamentals.shortName,
    sector: fundamentals.sector,
    ...score,
    ...yorum,
    aiGenerated: yorum !== FALLBACK_YORUM,
    cached: !!yorum && yorum !== FALLBACK_YORUM,
  }, {
    headers: {
      // Client tarafı hafif cache (5 dakika). Server ai_cache zaten 24h.
      'Cache-Control': 'private, s-maxage=300, stale-while-revalidate=900',
    },
  });
}

export async function GET(request: NextRequest)  { return handle(request); }
export async function POST(request: NextRequest) { return handle(request); }
