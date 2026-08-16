/**
 * GET /api/scanner-stats
 *
 * Tarayıcı sinyallerinin GEÇMİŞ İSABETİNİ kırılımlara göre sıralar.
 * "Hangi sinyal, hangi kombinasyon, hangi seans fazı gerçekten işe yarıyor?"
 *
 * Query params:
 *   tf     — "15" | "60" | "D" (yoksa hepsi)
 *   min    — güvenilir sayılacak asgari örnek (varsayılan 30)
 *   days   — kaç günlük geçmiş (varsayılan 180)
 *   limit  — çekilecek azami satır (varsayılan 5000)
 *
 * Koruma: SOCIAL_API_KEY tanımlıysa `x-api-key` header veya `?apiKey` gerekir.
 *
 * ÖNEMLİ OKUMA NOTU: isabet oranı yalnızca SONUÇLANMIŞ sinyaller üzerinden
 * hesaplanır (hedef + stop). "sonucsuz" olanlar orana katılmaz ama sayısı
 * ayrıca raporlanır — çoğu sonuçsuzsa o kurulum zaten hareket üretmiyordur.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIGNAL_LABELS: [number, string][] = [
  [1, 'Yutan'],
  [2, 'VIkes'],
  [4, 'VIyakn'],
  [8, 'DIkes'],
  [16, 'Kirilim'],
  [32, 'FVG'],
  [64, 'iFVG'],
];

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.SOCIAL_API_KEY;
  if (!expected) return true;
  const key = req.headers.get('x-api-key') ?? req.nextUrl.searchParams.get('apiKey');
  return key === expected;
}

interface Row {
  scan_tf: string;
  signal_mask: number;
  signal_text: string | null;
  direction: number;
  session_phase: string | null;
  v_score: number | null;
  level_dist_atr: number | null;
  follow_through: number | null;
  rel_strength: number | null;
  outcome: string | null;
  return_pct: number | null;
  mfe_atr: number | null;
  mae_atr: number | null;
}

interface Bucket {
  grup: string;
  n: number;
  hedef: number;
  stop: number;
  sonucsuz: number;
  isabet: number | null;   // hedef / (hedef + stop)
  ortGetiri: number | null;
  ortMfe: number | null;
  ortMae: number | null;
  guvenilir: boolean;
}

function summarize(name: string, rows: Row[], minN: number): Bucket {
  const hedef = rows.filter((r) => r.outcome === 'hedef').length;
  const stop = rows.filter((r) => r.outcome === 'stop').length;
  const sonucsuz = rows.filter((r) => r.outcome === 'sonucsuz').length;
  const karar = hedef + stop;
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => typeof x === 'number');
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  return {
    grup: name,
    n: rows.length,
    hedef,
    stop,
    sonucsuz,
    isabet: karar > 0 ? Math.round((hedef / karar) * 1000) / 10 : null,
    ortGetiri: avg(rows.map((r) => r.return_pct)),
    ortMfe: avg(rows.map((r) => r.mfe_atr)),
    ortMae: avg(rows.map((r) => r.mae_atr)),
    // Az örnekli oranlar gürültüdür — sıralamada dipte tutulur, işaretlenir.
    guvenilir: karar >= minN,
  };
}

function rank(buckets: Bucket[]): Bucket[] {
  return buckets
    .filter((b) => b.n > 0)
    .sort((a, b) => {
      if (a.guvenilir !== b.guvenilir) return a.guvenilir ? -1 : 1;
      return (b.isabet ?? -1) - (a.isabet ?? -1);
    });
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Supabase env tanımlı değil.' }, { status: 500 });
  }
  const supabase = createClient(url, serviceKey);

  const sp = req.nextUrl.searchParams;
  const tf = sp.get('tf');
  const minN = Math.max(1, parseInt(sp.get('min') ?? '30', 10));
  const days = Math.max(1, parseInt(sp.get('days') ?? '180', 10));
  const limit = Math.min(20000, Math.max(100, parseInt(sp.get('limit') ?? '5000', 10)));

  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  let q = supabase
    .from('scanner_signals')
    .select(
      'scan_tf, signal_mask, signal_text, direction, session_phase, v_score, level_dist_atr, follow_through, rel_strength, outcome, return_pct, mfe_atr, mae_atr',
    )
    .eq('evaluated', true)
    .gte('fired_at', since)
    .neq('source', 'TEST')
    .limit(limit);
  if (tf) q = q.eq('scan_tf', tf);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Row[];
  if (!rows.length) {
    return NextResponse.json({
      ok: true,
      toplam: 0,
      not: 'Henüz değerlendirilmiş sinyal yok. Cron çalıştıktan sonra tekrar bakın.',
    });
  }

  // ── 1) Tam kombinasyon (Yutan+FVG, Kirilim tek başına, ...) ──
  const byCombo = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.signal_text || '(bos)';
    (byCombo.get(k) ?? byCombo.set(k, []).get(k)!).push(r);
  }

  // ── 2) Tekil sinyal (bit bazlı, ÖRTÜŞEN — bir satır birden fazla gruba girer) ──
  const bySignal = SIGNAL_LABELS.map(([bit, label]) =>
    summarize(label, rows.filter((r) => (r.signal_mask & bit) !== 0), minN),
  );

  // ── 3) Seans fazı ──
  const byPhase = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.session_phase ?? 'bilinmiyor';
    (byPhase.get(k) ?? byPhase.set(k, []).get(k)!).push(r);
  }

  // ── 4) V-skor kovası (yalnızca iFVG içerenler) ──
  const vRows = rows.filter((r) => typeof r.v_score === 'number');
  const vBuckets = [
    summarize('V-skor 70+', vRows.filter((r) => (r.v_score ?? 0) >= 70), minN),
    summarize('V-skor 40-69', vRows.filter((r) => (r.v_score ?? 0) >= 40 && (r.v_score ?? 0) < 70), minN),
    summarize('V-skor <40', vRows.filter((r) => (r.v_score ?? 0) < 40), minN),
  ];

  // ── 5) Seviye bağlamı ──
  const lvlBuckets = [
    summarize('seviyede (≤0.5 ATR)', rows.filter((r) => (r.level_dist_atr ?? 99) <= 0.5), minN),
    summarize('yakın (0.5-1.5)', rows.filter((r) => (r.level_dist_atr ?? 99) > 0.5 && (r.level_dist_atr ?? 99) <= 1.5), minN),
    summarize('boşlukta (>1.5)', rows.filter((r) => (r.level_dist_atr ?? 99) > 1.5), minN),
  ];

  // ── 6) Follow-through ──
  const ftBuckets = [
    summarize('teyitli', rows.filter((r) => r.follow_through === 1), minN),
    summarize('teyitsiz', rows.filter((r) => r.follow_through === 0), minN),
  ];

  // ── 7) Göreli güç ──
  const rsBuckets = [
    summarize('endeksten güçlü', rows.filter((r) => (r.rel_strength ?? 0) > 0), minN),
    summarize('endeksten zayıf', rows.filter((r) => (r.rel_strength ?? 0) <= 0), minN),
  ];

  // ── 8) Tarama periyodu ──
  const byTf = new Map<string, Row[]>();
  for (const r of rows) {
    (byTf.get(r.scan_tf) ?? byTf.set(r.scan_tf, []).get(r.scan_tf)!).push(r);
  }

  return NextResponse.json(
    {
      ok: true,
      toplam: rows.length,
      esik: minN,
      kombinasyon: rank([...byCombo].map(([k, v]) => summarize(k, v, minN))),
      tekilSinyal: rank(bySignal),
      seansFazi: rank([...byPhase].map(([k, v]) => summarize(k, v, minN))),
      vSkor: rank(vBuckets),
      seviyeBaglami: rank(lvlBuckets),
      takip: rank(ftBuckets),
      goreliGuc: rank(rsBuckets),
      periyot: rank([...byTf].map(([k, v]) => summarize(k, v, minN))),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
