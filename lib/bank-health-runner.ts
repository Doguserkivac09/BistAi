/**
 * Banka Sağlık precompute çalıştırıcısı (BANKA-MOTORU-PLAN FAZ K2-6).
 *
 * Kademe 2 girdisi İş Yatırım UFRS_K mali tablolarıdır (sembol başına ~2 istek) →
 * istek anında ÇEKİLMEZ; haftalık cron burada hesaplayıp `ai_cache`'e yazar,
 * `/api/firsatlar` ve hisse detay tek satır okur (MIGRATION YOK).
 *
 * Evren küçük (~17 banka) → `?part` bölmeye gerek yok (growth-momentum'dan farkı).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchBankFinancials, toBankQuarters, bankTTM, type BankQuarter } from './isyatirim-bank';
import { recentQuarterRefs } from './isyatirim-financials';
import {
  computeBankHealth, computeBankMetrics, isBankSector,
  type BankHealth, type BankFinancials, type BankSectorContext,
} from './bank-health';
import { computePeerValuation } from './peer-valuation';
import { fetchYahooFundamentals } from './yahoo-fundamentals';
import { getSectorId } from './sectors';
import type { SectorMediansMap } from './sector-medians';
import type { YahooFundamentals } from './yahoo-fundamentals';

export interface BankHealthEntry {
  tier: BankHealth['tier'];
  institution: BankHealth['institution'];
  score: number | null;
  verdict: BankHealth['verdict'];
  redFlag: boolean;
  flags: BankHealth['flags'];
  dataQuality: BankHealth['dataQuality'];
  metrics: BankHealth['metrics'];
  /** Kademe 2 hangi çeyreğe dayanıyor (şeffaflık) */
  lastQuarter: string | null;
}

export type BankHealthMap = Record<string, BankHealthEntry>;

const CACHE_KEY = 'bank-health:BIST';
const TTL_MS = 8 * 24 * 60 * 60 * 1000; // 8 gün (haftalık koşu + marj)

/** Son 4 çeyrek TTM + bir yıl öncesinin TTM'i (trend için 8 çeyrek gerekir). */
function ttmPair(quarters: BankQuarter[]) {
  const usable = quarters.filter((q) => q.fields.netInterestIncome != null || q.fields.netIncome != null);
  if (usable.length < 4) return null;
  const ttm = bankTTM(usable);
  if (!ttm) return null;
  const prev = usable.length >= 8 ? bankTTM(usable.slice(0, usable.length - 4)) : null;
  return { ttm, prev, lastQuarter: usable[usable.length - 1]!.label };
}

export async function runBankHealth(
  symbols: string[],
  opts: { inflationYoy?: number | null; medians?: SectorMediansMap | null; concurrency?: number } = {},
): Promise<{ map: BankHealthMap; ok: number; tier2: number; skipped: number; sectorContext?: BankSectorContext }> {
  const map: BankHealthMap = {};
  let ok = 0, tier2 = 0, skipped = 0;
  const conc = opts.concurrency ?? 4;

  const now = new Date();
  const m = now.getUTCMonth();
  const nowQ = (m < 3 ? 1 : m < 6 ? 2 : m < 9 ? 3 : 4) as 1 | 2 | 3 | 4;
  // 14 dönem: TTM (4) + bir yıl öncesi TTM (4) = 8 SAĞLAM çeyrek gerekiyor. Standalone
  // dönüşümde yılın ilk çeyreği referans ister ve son çeyrek henüz açıklanmamış olabilir
  // → dar pencerede `prev` boş kalıyor, trend bayrakları (NIM/CoR) hiç üretilmiyordu.
  const refs = recentQuarterRefs(now.getUTCFullYear(), nowQ, 14);

  const banks = symbols.filter((s) => isBankSector(getSectorId(s)));

  // ── 1. GEÇİŞ: veri çek + ölçümleri hesapla ───────────────────────────────
  type Row = {
    sembol: string;
    fundamentals: YahooFundamentals | null;
    financials: BankFinancials | null;
    lastQuarter: string | null;
  };
  const rows: Row[] = [];

  for (let i = 0; i < banks.length; i += conc) {
    const chunk = banks.slice(i, i + conc);
    await Promise.all(chunk.map(async (sembol) => {
      try {
        const [fundamentals, bankFin] = await Promise.all([
          fetchYahooFundamentals(sembol).catch(() => null),
          fetchBankFinancials(sembol, refs).catch(() => ({ template: 'conventional' as const, periods: [] })),
        ]);
        const pair = bankFin.periods.length > 0 ? ttmPair(toBankQuarters(bankFin.periods)) : null;
        rows.push({
          sembol,
          fundamentals,
          financials: pair ? { ttm: pair.ttm, prev: pair.prev } : null,
          lastQuarter: pair?.lastQuarter ?? null,
        });
      } catch { skipped++; }
    }));
  }

  // ── SEKTÖR BAĞLAMI: trend medyanları ────────────────────────────────────
  // Faiz döngüsünde tüm bankaların marjı birlikte hareket eder; rozet ancak
  // emsalden AYRIŞMA gösterirse bilgi taşır (reel ROE kalibrasyonuyla aynı ders).
  const median = (xs: number[]): number | null => {
    if (xs.length < 3) return null; // az örneklemde medyan güvenilmez → mutlak eşiğe düş
    const a = [...xs].sort((x, y) => x - y);
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid]! : Math.round(((a[mid - 1]! + a[mid]!) / 2) * 10) / 10;
  };
  const nimDeltas: number[] = [];
  const corDeltas: number[] = [];
  for (const r of rows) {
    if (!r.financials) continue;
    const m = computeBankMetrics(r.financials);
    if (m.nimDeltaPp != null) nimDeltas.push(m.nimDeltaPp);
    if (m.corDeltaBps != null) corDeltas.push(m.corDeltaBps);
  }
  const sectorContext: BankSectorContext = {
    nimDeltaMedianPp: median(nimDeltas),
    corDeltaMedianBps: median(corDeltas),
  };

  // ── 2. GEÇİŞ: verdict üret (fetch YOK) ──────────────────────────────────
  for (const r of rows) {
    const sectorId = getSectorId(r.sembol);
    const med = opts.medians?.[sectorId] ?? null;
    const peer = r.fundamentals && med ? computePeerValuation(r.fundamentals, sectorId, med) : null;

    const health = computeBankHealth({
      sectorId,
      peer,
      roe: r.fundamentals?.returnOnEquity ?? null,
      inflationYoy: opts.inflationYoy ?? null,
      financials: r.financials,
      sectorContext,
    });

    if (!health.applicable || (health.score === null && health.flags.length === 0)) { skipped++; continue; }

    map[r.sembol] = {
      tier: health.tier, institution: health.institution, score: health.score, verdict: health.verdict,
      redFlag: health.redFlag, flags: health.flags, dataQuality: health.dataQuality,
      metrics: health.metrics ?? null, lastQuarter: r.lastQuarter,
    };
    ok++;
    if (health.tier === 2) tier2++;
  }

  return { map, ok, tier2, skipped, sectorContext };
}

export async function storeBankHealth(sb: SupabaseClient, partial: BankHealthMap): Promise<void> {
  const existing = await getBankHealthMap(sb);
  const merged = { ...(existing ?? {}), ...partial };
  await sb.from('ai_cache').upsert({
    cache_key: CACHE_KEY,
    explanation: JSON.stringify(merged),
    version: 1,
    hit_count: 0,
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
  }, { onConflict: 'cache_key' });
}

export async function getBankHealthMap(sb: SupabaseClient): Promise<BankHealthMap | null> {
  try {
    const { data } = await sb
      .from('ai_cache')
      .select('explanation')
      .eq('cache_key', CACHE_KEY)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (!data?.explanation) return null;
    return JSON.parse(data.explanation as string) as BankHealthMap;
  } catch {
    return null;
  }
}
