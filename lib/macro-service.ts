/**
 * Makro Servis Katmanı — tüm makro veri çekme + hesaplama tek merkezde.
 *
 * Sorun: /api/macro, /api/risk, /api/sectors, /api/alerts route'ları
 * hepsi aynı fetchAllMacroQuotes + fetchAllTurkeyMacro + fetchAllFredData
 * çağrılarını tekrarlıyordu. Bu servis, ortak veri çekmeyi birleştirir
 * ve request-level cache ile aynı request içinde tekrar çekimi önler.
 *
 * Phase 8.1
 */

import { fetchAllMacroQuotes, type MacroSnapshot as YahooMacroSnapshot } from '@/lib/macro-data';
import { fetchAllTurkeyMacro, type TurkeyMacroData } from '@/lib/turkey-macro';
import { fetchAllFredData, type FredSnapshot } from '@/lib/fred';
import { calculateMacroScore, calculateUSEconomyHealth, type MacroScoreResult } from '@/lib/macro-score';
import { calculateRiskScore, type RiskScoreResult } from '@/lib/risk-engine';

// ── Türler ──────────────────────────────────────────────────────────

export interface MacroBundle {
  yahoo: YahooMacroSnapshot;
  turkey: TurkeyMacroData | null;
  fred: FredSnapshot;
  fetchedAt: string;
}

export interface USEconomyHealth {
  score: number;
  detail: string;
}

export interface MacroFullResult {
  bundle: MacroBundle;
  macroScore: MacroScoreResult;
  riskScore: RiskScoreResult;
  usEconomy: USEconomyHealth | null;
}

// ── Request-level Cache ─────────────────────────────────────────────
// Aynı Node.js event loop tick'inde birden fazla route çağrılırsa
// (örn: frontend Promise.all ile /macro + /risk + /alerts) veri tekrar çekilmez.
// TTL: 30 saniye — yeterince kısa ki stale veri dönmesin.

const REQUEST_CACHE_TTL_MS = 30 * 1000;

let _bundleCache: { data: MacroBundle; expiry: number } | null = null;
let _fullCache: { data: MacroFullResult; expiry: number } | null = null;

// ── Veri Çekme ──────────────────────────────────────────────────────

/**
 * Tüm ham makro verileri (Yahoo + TCMB + FRED) tek seferde çeker.
 * 30sn request-level cache ile korunur.
 */
export async function getMacroBundle(): Promise<MacroBundle> {
  if (_bundleCache && Date.now() < _bundleCache.expiry) {
    return _bundleCache.data;
  }

  const [yahooResult, turkeyResult, fredResult] = await Promise.allSettled([
    fetchAllMacroQuotes(),
    fetchAllTurkeyMacro(),
    fetchAllFredData(),
  ]);

  if (yahooResult.status === 'rejected') {
    console.error('[macro-service] Yahoo veri çekme hatası:', yahooResult.reason);
  }
  if (turkeyResult.status === 'rejected') {
    console.error('[macro-service] TCMB veri çekme hatası:', turkeyResult.reason);
  }
  if (fredResult.status === 'rejected') {
    console.error('[macro-service] FRED veri çekme hatası:', fredResult.reason);
  }

  // Başarısız kaynaklarda boş/null fallback kullan — kısmi veri daha iyi hiç yoktan
  const yahoo = yahooResult.status === 'fulfilled' ? yahooResult.value : ({} as ReturnType<typeof fetchAllMacroQuotes> extends Promise<infer T> ? T : never);
  const turkey = turkeyResult.status === 'fulfilled' ? turkeyResult.value : null;
  const fred = fredResult.status === 'fulfilled' ? fredResult.value : ({} as ReturnType<typeof fetchAllFredData> extends Promise<infer T> ? T : never);

  const bundle: MacroBundle = {
    yahoo,
    turkey,
    fred,
    fetchedAt: new Date().toISOString(),
  };

  _bundleCache = { data: bundle, expiry: Date.now() + REQUEST_CACHE_TTL_MS };
  return bundle;
}

/**
 * Tüm makro verileri + makro skor + risk skor + ABD ekonomi sağlığı.
 * Route'ların ihtiyaç duyduğu her şeyi tek çağrıda döner.
 */
export async function getMacroFull(): Promise<MacroFullResult> {
  if (_fullCache && Date.now() < _fullCache.expiry) {
    return _fullCache.data;
  }

  const bundle = await getMacroBundle();
  const macroScore = calculateMacroScore(bundle.yahoo, bundle.turkey, bundle.fred);
  const riskScore = calculateRiskScore(bundle.yahoo, bundle.turkey);
  const usEconomy = calculateUSEconomyHealth(bundle.fred);

  const result: MacroFullResult = {
    bundle,
    macroScore,
    riskScore,
    usEconomy,
  };

  _fullCache = { data: result, expiry: Date.now() + REQUEST_CACHE_TTL_MS };
  return result;
}

/**
 * Sadece makro skor hesaplar (sektör analizi için yeterli).
 */
export async function getMacroScore(): Promise<MacroScoreResult> {
  const { macroScore } = await getMacroFull();
  return macroScore;
}

/**
 * Sadece risk skor hesaplar.
 */
export async function getRiskScore(): Promise<RiskScoreResult> {
  const { riskScore } = await getMacroFull();
  return riskScore;
}

// ── Format Helpers (route'lar için) ─────────────────────────────────

/**
 * /api/macro endpoint'inin response formatını oluşturur.
 */
export function formatMacroResponse(full: MacroFullResult) {
  const { bundle, macroScore, usEconomy } = full;
  const { yahoo, turkey, fred } = bundle;

  // usEconomy'yi frontend formatına dönüştür (label + color)
  const usEconomyFormatted = usEconomy ? {
    score: usEconomy.score,
    label: usEconomy.score >= 60 ? 'Güçlü' : usEconomy.score >= 40 ? 'Normal' : 'Zayıf',
    color: usEconomy.score >= 60 ? 'green' : usEconomy.score >= 40 ? 'yellow' : 'red',
  } : null;

  return {
    score: macroScore,
    indicators: {
      vix: yahoo.vix,
      dxy: yahoo.dxy,
      us10y: yahoo.us10y,
      usdtry: yahoo.usdtry,
      eem: yahoo.eem,
      brent: yahoo.brent,
      gold: yahoo.gold,
      silver: yahoo.silver,
      copper: yahoo.copper,
      bist100: yahoo.bist100,
    },
    turkey: {
      policyRate: turkey?.policyRate ?? null,
      cds5y: turkey?.cds5y ?? null,
      inflation: turkey?.inflation ?? null,
    },
    fred: {
      fedFundsRate: fred?.fedFundsRate ? {
        value: fred.fedFundsRate.latestValue,
        date: fred.fedFundsRate.latestDate,
        change: fred.fedFundsRate.change,
      } : null,
      gdpGrowth: fred?.gdpGrowth ? {
        value: fred.gdpGrowth.latestValue,
        date: fred.gdpGrowth.latestDate,
      } : null,
      unemployment: fred?.unemployment ? {
        value: fred.unemployment.latestValue,
        date: fred.unemployment.latestDate,
      } : null,
    },
    usEconomy: usEconomyFormatted,
    fetchedAt: bundle.fetchedAt,
  };
}
