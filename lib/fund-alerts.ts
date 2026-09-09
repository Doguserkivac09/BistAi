/**
 * Fon erken uyarı motoru (FON-FAZ6-PLAN 6A).
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  ⚠️ BU DOSYA BİR ALFA İDDİASI TAŞIR — ÖNCE ÖLÇÜLDÜ, SONRA YAYINLANDI.
 *
 *  Çekirdek hipotez: "yatırımcı kaçışı, fiyat düşüşünden ÖNCE gelir."
 *  Tek vakadan (PHE) doğdu. Tek vaka kanıt değildir; bu yüzden
 *  `scripts/fund-alert-backtest.ts` aynı fonksiyonları 240 günlük geçmişe
 *  uygular ve taban orana karşı ölçer. Ölçüm geçmezse `divergence` sinyali
 *  UYARI değil, nötr BAĞLAM olarak gösterilir (bkz. `alertTone`).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ LOOK-AHEAD BIAS'A KAPALI: her fonksiyon seriyi "verilen son nokta = şimdi"
 * kabul eder ve GELECEĞE BAKMAZ. Backtest, seriyi t anında kesip çağırır; bu
 * sayede ölçtüğümüz şey ile canlıda yayınladığımız şey AYNI koddur. Bu dosyaya
 * "kolaylık olsun" diye tüm seriyi gören bir kısayol eklemek, backtest'i
 * sessizce geçersiz kılar.
 *
 * ⚠️ KALİBRASYON KURALI (bu projede 4. kez): mutlak ölçüm = BAĞLAM, ayrıştırıcı
 * bayrak = EMSALE GÖRELİ. Piyasa geneli düşerken "sert değer kaybı" tüm evrende
 * tetiklenir ve bilgi taşımaz — bu yüzden kategori medyanı kapısı ZORUNLU.
 */

import type { FlowPoint } from './fund-store';
import type { FundFlag } from './fund-runner';

/** Z-skoru için gereken en az gözlem — altında dağılım anlamsız, sinyal ÜRETİLMEZ. */
export const MIN_DIST_OBS = 40;

/** Değişim dağılımının bakıldığı geçmiş (iş günü). */
export const DIST_WINDOW = 90;

/** Sinyal pencereleri (iş günü). */
export const SHORT_WINDOW = 5;
export const LONG_WINDOW = 20;

/** Yatırımcı çıkışının "olağandışı" sayıldığı z eşiği (negatif yön). */
export const FLIGHT_Z = -2;

/**
 * Ayrışmada fiyatın "henüz tepki vermemiş" sayıldığı üst sınır (%).
 * Fiyat bundan fazla düştüyse artık ayrışma değil, düpedüz çöküştür.
 */
export const DIVERGENCE_PRICE_FLOOR = -12;

/** Fon-özel sayılmak için kategori medyanının bu kadar altında olmalı (puan). */
export const PEER_GAP_PP = 8;

export type FundAlertId = 'fon-sert-dusus' | 'fon-yatirimci-kacisi' | 'fon-ayrisma';

export interface FundAlert {
  id: FundAlertId;
  /** Sade Türkçe — fon dili: gözlem bildirir, AL/SAT demez. */
  text: string;
  detail: string;
  /** Ölçülen büyüklükler — UI göstermese de denetlenebilirlik için taşınır. */
  metrics: {
    priceChangePct: number | null;
    peerMedianPct: number | null;
    investorsChangePct: number | null;
    investorsZ: number | null;
    sharesChangePct: number | null;
  };
}

export interface AlertInput {
  /** Fonun akım serisi — SON NOKTA "şimdi" kabul edilir, sonrası bilinmez. */
  series: FlowPoint[];
  /**
   * Aynı pencerede kategorinin medyan fiyat değişimi (%).
   * null ise (emsal yok / güvenilmez) fon-özellik iddiası EDİLEMEZ →
   * "sert düşüş" uyarısı üretilmez. Ayrışma sinyali fiyata değil akıma
   * dayandığı için emsalsiz de üretilebilir.
   */
  peerMedianPriceChangePct: number | null;
}

// ── Saf yardımcılar ─────────────────────────────────────────────────────────

const sirala = (s: FlowPoint[]) => [...s].sort((a, b) => a.date.localeCompare(b.date));

const yuzde = (yeni: number, eski: number): number | null =>
  !Number.isFinite(yeni) || !Number.isFinite(eski) || eski === 0
    ? null
    : ((yeni - eski) / Math.abs(eski)) * 100;

/**
 * `n` gözlem geriye giderek değişim (%). Alan boş olan günler ATLANIR —
 * null'ı 0 saymak sahte sıçrama üretir (fund-flows'daki aynı ders).
 */
function changeOverLast(
  series: FlowPoint[],
  n: number,
  sec: (p: FlowPoint) => number | null,
): number | null {
  const dolu = series.filter((p) => {
    const v = sec(p);
    return v != null && Number.isFinite(v);
  });
  if (dolu.length < 2) return null;
  const son = dolu[dolu.length - 1]!;
  // n gözlem geriye; yetmiyorsa en eskiye kadar (kısa geçmişte de ölçüm yapılır,
  // ama z-skoru ayrıca MIN_DIST_OBS kapısından geçmek zorunda).
  const gerideIdx = Math.max(0, dolu.length - 1 - n);
  const eski = dolu[gerideIdx]!;
  if (eski.date === son.date) return null;
  return yuzde(sec(son)!, sec(eski)!);
}

/** Ardışık dolu gözlemler arası yüzde değişim serisi. */
function changeSeries(series: FlowPoint[], sec: (p: FlowPoint) => number | null): number[] {
  const dolu = series.filter((p) => {
    const v = sec(p);
    return v != null && Number.isFinite(v);
  });
  const out: number[] = [];
  for (let i = 1; i < dolu.length; i++) {
    const d = yuzde(sec(dolu[i])!, sec(dolu[i - 1])!);
    if (d != null && Number.isFinite(d)) out.push(d);
  }
  return out;
}

export function ortalama(xs: number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((s, x) => s + x, 0) / xs.length;
}

export function medyan(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

/**
 * Örneklem standart sapması (n−1). Sabit seride 0 döner → z hesaplanamaz,
 * çağıran null döndürür (sıfıra bölüp Infinity üretmek YASAK).
 */
export function stdSapma(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const ort = ortalama(xs)!;
  const v = xs.reduce((s, x) => s + (x - ort) ** 2, 0) / (xs.length - 1);
  return v > 0 ? Math.sqrt(v) : null;
}

/**
 * Dönem değişiminin, fonun KENDİ günlük değişim dağılımına göre z-skoru.
 *
 * Dönem değişimi `n` günlük olduğu için günlük σ, √n ile ölçeklenir — aksi
 * halde 20 günlük birikimli değişim, günlük dağılıma karşı ölçülür ve her fon
 * "olağandışı" çıkar.
 */
export function periodZScore(
  gunlukDegisimler: number[],
  donemDegisimPct: number,
  n: number,
): number | null {
  if (gunlukDegisimler.length < MIN_DIST_OBS) return null;
  const ort = ortalama(gunlukDegisimler);
  const sd = stdSapma(gunlukDegisimler);
  if (ort == null || sd == null) return null;
  const beklenen = ort * n;
  const donemSd = sd * Math.sqrt(n);
  if (!(donemSd > 0)) return null;
  return (donemDegisimPct - beklenen) / donemSd;
}

// ── Sinyaller ───────────────────────────────────────────────────────────────

export interface AlertMeasurement {
  priceChangeShort: number | null;
  priceChangeLong: number | null;
  investorsChangeLong: number | null;
  investorsZ: number | null;
  sharesChangeLong: number | null;
  /** Z-skorunun dayandığı gözlem sayısı — yetersizse sinyal üretilmez. */
  distObs: number;
  asOf: string | null;
}

/**
 * Serinin SON gününe ait ölçümler. Gelecek bilgisi kullanılmaz.
 * Backtest bu fonksiyonu, seriyi t'de keserek çağırır.
 */
export function measureAlerts(series: FlowPoint[]): AlertMeasurement {
  const s = sirala(series);
  const bos: AlertMeasurement = {
    priceChangeShort: null, priceChangeLong: null, investorsChangeLong: null,
    investorsZ: null, sharesChangeLong: null, distObs: 0, asOf: null,
  };
  if (s.length === 0) return bos;

  const pencere = s.slice(-(DIST_WINDOW + LONG_WINDOW));
  const yatirimciDegisimleri = changeSeries(pencere, (p) => p.investors);
  const investorsChangeLong = changeOverLast(s, LONG_WINDOW, (p) => p.investors);

  return {
    priceChangeShort: changeOverLast(s, SHORT_WINDOW, (p) => p.price),
    priceChangeLong: changeOverLast(s, LONG_WINDOW, (p) => p.price),
    investorsChangeLong,
    investorsZ:
      investorsChangeLong == null
        ? null
        : periodZScore(yatirimciDegisimleri, investorsChangeLong, LONG_WINDOW),
    sharesChangeLong: changeOverLast(s, LONG_WINDOW, (p) => p.shares),
    distObs: yatirimciDegisimleri.length,
    asOf: s[s.length - 1]!.date,
  };
}

/**
 * Ölçümden uyarı üretir.
 *
 * Üç sinyal, plandaki sırayla. Hiçbiri veri yokluğunda "yok" varsaymaz —
 * ölçülemeyen sinyal üretilmez.
 */
export function buildAlerts(input: AlertInput): FundAlert[] {
  const m = measureAlerts(input.series);
  const out: FundAlert[] = [];
  const peer = input.peerMedianPriceChangePct;

  const metrics = (): FundAlert['metrics'] => ({
    priceChangePct: m.priceChangeShort,
    peerMedianPct: peer,
    investorsChangePct: m.investorsChangeLong,
    investorsZ: m.investorsZ,
    sharesChangePct: m.sharesChangeLong,
  });

  // ── 1. Sert değer kaybı — KATEGORİ KAPISI ZORUNLU ──
  // Ham yüzde tek başına kullanılmaz: tüm kategori düştüyse bu piyasadır,
  // fonun kusuru değildir ve uyarı olarak gösterilmesi yanıltıcıdır.
  if (m.priceChangeShort != null && peer != null && m.priceChangeShort < 0) {
    const fark = m.priceChangeShort - peer;
    if (fark <= -PEER_GAP_PP) {
      out.push({
        id: 'fon-sert-dusus',
        text: 'Emsallerinden belirgin şekilde daha çok değer kaybetti',
        detail:
          `Son ${SHORT_WINDOW} işlem gününde %${m.priceChangeShort.toFixed(1)} · ` +
          `aynı dönemde kategori medyanı %${peer.toFixed(1)}. ` +
          // Yön iddiası DEĞİL: ölçümde bu fonların ortalama getirisi pozitifti,
          // ama sert kayıp (≤ −%10) olasılığı 6 kata çıkıyordu.
          `Bu, düşüşün süreceği anlamına gelmez; sonucun daha oynak olduğu anlamına gelir.`,
        metrics: metrics(),
      });
    }
  }

  // ── 2. Yatırımcı kaçışı — fonun KENDİ geçmişine göre olağandışı mı ──
  if (m.investorsZ != null && m.investorsZ <= FLIGHT_Z && (m.investorsChangeLong ?? 0) < 0) {
    // Pay adedi ~sabitken yatırımcı düşüyorsa küçük yatırımcı çıkıyor;
    // pay çok daha hızlı düşüyorsa tek büyük itfa var. İkisi farklı olaylar.
    const pay = m.sharesChangeLong;
    const yat = m.investorsChangeLong!;
    const buyukItfa = pay != null && pay < yat * 1.5;
    out.push({
      id: 'fon-yatirimci-kacisi',
      text: buyukItfa
        ? 'Büyük bir çıkış yaşandı — pay adedi yatırımcı sayısından hızlı azaldı'
        : 'Olağandışı yatırımcı çıkışı var',
      detail:
        `Son ${LONG_WINDOW} işlem gününde yatırımcı sayısı %${yat.toFixed(1)} değişti ` +
        `(fonun kendi geçmişine göre ${m.investorsZ.toFixed(1)} standart sapma)` +
        (pay != null ? ` · pay adedi %${pay.toFixed(1)}` : ''),
      metrics: metrics(),
    });
  }

  // ── 3. ⭐ AYRIŞMA — bu fazın çekirdeği ──
  // Fiyat henüz tepki vermemişken (yatay/hafif negatif) yatırımcı sert çıkıyor.
  //
  // ⚠️ MUTLAK YÖN KAPISI ZORUNLU (canlı PHE verisinde yakalandı, 2026-09-09):
  // yalnız z-skoruna bakan ilk sürüm, yatırımcı sayısı **+%39 ARTMIŞKEN**
  // "yatırımcı çıkışı var" diyordu — çünkü hızlı büyüyen fonun kendi
  // dağılımında ortalama günlük artış çok yüksek olduğu için +%39 bile
  // "beklenenin altında" kalıp z'yi −2'ye indiriyordu. Göreli ölçüm yönü
  // belirlemez; çıkış demek için gerçekten çıkış olmalı.
  if (
    m.investorsZ != null && m.investorsZ <= FLIGHT_Z &&
    m.investorsChangeLong != null && m.investorsChangeLong < 0 &&
    m.priceChangeLong != null && m.priceChangeLong >= DIVERGENCE_PRICE_FLOOR
  ) {
    out.push({
      id: 'fon-ayrisma',
      text: 'Fiyat henüz tepki vermeden yatırımcı çıkışı var',
      detail:
        `Son ${LONG_WINDOW} işlem gününde fiyat %${m.priceChangeLong.toFixed(1)} ` +
        `iken yatırımcı sayısı %${(m.investorsChangeLong ?? 0).toFixed(1)} azaldı`,
      metrics: metrics(),
    });
  }

  return out;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  6A-0 ÖLÇÜM SONUCU (2026-09-09) — `scripts/fund-alert-backtest.ts`
 *
 *  TEFAS 288.923 fon-gün · BES 58.395 fon-gün · sonraki 20 işlem günü getirisi.
 *  "kötü sonuç" = ≤ −%10. Epizot = ardışık tetikler tek olay sayılır.
 *
 *  | sinyal              | epizot | kötü sonuç | taban | tetiklenme |
 *  |---------------------|--------|------------|-------|------------|
 *  | fon-sert-dusus      |  1.390 |    %21,5   | %3,5  |   %1,87    |  ✅
 *  | fon-yatirimci-kacisi|  1.179 |     %2,8   | %3,5  |   %6,79    |  ❌
 *  | fon-ayrisma         |  1.157 |     %2,2   | %3,5  |   %6,65    |  ❌
 *
 *  ❌ AYRIŞMA HİPOTEZİ ÇÜRÜTÜLDÜ. PHE gerçek bir vakaydı ama TEK vakaydı;
 *     289 bin fon-günde desen tekrar etmiyor. Tetiklendikten sonra kötü sonuç
 *     olasılığı taban orandan DAHA DÜŞÜK. Aynı sinyal PHE'nin kendi geçmişinde
 *     Haziran'da da yandı ve sonraki 20 günde +%29 geldi. BES'te de aynı
 *     (%0,4 vs taban %0,8).
 *
 *  ✅ SERT DÜŞÜŞ doğrulandı: kötü sonuç olasılığını 6 katına çıkarıyor ve
 *     evrenin yalnız %1,87'sinde tetikliyor (kalibrasyon kuralına uygun).
 *     ⚠️ Ama ortalama getirisi POZİTİF (+%7,3) — bu bir YÖN tahmini değil,
 *     dağılımın genişlediği uyarısıdır. Metni buna göre yazıldı.
 *
 *  Ölçüm derin geçmişle (3-5 yıl) tekrarlanabilir; o zaman bu tablo güncellenir.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Ölçümde ayrıştırıcı çıkan — yalnız bunlar rozet olarak YAYINLANIR. */
const YAYINLANAN: ReadonlySet<FundAlertId> = new Set<FundAlertId>(['fon-sert-dusus']);

/**
 * Uyarıları rozet kanalına çevirir.
 *
 * ⚠️ Ölçümde bilgi taşımayan sinyaller BURADA ELENİR — "nötr bağlam rozeti"
 * olarak bile gösterilmez: kullanıcı ekranda gördüğü her rozeti sinyal sayar,
 * ve çürütülmüş bir deseni göstermek onu yanlış yönlendirir. Ölçüm ham verisi
 * kaybolmaz; ayrışma detay sayfasındaki fiyat/yatırımcı grafiğinde ve dönemsel
 * tabloda gözle görülür — orada iddia yok, veri var.
 */
export function alertsToFlags(alerts: FundAlert[]): FundFlag[] {
  return alerts
    .filter((a) => YAYINLANAN.has(a.id))
    .map((a) => ({ id: a.id, tone: 'warn' as const, text: a.text, detail: a.detail }));
}
