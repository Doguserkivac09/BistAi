/**
 * GET /api/firsatlar
 * Son 3 günlük yüksek kaliteli sinyalleri sembol bazında gruplar,
 * confluence skoruna göre sıralar, sektör momentum bilgisi ekler.
 *
 * v2 (2026-04-23): Çoklu faktör skorlama
 *  - Geçmiş win rate entegrasyonu (signal-stats-summary)
 *  - Time decay (exponential, half-life 48h)
 *  - Rejime göre skor (bull+AL / bear+SAT = bonus; ters = ceza)
 *  - Makro-yön uyumu (makro>+20 & AL veya makro<-20 & SAT = bonus)
 *  - adjustedScore = compositeScore (UI bununla sıralar)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMacroFull } from '@/lib/macro-service';
import { getSector, getSectorId, SECTOR_REPRESENTATIVES, type SectorId } from '@/lib/sectors';
import { analyzeSector, type SectorMomentum } from '@/lib/sector-engine';
import { calcTavanScore, type TavanResult } from '@/lib/tavan-score';
import type { SignalPerformanceRecord } from '@/lib/performance-types';
import {
  computeDecision,
  dbRowsToStockSignals,
  type DecisionOutput,
} from '@/lib/decision-engine';
import { createServerClient } from '@/lib/supabase-server';
import { daysUntilEarnings } from '@/lib/yahoo-fundamentals';
import { getStoredFundamentals } from '@/lib/firsatlar-fundamentals-runner';
import type {
  InvestableConfidence,
  InvestableRating,
} from '@/lib/investment-score';
import { SIGNAL_CANONICAL_FIELD } from '@/lib/signal-horizons';
import type { SymbolCatalyst, SymbolEventRisk } from '@/lib/news-impact';
import type { OHLCVCandle } from '@/types';

const MIN_CONFLUENCE    = 45;
const LOOKBACK_DAYS     = 5;
const STATS_LOOKBACK_D  = 180;    // geçmiş win rate için örneklem penceresi
const MIN_ADV_TL        = 10_000_000; // 10M TL altı likiditesi elenir (P0-3)
const MIN_RR            = 1.5;        // 1.5 altı R/R sinyaller elenir (P2-1)

// BIST market filtresi — scan-us cron'u aynı tabloya market='US' yazıyor;
// filtre olmadan US hisseleri BIST sayfasına sızıyordu (2026-06-11 fix).
// Eski (migration öncesi) satırlar market=null olabilir → tolere edilir.
const BIST_MARKET_OR = 'market.eq.BIST,market.is.null';

const COMMISSION = 0.004;

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return createClient(url, key);
}

export interface FirsatItem {
  sembol:              string;
  sektorAdi:           string;
  sektorId:            string;
  sinyaller:           string[];
  direction:           'yukari' | 'asagi' | 'notr';
  confluenceScore:     number;
  /** Çoklu faktör sonrası nihai skor (UI bununla sıralar) */
  adjustedScore:       number;
  entryPrice:          number;
  entryTime:           string;
  /** Sinyalin yaşı (saat) */
  ageHours:            number;
  regime:              string | null;
  sektorSinyalSayisi:  number;
  /** En iyi sinyalin geçmiş win rate'i (0-1, yoksa null) */
  historicalWinRate:   number | null;
  /** Win rate örneklem sayısı */
  winRateN:            number;
  // ── P0-3 / P1-1 / P2-1 (2026-04-23) ─────────────────────────────────
  /** 20g ortalama günlük TL işlem hacmi */
  avgDailyVolumeTL:    number | null;
  /** Haftalık trend sinyal yönü ile uyumlu mu? */
  weeklyAligned:       boolean | null;
  /** ATR bazlı zarar kes */
  stopLoss:            number | null;
  /** Hedef fiyat */
  targetPrice:         number | null;
  /** Risk/ödül oranı */
  riskRewardRatio:     number | null;
  // ── P2-2 (2026-04-23) KAP uyarısı ────────────────────────────────
  /** Son 7 gün içinde kritik KAP duyurusu var mı? */
  kapUyarisi:          { var: boolean; mesaj: string; url?: string } | null;
  /** Skor ayarlamaları (şeffaflık için) */
  adjustments: {
    timeDecay:     number;  // çarpan (0-1)
    winRate:       number;  // ± puan
    regimeFit:     number;  // ± puan
    macroAlign:    number;  // ± puan
    mtfAlign:      number;  // ± puan (haftalık uyum)
    sectorAlign:   number;  // ± puan (sektör momentum uyumu, P1-1)
    volumeConfirm: number;  // ± puan (rel_vol5 hacim teyidi, P1-2)
    earningsRisk:  number;  // ± puan (yaklaşan bilanço binary event, FAZ 2)
    kapEvent:      number;  // ± puan (KAP-tipi event riski, haber tabanlı)
  };
  /** Sonraki bilançoya kalan takvim günü — null = bilinmiyor; rozet için */
  daysUntilEarnings: number | null;
  // ── Tavan / Taban ────────────────────────────────────────────────────
  /** 0-100 tavan ihtimal skoru */
  tavanScore:      number | null;
  /** Bugün tavan yaptı mı? */
  isTavan:         boolean;
  /** Bugün taban yaptı mı? */
  isTaban:         boolean;
  /** Tavana yaklaşıyor mu? (+%7-9.5) */
  tavanYaklasıyor: boolean;
  /** Tavan ihtimal etiketi */
  tavanLabel:      TavanResult['label'];
  /** Bugünkü % değişim */
  changePercent:   number | null;

  /**
   * Kaç gün önce de bu sinyal fırsatlar sayfasında vardı.
   * null = yeni sinyal (ilk kez görünüyor)
   * 3 = 3 gün önce de aynı sinyal mevcuttu → "Hâlâ Geçerli"
   */
  persistedDays:   number | null;
  /** Birleşik karar motoru çıktısı — hisse detay ile aynı format */
  decision: DecisionOutput;
  /** Yatırım Skoru (deterministik, temel veriye dayalı) — null = veri çekilemedi */
  investmentScore: {
    score: number;                   // 0-100
    rating: InvestableRating;
    confidence: InvestableConfidence;
    inflationAdjusted: boolean;
  } | null;
  /** Haber katalisti (news-impact precompute) — taze material haber özeti, yoksa null */
  catalyst: {
    sentiment: SymbolCatalyst['sentiment'];
    state: SymbolCatalyst['state'];
    materiality: SymbolCatalyst['materiality'];
    baslik: string;
    link: string;
    ar: number | null;
    yasSaat: number;
    /** Skora etkisi (±puan) — decision.factors.catalyst */
    adjustment: number;
    /** Haber yönü sinyal yönü ile uyumlu mu? */
    aligned: boolean;
  } | null;
}

export interface FirsatlarResponse {
  firsatlar:    FirsatItem[];
  makroScore:   number | null;
  regime:       string | null;
  toplamSinyal: number;
  /** En yeni sinyalin entry_time değeri — UI'da staleness göstermek için */
  scannedAt:    string | null;
  /** Cron'un son tetiklenme zamanı (gün içi 3 kez) — "Son güncelleme: 12:03" rozeti için */
  lastRefreshedAt: string | null;
  /** excludeOwned ile filtrelenmiş hisse sayısı (login varsa) */
  excludedOwnedCount?: number;
  /** Filtre dışında kalan portföy/watchlist sembolleri */
  ownedSymbols?: string[];
}

// ── Yardımcılar ──────────────────────────────────────────────────────

function computeWinRates(
  records: Pick<SignalPerformanceRecord, 'signal_type' | 'direction' | 'return_3d' | 'return_7d' | 'return_14d' | 'return_30d'>[],
): Map<string, { winRate: number; n: number }> {
  const groups = new Map<string, typeof records>();
  for (const r of records) {
    if (!r.signal_type) continue;
    if (!groups.has(r.signal_type)) groups.set(r.signal_type, []);
    groups.get(r.signal_type)!.push(r);
  }

  const out = new Map<string, { winRate: number; n: number }>();
  for (const [sigType, rows] of groups) {
    const field = SIGNAL_CANONICAL_FIELD[sigType] ?? 'return_7d';
    const valid = rows.filter((r) => {
      const v = r[field];
      return v != null && Number.isFinite(v as number);
    });
    if (valid.length < 5) continue;

    let wins = 0;
    for (const r of valid) {
      const raw = r[field] as number;
      const dirAdj = r.direction === 'asagi' ? -raw : raw;
      if (dirAdj - COMMISSION > 0) wins++;
    }
    out.set(sigType, { winRate: wins / valid.length, n: valid.length });
  }
  return out;
}

// NOT: timeDecay / winRate / regime / macro / mtf ayarlamaları artık
// `lib/decision-engine.ts` içinde merkezi olarak yapılıyor — duplikasyon kaldırıldı.
//
// KAP event riski artık kap.org.tr'den DEĞİL (site sunucu erişimini blokluyor,
// faktör prod'da hiç tetiklenmiyordu), news-catalyst cron'unun haber tabanlı
// eventRisks haritasından okunur (lib/news-impact deriveEventRisk).

export async function GET(req: NextRequest) {
  try {
    const url           = new URL(req.url);
    const excludeOwned  = url.searchParams.get('excludeOwned') === 'true';
    const sektorFilter  = url.searchParams.get('sektor'); // sektör ID (opsiyonel)

    const supabase = createAdminClient();

    // Login + portföy/watchlist (sadece excludeOwned varsa)
    let ownedSet: Set<string> = new Set();
    if (excludeOwned) {
      try {
        const userClient = await createServerClient();
        const { data: { user } } = await userClient.auth.getUser();
        if (user) {
          const [{ data: poz }, { data: watch }] = await Promise.all([
            userClient.from('portfolyo_pozisyonlar').select('sembol').eq('user_id', user.id),
            userClient.from('watchlist').select('sembol').eq('user_id', user.id),
          ]);
          ownedSet = new Set([
            ...(poz   ?? []).map((p: { sembol: string }) => p.sembol),
            ...(watch ?? []).map((w: { sembol: string }) => w.sembol),
          ]);
        }
      } catch {
        // Auth/DB hatası → ownedSet boş kalır, normal liste döner
      }
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
    cutoff.setHours(0, 0, 0, 0); // Yahoo tarihleri gün başı olarak kaydedilir, saati sıfırla

    const statsCutoff = new Date();
    statsCutoff.setDate(statsCutoff.getDate() - STATS_LOOKBACK_D);

    // Paralel çek: win rate + makro + scan_cache + katalist + temel-veri precompute
    const [statsRes, macroRes, scanCacheRes, catalystRes, fundamentalsRes] = await Promise.allSettled([
      // Win rate istatistiği — yalnızca BIST (BUG-B: market filtresi yokken
      // scan-us kayıtları BIST win-rate'lerini kirletiyordu)
      supabase
        .from('signal_performance')
        .select('signal_type, direction, return_3d, return_7d, return_14d, return_30d')
        .eq('evaluated', true)
        .or(BIST_MARKET_OR)
        .gte('entry_time', statsCutoff.toISOString()),

      getMacroFull(),
      // scan_cache: change_percent, rel_vol5, rsi — tavan skoru + hacim teyidi (BIST only)
      supabase
        .from('scan_cache')
        .select('sembol, change_percent, rel_vol5, rsi')
        .eq('market', 'BIST')
        .gte('scanned_at', new Date(Date.now() - 2 * 86_400_000).toISOString()),
      // Haber katalisti + KAP-tipi event riski — cron precompute, tek satır (ai_cache)
      supabase
        .from('ai_cache')
        .select('explanation')
        .eq('cache_key', 'news-catalyst:BIST')
        .gt('expires_at', new Date().toISOString())
        .single(),
      // Yatırım Skoru + bilanço tarihi — cron precompute (FAZ 2; istek-anı Yahoo YOK)
      getStoredFundamentals(supabase),
    ]);

    // Katalist + event risk haritaları: sembol → SymbolCatalyst / SymbolEventRisk
    const catalystMap = new Map<string, SymbolCatalyst>();
    const eventRiskMap = new Map<string, SymbolEventRisk>();
    if (catalystRes.status === 'fulfilled' && catalystRes.value.data?.explanation) {
      try {
        const parsed = JSON.parse(catalystRes.value.data.explanation) as {
          items?: Record<string, SymbolCatalyst>;
          eventRisks?: Record<string, SymbolEventRisk>;
        };
        for (const [sym, cat] of Object.entries(parsed.items ?? {})) {
          catalystMap.set(sym, cat);
        }
        for (const [sym, risk] of Object.entries(parsed.eventRisks ?? {})) {
          eventRiskMap.set(sym, risk);
        }
      } catch { /* bozuk cache → katalist yok, normal devam */ }
    }

    // Aktif sinyal sorgusu — yeni kolonları önce dene, migration yoksa temel sorguya fall back
    type SignalRow = {
      sembol: string;
      signal_type: string;
      direction: string;
      entry_price: number;
      entry_time: string;
      confluence_score: number;
      regime: string | null;
      avg_daily_volume_tl: number | null;
      weekly_aligned: boolean | null;
      stop_loss: number | null;
      target_price: number | null;
      risk_reward_ratio: number | null;
      last_refreshed_at: string | null;
    };

    const BASE_SELECT = 'sembol, signal_type, direction, entry_price, entry_time, confluence_score, regime, last_refreshed_at';
    const FULL_SELECT = `${BASE_SELECT}, avg_daily_volume_tl, weekly_aligned, stop_loss, target_price, risk_reward_ratio`;

    // ÖNEMLİ: market filtresi olmadan scan-us'un US sinyalleri BIST sayfasına
    // sızıyordu; üstelik Supabase'in 1000 satır tavanında US satırları BIST
    // satırlarını listeden itiyordu (canlıda doğrulandı, 2026-06-11).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sinyalData: { data: any[] | null; error: { message: string; code?: string } | null } =
      await supabase
        .from('signal_performance')
        .select(FULL_SELECT)
        .eq('evaluated', false)
        .or(BIST_MARKET_OR)
        .gte('entry_time', cutoff.toISOString())
        .gte('confluence_score', MIN_CONFLUENCE)
        .order('confluence_score', { ascending: false })
        .limit(1000);

    // Kolon bulunamadı hatası (migration henüz uygulanmamış) → temel sorguyla tekrar dene
    if (sinyalData.error && (sinyalData.error.code === '42703' || sinyalData.error.message?.includes('does not exist'))) {
      sinyalData = await supabase
        .from('signal_performance')
        .select(BASE_SELECT)
        .eq('evaluated', false)
        .or(BIST_MARKET_OR)
        .gte('entry_time', cutoff.toISOString())
        .gte('confluence_score', MIN_CONFLUENCE)
        .order('confluence_score', { ascending: false })
        .limit(1000);
    }

    if (sinyalData.error) {
      return NextResponse.json({ error: sinyalData.error.message }, { status: 500 });
    }

    const allRows = ((sinyalData.data ?? []) as Partial<SignalRow>[]).map((r) => ({
      sembol:              r.sembol ?? '',
      signal_type:         r.signal_type ?? '',
      direction:           r.direction ?? '',
      entry_price:         r.entry_price ?? 0,
      entry_time:          r.entry_time ?? '',
      confluence_score:    r.confluence_score ?? 0,
      regime:              r.regime ?? null,
      avg_daily_volume_tl: r.avg_daily_volume_tl ?? null,
      weekly_aligned:      r.weekly_aligned ?? null,
      stop_loss:           r.stop_loss ?? null,
      target_price:        r.target_price ?? null,
      risk_reward_ratio:   r.risk_reward_ratio ?? null,
      last_refreshed_at:   r.last_refreshed_at ?? null,
    } satisfies SignalRow));

    // Sert filtreler (P0-3, P2-1):
    // - avg_daily_volume_tl null ise eski kayıt → tolere et (backwards-compat)
    // - dolu ama < 10M TL → ele (low liquidity / manipülasyon riski)
    // - risk_reward_ratio null ise tolere et; dolu ama < 1.5 → ele
    const rows = allRows.filter((r) => {
      if (r.avg_daily_volume_tl !== null && r.avg_daily_volume_tl < MIN_ADV_TL) return false;
      if (r.risk_reward_ratio   !== null && r.risk_reward_ratio   < MIN_RR)     return false;
      return true;
    });

    // Win rate haritası
    const winRateMap = statsRes.status === 'fulfilled' && !statsRes.value.error
      ? computeWinRates(statsRes.value.data ?? [])
      : new Map<string, { winRate: number; n: number }>();

    // Makro skor
    let makroScore: number | null = null;
    if (macroRes.status === 'fulfilled') {
      makroScore = macroRes.value.macroScore.score;
    }
    const regime: string | null = rows[0]?.regime ?? null;

    // Sembol bazında grupla
    const gruplar = new Map<string, typeof rows>();
    for (const row of rows) {
      const mevcut = gruplar.get(row.sembol) ?? [];
      mevcut.push(row);
      gruplar.set(row.sembol, mevcut);
    }

    // Sektör → sinyal veren hisse sayısı
    const sektorSayaci = new Map<string, Set<string>>();
    for (const sembol of gruplar.keys()) {
      const sektorId = getSectorId(sembol);
      if (!sektorSayaci.has(sektorId)) sektorSayaci.set(sektorId, new Set());
      sektorSayaci.get(sektorId)!.add(sembol);
    }

    // ── Tavan Skoru — scan_cache'den change_percent + rel_vol5 + rsi ────
    type ScanCacheRow = { sembol: string; change_percent: number | null; rel_vol5: number | null; rsi: number | null };
    const scanCacheMap = new Map<string, ScanCacheRow>();
    if (scanCacheRes.status === 'fulfilled' && !scanCacheRes.value.error) {
      for (const row of (scanCacheRes.value.data ?? []) as ScanCacheRow[]) {
        // En yeni kaydı koru (aynı sembole birden fazla row varsa)
        if (!scanCacheMap.has(row.sembol)) scanCacheMap.set(row.sembol, row);
      }
    }

    // ── B: Sinyal kalıcılığı — "Hâlâ Geçerli" badge ────────────────────
    // 3-10 gün önce aynı sembol+signal_type signal_performance'da var mıydı?
    const persistenceMap = new Map<string, number>(); // key: sembol_signalType → daysAgo
    {
      const since10d = new Date(Date.now() - 10 * 86_400_000).toISOString();
      const before3d  = new Date(Date.now() - 3  * 86_400_000).toISOString();
      const { data: oldSigs } = await supabase
        .from('signal_performance')
        .select('sembol, signal_type, entry_time')
        .or(BIST_MARKET_OR)
        .gte('entry_time', since10d)
        .lte('entry_time', before3d)
        .is('user_id', null)
        .gte('confluence_score', MIN_CONFLUENCE)
        .in('sembol', Array.from(gruplar.keys()));
      for (const sig of oldSigs ?? []) {
        const key = `${sig.sembol}_${sig.signal_type}`;
        const daysAgo = Math.floor((Date.now() - new Date(sig.entry_time).getTime()) / 86_400_000);
        const prev = persistenceMap.get(key);
        if (prev == null || daysAgo < prev) persistenceMap.set(key, daysAgo);
      }
    }

    // ── Yatırım Skoru + bilanço tarihi (FAZ 2 precompute) ───────────────
    // Eskiden sembol başına istek-anı fetchYahooFundamentals fan-out'u vardı
    // (cold start'ta Yahoo'ya ~130 paralel çağrı). Artık cron precompute eder
    // (firsatlar-fundamentals:BIST), burada TEK satır okunur — Yahoo YOK.
    const uniqueSymbols = Array.from(gruplar.keys());
    const investmentScoreMap = new Map<string, FirsatItem['investmentScore']>();
    const earningsTsMap = new Map<string, number | null>();
    {
      const store = fundamentalsRes.status === 'fulfilled' ? fundamentalsRes.value : null;
      for (const sym of uniqueSymbols) {
        const entry = store?.items?.[sym];
        if (entry) {
          investmentScoreMap.set(sym, {
            score: entry.score,
            rating: entry.rating,
            confidence: entry.confidence,
            inflationAdjusted: entry.inflationAdjusted,
          });
          earningsTsMap.set(sym, entry.nextEarningsTs ?? null);
        } else {
          investmentScoreMap.set(sym, null);
        }
      }
    }

    // ── Sektör momentum (P1-1) — scan_cache'teki hazır mumlardan ────────
    // Temsilci hisselerin candles_json'u (son 60 mum) ile analyzeSector çalışır;
    // istek anında Yahoo'ya GİDİLMEZ. 60 mum perf20d için yeterli (perf60d null
    // kalabilir → momentum hafif sönümlü ama yönü doğru).
    const sectorMomentumMap = new Map<string, SectorMomentum>();
    try {
      const neededSectors = new Set<string>();
      for (const sembol of gruplar.keys()) neededSectors.add(getSectorId(sembol));

      const repSymbols = new Set<string>();
      for (const secId of neededSectors) {
        for (const s of SECTOR_REPRESENTATIVES[secId as SectorId] ?? []) repSymbols.add(s);
      }

      if (repSymbols.size > 0) {
        const { data: repRows } = await supabase
          .from('scan_cache')
          .select('sembol, candles_json')
          .eq('market', 'BIST')
          .in('sembol', Array.from(repSymbols));

        const candleMap = new Map<string, OHLCVCandle[]>();
        for (const row of (repRows ?? []) as { sembol: string; candles_json: unknown }[]) {
          if (Array.isArray(row.candles_json) && row.candles_json.length >= 5) {
            candleMap.set(row.sembol, row.candles_json as OHLCVCandle[]);
          }
        }

        const macroForSector = macroRes.status === 'fulfilled' ? macroRes.value.macroScore : null;
        for (const secId of neededSectors) {
          const reps = SECTOR_REPRESENTATIVES[secId as SectorId] ?? [];
          const sectorData: Record<string, OHLCVCandle[]> = {};
          for (const s of reps) {
            const c = candleMap.get(s);
            if (c) sectorData[s] = c;
          }
          if (Object.keys(sectorData).length === 0) continue;
          sectorMomentumMap.set(secId, analyzeSector(secId as SectorId, sectorData, macroForSector));
        }
      }
    } catch { /* sektör verisi yoksa faktör 0 kalır — karar yine üretilir */ }

    const now = Date.now();
    const firsatlar: FirsatItem[] = [];

    for (const [sembol, sinyaller] of gruplar) {
      const best = sinyaller.reduce((a, b) =>
        (b.confluence_score ?? 0) > (a.confluence_score ?? 0) ? b : a
      );

      const uniqueSinyaller = [...new Set(sinyaller.map((s) => s.signal_type))];

      const yukariSayisi = sinyaller.filter((s) => s.direction === 'yukari').length;
      const asagiSayisi  = sinyaller.filter((s) => s.direction === 'asagi').length;
      const direction: FirsatItem['direction'] =
        yukariSayisi > asagiSayisi ? 'yukari' :
        asagiSayisi > yukariSayisi ? 'asagi' : 'notr';

      const sektorBilgi  = getSector(sembol);
      const sektorId     = getSectorId(sembol);
      const sektorSinyalSayisi = sektorSayaci.get(sektorId)?.size ?? 1;

      const baseScore = Math.round(best.confluence_score ?? 0);
      const ageHours  = Math.max(0, (now - new Date(best.entry_time).getTime()) / 3_600_000);

      const wrEntry = winRateMap.get(best.signal_type);
      const histWr  = wrEntry?.winRate ?? null;
      const histN   = wrEntry?.n ?? 0;

      // KAP-tipi event riski: son 7 gün kurumsal event (haber tabanlı, cron precompute)
      const kapEvent = eventRiskMap.get(sembol) ?? null;

      // ── Birleşik Karar Motoru ────────────────────────────────────────
      // DB satırlarını StockSignal[] şekline çevir ve computeDecision çağır.
      // Böylece /api/hisse-analiz ile tam aynı skor formülü uygulanır.
      const stockSignals = dbRowsToStockSignals(sinyaller.map((r) => ({
        signal_type: r.signal_type,
        direction: r.direction,
        sembol,
        confluence_score: r.confluence_score,
        weekly_aligned: r.weekly_aligned,
        stop_loss: r.stop_loss,
        target_price: r.target_price,
        risk_reward_ratio: r.risk_reward_ratio,
        avg_daily_volume_tl: r.avg_daily_volume_tl,
        entry_price: r.entry_price,
      })));

      const catalyst = catalystMap.get(sembol) ?? null;

      // BUG-C fix: riskScore + sectorMomentum + relVol5 artık burada da veriliyor —
      // /api/hisse-analiz ile aynı girdi seti → aynı hisse iki sayfada aynı skor.
      const decision = computeDecision({
        signals: stockSignals,
        macroScore: macroRes.status === 'fulfilled' ? macroRes.value.macroScore : null,
        sectorMomentum: sectorMomentumMap.get(sektorId) ?? null,
        riskScore: macroRes.status === 'fulfilled' ? macroRes.value.riskScore : null,
        historicalWinRate: wrEntry ? { winRate: wrEntry.winRate, n: wrEntry.n } : null,
        kapRisk: kapEvent ? { var: true, mesaj: kapEvent.baslik } : null,
        catalyst,
        regime: best.regime,
        relVol5: scanCacheMap.get(sembol)?.rel_vol5 ?? null,
        daysUntilEarnings: daysUntilEarnings(earningsTsMap.get(sembol) ?? null),
        scannedAt: best.entry_time,
        dataSource: 'db_snapshot',
      });

      // Katalist yönü sinyal yönü ile uyumlu mu? (UI rozeti için)
      const catalystAligned = catalyst != null && catalyst.sentiment !== 'nötr' && direction !== 'notr'
        ? (catalyst.sentiment === 'pozitif') === (direction === 'yukari')
        : false;

      firsatlar.push({
        sembol,
        sektorAdi:          sektorBilgi.shortName,
        sektorId,
        sinyaller:          uniqueSinyaller,
        direction,
        confluenceScore:    baseScore,
        adjustedScore:      decision.score,  // birleşik motordan
        entryPrice:         best.entry_price,
        entryTime:          best.entry_time,
        ageHours:           Math.round(ageHours * 10) / 10,
        regime:             best.regime,
        sektorSinyalSayisi,
        historicalWinRate:  histWr,
        winRateN:           histN,
        avgDailyVolumeTL:   best.avg_daily_volume_tl,
        weeklyAligned:      best.weekly_aligned,
        stopLoss:           best.stop_loss,
        targetPrice:        best.target_price,
        riskRewardRatio:    best.risk_reward_ratio,
        kapUyarisi: kapEvent
          ? { var: true, mesaj: `${kapEvent.kategori}: ${kapEvent.baslik.slice(0, 80)}`, url: kapEvent.link }
          : null,
        adjustments: {
          timeDecay:     decision.factors.timeDecay,
          winRate:       decision.factors.winRateAdj,
          regimeFit:     decision.factors.regimeFit,
          macroAlign:    decision.factors.macroAlign,
          mtfAlign:      decision.factors.mtfAlign,
          sectorAlign:   decision.factors.sectorAlign,
          volumeConfirm: decision.factors.volumeConfirm,
          earningsRisk:  decision.factors.earningsRisk,
          kapEvent:      decision.factors.kapEvent,
        },
        daysUntilEarnings: daysUntilEarnings(earningsTsMap.get(sembol) ?? null),
        decision,
        investmentScore: investmentScoreMap.get(sembol) ?? null,
        catalyst: catalyst
          ? {
              sentiment:   catalyst.sentiment,
              state:       catalyst.state,
              materiality: catalyst.materiality,
              baslik:      catalyst.baslik,
              link:        catalyst.link,
              ar:          catalyst.ar,
              yasSaat:     catalyst.yasSaat,
              adjustment:  decision.factors.catalyst,
              aligned:     catalystAligned,
            }
          : null,
        // ── Tavan / Taban ──────────────────────────────────────────────
        ...(() => {
          const sc = scanCacheMap.get(sembol);
          const tavan = calcTavanScore({
            changePercent:   sc?.change_percent ?? null,
            relVol5:         sc?.rel_vol5       ?? null,
            confluenceScore: baseScore,
            rsi:             sc?.rsi            ?? null,
            weeklyAligned:   best.weekly_aligned ?? null,
          });
          return {
            tavanScore:      tavan.label ? tavan.tavanScore : null,
            isTavan:         tavan.isTavan,
            isTaban:         tavan.isTaban,
            tavanYaklasıyor: tavan.yaklasıyor,
            tavanLabel:      tavan.label,
            changePercent:   sc?.change_percent ?? null,
          };
        })(),
        persistedDays: (() => {
          // En az bir sinyalin 3-10 gün önce de var olup olmadığına bak
          const days = uniqueSinyaller
            .map((st) => persistenceMap.get(`${sembol}_${st}`))
            .filter((d): d is number => d != null);
          return days.length > 0 ? Math.min(...days) : null;
        })(),
      });
    }

    // Nihai skora göre sırala (en yüksek → en düşük)
    firsatlar.sort((a, b) => b.adjustedScore - a.adjustedScore);

    // En yeni entry_time (UI'da "şu zamanki taramanın sonucu" göstermek için)
    const scannedAt = firsatlar.length > 0
      ? firsatlar.reduce((latest, f) => f.entryTime > latest ? f.entryTime : latest, firsatlar[0]!.entryTime)
      : null;

    // En yeni last_refreshed_at — gün içi tazelenme rozeti için
    // (allRows ham SignalRow listesi; firsatlar gruplama sonrası — ham veriden hesaplıyoruz)
    let lastRefreshedAt: string | null = null;
    for (const r of allRows) {
      const v = r.last_refreshed_at;
      if (v && (lastRefreshedAt === null || v > lastRefreshedAt)) lastRefreshedAt = v;
    }

    // ── Response-time filters ─────────────────────────────────────────
    let filtered = firsatlar;
    let excludedOwnedCount = 0;
    const ownedSymbols: string[] = [];

    if (ownedSet.size > 0) {
      const before = filtered.length;
      filtered = filtered.filter((f) => {
        if (ownedSet.has(f.sembol)) {
          ownedSymbols.push(f.sembol);
          return false;
        }
        return true;
      });
      excludedOwnedCount = before - filtered.length;
    }

    if (sektorFilter) {
      filtered = filtered.filter((f) => f.sektorId === sektorFilter);
    }

    return NextResponse.json<FirsatlarResponse>({
      firsatlar: filtered,
      makroScore,
      regime,
      toplamSinyal: allRows.length,
      scannedAt,
      lastRefreshedAt,
      excludedOwnedCount: excludeOwned ? excludedOwnedCount : undefined,
      ownedSymbols:       excludeOwned ? ownedSymbols       : undefined,
    }, {
      // excludeOwned + auth → kullanıcıya özgü, no-cache. Aksi halde public cache.
      headers: {
        'Cache-Control': excludeOwned
          ? 'private, no-cache'
          : 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
