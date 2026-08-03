/**
 * Banka Sağlık Motoru — Kademe 1 (BANKA-MOTORU-PLAN.md FAZ K1).
 *
 * SORUN: `isFinancialSector` bankaları yakalayıp Piotroski/Altman/Beneish'i
 * "uygulanmaz" döndürüyordu → banka HİÇBİR temel kalite kapısından geçmiyordu
 * (decision-engine `fundamentalVeto` red-flag'i bankada asla tetiklenmiyordu).
 * Bu dosya o kör noktayı kapatır: "yargılayamıyoruz" yerine "banka mantığına yönlendir".
 *
 * KADEME 1 = yalnız MEVCUT ve DOĞRULANMIŞ girdiler (peer medyanı + ROE + enflasyon).
 * Sınırlı ama gerçek tespit; `dataQuality: 'kısmi'` ile dürüstçe etiketlenir.
 * Kademe 2 (NIM/CoR/gelir kırılımı — İş Yatırım UFRS_K şablonu) ayrı fazdır.
 *
 * SAF/deterministik — fetch YOK, UI YOK.
 */

import type { PeerValuation } from './peer-valuation';
import type { SectorId } from './sectors';
import type { BankFields } from './isyatirim-bank';

/** Banka rotasına giren sektörler. Sigorta/finans BİLİNÇLİ olarak dışarıda:
 *  mali tablosu bankadan da farklı (teknik karşılıklar, prim üretimi) → NIM/NPL/SYR
 *  metrikleri onlara uymaz, ayrı motor gerektirir (plan: kapsam dışı). */
export const BANK_SECTORS: readonly SectorId[] = ['banka'];

export function isBankSector(sectorId: SectorId): boolean {
  return BANK_SECTORS.includes(sectorId);
}

export type BankFlagTone = 'pos' | 'warn';

export interface BankFlag {
  id: string;
  tone: BankFlagTone;
  /** Sade Türkçe — opportunity-reasons sözlüğüne doğrudan beslenebilir */
  text: string;
  detail?: string;
}

/**
 * Kademe 2 girdisi — İş Yatırım UFRS_K TTM'leri (lib/isyatirim-bank).
 * `prev` bir yıl önceki TTM (trend için). Yoksa yalnız seviye ölçülür.
 */
export interface BankFinancials {
  ttm: BankFields;
  prev: BankFields | null;
}

/**
 * Sektör bağlamı — trend bayraklarını GÖRECELİ yapar.
 * DERS (reel ROE kalibrasyonuyla aynı): faiz indirim döngüsünde TÜM bankaların marjı
 * genişler, TÜM bankaların risk maliyeti artabilir. Sektörün tamamında geçerli bir
 * hareket ayrıştırıcı DEĞİLDİR — rozet ancak bankanın emsalinden AYRIŞTIĞI yerde
 * bilgi taşır. Bağlam verilmezse mutlak (daha zayıf) eşiklere düşülür.
 */
export interface BankSectorContext {
  nimDeltaMedianPp: number | null;
  corDeltaMedianBps: number | null;
}

/**
 * Analist BEKLENTİSİ (ileriye dönük) — skora KARIŞMAZ, ayrı gösterilir.
 *
 * NEDEN AYRI: `score` gerçekleşmiş kaliteyi ölçer (geçmiş 12 ay kârlılığı, emsal
 * çarpanları, gelir kalitesi). Toparlanma/değer hikâyelerinde bu ikisi zıt yönde
 * olabilir — dip kârla F/K yüksek çıkar, skor düşer; beklenti ise yüksek olabilir.
 * İkisini tek nota karıştırmak hangi bilginin nereden geldiğini gizlerdi. Ayrıca
 * analist kapsamı bankaların yarısında YOK (YKBNK/AKBNK) → skora katılsa ağırlık
 * yeniden normalize edilir ve skorlar karşılaştırılamaz hale gelirdi.
 */
export interface BankAnalystInput {
  currentPrice: number | null;
  targetMeanPrice: number | null;
  /** 1 = güçlü al … 5 = güçlü sat (Yahoo recommendationMean) */
  recommendationMean: number | null;
  recommendationKey: string | null;
  analystCount: number | null;
}

export interface BankOutlook {
  /** Kapsam var mı — yoksa hiçbir şey İDDİA EDİLMEZ */
  available: boolean;
  targetPrice: number | null;
  currentPrice: number | null;
  /** Hedefe göre yükseliş potansiyeli % */
  upsidePct: number | null;
  /** Sade Türkçe konsensüs etiketi */
  consensusLabel: string | null;
  consensusMean: number | null;
  analystCount: number | null;
}

/** Konsensüs ortalaması (1-5) → sade Türkçe. */
function consensusLabel(mean: number | null): string | null {
  if (mean == null || !Number.isFinite(mean)) return null;
  if (mean <= 1.5) return 'güçlü al';
  if (mean <= 2.5) return 'al';
  if (mean <= 3.5) return 'tut';
  if (mean <= 4.5) return 'sat';
  return 'güçlü sat';
}

/**
 * Analist beklentisini derler. Kapsam yoksa `available:false` — sıfır/uydurma YOK.
 * `analystCount < 3` de kapsamsız sayılır (tek-iki kurum konsensüs değildir).
 */
export function computeBankOutlook(a: BankAnalystInput | null | undefined): BankOutlook {
  const empty: BankOutlook = {
    available: false, targetPrice: null, currentPrice: null,
    upsidePct: null, consensusLabel: null, consensusMean: null, analystCount: null,
  };
  if (!a) return empty;
  const n = a.analystCount ?? 0;
  const hasTarget = a.targetMeanPrice != null && a.currentPrice != null && a.currentPrice > 0;
  if (n < 3 || (!hasTarget && a.recommendationMean == null)) return { ...empty, analystCount: a.analystCount ?? null };
  return {
    available: true,
    targetPrice: a.targetMeanPrice ?? null,
    currentPrice: a.currentPrice ?? null,
    upsidePct: hasTarget
      ? Math.round(((a.targetMeanPrice! - a.currentPrice!) / a.currentPrice!) * 1000) / 10
      : null,
    consensusLabel: consensusLabel(a.recommendationMean),
    consensusMean: a.recommendationMean ?? null,
    analystCount: a.analystCount ?? null,
  };
}

export interface BankHealthInput {
  sectorId: SectorId;
  /** Sektör emsal karşılaştırması (banka medyanı canlı doğrulanmış, n≈17) */
  peer: PeerValuation | null;
  /** Özkaynak kârlılığı — ORAN (0.45 = %45), Yahoo `returnOnEquity` */
  roe: number | null;
  /** TÜFE yıllık % (35.1 = %35,1) — null ise reelleştirme yapılmaz */
  inflationYoy: number | null;
  /** Kademe 2 — banka mali tabloları (yoksa Kademe 1'de kalınır) */
  financials?: BankFinancials | null;
  /** Sektör trend medyanları — trend bayraklarını göreceli yapar (runner iki geçişte üretir) */
  sectorContext?: BankSectorContext | null;
  /** Analist beklentisi — SKORA GİRMEZ, ayrı alan olarak taşınır */
  analyst?: BankAnalystInput | null;
}

/** Kademe 2 ölçümleri — UI ve şeffaflık için ham oranlar (null = ölçülemedi). */
export interface BankMetrics {
  /** (NII + net komisyon) / toplam faaliyet geliri — çekirdek gelir oranı */
  coreIncomeRatio: number | null;
  /** ticari kâr / toplam faaliyet geliri — volatil gelire bağımlılık */
  tradingShare: number | null;
  /** NII / ortalama aktif (%) — getirili aktif kırılımı şablonda yok, AKTİF bazlı proxy */
  nimProxy: number | null;
  /**
   * karşılık gideri / ortalama krediler (baz puan) — BRÜT karşılık oranı.
   * Piyasanın "net CoR"u değildir: tablodaki kalem tahsilatları netleştirmez ve
   * diğer alacakların karşılığını da içerir. Seviye değil TREND'i anlamlıdır.
   */
  corBps: number | null;
  /** faaliyet gideri / toplam faaliyet geliri — verimlilik */
  costIncome: number | null;
  /** bir yıl öncesine göre değişimler (puan) — trend; prev yoksa null */
  nimDeltaPp: number | null;
  corDeltaBps: number | null;
  coreRatioDeltaPp: number | null;
  netIncomeGrowthPct: number | null;
}

export interface BankHealth {
  applicable: boolean;
  /**
   * `banka` = BDDK banka mali tablosu (UFRS_K) beyan eden mevduat/katılım bankası.
   * `finans` = sektör listesinde 'banka' altında duran ama banka tablosu OLMAYAN
   * kuruluş (aracı kurum, faktoring, leasing, holding, kurucu payı — GEDIK/GARFA/
   * QNBFK/VAKFN/GSDHO…). Değerlendirme (emsal + reel ROE) geçerlidir ama bunu
   * "banka değerlendirmesi" diye sunmak YANLIŞ olurdu → etiket ayrıştırılır.
   */
  institution: 'banka' | 'finans';
  /** 1 = kısmi veri (peer + reel ROE) · 2 = tam banka motoru (Kademe 2) */
  tier: 1 | 2;
  /** 0-100; null = skorlanacak girdi yok */
  score: number | null;
  verdict: 'saglikli' | 'notr' | 'zayif' | 'olculemedi';
  flags: BankFlag[];
  /** Karar motoru için sert bayrak — bankanın `beneishSuspect`/`altmanDistress` karşılığı */
  redFlag: boolean;
  dataQuality: 'kısmi' | 'geniş' | 'yok';
  reason?: string;
  /** Kademe 2 ham ölçümleri (tier 1'de null) */
  metrics?: BankMetrics | null;
  /**
   * İleriye dönük analist beklentisi. `score`/`verdict`/`redFlag` ile İLİŞKİSİ YOKTUR
   * — geçmiş kalite ile beklenti zıt olabilir, ikisi ayrı okunmalıdır.
   */
  outlook?: BankOutlook | null;
}

/**
 * "Derin reel kayıp" eşiği (puan). Emsal medyanı yoksa bile bu seviyenin altındaki
 * reel ROE tek başına veto üretir — sektör geneli zor olsa da bu kadarı ayrıştırıcıdır.
 * −15 pp: TÜFE ~%32 iken sektör medyan reel ROE'si ≈ −8 pp; bunun belirgin altı.
 */
const DEEP_REAL_LOSS_PP = -15;

/** Reel = nominal − enflasyon (growth-momentum.ts `realize` ile AYNI konvansiyon). */
export function realRoePct(roeRatio: number | null, inflationYoy: number | null): number | null {
  if (roeRatio === null || !Number.isFinite(roeRatio)) return null;
  const nominalPct = roeRatio * 100;
  if (inflationYoy === null) return Math.round(nominalPct * 10) / 10;
  return Math.round((nominalPct - inflationYoy) * 10) / 10;
}

/** Reel ROE % → 0-100 alt skoru. −20%→0 · 0%→45 · +15%→100 */
function realRoeScore(realPct: number): number {
  const s = 45 + (realPct / 15) * 55;
  return Math.max(0, Math.min(100, Math.round(s)));
}

// ── Kademe 2: gelir kalitesi + marj + risk maliyeti ────────────────────────

const div = (a: number | null, b: number | null): number | null =>
  a == null || b == null || b === 0 ? null : a / b;

/** İki dönemin ortalaması — payda olarak stok kalemleri (krediler/aktif) için. */
const avg = (a: number | null, b: number | null): number | null =>
  a == null ? b : b == null ? a : (a + b) / 2;

const pp = (a: number | null, b: number | null): number | null =>
  a == null || b == null ? null : Math.round((a - b) * 1000) / 10; // oran farkı → puan

/**
 * Kademe 2 ölçümleri. Payda olarak stok kalemlerinde DÖNEM ORTALAMASI kullanılır
 * (TL enflasyonunda dönem-sonu bakiye akış kalemini sistematik olarak küçük gösterir).
 * `prev` yoksa ortalama alınamaz → dönem-sonu bakiyesi kullanılır (hafif muhafazakâr).
 */
export function computeBankMetrics(fin: BankFinancials): BankMetrics {
  const { ttm, prev } = fin;
  const core = ttm.netInterestIncome != null && ttm.netFeeIncome != null
    ? ttm.netInterestIncome + ttm.netFeeIncome : null;
  const coreIncomeRatio = div(core, ttm.totalOperatingIncome);
  const tradingShare = div(ttm.tradingProfit, ttm.totalOperatingIncome);
  const nimProxy = div(ttm.netInterestIncome, avg(ttm.totalAssets, prev?.totalAssets ?? null));
  const corRatio = div(ttm.provisions, avg(ttm.loans, prev?.loans ?? null));
  const costIncome = div(ttm.operatingExpense, ttm.totalOperatingIncome);

  let prevNim: number | null = null, prevCor: number | null = null, prevCore: number | null = null;
  if (prev) {
    prevNim = div(prev.netInterestIncome, prev.totalAssets);
    prevCor = div(prev.provisions, prev.loans);
    const pc = prev.netInterestIncome != null && prev.netFeeIncome != null
      ? prev.netInterestIncome + prev.netFeeIncome : null;
    prevCore = div(pc, prev.totalOperatingIncome);
  }

  return {
    coreIncomeRatio,
    tradingShare,
    nimProxy: nimProxy == null ? null : Math.round(nimProxy * 1000) / 10,
    corBps: corRatio == null ? null : Math.round(corRatio * 10000),
    costIncome,
    nimDeltaPp: pp(nimProxy, prevNim),
    corDeltaBps: corRatio == null || prevCor == null ? null : Math.round((corRatio - prevCor) * 10000),
    coreRatioDeltaPp: pp(coreIncomeRatio, prevCore),
    netIncomeGrowthPct:
      ttm.netIncome == null || prev?.netIncome == null || prev.netIncome === 0
        ? null
        : Math.round(((ttm.netIncome - prev.netIncome) / Math.abs(prev.netIncome)) * 1000) / 10,
  };
}

/** Çekirdek gelir oranı → 0-100. %50→30 · %75→65 · %90→90 */
function coreRatioScore(r: number): number {
  return Math.max(0, Math.min(100, Math.round((r - 0.3) * 150)));
}

/**
 * Kademe 2 bayrakları (BANKA-MOTORU-PLAN K2-5).
 *
 * ⚠️ KAPSAM DÜRÜSTLÜĞÜ: NPL / coverage / Stage 2 İş Yatırım şablonunda YOK
 * (K0 spike: `1AFD`/`1AFE` hep 0). Bu yüzden planın "karşılık ertelemesi üçlüsü"
 * (coverage↓ + NPL↑ + kâr↑) KURULAMAZ. Yerine ölçülebilir ve daha ZAYIF bir
 * yakınsama kullanılır: risk maliyeti (CoR) belirgin düşerken net kâr artıyorsa
 * kârın bir kısmı karşılık giderindeki azalmadan geliyor demektir. Bu, coverage
 * kanıtı DEĞİLDİR ve rozet metni de öyle iddia etmez.
 * SYR/CET1 ve TÜFEX bayrakları üretilmez — veri yok, tahmin edilmez.
 */
function tier2Flags(m: BankMetrics, ctx: BankSectorContext | null): { flags: BankFlag[]; redFlag: boolean } {
  const flags: BankFlag[] = [];
  let redFlag = false;
  const pct = (v: number) => `%${Math.round(v * 100)}`;

  // Ticari ZARAR: pay negatifse çekirdek oran %100'ü aşar (zarar toplam geliri düşürür).
  // Bu aritmetik olarak doğru ama "çekirdek güçlü" rozetiyle tek başına gösterilirse
  // ticari masadaki kaybı gizler → ayrı uyarı üretilir.
  const tradingLoss = m.tradingShare != null && m.tradingShare <= -0.15;
  if (tradingLoss) {
    flags.push({ id: 'bank-trading-loss', tone: 'warn', text: 'Ticari işlemler geliri baskılıyor',
      detail: `Ticari zarar toplam gelirin ${pct(Math.abs(m.tradingShare!))}'i kadar` });
  }

  // Gelir kalitesi — kullanıcının çekirdek sorusu: "kâr gerçek mi?"
  if (m.coreIncomeRatio != null) {
    if (m.coreIncomeRatio >= 0.75) {
      flags.push({ id: 'bank-core-strong', tone: 'pos', text: 'Çekirdek gelir güçlü',
        detail: `Faiz + komisyon geliri toplam gelirin ${pct(m.coreIncomeRatio)}'i` });
    } else if (m.coreIncomeRatio < 0.55) {
      const tradingHeavy = m.tradingShare != null && m.tradingShare > 0.25;
      redFlag = redFlag || tradingHeavy;
      flags.push({ id: 'bank-core-weak', tone: 'warn',
        text: tradingHeavy ? 'Kâr ticari gelirden — sürdürülemez' : 'Çekirdek gelir payı düşük',
        detail: `Çekirdek ${pct(m.coreIncomeRatio)}`
          + (m.tradingShare != null ? ` · ticari kâr ${pct(m.tradingShare)}` : '') });
    }
  }

  // Faiz marjı (proxy) trendi — sektöre GÖRE
  if (m.nimDeltaPp != null) {
    const med = ctx?.nimDeltaMedianPp ?? null;
    const rel = med !== null ? m.nimDeltaPp - med : null;
    const up = rel !== null ? rel >= 0.75 : m.nimDeltaPp >= 1.5;
    const down = rel !== null ? rel <= -0.75 : m.nimDeltaPp <= -0.5;
    const suffix = med !== null ? ` (sektör medyanı ${med >= 0 ? '+' : ''}${med.toFixed(1)})` : '';
    if (up) {
      flags.push({ id: 'bank-nim-up', tone: 'pos',
        text: med !== null ? 'Faiz marjı emsalinden hızlı genişliyor' : 'Faiz marjı genişliyor',
        detail: `Marj proxy'si yıllık ${m.nimDeltaPp >= 0 ? '+' : ''}${m.nimDeltaPp.toFixed(1)} puan${suffix}` });
    } else if (down) {
      flags.push({ id: 'bank-nim-down', tone: 'warn',
        text: med !== null ? 'Faiz marjı emsalinin gerisinde' : 'Faiz marjı daralıyor',
        detail: `Marj proxy'si yıllık ${m.nimDeltaPp >= 0 ? '+' : ''}${m.nimDeltaPp.toFixed(1)} puan${suffix}` });
    }
  }

  // Risk maliyeti (CoR) — sektöre GÖRE
  if (m.corDeltaBps != null) {
    const med = ctx?.corDeltaMedianBps ?? null;
    const rel = med !== null ? m.corDeltaBps - med : null;
    if (rel !== null ? rel >= 50 : m.corDeltaBps >= 100) {
      flags.push({ id: 'bank-cor-up', tone: 'warn', text: 'Kredi risk maliyeti emsalinden hızlı artıyor',
        detail: `Karşılık gideri/krediler yıllık +${m.corDeltaBps} baz puan`
          + (med !== null ? ` (sektör medyanı ${med >= 0 ? '+' : ''}${med})` : '') });
    }
  }

  // Karşılık azalmasından beslenen kâr (coverage kanıtı DEĞİL — zayıf yakınsama)
  if (m.corDeltaBps != null && m.corDeltaBps <= -50 && (m.netIncomeGrowthPct ?? 0) > 10) {
    flags.push({ id: 'bank-cor-relief', tone: 'warn',
      text: 'Kâr artışı karşılık giderindeki düşüşten besleniyor',
      detail: `Risk maliyeti ${m.corDeltaBps} baz puan gerilerken net kâr %${m.netIncomeGrowthPct!.toFixed(0)} arttı` });
  }

  // Verimlilik
  if (m.costIncome != null && m.costIncome > 0.6) {
    flags.push({ id: 'bank-cost-high', tone: 'warn', text: 'Faaliyet giderleri geliri baskılıyor',
      detail: `Maliyet/gelir ${pct(m.costIncome)}` });
  }

  return { flags, redFlag };
}

const empty = (reason: string): BankHealth => ({
  applicable: false, tier: 1, score: null, verdict: 'olculemedi', institution: 'finans',
  flags: [], redFlag: false, dataQuality: 'yok', reason, metrics: null, outlook: null,
});

/**
 * Kademe 1 banka değerlendirmesi.
 *
 * Tespit edebildikleri (sınırlı ama gerçek):
 *  🔴 Reel ROE negatif → nominal kâr yüksek olsa da özkaynak değer KAYBEDİYOR
 *  🟠 Emsale göre pahalı VE ROE emsal altında → çifte olumsuz
 * Tespit EDEMEDİKLERİ (Kademe 2'ye ait, burada iddia edilmez):
 *  karşılık ertelemesi · ticari kâr bağımlılığı · Stage 2 · SYR erimesi · TÜFEX
 */
export function computeBankHealth(input: BankHealthInput): BankHealth {
  if (!isBankSector(input.sectorId)) return empty('Banka sektörü değil — sanayi rotası geçerli');

  const { peer, roe, inflationYoy } = input;
  const flags: BankFlag[] = [];
  const real = realRoePct(roe, inflationYoy);

  // Hiçbir girdi yoksa skor UYDURULMAZ (Kademe 2 mali tablosu da yoksa).
  if (real === null && (peer === null || !peer.reliable) && !input.financials) {
    return { ...empty('Banka için peer medyanı, ROE ve mali tablo verisi yok'), applicable: true };
  }

  // ── Reel getiri ────────────────────────────────────────────────────
  // KALİBRASYON (canlı ölçümle düzeltildi): TÜFE ~%32 iken BIST bankalarının ROE'si
  // ~%15-33 → reel ROE neredeyse TÜM sektörde negatif (8 bankanın 7'si). "Reel negatif"
  // tek başına sert bayrak yapılırsa bankaların tamamı 40 tavanına çarpar ve üründen
  // silinir — planın "banka ya sessizce elenir ya denetimsiz geçer, ikisi de kabul
  // edilemez" ilkesine aykırı. Sektör GENELİNDE geçerli bir olgu ayrıştırıcı değildir.
  // Çözüm: uyarı HER ZAMAN gösterilir (şeffaflık), ama VETO yalnız hisse emsalinden
  // GERİ kaldığında (ROE sektör medyanının altında) veya reel kayıp derinken tetiklenir.
  let redFlag = false;
  const peerRoeMedian = peer?.roe.median ?? null;
  if (real !== null) {
    if (real < 0) {
      const laggard = peerRoeMedian !== null && roe !== null && roe < peerRoeMedian;
      const deep = real <= DEEP_REAL_LOSS_PP;
      redFlag = laggard || deep;
      flags.push({
        id: 'bank-real-roe-neg', tone: 'warn',
        text: redFlag ? 'Reel getiri negatif, emsalinin de gerisinde' : 'Nominal kâr var, reel getiri negatif',
        detail: inflationYoy !== null
          ? `ROE %${(roe! * 100).toFixed(0)} − enflasyon %${inflationYoy.toFixed(0)} = reel %${real.toFixed(1)}`
            + (laggard ? ` · sektör medyanı %${(peerRoeMedian! * 100).toFixed(0)}` : '')
          : undefined,
      });
    } else if (real >= 5) {
      flags.push({ id: 'bank-real-roe-pos', tone: 'pos', text: 'Reel getiri pozitif', detail: `Reel ROE %${real.toFixed(1)}` });
    }
  }

  // ── Emsal konumu (yalnız güvenilir medyanda — n<5'te verdict zayıf) ──
  const peerOk = peer !== null && peer.reliable;
  const roeBelowPeer = peerOk && peer.roe.pctVsMedian !== null && peer.roe.pctVsMedian < 0;
  if (peerOk) {
    if (peer.relativeScore < 40 && roeBelowPeer) {
      flags.push({
        id: 'bank-expensive-weak-roe', tone: 'warn',
        text: 'Emsaline göre pahalı ve kârlılığı düşük',
        detail: `Emsal skoru ${peer.relativeScore}/100 · ROE sektör medyanının %${Math.abs(peer.roe.pctVsMedian!)} altında`,
      });
    } else if (peer.relativeScore > 60 && !roeBelowPeer) {
      flags.push({
        id: 'bank-cheap-strong-roe', tone: 'pos',
        text: 'Emsaline göre ucuz, kârlılığı sektör üstü',
        detail: `Emsal skoru ${peer.relativeScore}/100`,
      });
    }
  }

  // ── Bileşik skor — mevcut bileşenlerin ağırlıklı ortalaması ─────────
  // Bileşen yoksa ağırlık YENİDEN NORMALİZE edilir (long-term-runner deseni):
  // eksik veri sıfır sayılıp skoru haksızca ezmez.
  const parts: Array<{ v: number; w: number }> = [];
  if (real !== null) parts.push({ v: realRoeScore(real), w: 40 });
  if (peerOk) parts.push({ v: peer.relativeScore, w: 30 });

  // ── Kademe 2: gelir kalitesi + marj + risk maliyeti (mali tablo varsa) ──
  let metrics: BankMetrics | null = null;
  let tier: 1 | 2 = 1;
  if (input.financials) {
    metrics = computeBankMetrics(input.financials);
    const t2 = tier2Flags(metrics, input.sectorContext ?? null);
    flags.push(...t2.flags);
    redFlag = redFlag || t2.redFlag;
    if (metrics.coreIncomeRatio !== null) {
      // Çekirdek gelir kalitesi Kademe 2'nin ana katkısı — reel ROE ile benzer ağırlıkta.
      parts.push({ v: coreRatioScore(metrics.coreIncomeRatio), w: 30 });
      tier = 2;
    } else if (metrics.nimProxy !== null || metrics.corBps !== null) {
      tier = 2; // ölçüm var ama skorlanabilir çekirdek oran yok → bayraklar yine üretildi
    }
  }

  const totalW = parts.reduce((s, p) => s + p.w, 0);
  const score = totalW > 0 ? Math.round(parts.reduce((s, p) => s + p.v * p.w, 0) / totalW) : null;

  const verdict: BankHealth['verdict'] =
    score === null ? 'olculemedi' : redFlag || score < 40 ? 'zayif' : score >= 60 ? 'saglikli' : 'notr';

  return {
    applicable: true,
    tier,
    // Banka tablosu YOKSA "banka" iddia edilmez (aracı kurum/leasing/faktoring olabilir).
    institution: input.financials ? 'banka' : 'finans',
    score,
    verdict,
    flags,
    redFlag,
    // 'tam' İDDİA EDİLMEZ: Kademe 2'de bile NPL/coverage/Stage 2/SYR/TÜFEX yok
    // (İş Yatırım şablonunda mevcut değil). En iyi durum "geniş"tir.
    dataQuality: tier === 2 ? 'geniş' : 'kısmi',
    metrics,
    outlook: computeBankOutlook(input.analyst),
  };
}
