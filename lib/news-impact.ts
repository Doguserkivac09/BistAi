/**
 * "Haber Fiyatlandı mı?" — materyalite sınıflandırma + event-study etki analizi.
 *
 * 1) Haberi materyaliteye göre sınıfla (yüksek / orta / gürültü) — kural tabanlı.
 * 2) Material haber için, yayın zamanından (T) bu yana fiyat tepkisini ölç:
 *    anormal getiri (hisse − BIST100) + hacim z-skoru + haber yaşı → "fiyatlandı mı?".
 *
 * METODOLOJİ NOTU (neden günlük mum, intraday değil):
 *  - RSS pubDate "yayın zamanı"dır, gerçek KAP bildirim saati DEĞİLDİR (saatlerce
 *    gecikebilir). Intraday mumla T'ye dakika hassasiyetinde hizalamak sahte
 *    hassasiyet üretir. Üstelik likit olmayan BIST hisselerinde Yahoo saatlik
 *    verisi boşluklu/eksiktir.
 *  - Günlük mum sağlamdır: Yahoo'nun CANLI son günlük mumu close = anlık fiyat,
 *    yani bugün çıkan haberin gün-içi tepkisi de "dün kapanış → şu an" penceresinde
 *    görünür. Olay penceresi ±1 gün toleranslıdır.
 *  - Sonuç OLASILIKSALDIR, yatırım tavsiyesi değildir.
 */

import type { OHLCVCandle } from '@/types'
import type { SymbolNewsItem } from './symbol-news'

export type Materiality = 'yüksek' | 'orta' | 'gürültü'
export type PricedVerdict =
  | 'fiyatlandı'
  | 'fiyatlanıyor'
  | 'henüz-fiyatlanmadı'
  | 'tepkisiz'
  | 'ölçülemedi'

export interface NewsImpact extends SymbolNewsItem {
  materiality: Materiality
  kategori: string
  ar: number | null         // anormal getiri (oran, 0.08 = %8) = hisse − endeks
  hamGetiri: number | null  // hissenin ham getirisi (oran)
  indexGetiri: number | null // aynı pencerede endeks getirisi (oran)
  hacimOran: number | null  // olay sonrası ort hacim / 20-mum ort (×kat)
  hacimZ: number | null     // hacim z-skoru ((Vpost − μ)/σ) — istatistiksel anlamlılık
  hacimSpike: boolean       // hacim olağandışı yükseldi mi
  esik: number              // bu hisse için kullanılan "anlamlı AR" eşiği (oran)
  yasSaat: number           // haber yaşı (saat)
  yon: 'pozitif' | 'negatif' | 'nötr'
  anticipation: boolean     // T'den ÖNCE zaten anlamlı hareket olmuş mu (önceden satın alma)
  anticipationAr: number | null // olay öncesi 3-mum anormal getirisi
  verdict: PricedVerdict
  // ── Opsiyonel AI katmanı (route bütçe varsa doldurur) ──
  aiDuygu?: 'pozitif' | 'negatif' | 'nötr'
  aiNot?: string
  aiMateryalite?: number    // 1-5
}

// ── Materyalite kuralları ───────────────────────────────────────────────────

const HIGH_RULES: { kw: string[]; kategori: string }[] = [
  { kw: ['sözleşme', 'ihale', 'sipariş', 'kontrat', 'satın al', 'devral', 'devir', 'birleşme', 'iş birliği', 'işbirliği', 'tedarik', 'imzala', 'anlaşma sağla'], kategori: 'Sözleşme/M&A' },
  { kw: ['temettü', 'kâr payı', 'kar payı', 'geri alım', 'pay geri al'], kategori: 'Temettü/Geri Alım' },
  { kw: ['bilanço', 'finansal sonuç', 'net kâr', 'net kar', 'çeyrek', 'faaliyet kâr', 'rekor kâr', 'zarar açıkla', 'kârını açıkla', 'karını açıkla', 'gelir açıkla'], kategori: 'Finansal Sonuç' },
  { kw: ['sermaye art', 'bedelli', 'bedelsiz', 'tahsisli', 'sermaye azalt'], kategori: 'Sermaye' },
  { kw: ['yeni yatırım', 'fabrika', 'kapasite', 'ihracat', 'yeni anlaşma', 'mutabakat', 'üretime başla', 'devreye al'], kategori: 'Yatırım/İhracat' },
  { kw: ['lisans', 'ruhsat', 'onay aldı', 'patent', 'sertifika', 'izin aldı', 'teşvik'], kategori: 'Ruhsat/Onay' },
  { kw: ['dava', 'ceza', 'tedbir', 'soruşturma', 'iflas', 'konkordato', 'haciz', 'el koy', 'kayyum'], kategori: 'Hukuk/Risk' },
  { kw: ['genel müdür', 'ceo', 'istifa', 'atan', 'yönetim kurulu', 'görevden al'], kategori: 'Yönetim' },
  { kw: ['halka arz', 'spk onay'], kategori: 'Halka Arz' },
]
// Gürültü: fiyat-sorgusu / teknik-analiz / "en çok artan" tipi tıklama tuzakları
const NOISE_KW = [
  'teknik analiz', 'canlı grafik', 'günlük teknik', 'hisse senedi fiyatı', 'grafiği',
  'en çok', 'tahtası', 'günün hisseleri', 'yükselen hisseler', 'düşen hisseler',
  'kaç tl', 'ne kadar', 'kaç para', 'kaç lira', 'hisse yorum', 'alınır mı', 'satılır mı',
  'ne kadar oldu', 'düşüşte mi', 'yükselişte mi', 'fiyatı ne', 'son durum',
]
const MID_KW = ['analist', 'hedef fiyat', 'tavsiye', 'yabancı', 'takas', 'derecelendirme', 'değerlendirme', 'rapor', 'aracı kurum', 'öneri']

export function classifyMateriality(baslik: string): { level: Materiality; kategori: string } {
  const l = baslik.toLowerCase()
  // Önce gürültü değil; YÜKSEK material anahtarları (en bilgilendirici) öncelikli
  for (const r of HIGH_RULES) if (r.kw.some((k) => l.includes(k))) return { level: 'yüksek', kategori: r.kategori }
  if (NOISE_KW.some((k) => l.includes(k))) return { level: 'gürültü', kategori: 'Gürültü' }
  if (MID_KW.some((k) => l.includes(k))) return { level: 'orta', kategori: 'Analist/Piyasa' }
  return { level: 'orta', kategori: 'Genel' } // bilinmeyen → nötr-orta (aşırı eleme yapma)
}

// ── Yardımcılar ─────────────────────────────────────────────────────────────

/** Mum tarihini "YYYY-MM-DD" string'e indirger (günlük string ya da unix-saniye number). */
function dstr(d: string | number): string {
  return typeof d === 'number' ? new Date(d * 1000).toISOString().slice(0, 10) : String(d).slice(0, 10)
}
function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0 }
function std(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

/** Hisse günlük getirilerinin std sapması (dinamik anlamlılık eşiği için). */
function dailyVol(candles: OHLCVCandle[]): number {
  const rets: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const p = candles[i - 1].close
    if (p > 0) rets.push((candles[i].close - p) / p)
  }
  if (rets.length < 5) return 0.04
  return std(rets)
}

/** Endeks getirisi belirli bir [fromGun → toGun] penceresinde. Yoksa 0 (AR ≈ ham). */
function indexReturnWindow(indexCandles: OHLCVCandle[], fromGun: string, toGun: string): number {
  if (!indexCandles.length) return 0
  let fi = -1, ti = -1
  for (let i = 0; i < indexCandles.length; i++) {
    const d = dstr(indexCandles[i].date)
    if (d <= fromGun) fi = i
    if (d <= toGun) ti = i
  }
  if (fi < 0 || ti < 0) return 0
  const ib = indexCandles[fi].close
  const ic = indexCandles[ti].close
  return ib > 0 ? (ic - ib) / ib : 0
}

/** Olayı izleyen tepki penceresi: olay günü + sonraki 2 işlem günü (3 mum). */
const K_REACTION = 3

// ── Event study ─────────────────────────────────────────────────────────────

export function computeNewsImpact(
  haber: SymbolNewsItem,
  candles: OHLCVCandle[],
  indexCandles: OHLCVCandle[],
): NewsImpact {
  const cls = classifyMateriality(haber.baslik)
  const base: NewsImpact = {
    ...haber,
    materiality: cls.level,
    kategori: cls.kategori,
    ar: null, hamGetiri: null, indexGetiri: null,
    hacimOran: null, hacimZ: null, hacimSpike: false,
    esik: 0.03,
    yasSaat: 0, yon: 'nötr',
    anticipation: false, anticipationAr: null,
    verdict: 'ölçülemedi',
  }

  // Gürültü için event study yapma (anlamsız + hızlı)
  if (cls.level === 'gürültü') return base

  const T = haber.tarih ? new Date(haber.tarih) : null
  if (!T || isNaN(T.getTime()) || candles.length < 6) return base
  base.yasSaat = Math.max(0, (Date.now() - T.getTime()) / 3_600_000)

  const newsDay = T.toISOString().slice(0, 10)

  // Baz mum: haber gününden KESİN ÖNCEKİ son mum (haberin etkisi sonraki mumlarda görünür)
  let bazIdx = -1
  for (let i = 0; i < candles.length; i++) {
    if (dstr(candles[i].date) < newsDay) bazIdx = i
    else break
  }
  // bazIdx<0 → haber penceremizin tamamından eski → ölçülemez.
  // (Bugünkü haber için bazIdx zaten dünün mumudur; market hiç işlem görmediyse
  //  bazIdx = son mum olur, getiri 0 → "henüz fiyatlanmadı" doğru sonucu verir.)
  if (bazIdx < 0) {
    if (base.yasSaat < 36 && candles.length >= 2) bazIdx = candles.length - 2
    else return base
  }

  const lastIdx = candles.length - 1
  const bazTarih = dstr(candles[bazIdx].date)
  const bazClose = candles[bazIdx].close
  if (!bazClose) return base

  // ── Tepki penceresi: olayı izleyen ~K işlem günü (haberin TEPKİSİ;
  //    "şimdiye kadarki sürüklenme" değil — eski haber için bu kritik). ──
  const reactIdx = bazIdx >= lastIdx ? lastIdx : Math.min(bazIdx + K_REACTION, lastIdx)
  const pencereTamam = bazIdx + K_REACTION <= lastIdx // K günün tamamı geçmişte mi?
  const reactTarih = dstr(candles[reactIdx].date)
  const reactClose = candles[reactIdx].close

  base.hamGetiri = (reactClose - bazClose) / bazClose
  base.indexGetiri = indexReturnWindow(indexCandles, bazTarih, reactTarih)
  base.ar = base.hamGetiri - base.indexGetiri // β=1 varsayımı (basit market-adjusted CAR)

  // ── Hacim: tepki penceresi ort vs olay öncesi 20-mum dağılımı ──
  const after = candles.slice(bazIdx + 1, reactIdx + 1).map((c) => c.volume).filter((v) => v > 0)
  const before = candles.slice(Math.max(0, bazIdx - 19), bazIdx + 1).map((c) => c.volume).filter((v) => v > 0)
  const muBefore = mean(before)
  const sdBefore = std(before)
  const vPost = after.length ? mean(after) : (candles[lastIdx].volume || 0)
  base.hacimOran = muBefore > 0 ? vPost / muBefore : null
  base.hacimZ = sdBefore > 0 ? (vPost - muBefore) / sdBefore : null
  // Spike: z>2 (varsa) ya da oran>2 (z hesaplanamadıysa)
  base.hacimSpike = base.hacimZ != null ? base.hacimZ > 2 : (base.hacimOran != null && base.hacimOran > 2)

  // ── Dinamik anlamlılık eşiği: max(%3, 1.5×günlük vol) ──
  const sigma = dailyVol(candles)
  base.esik = Math.max(0.03, 1.5 * sigma)
  const significant = Math.abs(base.ar) > base.esik
  // "Taze" = tepki penceresi henüz kapanmamış (reaksiyon gelişiyor).
  // İşlem-günü bazlı; takvim yaşından daha doğru (hafta sonu/tatil etkisi yok).
  const fresh = !pencereTamam

  base.yon = base.ar > 0.005 ? 'pozitif' : base.ar < -0.005 ? 'negatif' : 'nötr'

  // ── Anticipation: T'den ÖNCEKİ 3 mumda zaten anlamlı hareket olmuş mu? ──
  // (fiyat haberi "önceden satın almış" olabilir)
  if (bazIdx >= 3) {
    const preStart = candles[bazIdx - 3].close
    const preEnd = candles[bazIdx].close
    if (preStart > 0) {
      const preRaw = (preEnd - preStart) / preStart
      const preIdx = (() => {
        // olay-öncesi pencere için endeks getirisi
        const s = dstr(candles[bazIdx - 3].date)
        let si = -1, ei = -1
        for (let i = 0; i < indexCandles.length; i++) {
          const d = dstr(indexCandles[i].date)
          if (d <= s) si = i
          if (d <= bazTarih) ei = i
        }
        if (si < 0 || ei < 0 || indexCandles[si].close <= 0) return 0
        return (indexCandles[ei].close - indexCandles[si].close) / indexCandles[si].close
      })()
      base.anticipationAr = preRaw - preIdx
      base.anticipation = Math.abs(base.anticipationAr) > base.esik
    }
  }

  // ── Verdict matrisi (2 eksen: tepki büyüklüğü × haber yaşı) ──
  base.verdict = significant
    ? (fresh ? 'fiyatlanıyor' : 'fiyatlandı')
    : (fresh ? 'henüz-fiyatlanmadı' : 'tepkisiz')

  return base
}

// ── Sıralama / filtre ───────────────────────────────────────────────────────

/**
 * Önem sırası skoru (yüksek = üstte). Sadece materyalite değil; TAZELİK + ETKİ +
 * "material ama henüz fiyatlanmamış" (en aksiyon-alınabilir) birlikte tartılır.
 * Böylece 50 gün önceki "tepkisiz" bir haber, bugün fiyatı oynatan haberin altında kalır.
 */
function priority(n: NewsImpact): number {
  let s = n.materiality === 'yüksek' ? 30 : 10
  const days = n.yasSaat / 24
  s += Math.max(0, 20 - days)              // tazelik: ~20 günde sönen 0..20 bonus
  if (Math.abs(n.ar ?? 0) > n.esik) s += 8 // anlamlı hareket
  if (n.hacimSpike) s += 4                 // hacim teyidi
  if (n.materiality === 'yüksek' && n.verdict === 'henüz-fiyatlanmadı') s += 15 // aksiyon
  return s
}

export interface NewsImpactResult {
  important: NewsImpact[]   // gürültü hariç, materyalite + yaşa göre sıralı
  noise: NewsImpact[]       // gürültü (ayrı/gizli liste)
  noiseCount: number
  importantCount: number
  unpricedCount: number     // YÜKSEK materyalite + henüz fiyatlanmamış
  last7dCount: number       // son 7 gündeki önemli haber sayısı
}

/** Ölçülebilir + aksiyon alınabilir pencere: bundan eski haber gösterilmez. */
const MAX_AGE_GUN = 60

export function rankNewsImpact(
  haberler: SymbolNewsItem[],
  candles: OHLCVCandle[],
  indexCandles: OHLCVCandle[],
): NewsImpactResult {
  const now = Date.now()
  const maxAgeMs = MAX_AGE_GUN * 86_400_000
  // Yalnızca son MAX_AGE_GUN gün (ölçülebilir + güncel) haberler
  const taze = haberler.filter((h) => {
    if (!h.tarih) return false
    const t = new Date(h.tarih).getTime()
    return !isNaN(t) && now - t < maxAgeMs
  })
  const all = taze.map((h) => computeNewsImpact(h, candles, indexCandles))

  const important = all
    .filter((n) => n.materiality !== 'gürültü' && n.verdict !== 'ölçülemedi')
    .sort((a, b) => {
      const p = priority(b) - priority(a)
      if (Math.abs(p) > 0.01) return p
      return (new Date(b.tarih).getTime() || 0) - (new Date(a.tarih).getTime() || 0)
    })
  const noise = all.filter((n) => n.materiality === 'gürültü')

  const last7dCount = important.filter(
    (n) => n.tarih && now - new Date(n.tarih).getTime() < 7 * 86_400_000,
  ).length
  const unpricedCount = important.filter(
    (n) => n.materiality === 'yüksek' && n.verdict === 'henüz-fiyatlanmadı',
  ).length

  return {
    important,
    noise,
    noiseCount: noise.length,
    importantCount: important.length,
    unpricedCount,
    last7dCount,
  }
}
