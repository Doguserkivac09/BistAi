/**
 * Geliştirme ortamında backtest sayfasını test etmek için
 * sentetik signal_performance kayıtları üretir.
 *
 * SADECE development modunda çalışır.
 * POST /api/dev/seed-backtest
 * Body: { count?: number } (varsayılan 120)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Sadece development'ta çalış
function isDev() {
  return process.env.NODE_ENV !== 'production';
}

// Gerçekçi sinyal dağılımı
const SIGNAL_TYPES = [
  { type: 'RSI Uyumsuzluğu',        weight: 15, baseWinRate: 0.58, avgReturn: 3.2 },
  { type: 'Hacim Anomalisi',         weight: 20, baseWinRate: 0.52, avgReturn: 1.8 },
  { type: 'Trend Başlangıcı',        weight: 18, baseWinRate: 0.61, avgReturn: 4.1 },
  { type: 'Destek/Direnç Kırılımı',  weight: 15, baseWinRate: 0.55, avgReturn: 2.9 },
  { type: 'MACD Kesişimi',           weight: 17, baseWinRate: 0.54, avgReturn: 2.3 },
  { type: 'RSI Seviyesi',            weight: 10, baseWinRate: 0.57, avgReturn: 2.7 },
  { type: 'Altın Çapraz',            weight: 5,  baseWinRate: 0.63, avgReturn: 5.2 },
];

const REGIMES = ['bull_trend', 'bear_trend', 'sideways', 'unknown'];
const REGIME_WEIGHTS = [40, 25, 30, 5];

const BIST_SAMPLE = [
  'THYAO', 'GARAN', 'ASELS', 'KCHOL', 'EREGL', 'BIMAS', 'AKBNK',
  'SISE', 'TUPRS', 'FROTO', 'TOASO', 'SAHOL', 'YKBNK', 'HALKB',
  'VAKBN', 'TCELL', 'ARCLK', 'EKGYO', 'PGSUS', 'TTKOM',
];

function weightedRandom<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** Normal dağılım yaklaşımı (Box-Muller) */
function randn(mean: number, std: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Tek sinyal kaydı üret */
function generateRecord(daysAgo: number) {
  const sig = weightedRandom(SIGNAL_TYPES, SIGNAL_TYPES.map(s => s.weight));
  const regime = weightedRandom(REGIMES, REGIME_WEIGHTS);
  const direction = Math.random() > 0.45 ? 'yukari' : 'asagi';
  const sembol = BIST_SAMPLE[Math.floor(Math.random() * BIST_SAMPLE.length)]!;

  // Rejim etkisi: boğa piyasasında AL sinyalleri daha iyi
  const regimeBonus =
    (regime === 'bull_trend' && direction === 'yukari') ? 0.06 :
    (regime === 'bear_trend' && direction === 'asagi') ? 0.05 :
    (regime === 'sideways') ? -0.03 : 0;

  const winProb = clamp(sig.baseWinRate + regimeBonus + randn(0, 0.08), 0.2, 0.85);
  const won = Math.random() < winProb;

  const entryPrice = clamp(randn(50, 30), 5, 500);

  // Getiri hesabı: kazananlarda pozitif, kaybedenlerda negatif
  const baseRet = sig.avgReturn;
  const ret3d  = clamp(won ? randn(baseRet * 0.4, 1.0) : randn(-baseRet * 0.3, 0.8),  -8,  12);
  const ret7d  = clamp(won ? randn(baseRet * 0.8, 1.5) : randn(-baseRet * 0.5, 1.2), -10, 15);
  const ret14d = clamp(won ? randn(baseRet,       2.0) : randn(-baseRet * 0.7, 1.8), -12, 18);

  const mfe = won ? clamp(randn(baseRet * 1.2, 2), 0.5, 20)  : clamp(randn(1.5, 1), 0.1, 5);
  const mae = won ? clamp(randn(1.0, 0.8), 0.1, 5)            : clamp(randn(baseRet * 0.8, 1.5), 0.5, 15);

  const entryTime = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

  return {
    user_id: null,
    sembol,
    signal_type: sig.type,
    direction,
    entry_price: Math.round(entryPrice * 100) / 100,
    entry_time: entryTime,
    return_3d:  Math.round(ret3d  * 100) / 100,
    return_7d:  Math.round(ret7d  * 100) / 100,
    return_14d: Math.round(ret14d * 100) / 100,
    mfe: Math.round(mfe * 100) / 100,
    mae: Math.round(mae * 100) / 100,
    evaluated: true,
    regime,
  };
}

export async function POST(request: NextRequest) {
  if (!isDev()) {
    return NextResponse.json({ error: 'Sadece geliştirme ortamında çalışır.' }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase env değişkenleri eksik.' }, { status: 500 });
  }

  let count = 120;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.count === 'number') count = Math.min(Math.max(body.count, 10), 500);
  } catch { /* ignore */ }

  // Kayıtları üret — son 90 gün boyunca dağıt
  const records = Array.from({ length: count }, (_, i) => {
    const daysAgo = Math.floor((i / count) * 89) + 1; // 1..89 gün önce
    return generateRecord(daysAgo);
  });

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data, error } = await supabase
    .from('signal_performance')
    .insert(records)
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    inserted: data?.length ?? 0,
    message: `${data?.length ?? 0} sentetik kayıt eklendi. /backtesting sayfasını yenileyebilirsiniz.`,
  });
}

/** Seed edilen kayıtları temizle (evaluated=true AND user_id IS NULL) */
export async function DELETE() {
  if (!isDev()) {
    return NextResponse.json({ error: 'Sadece geliştirme ortamında çalışır.' }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase env değişkenleri eksik.' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { error, count } = await supabase
    .from('signal_performance')
    .delete({ count: 'exact' })
    .eq('evaluated', true)
    .is('user_id', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}
