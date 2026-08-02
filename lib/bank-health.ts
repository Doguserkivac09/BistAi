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

export interface BankHealthInput {
  sectorId: SectorId;
  /** Sektör emsal karşılaştırması (banka medyanı canlı doğrulanmış, n≈17) */
  peer: PeerValuation | null;
  /** Özkaynak kârlılığı — ORAN (0.45 = %45), Yahoo `returnOnEquity` */
  roe: number | null;
  /** TÜFE yıllık % (35.1 = %35,1) — null ise reelleştirme yapılmaz */
  inflationYoy: number | null;
}

export interface BankHealth {
  applicable: boolean;
  /** 1 = kısmi veri (peer + reel ROE) · 2 = tam banka motoru (Kademe 2) */
  tier: 1 | 2;
  /** 0-100; null = skorlanacak girdi yok */
  score: number | null;
  verdict: 'saglikli' | 'notr' | 'zayif' | 'olculemedi';
  flags: BankFlag[];
  /** Karar motoru için sert bayrak — bankanın `beneishSuspect`/`altmanDistress` karşılığı */
  redFlag: boolean;
  dataQuality: 'kısmi' | 'tam' | 'yok';
  reason?: string;
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

const empty = (reason: string): BankHealth => ({
  applicable: false, tier: 1, score: null, verdict: 'olculemedi',
  flags: [], redFlag: false, dataQuality: 'yok', reason,
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

  // Hiçbir girdi yoksa skor UYDURULMAZ.
  if (real === null && (peer === null || !peer.reliable)) {
    return { ...empty('Banka için peer medyanı ve ROE verisi yok'), applicable: true };
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
  if (real !== null) parts.push({ v: realRoeScore(real), w: 55 });
  if (peerOk) parts.push({ v: peer.relativeScore, w: 45 });
  const totalW = parts.reduce((s, p) => s + p.w, 0);
  const score = totalW > 0 ? Math.round(parts.reduce((s, p) => s + p.v * p.w, 0) / totalW) : null;

  const verdict: BankHealth['verdict'] =
    score === null ? 'olculemedi' : redFlag || score < 40 ? 'zayif' : score >= 60 ? 'saglikli' : 'notr';

  return {
    applicable: true,
    tier: 1,
    score,
    verdict,
    flags,
    redFlag,
    dataQuality: 'kısmi',
  };
}
