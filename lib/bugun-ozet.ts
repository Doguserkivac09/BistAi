/**
 * "Bugün v3" gözlem katmanı (design_handoff_bugun_v3) — SAF, deterministik.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  ⚠️ BU MODÜL HÜKÜM ÜRETMEZ. "Al / sat / değerlendir / fırsat" dili YOK.
 *
 *  Handoff'un v2 → v3 değişikliğinin özü bu: "Bugün ne yapmalıyım?" kaldırıldı,
 *  yerine "Bugün öne çıkanlar — hüküm değil, gözlem" geldi. Her satır yalnızca
 *  NE OLDUĞUNU söyler ("5 günlük ortalamanın 2,8 katı hacim"). Kısa vade sinyal
 *  listesi ölçümde yazı-tura çıktığı için bakımda (bkz. lib/maintenance.ts);
 *  bu ekran o boşluğu yeni bir öneri listesiyle doldurmamalı.
 *  Buraya bir `verdict` / `score` / `action` alanı eklemek bu kararı bozar.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Girdi: scan_cache satırları (BIST). Çıktı: ekrana hazır gözlem blokları.
 */

import { SECTORS, type SectorId } from './sectors';
import { getBISTMarketStatus } from './time-align';

export interface ScanRow {
  sembol: string;
  changePercent: number | null;
  lastClose: number | null;
  lastVolume: number | null;
  /** Son hacim ÷ son 5 günün ortalaması */
  relVol5: number | null;
  /** 52 hafta zirvesine uzaklık (%, ≤ 0) */
  pct52wHigh: number | null;
  sector: string | null;
}

/**
 * Likidite tabanı — günlük TL işlem hacmi.
 * Altındaki hisselerde %9'luk hareket birkaç yüz bin liralık işlemle oluşur;
 * onları "bugün öne çıkan" diye göstermek gürültüyü öne çıkarmaktır.
 */
export const MIN_TL_HACIM = 20_000_000;

/**
 * Veri hatası sınırı (%). BIST'te günlük fiyat limiti ~%10 (bazı pazarlarda %20).
 * Bunun çok üstündeki değişim bölünme/bedelsiz düzeltmesi yapılmamış veya bozuk
 * fiyattır — canlıda GMSTR **+%1.090** göründü ve "Sanayi +%6,8" sektör
 * ortalamasını tek başına şişirdi. Bu satırlar hiçbir bloğa girmez.
 */
export const MAX_GUNLUK_DEGISIM = 25;

export function gecerliDegisim(chg: number | null | undefined): chg is number {
  return chg != null && Number.isFinite(chg) && Math.abs(chg) <= MAX_GUNLUK_DEGISIM;
}

/** Gözlem eşikleri — "olağan dışı" sayılan sınırlar. */
export const ESIK = {
  hacimKati: 2.5,
  zirveYakin: -0.5,
  sertYukselis: 7,
  tavanYakin: 9.5,
  hacimliDusus: -4,
  hacimliDususKat: 1.5,
} as const;

export type GozlemTuru = 'Hacim' | 'Zirve' | 'Sert hareket' | 'Düşüş';

export interface Gozlem {
  sym: string;
  what: GozlemTuru;
  note: string;
  chg: number;
}

export interface SatirHacim { sym: string; chg: number; relVol5: number | null }
export interface SatirIslem { sym: string; chg: number; tlHacim: number }
export interface SektorGunluk { id: string; name: string; chg: number; n: number }

export interface BugunOzet {
  highlights: Gozlem[];
  movers: SatirHacim[];
  traded: SatirIslem[];
  sectors: SektorGunluk[];
  breadth: { up: number; down: number; flat: number; total: number };
  universe: number;
}

const tr1 = (v: number) => v.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function medyan(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

export function tlHacim(r: ScanRow): number {
  return r.lastClose != null && r.lastVolume != null ? r.lastClose * r.lastVolume : 0;
}

/** Geçerli (değişimi bilinen) ve likit satırlar. */
export function likitEvren(rows: ScanRow[]): ScanRow[] {
  return rows.filter((r) => gecerliDegisim(r.changePercent) && tlHacim(r) >= MIN_TL_HACIM);
}

/**
 * Gözlemleri üretir. Her türden en belirgin olan önce seçilir (çeşitlilik),
 * sonra kalan yer büyüklüğe göre doldurulur. Aynı hisse iki kez görünmez.
 */
export function buildHighlights(rows: ScanRow[], limit = 5): Gozlem[] {
  const evren = likitEvren(rows);
  const adaylar: Array<Gozlem & { guc: number }> = [];

  for (const r of evren) {
    const chg = r.changePercent!;
    if (r.relVol5 != null && r.relVol5 >= ESIK.hacimKati) {
      adaylar.push({
        sym: r.sembol, what: 'Hacim', chg, guc: r.relVol5,
        note: `Son 5 günün ortalamasının ${tr1(r.relVol5)} katı hacim`,
      });
    }
    if (r.pct52wHigh != null && r.pct52wHigh >= ESIK.zirveYakin) {
      adaylar.push({
        sym: r.sembol, what: 'Zirve', chg, guc: 100 + (r.pct52wHigh ?? 0),
        note: '52 haftanın en yüksek seviyesinde işlem görüyor',
      });
    }
    if (chg >= ESIK.sertYukselis) {
      adaylar.push({
        sym: r.sembol, what: 'Sert hareket', chg, guc: chg,
        note: chg >= ESIK.tavanYakin ? 'Günlük fiyat sınırına (tavan) yakın' : `Gün içinde %${tr1(chg)} yükseldi`,
      });
    }
    if (chg <= ESIK.hacimliDusus && r.relVol5 != null && r.relVol5 >= ESIK.hacimliDususKat) {
      adaylar.push({
        sym: r.sembol, what: 'Düşüş', chg, guc: -chg,
        note: 'Ortalamanın üzerinde hacimle geri çekiliyor',
      });
    }
  }

  const secilen: Gozlem[] = [];
  const kullanilan = new Set<string>();
  const ekle = (g: Gozlem & { guc: number }) => {
    if (kullanilan.has(g.sym) || secilen.length >= limit) return;
    kullanilan.add(g.sym);
    secilen.push({ sym: g.sym, what: g.what, note: g.note, chg: g.chg });
  };

  const turler: GozlemTuru[] = ['Hacim', 'Zirve', 'Sert hareket', 'Düşüş'];
  for (const t of turler) {
    const enIyi = adaylar.filter((a) => a.what === t && !kullanilan.has(a.sym)).sort((a, b) => b.guc - a.guc)[0];
    if (enIyi) ekle(enIyi);
  }
  // Kalan yer: türler arası normalize bir karşılaştırma yok, bu yüzden tür sırasıyla dolaşılır.
  for (const t of turler) {
    for (const a of adaylar.filter((x) => x.what === t).sort((x, y) => y.guc - x.guc)) ekle(a);
  }
  return secilen;
}

export function buildOzet(rows: ScanRow[]): BugunOzet {
  const evren = likitEvren(rows);

  const movers = [...evren]
    .filter((r) => r.changePercent! > 0)
    .sort((a, b) => b.changePercent! - a.changePercent!)
    .slice(0, 5)
    .map((r) => ({ sym: r.sembol, chg: r.changePercent!, relVol5: r.relVol5 }));

  const traded = [...evren]
    .sort((a, b) => tlHacim(b) - tlHacim(a))
    .slice(0, 5)
    .map((r) => ({ sym: r.sembol, chg: r.changePercent!, tlHacim: tlHacim(r) }));

  // Sektörün GÜNLÜK performansı: likit üyelerin değişim MEDYANI.
  // Ortalama değil: tek bir uç hareket (veri hatası filtresinden kaçan bir tavan
  // serisi bile) küçük sektörü tek başına sürükler. 3'ten az üyeli sektör
  // gösterilmez — tek hissenin hareketi "sektör" değildir.
  const grup = new Map<string, number[]>();
  for (const r of evren) {
    if (!r.sector) continue;
    if (!grup.has(r.sector)) grup.set(r.sector, []);
    grup.get(r.sector)!.push(r.changePercent!);
  }
  const hepsi: SektorGunluk[] = [...grup.entries()]
    .filter(([, xs]) => xs.length >= 3)
    .map(([id, xs]) => ({
      id,
      name: SECTORS[id as SectorId]?.shortName ?? id,
      chg: medyan(xs),
      n: xs.length,
    }))
    .sort((a, b) => b.chg - a.chg);
  const sectors = hepsi.length <= 6 ? hepsi : [...hepsi.slice(0, 3), ...hepsi.slice(-3)];

  const tum = rows.filter((r) => gecerliDegisim(r.changePercent));
  const breadth = {
    up: tum.filter((r) => r.changePercent! > 0).length,
    down: tum.filter((r) => r.changePercent! < 0).length,
    flat: tum.filter((r) => r.changePercent === 0).length,
    total: tum.length,
  };

  return { highlights: buildHighlights(rows), movers, traded, sectors, breadth, universe: evren.length };
}

/**
 * Günün özeti — yalnız ÖLÇÜLEN olguları cümleye çevirir.
 *
 * ⚠️ "AI" etiketi TAŞIMAZ. Handoff kartı "✦ AI · Bugünün özeti" diyor ama bu metin
 * bir dil modelinden gelmiyor; kural-tabanlı bir cümle kurucuya "AI" demek
 * kullanıcıyı yanıltır. Eski ekranda aynı yanlış vardı ("AI yalnızca özetler").
 * Risk iştahı / rüzgâr gibi YORUM da yapılmaz — handoff bu üçlüyü kaldırdı.
 */
export function buildSummary(
  o: BugunOzet,
  bist100Chg: number | null,
): string | null {
  const parcalar: string[] = [];
  if (bist100Chg != null) {
    parcalar.push(
      Math.abs(bist100Chg) < 0.1
        ? 'BIST 100 yatay seyrediyor.'
        : `BIST 100 %${tr1(Math.abs(bist100Chg))} ${bist100Chg > 0 ? 'yükselişte' : 'düşüşte'}.`,
    );
  }
  if (o.breadth.total >= 50) {
    const oran = Math.round((o.breadth.up / o.breadth.total) * 100);
    parcalar.push(`Hisselerin %${oran}'i artıda.`);
  }
  if (o.sectors.length >= 2) {
    const en = o.sectors[0]!, son = o.sectors[o.sectors.length - 1]!;
    // Yön diline dikkat: tüm sektörler düşerken "en iyi performans" demek,
    // canlıda −%1,5'lik bir sektörü olumlu gösteriyordu.
    if (en.chg > 0 && son.chg < 0) {
      parcalar.push(`${en.name} en güçlü, ${son.name} en zayıf sektör.`);
    } else if (en.chg <= 0) {
      parcalar.push(`Tüm sektörler ekside; en az düşen ${en.name}, en sert düşen ${son.name}.`);
    } else {
      parcalar.push(`Tüm sektörler artıda; en güçlüsü ${en.name}.`);
    }
  }
  return parcalar.length ? parcalar.join(' ') : null;
}

// ── Yaklaşan bilançolar ─────────────────────────────────────────────────────

export interface YaklasanBilanco { sym: string; ts: number; date: string; note: string }

const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/**
 * Yahoo `calendarEvents` tarihleri — gelecekteki ve ufuk içindekiler, yakından uzağa.
 * ⚠️ BIST için bu tarihler çoğunlukla TAHMİNİDİR (şirket KAP'a açıklayana kadar);
 * not alanı bunu söyler, ekran kesin tarih gibi sunmaz.
 */
export function buildEarnings(
  items: Record<string, { nextEarningsTs?: number | null }>,
  now = Date.now(),
  ufukGun = 45,
  limit = 6,
): YaklasanBilanco[] {
  const ufuk = now + ufukGun * 86_400_000;
  return Object.entries(items)
    .map(([sym, e]) => {
      const raw = e?.nextEarningsTs;
      if (raw == null || !Number.isFinite(raw)) return null;
      // Saniye mi milisaniye mi — Yahoo saniye döner.
      const ts = raw < 1e12 ? raw * 1000 : raw;
      return { sym, ts };
    })
    .filter((x): x is { sym: string; ts: number } => x != null && x.ts >= now - 86_400_000 && x.ts <= ufuk)
    .sort((a, b) => a.ts - b.ts)
    .slice(0, limit)
    .map(({ sym, ts }) => {
      const d = new Date(ts);
      return { sym, ts, date: `${d.getUTCDate()} ${AYLAR[d.getUTCMonth()]}`, note: 'Tahmini tarih' };
    });
}

// ── Borsa durumu ────────────────────────────────────────────────────────────


export interface BorsaDurumu {
  acik: boolean;
  etiket: string;
  /** "Kapanışa 4s 12dk" — yalnız seans içinde */
  detay: string | null;
}

/** BIST sürekli işlem sonu (kapanış seansı dahil) — TR saati, dakika. */
const KAPANIS_DK = 18 * 60 + 10;

/**
 * ⚠️ Kabuktaki çip önceden SABİT "BIST açık" yazıyordu — hafta sonu gece de.
 * Artık `getBISTMarketStatus` (TR tatil takvimi dahil) kullanılıyor.
 */
export function borsaDurumu(now: Date = new Date()): BorsaDurumu {
  const s = getBISTMarketStatus(now);
  if (s === 'open') {
    const tr = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    const kalan = Math.max(0, KAPANIS_DK - (tr.getHours() * 60 + tr.getMinutes()));
    const sa = Math.floor(kalan / 60), dk = kalan % 60;
    return { acik: true, etiket: 'BIST açık', detay: `Kapanışa ${sa > 0 ? `${sa}s ` : ''}${dk}dk` };
  }
  const etiket =
    s === 'pre_market' ? 'Açılış bekleniyor'
      : s === 'holiday' ? 'Resmî tatil'
        : s === 'weekend' ? 'Hafta sonu'
          : 'BIST kapalı';
  return { acik: false, etiket, detay: s === 'pre_market' ? 'Açılış 10:00' : null };
}
