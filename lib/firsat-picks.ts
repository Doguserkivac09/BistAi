/**
 * Fırsat Sicili — saf hesap katmanı (forward-tracking).
 *
 * ÜRÜNÜN EN ÖNEMLİ İDDİASI BURADA ÖLÇÜLÜR: "gösterdiğimiz kurulumlar gerçekte ne
 * getirdi ve BIST'i geçti mi?" Bir tarayıcıyı güvenilir kılan tek şey budur.
 *
 * DÜRÜSTLÜK KURALLARI (kod bunları zorlar, yorum değil):
 *  1. Getiri YÖN-DÜZELTMELİDİR — kısa (asagi) kurulumda fiyat düşüşü KAZANÇTIR.
 *     Ham getiriyi kullanmak short'ları sistematik olarak kaybeden gösterirdi.
 *  2. İsabet oranı KOMİSYON SONRASI net getiriye bakar (gidiş-dönüş, COMMISSION).
 *  3. Örneklem küçükken oran YAYINLANMAZ — `MIN_SAMPLE` altında `null` döner,
 *     "%100 isabet (n=2)" gibi yanıltıcı bir sayı asla üretilmez.
 *  4. BIST karşılaştırması yalnız benchmark verisi olan pick'lerden hesaplanır.
 *
 * SAF/deterministik — fetch YOK, UI YOK.
 */

/** Gidiş-dönüş komisyon (decision/gecmis-firsatlar ile AYNI sabit) */
export const COMMISSION_PCT = 0.4;

/** Bu sayının altında oran yayınlanmaz — "n=2 ile %100" iddiası üretilmez. */
export const MIN_SAMPLE = 5;

export const PICK_HORIZONS = [
  { key: '1w', weeks: 1, label: '1 hafta' },
  { key: '2w', weeks: 2, label: '2 hafta' },
  { key: '4w', weeks: 4, label: '1 ay' },
] as const;

export type PickHorizonKey = (typeof PICK_HORIZONS)[number]['key'];

export interface FirsatPickRow {
  sembol: string;
  week_start: string;
  tier: string;
  direction: string;
  score: number;
  ret_1w: number | null; bist_ret_1w: number | null;
  ret_2w: number | null; bist_ret_2w: number | null;
  ret_4w: number | null; bist_ret_4w: number | null;
}

export interface HorizonStats {
  horizon: PickHorizonKey;
  label: string;
  /** Değerlendirilmiş pick sayısı */
  n: number;
  /** Komisyon sonrası pozitif getiri oranı % — n < MIN_SAMPLE ise null */
  winRate: number | null;
  /** Yön-düzeltmeli ortalama net getiri % */
  avgNet: number | null;
  /** BIST'i geçen pick oranı % (benchmark verisi olanlar üzerinden) */
  beatRate: number | null;
  /** Aynı dönemde BIST'in ortalama getirisi % */
  avgBist: number | null;
  /** Ortalama göreli getiri (bizim − BIST) */
  avgExcess: number | null;
}

/**
 * Yön-düzeltmeli NET getiri. Kısa kurulumda işaret çevrilir, sonra komisyon düşülür.
 * Ham getiri `ret` yüzde cinsindendir (5 = %5).
 */
export function netReturn(ret: number, direction: string): number {
  const dirAdj = direction === 'asagi' ? -ret : ret;
  return Math.round((dirAdj - COMMISSION_PCT) * 10) / 10;
}

/** Yön-düzeltmeli BIST getirisi — short kurulumda benchmark de ters çevrilir. */
function netBist(bistRet: number, direction: string): number {
  return direction === 'asagi' ? -bistRet : bistRet;
}

const avg = (xs: number[]): number | null =>
  xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;

/** Tek ufuk için istatistik. Örneklem yetersizse oranlar null (uydurma yok). */
export function computeHorizonStats(rows: FirsatPickRow[], horizon: PickHorizonKey): HorizonStats {
  const meta = PICK_HORIZONS.find((h) => h.key === horizon)!;
  const retKey = `ret_${horizon}` as 'ret_1w' | 'ret_2w' | 'ret_4w';
  const bistKey = `bist_ret_${horizon}` as 'bist_ret_1w' | 'bist_ret_2w' | 'bist_ret_4w';

  const evaluated = rows.filter((r) => r[retKey] != null && Number.isFinite(r[retKey] as number));
  const nets = evaluated.map((r) => netReturn(r[retKey] as number, r.direction));

  const withBench = evaluated.filter((r) => r[bistKey] != null && Number.isFinite(r[bistKey] as number));
  const excesses = withBench.map(
    (r) => netReturn(r[retKey] as number, r.direction) - netBist(r[bistKey] as number, r.direction),
  );
  const bists = withBench.map((r) => netBist(r[bistKey] as number, r.direction));

  const n = evaluated.length;
  const enough = n >= MIN_SAMPLE;
  const benchEnough = withBench.length >= MIN_SAMPLE;

  return {
    horizon,
    label: meta.label,
    n,
    winRate: enough ? Math.round((nets.filter((v) => v > 0).length / n) * 1000) / 10 : null,
    avgNet: enough ? avg(nets) : null,
    beatRate: benchEnough
      ? Math.round((excesses.filter((v) => v > 0).length / withBench.length) * 1000) / 10
      : null,
    avgBist: benchEnough ? avg(bists) : null,
    avgExcess: benchEnough ? avg(excesses) : null,
  };
}

export interface PickTrackRecord {
  /** Kayıt başlangıcı — sicilin kapsadığı ilk hafta */
  firstWeek: string | null;
  /** Toplam kaydedilmiş pick (değerlendirilmiş + bekleyen) */
  totalPicks: number;
  /** Henüz hiçbir ufku dolmamış pick sayısı */
  pendingPicks: number;
  horizons: HorizonStats[];
}

/**
 * Tüm sicil. `tier` verilirse yalnız o katman (ör. 'onayli') ölçülür — ürünün
 * varsayılan görünümünde gösterdiği liste ile sicilin kapsamı AYNI olmalıdır.
 */
export function computeTrackRecord(rows: FirsatPickRow[], tier?: string): PickTrackRecord {
  const scoped = tier ? rows.filter((r) => r.tier === tier) : rows;
  const weeks = scoped.map((r) => r.week_start).sort();
  return {
    firstWeek: weeks[0] ?? null,
    totalPicks: scoped.length,
    pendingPicks: scoped.filter((r) => r.ret_1w == null && r.ret_2w == null && r.ret_4w == null).length,
    horizons: PICK_HORIZONS.map((h) => computeHorizonStats(scoped, h.key)),
  };
}

/** Verilen tarihin ait olduğu haftanın Pazartesi'si (YYYY-MM-DD, UTC). */
export function weekStartOf(d: Date = new Date()): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay(); // 0=Paz
  const diff = dow === 0 ? 6 : dow - 1;
  x.setUTCDate(x.getUTCDate() - diff);
  return x.toISOString().slice(0, 10);
}
