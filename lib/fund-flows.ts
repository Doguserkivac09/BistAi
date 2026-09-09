/**
 * Fon para akımı motoru (FON-ANALIZ-PLAN F3 / FON-BACKFILL-PLAN FAZ 5).
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  ⚠️ AKIMI FON BÜYÜKLÜĞÜNDEN HESAPLAMA. BU EN SIK YAPILAN HATADIR.
 *
 *    ❌ YANLIŞ:  Δ(fon büyüklüğü)
 *       Fon büyüklüğü = pay adedi × birim pay değeri. Fiyat arttığında büyüklük
 *       de artar — hiç para girmemiş olsa bile. Yükselen piyasada bu yöntem her
 *       fona sahte "para girişi" yazar.
 *
 *    ✅ DOĞRU:   Δ(tedavüldeki pay adedi) × ortalama birim pay değeri
 *       Pay adedi YALNIZCA yatırımcı alım/satım yaptığında değişir; fiyat
 *       hareketinden etkilenmez. Akımın tek dürüst kaynağı budur.
 *
 *  Bu ayrım `lib/__tests__/fund-flows.test.ts` içinde regresyona kilitlendi
 *  ("pay sabit + fiyat değişti → akım SIFIR"). Sadeleştirmek isteyen gelecekteki
 *  okuyucu: o testi kırmadan bu formülü değiştiremezsin.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ KALİBRASYON KURALI (bu projede 3. kez): mutlak ölçüm = BAĞLAM, ayrıştırıcı
 * bayrak = KATEGORİ EMSALİNE GÖRELİ. Piyasa genelinde çıkış varken "para çıkışı
 * var" tüm evrende tetiklenir ve bilgi taşımaz.
 */

import type { FlowPoint } from './fund-store';
import type { FundFlag } from './fund-runner';

/** Akım ölçümü için gereken en az gözlem (pay adedi dolu gün). */
export const MIN_FLOW_OBS = 5;

/** Anlamlı sayılan asgari pay adedi değişimi (%) — gürültü eşiği. */
const NOISE_PCT = 0.5;

export type FlowPattern =
  | 'kurumsal-giris'    // pay ↑, yatırımcı sayısı ~sabit
  | 'perakende-akini'   // pay ↑, yatırımcı sayısı ↑↑ (genelde geç para)
  | 'cikis'             // pay ↓
  | 'notr';

export interface FlowMetrics {
  /** Ölçüm penceresindeki net akım (TL). Pozitif = giriş. */
  netFlowTL: number | null;
  /** Pay adedi değişimi (%) — akımın yön ve şiddet kaynağı. */
  sharesChangePct: number | null;
  /** Yatırımcı sayısı değişimi (%) — perakende/kurumsal ayrımı. */
  investorsChangePct: number | null;
  /** Akımın dönem sonu büyüklüğe oranı (%) — kapasite göstergesi. */
  flowToSizePct: number | null;
  pattern: FlowPattern | null;
  observations: number;
  from: string | null;
  to: string | null;
}

const pct = (a: number, b: number): number | null =>
  b === 0 || !Number.isFinite(a) || !Number.isFinite(b) ? null : ((a - b) / Math.abs(b)) * 100;

/**
 * Pencere içindeki net akımı ölçer.
 *
 * `windowDays` son N takvim gününe bakar; pay adedi dolu ilk/son gözlem
 * kullanılır (arada boş gün olması sorun değil).
 */
export function computeFlows(series: FlowPoint[], windowDays = 30): FlowMetrics {
  const bos: FlowMetrics = {
    netFlowTL: null, sharesChangePct: null, investorsChangePct: null,
    flowToSizePct: null, pattern: null, observations: 0, from: null, to: null,
  };
  if (!series || series.length === 0) return bos;

  const sirali = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const son = sirali[sirali.length - 1]!;
  const cutoff = new Date(Date.parse(`${son.date}T00:00:00Z`) - windowDays * 86_400_000)
    .toISOString().slice(0, 10);

  // Yalnız pay adedi DOLU gözlemler — null'ı 0 saymak sahte dev akım üretirdi.
  const pencere = sirali.filter((p) => p.date >= cutoff && p.shares != null && Number.isFinite(p.shares!));
  if (pencere.length < MIN_FLOW_OBS) return { ...bos, observations: pencere.length };

  const ilk = pencere[0]!;
  const sonN = pencere[pencere.length - 1]!;

  const paySon = sonN.shares!;
  const payIlk = ilk.shares!;
  const dPay = paySon - payIlk;

  // Ortalama birim pay değeri — akımın hangi fiyattan gerçekleştiği bilinmiyor,
  // dönem ortalaması en dürüst yaklaşım (uç fiyatla çarpmak akımı şişirir).
  const fiyatlar = pencere.map((p) => p.price).filter((x) => Number.isFinite(x) && x > 0);
  const ortFiyat = fiyatlar.length ? fiyatlar.reduce((s, x) => s + x, 0) / fiyatlar.length : null;

  const netFlowTL = ortFiyat == null ? null : dPay * ortFiyat;
  const sharesChangePct = pct(paySon, payIlk);

  const yatSon = sonN.investors;
  const yatIlk = ilk.investors;
  const investorsChangePct = yatSon != null && yatIlk != null ? pct(yatSon, yatIlk) : null;

  const buyukluk = ortFiyat != null ? paySon * ortFiyat : null;
  const flowToSizePct =
    netFlowTL != null && buyukluk != null && buyukluk > 0 ? (netFlowTL / buyukluk) * 100 : null;

  return {
    netFlowTL,
    sharesChangePct,
    investorsChangePct,
    flowToSizePct,
    pattern: derivePattern(sharesChangePct, investorsChangePct),
    observations: pencere.length,
    from: ilk.date,
    to: sonN.date,
  };
}

/**
 * Akımın YORUMU — akım tek başına "iyi" değildir, ters okunur:
 *  - pay ↑ + yatırımcı ~sabit  → kurumsal para (az sayıda büyük alıcı)
 *  - pay ↑ + yatırımcı ↑↑      → perakende akını (genelde geçmiş getiriyi
 *                                 kovalayan geç para)
 *  - pay ↓                     → çıkış (yönetici zorunlu satış yapabilir)
 */
export function derivePattern(
  sharesChangePct: number | null,
  investorsChangePct: number | null,
): FlowPattern | null {
  if (sharesChangePct == null) return null;
  if (sharesChangePct < -NOISE_PCT) return 'cikis';
  if (sharesChangePct <= NOISE_PCT) return 'notr';
  // Giriş var: yatırımcı sayısı da pay kadar hızlı büyüyorsa perakende.
  if (investorsChangePct != null && investorsChangePct > sharesChangePct * 0.5) return 'perakende-akini';
  return 'kurumsal-giris';
}

/**
 * Akım bayrakları — KATEGORİ MEDYANINA GÖRELİ (kalibrasyon kuralı).
 *
 * `peerMedianSharesChangePct` yoksa (n < MIN_PEER) ayrıştırıcı bayrak
 * ÜRETİLMEZ; rozet sektör iddia edemez. Yalnız kapasite/erime gibi fonun
 * KENDİ ölçeğine bağlı mutlak uyarılar kalır.
 */
export function flowFlags(
  f: FlowMetrics,
  peerMedianSharesChangePct: number | null,
  sizeTL: number | null,
): FundFlag[] {
  const flags: FundFlag[] = [];
  if (f.sharesChangePct == null) return flags;

  const fmt = (x: number) => `${x >= 0 ? '+' : ''}%${x.toFixed(1)}`;

  // ── AYRIŞTIRICI: emsale göreli ──
  if (peerMedianSharesChangePct != null) {
    const fark = f.sharesChangePct - peerMedianSharesChangePct;
    if (fark > 5) {
      flags.push({
        id: 'fon-akim-emsalustu', tone: 'pos',
        text: 'Emsallerinden daha fazla para çekiyor',
        detail: `Pay adedi ${fmt(f.sharesChangePct)} · kategori medyanı ${fmt(peerMedianSharesChangePct)}`,
      });
    } else if (fark < -5) {
      flags.push({
        id: 'fon-akim-emsalalti', tone: 'warn',
        text: 'Emsallerine göre para çıkışı yaşıyor',
        detail: `Pay adedi ${fmt(f.sharesChangePct)} · kategori medyanı ${fmt(peerMedianSharesChangePct)}`,
      });
    }
  }

  // ── MUTLAK (fonun kendi ölçeğine bağlı — bağlam değil, gerçek risk) ──
  // Kapasite: küçük fona hızlı giriş, yöneticinin aynı stratejiyi uygulamasını zorlaştırır.
  //
  // ⚠️ EŞİK CANLI VERİYLE KALİBRE EDİLMELİ: bu projede iki kez, evrenin
  // neredeyse tamamında tetiklenen bir bayrak "bilgi taşımıyor" diye
  // düzeltildi (banka reel-ROE, banka NIM trendi). İlk gerçek koşuda
  // "evrenin yüzde kaçında tetikleniyor" ölçülmeli; %70'in üstündeyse bu
  // bayrak bağlama çevrilir veya emsale göreli yapılır.
  const KUCUK_FON_TL = 500_000_000;
  const KAPASITE_ESIK_PCT = 30;
  if (f.flowToSizePct != null && f.flowToSizePct > KAPASITE_ESIK_PCT && sizeTL != null && sizeTL < KUCUK_FON_TL) {
    flags.push({
      id: 'fon-kapasite', tone: 'warn',
      text: 'Hızlı büyüyor — kapasite baskısı olabilir',
      detail: `Dönem akımı büyüklüğün ${fmt(f.flowToSizePct)}'i kadar`,
    });
  }
  // Erime: sürekli çıkış → zorunlu satış + kapanma riski.
  if (f.sharesChangePct < -25) {
    flags.push({
      id: 'fon-eriyor', tone: 'warn',
      text: 'Fon küçülüyor — sürekli çıkış var',
      detail: `Pay adedi ${fmt(f.sharesChangePct)}`,
    });
  }
  // Perakende akını bağlam olarak gösterilir (yargı değil, bilgi).
  if (f.pattern === 'perakende-akini' && f.sharesChangePct > 10) {
    flags.push({
      id: 'fon-perakende-akini', tone: 'neutral',
      text: 'Yoğun bireysel yatırımcı girişi',
      detail: `Yatırımcı sayısı ${f.investorsChangePct != null ? fmt(f.investorsChangePct) : '?'}`,
    });
  }

  return flags;
}

// ── FAZ 6B: dönemsel yatırımcı değişimi ─────────────────────────────────────

/**
 * `days` takvim günü öncesine göre yatırımcı sayısı değişimi (%).
 *
 * Dönemsel getiri tablosunun yanında gösterilir — ürünün asıl sorusu
 * "getiri ne oldu" değil, **"getiri ne olurken yatırımcı ne yaptı"**.
 *
 * ⚠️ KAPSAMA DİSİPLİNİ (`coversPeriod` ile aynı kural): elde yalnız 10 günlük
 * veri varken "1 yıllık değişim" diye 10 günün değişimini yazmak yalandır.
 * Aralık, istenen dönemin %90'ını kapsamıyorsa **null** döner.
 *
 * ⚠️ Boş gözlemler ATLANIR, 0 SAYILMAZ (fund-flows'un temel kuralı).
 *
 * @param days -1 verilirse YTD (yılbaşından beri) — kapsama kuralı uygulanmaz,
 *             çünkü YTD tanımı gereği kısmi bir dönemdir.
 */
export function investorChangeOverDays(series: FlowPoint[], days: number): number | null {
  const dolu = [...series]
    .filter((p) => p.investors != null && Number.isFinite(p.investors))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (dolu.length < 2) return null;

  const son = dolu[dolu.length - 1]!;
  let pencere: FlowPoint[];

  if (days < 0) {
    const yilBasi = `${son.date.slice(0, 4)}-01-01`;
    pencere = dolu.filter((p) => p.date >= yilBasi);
  } else {
    const kesim = new Date(Date.parse(`${son.date}T00:00:00Z`) - days * 86_400_000)
      .toISOString().slice(0, 10);
    pencere = dolu.filter((p) => p.date >= kesim);
    // Kapsama: en eski gözlem ile son gözlem arası dönemin %90'ı olmalı.
    if (pencere.length < 2) return null;
    const span = (Date.parse(pencere[pencere.length - 1]!.date) - Date.parse(pencere[0]!.date)) / 86_400_000;
    if (span < days * 0.9) return null;
  }

  if (pencere.length < 2) return null;
  return pct(pencere[pencere.length - 1]!.investors!, pencere[0]!.investors!);
}
