/**
 * Phase 13.6 — ML Prediction Proxy
 *
 * POST /api/ml/predict
 *
 * Next.js → Python ML servisi köprüsü.
 * ML servisi çevrimdışıysa composite signal'dan heuristic fallback.
 *
 * Env: ML_SERVICE_URL (örn: https://bistai-ml.railway.app)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { featureVectorToArray, type MLFeatureVector } from '@/lib/ml-features';

// ── Cache (basit in-memory, sembol + sinyal tipi bazlı) ──────────────

interface CacheEntry {
  result: MLPredictionResult;
  expiresAt: number;
}

const predictionCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 dk

// ── Tipler ───────────────────────────────────────────────────────────

export interface MLPredictionResult {
  prediction: 'BUY' | 'HOLD' | 'SELL';
  confidence: number;
  probabilities: {
    BUY: number;
    HOLD: number;
    SELL: number;
  };
  model_type: 'xgboost' | 'heuristic' | 'composite_fallback';
  feature_importances?: Record<string, number>;
}

// ── Heuristic Fallback (ML servisi yokken) ───────────────────────────

function heuristicFallback(features: MLFeatureVector): MLPredictionResult {
  let buyScore = 0;
  let sellScore = 0;

  if (features.rsi14 < 30) buyScore += 0.3;
  else if (features.rsi14 > 70) sellScore += 0.3;

  if (features.directionCode === 2) buyScore += 0.2;
  else if (features.directionCode === 0) sellScore += 0.2;

  if (features.macroScore > 30) buyScore += 0.2;
  else if (features.macroScore < -30) sellScore += 0.2;

  if (features.riskScore > 70) { sellScore += 0.15; buyScore -= 0.1; }

  if (features.macdHistogram > 0.2) buyScore += 0.1;
  else if (features.macdHistogram < -0.2) sellScore += 0.1;

  buyScore = Math.max(0, Math.min(1, buyScore));
  sellScore = Math.max(0, Math.min(1, sellScore));
  const holdScore = Math.max(0, 1 - buyScore - sellScore);
  const total = buyScore + holdScore + sellScore;

  const probs = {
    BUY: Math.round((buyScore / total) * 1000) / 1000,
    HOLD: Math.round((holdScore / total) * 1000) / 1000,
    SELL: Math.round((sellScore / total) * 1000) / 1000,
  };

  const prediction = (Object.entries(probs).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'HOLD') as 'BUY' | 'HOLD' | 'SELL';

  return {
    prediction,
    confidence: probs[prediction],
    probabilities: probs,
    model_type: 'composite_fallback',
  };
}

// ── Python ML Servisi Çağrısı ─────────────────────────────────────────

async function callMLService(features: MLFeatureVector): Promise<MLPredictionResult | null> {
  const mlServiceUrl = process.env.ML_SERVICE_URL;
  if (!mlServiceUrl) return null;

  try {
    const body = {
      rsi14: features.rsi14,
      macdHistogram: features.macdHistogram,
      bbPosition: features.bbPosition,
      volumeRatio: features.volumeRatio,
      priceChange5d: features.priceChange5d,
      priceChange20d: features.priceChange20d,
      atr14Pct: features.atr14Pct,
      signalTypeCode: features.signalTypeCode,
      directionCode: features.directionCode,
      severityCode: features.severityCode,
      macroScore: features.macroScore,
      riskScore: features.riskScore,
    };

    const res = await fetch(`${mlServiceUrl}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000), // 5 sn timeout
    });

    if (!res.ok) return null;

    const data = await res.json() as MLPredictionResult;
    return data;
  } catch {
    return null;
  }
}

// ── Route Handler ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 30 istek / 1 dk
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`ml-predict:${ip}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Çok fazla istek. Lütfen bekleyin.' },
        { status: 429 }
      );
    }

    // Auth kontrolü
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Giriş yapmanız gerekiyor.' }, { status: 401 });
    }

    const features = await request.json() as MLFeatureVector;

    // Gerekli alanlar kontrolü
    if (typeof features.rsi14 !== 'number') {
      return NextResponse.json({ error: 'Geçersiz özellik vektörü.' }, { status: 400 });
    }

    // Cache kontrolü
    const cacheKey = `${features._symbol}:${features._signalType}:${Math.round(features.rsi14)}`;
    const cached = predictionCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return NextResponse.json({ ...cached.result, cached: true });
    }

    // ML servisi → fallback
    const mlResult = await callMLService(features);
    const result = mlResult ?? heuristicFallback(features);

    // Cache'le
    predictionCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });

    return NextResponse.json({ ...result, cached: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── Health Check ──────────────────────────────────────────────────────

export async function GET() {
  const mlServiceUrl = process.env.ML_SERVICE_URL;

  let mlStatus: 'online' | 'offline' | 'not_configured' = 'not_configured';

  if (mlServiceUrl) {
    try {
      const res = await fetch(`${mlServiceUrl}/health`, {
        signal: AbortSignal.timeout(3_000),
      });
      mlStatus = res.ok ? 'online' : 'offline';
    } catch {
      mlStatus = 'offline';
    }
  }

  return NextResponse.json({
    status: 'ok',
    ml_service: mlStatus,
    ml_service_url: mlServiceUrl ?? null,
    fallback_active: mlStatus !== 'online',
  });
}
