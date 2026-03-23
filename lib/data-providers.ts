/**
 * Phase 13.3 — Veri Kaynak Abstraksiyonu
 *
 * Tüm hisse/fiyat veri kaynaklarını (Yahoo Finance, AlphaVantage)
 * tek bir interface üzerinden erişilebilir hale getirir.
 *
 * Özellikler:
 * - Otomatik fallback: Yahoo başarısız → AlphaVantage
 * - Kaynak bağımsız tip güvencesi
 * - Fundamentals (P/E, EPS) için AlphaVantage seçimi
 */

import type { OHLCVCandle } from '@/types';
import { fetchOHLCV, fetchQuote as yahooFetchQuote } from './yahoo';
import {
  fetchDailyOHLCV,
  fetchQuote as avFetchQuote,
  fetchFundamentals,
  type AVFundamentals,
} from './alpha-vantage';

// ── Ortak Tipler ─────────────────────────────────────────────────────

export type DataSource = 'yahoo' | 'alphavantage';

export interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  source: DataSource;
  fetchedAt: string;
}

export interface OHLCVResult {
  candles: OHLCVCandle[];
  source: DataSource;
  symbol: string;
}

// ── Provider Interface ────────────────────────────────────────────────

export interface DataProvider {
  readonly name: DataSource;
  getOHLCV(symbol: string): Promise<OHLCVCandle[]>;
  getQuote(symbol: string): Promise<QuoteData>;
}

// ── Yahoo Provider ────────────────────────────────────────────────────

class YahooDataProvider implements DataProvider {
  readonly name: DataSource = 'yahoo';

  async getOHLCV(symbol: string): Promise<OHLCVCandle[]> {
    const { candles } = await fetchOHLCV(symbol, 90);
    return candles;
  }

  async getQuote(symbol: string): Promise<QuoteData> {
    const q = await yahooFetchQuote(symbol);
    if (!q) throw new Error(`Yahoo: ${symbol} için quote bulunamadı.`);
    return {
      symbol,
      price: q.regularMarketPrice ?? 0,
      change: 0,
      changePercent: 0,
      volume: q.regularMarketVolume ?? 0,
      source: 'yahoo',
      fetchedAt: new Date().toISOString(),
    };
  }
}

// ── AlphaVantage Provider ─────────────────────────────────────────────

class AlphaVantageDataProvider implements DataProvider {
  readonly name: DataSource = 'alphavantage';

  async getOHLCV(symbol: string): Promise<OHLCVCandle[]> {
    const result = await fetchDailyOHLCV(symbol, 'compact');
    return result.candles;
  }

  async getQuote(symbol: string): Promise<QuoteData> {
    const q = await avFetchQuote(symbol);
    return {
      symbol,
      price: q.price,
      change: q.change,
      changePercent: q.changePercent,
      volume: q.volume,
      source: 'alphavantage',
      fetchedAt: new Date().toISOString(),
    };
  }
}

// ── Provider Instances ────────────────────────────────────────────────

const yahoo = new YahooDataProvider();
const alphaVantage = new AlphaVantageDataProvider();

// ── Fallback Mantığı ──────────────────────────────────────────────────

/**
 * OHLCV verisini önce Yahoo'dan dener, başarısız olursa AlphaVantage'a geçer.
 */
export async function getOHLCVWithFallback(symbol: string): Promise<OHLCVResult> {
  try {
    const candles = await yahoo.getOHLCV(symbol);
    if (candles.length > 0) {
      return { candles, source: 'yahoo', symbol };
    }
    throw new Error('Yahoo: boş veri döndü');
  } catch (yahooErr) {
    const apiKey = process.env.ALPHAVANTAGE_API_KEY;
    if (!apiKey) {
      throw new Error(`Yahoo başarısız oldu ve ALPHAVANTAGE_API_KEY tanımlı değil. Yahoo hatası: ${yahooErr}`);
    }

    try {
      const candles = await alphaVantage.getOHLCV(symbol);
      return { candles, source: 'alphavantage', symbol };
    } catch (avErr) {
      throw new Error(`Her iki kaynak da başarısız. Yahoo: ${yahooErr} | AlphaVantage: ${avErr}`);
    }
  }
}

/**
 * Quote verisini önce Yahoo'dan dener, başarısız olursa AlphaVantage'a geçer.
 */
export async function getQuoteWithFallback(symbol: string): Promise<QuoteData> {
  try {
    return await yahoo.getQuote(symbol);
  } catch {
    const apiKey = process.env.ALPHAVANTAGE_API_KEY;
    if (!apiKey) throw new Error(`Yahoo quote başarısız, ALPHAVANTAGE_API_KEY yok.`);
    return await alphaVantage.getQuote(symbol);
  }
}

/**
 * Birden fazla sembol için paralel quote çeker.
 * Yahoo batch API kullanır (verimli), fallback tek tek AlphaVantage'a gider.
 */
export async function getBatchQuotesWithFallback(
  symbols: string[]
): Promise<Record<string, QuoteData>> {
  try {
    const result: Record<string, QuoteData> = {};
    await Promise.allSettled(
      symbols.map(async (sym) => {
        const q = await yahooFetchQuote(sym);
        if (q) {
          result[sym] = {
            symbol: sym,
            price: q.regularMarketPrice ?? 0,
            change: 0,
            changePercent: 0,
            volume: q.regularMarketVolume ?? 0,
            source: 'yahoo',
            fetchedAt: new Date().toISOString(),
          };
        }
      })
    );
    if (Object.keys(result).length > 0) return result;
    throw new Error('Yahoo: hiçbir quote bulunamadı');
  } catch {
    // Yahoo batch başarısız → AlphaVantage tek tek (limit nedeniyle ilk 5)
    const limited = symbols.slice(0, 5);
    const result: Record<string, QuoteData> = {};
    await Promise.allSettled(
      limited.map(async (sym) => {
        try {
          result[sym] = await alphaVantage.getQuote(sym);
        } catch {
          // Bu sembol başarısız, atla
        }
      })
    );
    return result;
  }
}

// ── Fundamentals (sadece AlphaVantage) ───────────────────────────────

export type { AVFundamentals as Fundamentals };

/**
 * Şirket temel verilerini getirir.
 * Yalnızca AlphaVantage destekler — API key zorunlu.
 */
export async function getFundamentals(symbol: string): Promise<AVFundamentals> {
  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  if (!apiKey) {
    throw new Error('Fundamentals için ALPHAVANTAGE_API_KEY gereklidir.');
  }
  return fetchFundamentals(symbol);
}

// ── Provider Seçimi ───────────────────────────────────────────────────

/**
 * Birincil provider döner (Yahoo).
 */
export function getPrimaryProvider(): DataProvider {
  return yahoo;
}

/**
 * AlphaVantage provider döner (API key varsa).
 */
export function getFallbackProvider(): DataProvider | null {
  return process.env.ALPHAVANTAGE_API_KEY ? alphaVantage : null;
}
