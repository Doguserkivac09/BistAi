/**
 * Bugün v3 toplayıcı API'si (design_handoff_bugun_v3).
 * GET /api/bugun
 *
 * Ekranın kamuya açık bloklarını TEK istekte döndürür: endeksler + döviz/altın,
 * öne çıkan gözlemler, ivme kazananlar, en çok işlem görenler, sektörlerin günlük
 * performansı, piyasa genişliği, günün özeti, yaklaşan bilançolar.
 * Kişisel bloklar (portföy, takip listesi) oturum gerektirdiği için AYRI kalır.
 *
 * ⚠️ HÜKÜM ÜRETMEZ — bkz. `lib/bugun-ozet.ts` başlığı.
 *
 * ⚠️ BİLİNÇLİ OLARAK YOK: "Yabancı takas hareketi". Handoff bu bloğu içeriyor ama
 * ücretsiz, makine-okunur bir kaynağı yok (2026-09-12 ölçüldü: İş Yatırım günlük
 * yabancı oranları evrenin yalnız %2'si, KAP bot korumalı, kurum bazlı takas
 * ücretli — CLAUDE.md "Kaynak fizibilitesi"). Mock sayıyla doldurulmaz.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildOzet, buildSummary, buildEarnings, type ScanRow } from '@/lib/bugun-ozet';
import { fetchCommodityQuote } from '@/lib/commodity';
import { getStoredFundamentals } from '@/lib/firsatlar-fundamentals-runner';

export const dynamic = 'force-dynamic';

/** Gram altın = ons (USD) × USD/TRY ÷ 31,1035 — Türkiye'de fiyatlanan birim. */
const GRAM_PER_ONS = 31.1035;

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET() {
  const sb = createAdmin();

  const [scan, xu100, xu030, usd, eur, gold, fund] = await Promise.all([
    sb.from('scan_cache')
      .select('sembol, change_percent, last_close, last_volume, rel_vol5, pct_from_52w_high, sector, scanned_at')
      .or('market.eq.BIST,market.is.null')
      .limit(2000),
    fetchCommodityQuote('XU100.IS', 'BIST 100', '').catch(() => null),
    fetchCommodityQuote('XU030.IS', 'BIST 30', '').catch(() => null),
    fetchCommodityQuote('USDTRY=X', 'Dolar/TL', '₺').catch(() => null),
    fetchCommodityQuote('EURTRY=X', 'Euro/TL', '₺').catch(() => null),
    fetchCommodityQuote('GC=F', 'Ons altın', '$').catch(() => null),
    getStoredFundamentals(sb).catch(() => null),
  ]);

  type Row = {
    sembol: string; change_percent: number | null; last_close: number | null; last_volume: number | null;
    rel_vol5: number | null; pct_from_52w_high: number | null; sector: string | null; scanned_at: string | null;
  };
  const raw = (scan.data ?? []) as Row[];
  const rows: ScanRow[] = raw.map((x) => ({
    sembol: x.sembol,
    changePercent: x.change_percent,
    lastClose: x.last_close,
    lastVolume: x.last_volume,
    relVol5: x.rel_vol5,
    pct52wHigh: x.pct_from_52w_high,
    sector: x.sector,
  }));
  const asOf = raw.reduce<string | null>((m, x) => (x.scanned_at && (!m || x.scanned_at > m) ? x.scanned_at : m), null);

  const ozet = buildOzet(rows);

  // Gram altın TÜRETİLİR (ons × kur). Değişim de iki değişimin bileşimidir.
  let gram: { val: number | null; chg: number | null } = { val: null, chg: null };
  if (gold?.lastPrice != null && usd?.lastPrice != null) {
    gram = {
      val: (gold.lastPrice * usd.lastPrice) / GRAM_PER_ONS,
      chg: gold.change1d != null && usd.change1d != null
        ? ((1 + gold.change1d / 100) * (1 + usd.change1d / 100) - 1) * 100
        : null,
    };
  }

  const fx = [
    { label: 'Dolar/TL', val: usd?.lastPrice ?? null, chg: usd?.change1d ?? null, digits: 2 },
    { label: 'Euro/TL', val: eur?.lastPrice ?? null, chg: eur?.change1d ?? null, digits: 2 },
    { label: 'Gram altın', val: gram.val, chg: gram.chg, digits: 0, derived: true },
    { label: 'Ons altın', val: gold?.lastPrice ?? null, chg: gold?.change1d ?? null, digits: 0 },
  ].filter((x) => x.val != null);

  const index = {
    bist100: xu100 ? {
      val: xu100.lastPrice, chg: xu100.change1d, date: xu100.asOfDate ?? null,
      series: xu100.candles.map((c) => c.close).filter((v) => v > 0),
    } : null,
    bist30: xu030 ? { val: xu030.lastPrice, chg: xu030.change1d, date: xu030.asOfDate ?? null } : null,
  };

  // ⚠️ TARİH KAPISI: endeks değişimi yalnız tarama ile AYNI işlem gününe aitse
  // özet cümlesine girer. Canlıda Yahoo XU100 için bayat bir fiyat (11 Eylül,
  // +%0,51) döndü; 15 Eylül taramasıyla birleşince ekran "BIST 100 yükselişte,
  // hisselerin %13'ü artıda" gibi kendisiyle çelişen bir cümle kurdu.
  const taramaGunu = asOf
    ? new Date(asOf).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })
    : null;
  const endeksAyniGun = index.bist100?.date != null && index.bist100.date === taramaGunu;

  return NextResponse.json(
    {
      asOf,
      index,
      fx,
      ...ozet,
      summary: buildSummary(ozet, endeksAyniGun ? (index.bist100?.chg ?? null) : null),
      taramaGunu,
      earnings: fund?.items ? buildEarnings(fund.items) : [],
    },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300' } },
  );
}
