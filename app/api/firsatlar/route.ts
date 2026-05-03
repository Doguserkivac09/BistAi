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
import { getSector, getSectorId } from '@/lib/sectors';
import type { SignalPerformanceRecord } from '@/lib/performance-types';
import { fetchKapDuyurular } from '@/lib/kap';
import {
  computeDecision,
  dbRowsToStockSignals,
  type DecisionOutput,
} from '@/lib/decision-engine';
import { createServerClient } from '@/lib/supabase-server';
import { fetchYahooFundamentals } from '@/lib/yahoo-fundamentals';
import {
  computeInvestableScore,
  DEFAULT_WEIGHTS,
  type InvestableConfidence,
  type InvestableRating,
} from '@/lib/investment-score';
import { fetchTurkeyInflation } from '@/lib/turkey-macro';

const MIN_CONFLUENCE    = 45;
const LOOKBACK_DAYS     = 3;
const STATS_LOOKBACK_D  = 180;    // geçmiş win rate için örneklem penceresi
const MIN_ADV_TL        = 10_000_000; // 10M TL altı likiditesi elenir (P0-3)
const MIN_RR            = 1.5;        // 1.5 altı R/R sinyaller elenir (P2-1)

// Canonical horizon map (signal-stats-summary ile senkronize)
const SIGNAL_CANONICAL_FIELD: Record<string, 'return_3d' | 'return_7d' | 'return_14d' | 'return_30d'> = {
  'Altın Çapraz':           'return_30d',
  'Ölüm Çaprazı':            'return_30d',
  'Altın Çapraz Yaklaşıyor': 'return_30d', // pre-signal
  'Trend Başlangıcı':        'return_14d',
  'Destek/Direnç Kırılımı':  'return_14d',
  'Higher Lows':             'return_14d',
  'Trend Olgunlaşıyor':      'return_14d', // pre-signal
  'Direnç Testi':            'return_14d', // pre-signal
  'Çift Dip':                'return_14d', // formasyon
  'Çift Tepe':               'return_14d', // formasyon
  'Bull Flag':               'return_14d', // formasyon (devam)
  'Bear Flag':               'return_14d', // formasyon (devam — bearish)
  'Cup & Handle':            'return_30d', // uzun vadeli formasyon
  'Ters Omuz-Baş-Omuz':      'return_30d', // güçlü reversal — uzun vadeli
  'Yükselen Üçgen':          'return_14d', // sıkışma kırılımı
  'MACD Kesişimi':           'return_7d',
  'MACD Daralıyor':          'return_7d',  // pre-signal
  'RSI Uyumsuzluğu':         'return_7d',
  'Bollinger Sıkışması':     'return_7d',
  'RSI Seviyesi':            'return_3d',
  'Hacim Anomalisi':         'return_3d',
};

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
    timeDecay:  number;  // çarpan (0-1)
    winRate:    number;  // ± puan
    regimeFit:  number;  // ± puan
    macroAlign: number;  // ± puan
    mtfAlign:   number;  // ± puan (haftalık uyum)
    kapEvent:   number;  // ± puan (KAP event riski)
  };
  /** Birleşik karar motoru çıktısı — hisse detay ile aynı format */
  decision: DecisionOutput;
  /** Yatırım Skoru (deterministik, temel veriye dayalı) — null = veri çekilemedi */
  investmentScore: {
    score: number;                   // 0-100
    rating: InvestableRating;
    confidence: InvestableConfidence;
    inflationAdjusted: boolean;
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

// KAP event — son 7 gün kritik duyuru (finansal rapor, genel kurul, temettü vb.)
// Bu tür event'ler sinyali yanıltabilir → skor penaltısı
const KRITIK_KAP_KATEGORI = ['FR', 'FN', 'GK', 'ÖDA'];
function isKritikKapDuyurusu(baslik: string, kategori: string): boolean {
  const kat = kategori.toUpperCase();
  const bas = baslik.toUpperCase();
  if (KRITIK_KAP_KATEGORI.some((k) => kat.includes(k))) return true;
  return (
    bas.includes('FİNANSAL') ||
    bas.includes('MALİ TABLO') ||
    bas.includes('TEMETTÜ') ||
    bas.includes('GENEL KURUL') ||
    bas.includes('KÂR PAYI') ||
    bas.includes('SERMAYE ARTIRIM')
  );
}

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

    const statsCutoff = new Date();
    statsCutoff.setDate(statsCutoff.getDate() - STATS_LOOKBACK_D);

    // Paralel çek: geçmiş win rate verisi + makro + KAP duyuruları + TÜFE
    const [statsRes, macroRes, kapRes, tufeRes] = await Promise.allSettled([
      supabase
        .from('signal_performance')
        .select('signal_type, direction, return_3d, return_7d, return_14d, return_30d')
        .eq('evaluated', true)
        .gte('entry_time', statsCutoff.toISOString()),

      getMacroFull(),
      fetchKapDuyurular(200), // son 200 KAP duyurusu (cache'li, 15dk TTL)
      fetchTurkeyInflation(), // TÜFE YoY — Investment Score enflasyon düzeltmesi
    ]);

    // TÜFE bağlamı (yoksa global formül)
    const inflation =
      tufeRes.status === 'fulfilled' && tufeRes.value && Number.isFinite(tufeRes.value.value)
        ? { tufeYoy: tufeRes.value.value, source: 'tcmb' }
        : undefined;

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sinyalData: { data: any[] | null; error: { message: string; code?: string } | null } =
      await supabase
        .from('signal_performance')
        .select(FULL_SELECT)
        .eq('evaluated', false)
        .gte('entry_time', cutoff.toISOString())
        .gte('confluence_score', MIN_CONFLUENCE)
        .order('confluence_score', { ascending: false });

    // Kolon bulunamadı hatası (migration henüz uygulanmamış) → temel sorguyla tekrar dene
    if (sinyalData.error && (sinyalData.error.code === '42703' || sinyalData.error.message?.includes('does not exist'))) {
      sinyalData = await supabase
        .from('signal_performance')
        .select(BASE_SELECT)
        .eq('evaluated', false)
        .gte('entry_time', cutoff.toISOString())
        .gte('confluence_score', MIN_CONFLUENCE)
        .order('confluence_score', { ascending: false });
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

    // KAP haritası: sembol → son 7 gün kritik duyuru (varsa en sonuncusu)
    const kapMap = new Map<string, { baslik: string; url: string; tarih: string; kategori: string }>();
    if (kapRes.status === 'fulfilled') {
      const sinirTarih = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const d of kapRes.value) {
        const sym = d.sembol?.toUpperCase();
        if (!sym) continue;
        const ts = new Date(d.tarih).getTime();
        if (!Number.isFinite(ts) || ts < sinirTarih) continue;
        if (!isKritikKapDuyurusu(d.baslik, d.kategori)) continue;
        // İlk gelen = en yeni (fetchKapDuyurular tarih azalan sırada döner)
        if (!kapMap.has(sym)) {
          kapMap.set(sym, { baslik: d.baslik, url: d.url, tarih: d.tarih, kategori: d.kategoriAdi });
        }
      }
    }

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

    // ── Yatırım Skoru (deterministik, ham temel veri → 0-100) ───────────
    // Yahoo fundamentals 24h in-memory cache'li → çağrı maliyeti çok düşük.
    // Hata olursa null döner; o sembolde rozet gösterilmez.
    const uniqueSymbols = Array.from(gruplar.keys());
    const investmentScoreMap = new Map<
      string,
      FirsatItem['investmentScore']
    >();
    await Promise.all(
      uniqueSymbols.map(async (sym) => {
        try {
          const fundamentals = await fetchYahooFundamentals(sym);
          const inv = computeInvestableScore(fundamentals, DEFAULT_WEIGHTS, inflation);
          investmentScoreMap.set(sym, {
            score: inv.score,
            rating: inv.ratingLabel,
            confidence: inv.confidence,
            inflationAdjusted: inv.inflationAdjustment?.applied ?? false,
          });
        } catch {
          investmentScoreMap.set(sym, null);
        }
      }),
    );

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

      // KAP event riski: son 7 gün kritik duyuru
      const kapEvent = kapMap.get(sembol) ?? null;

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

      const decision = computeDecision({
        signals: stockSignals,
        macroScore: macroRes.status === 'fulfilled' ? macroRes.value.macroScore : null,
        historicalWinRate: wrEntry ? { winRate: wrEntry.winRate, n: wrEntry.n } : null,
        kapRisk: kapEvent ? { var: true, mesaj: kapEvent.baslik } : null,
        regime: best.regime,
        scannedAt: best.entry_time,
        dataSource: 'db_snapshot',
      });

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
          ? { var: true, mesaj: `${kapEvent.kategori}: ${kapEvent.baslik.slice(0, 80)}`, url: kapEvent.url }
          : null,
        adjustments: {
          timeDecay:  decision.factors.timeDecay,
          winRate:    decision.factors.winRateAdj,
          regimeFit:  decision.factors.regimeFit,
          macroAlign: decision.factors.macroAlign,
          mtfAlign:   decision.factors.mtfAlign,
          kapEvent:   decision.factors.kapEvent,
        },
        decision,
        investmentScore: investmentScoreMap.get(sembol) ?? null,
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
