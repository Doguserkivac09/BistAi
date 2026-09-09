/**
 * Fon Risk & Getiri Motoru (FON-ANALIZ-PLAN FAZ F2) — ürünün kalbi.
 *
 * TEZ: Fon sektörünün en büyük yanılgısı NOMİNAL getiridir. %37 politika faizi ve
 * %32 enflasyon ortamında "%45 getirdi" hiçbir şey söylemez. Bu motor üç katmanı
 * birlikte üretir: nominal → fazla (risksize göre) → reel (enflasyona göre).
 *
 * SAF/deterministik — fetch YOK, UI YOK, tarih "bugün" varsayımı YOK.
 *
 * ⚠️ VERİ YOKSA METRİK ÜRETİLMEZ. Her metriğin minimum örneklemi vardır; altında
 * `null` döner. Bu projede tekrar eden ilke: eksik veri 0 sayılmaz, uydurulmaz.
 *
 * NOT (plan varsayımı düzeltildi): `lib/backtesting.ts`'teki Sharpe/maxDD
 * fonksiyonları dışa aktarılmamış ve İŞLEM KAYITLARI üzerinde çalışıyor; fonun
 * ihtiyacı NAV serisi sürümü. Zorlama yeniden kullanım yerine burada seri-tabanlı
 * yazıldı. Gerçekten paylaşılanlar: risksiz getiri (`fetchPolicyRate`) ve
 * enflasyon (`fetchTurkeyInflation`) — onlar çağıran katmandan geçirilir.
 */

/** BIST işlem günü sayısı — yıllıklandırma paydası. */
export const TRADING_DAYS = 252;

/** Metrik üretmek için gereken en az gözlem (altında null döner). */
/**
 * Bir dönemin "kapsandı" sayılması için gereken oran.
 *
 * Tek yerde tutuluyor: `coversPeriod` ile `annualizedReturn` aynı eşiği
 * kullanmazsa, bir metrik "1 yıllık veri var" derken diğeri "yok" der ve
 * ona bağlı hesaplar (Calmar) sessizce null kalır — canlıda tam olarak bu oldu.
 */
export const PERIOD_COVERAGE = 0.9;

/**
 * Calmar için gereken en az düşüş (mutlak %, pozitif yazılır).
 * Altında oran patlıyor ve ölçü olmaktan çıkıyor (bkz. `riskMetrics`).
 */
export const CALMAR_MIN_DD = 1;

export const MIN_OBS = {
  /** Getiri: en az 2 fiyat noktası */
  return: 2,
  /** Volatilite/Sharpe: 20 günlük getiri (~1 ay) */
  risk: 20,
  /** Beta/alfa: 60 ortak gün (~3 ay) */
  regression: 60,
  /** Rolling tutarlılık: en az 3 tam pencere */
  rollingWindows: 3,
} as const;

export interface NavPoint {
  /** ISO YYYY-MM-DD */
  date: string;
  /** Birim pay değeri */
  price: number;
}

// ── Temel yardımcılar ───────────────────────────────────────────────────────

/** Seriyi tarihe göre sıralar ve aynı güne ait tekrarları temizler. */
export function normalizeSeries(points: NavPoint[]): NavPoint[] {
  const byDate = new Map<string, number>();
  for (const p of points) {
    if (!p?.date || !Number.isFinite(p.price) || p.price <= 0) continue;
    byDate.set(p.date, p.price);
  }
  return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, price]) => ({ date, price }));
}

/** Günlük basit getiriler (oran, 0.012 = %1,2). */
export function dailyReturns(series: NavPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!.price;
    if (prev > 0) out.push(series[i]!.price / prev - 1);
  }
  return out;
}

/**
 * İki seriyi ORTAK TARİHLERDE hizalar (inner-join).
 * Fon tatil günlerinde fiyat üretmez; hizalamadan beta/alfa hesaplamak, farklı
 * günleri eşleştirip sahte korelasyon üretir. (`deriveGramTryFromOns` ile aynı disiplin.)
 */
export function alignSeries(a: NavPoint[], b: NavPoint[]): { a: NavPoint[]; b: NavPoint[] } {
  const mapB = new Map(b.map((p) => [p.date, p.price]));
  const outA: NavPoint[] = [];
  const outB: NavPoint[] = [];
  for (const p of a) {
    const pb = mapB.get(p.date);
    if (pb != null) { outA.push(p); outB.push({ date: p.date, price: pb }); }
  }
  return { a: outA, b: outB };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  // Örneklem standart sapması (n−1) — popülasyon değil
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

// ── F2-1: Getiri katmanı ────────────────────────────────────────────────────

/** Kümülatif getiri % (seri baştan sona). */
export function cumulativeReturn(series: NavPoint[]): number | null {
  if (series.length < MIN_OBS.return) return null;
  const first = series[0]!.price, last = series.at(-1)!.price;
  if (first <= 0) return null;
  return round((last / first - 1) * 100, 2);
}

/** Yıllıklandırılmış getiri % — 1 yıldan KISA dönemde yıllıklandırma YAPILMAZ
 *  (3 aylık %10'u "yıllık %46" diye sunmak yanıltıcıdır). */
export function annualizedReturn(series: NavPoint[]): number | null {
  if (series.length < MIN_OBS.return) return null;
  const days = daySpan(series);
  //
  // ⚠️ EŞİK `coversPeriod` İLE AYNI DİSİPLİNDE (%90) — önce katı 365 idi ve
  // bu sessiz bir arızaya yol açıyordu: 240 iş günlük tam veri **349 takvim
  // günü** ediyor (hafta sonu + tatil), yani "1 yıl" pratikte hiçbir zaman
  // 365'e ulaşmıyordu. Sonuç: yıllık getiri sütunu HER fonda boştu ve ona
  // bağlı olan **Calmar da hiç üretilemiyordu** (canlıda yakalandı).
  // Yıllıklandırma zaten bir dönüşümdür; %95 kapsanan bir dönemi yıla
  // çevirmek meşru, %25'ini çevirmek değildir — sınır oradan geçiyor.
  if (days < 365 * PERIOD_COVERAGE) return null;
  const first = series[0]!.price, last = series.at(-1)!.price;
  if (first <= 0) return null;
  return round(((last / first) ** (365 / days) - 1) * 100, 2);
}

function daySpan(series: NavPoint[]): number {
  const a = Date.parse(series[0]!.date), b = Date.parse(series.at(-1)!.date);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(1, (b - a) / 86_400_000) : 0;
}

/** Seriden son N takvim gününü keser (dönemsel getiriler için). */
export function sliceLastDays(series: NavPoint[], days: number): NavPoint[] {
  if (series.length === 0) return [];
  const end = Date.parse(series.at(-1)!.date);
  const cutoff = end - days * 86_400_000;
  return series.filter((p) => Date.parse(p.date) >= cutoff);
}

export const PERIODS = [
  { key: '1h', label: '1 hafta', days: 7 },
  { key: '1a', label: '1 ay', days: 30 },
  { key: '3a', label: '3 ay', days: 91 },
  { key: '6a', label: '6 ay', days: 182 },
  { key: 'ytd', label: 'Yılbaşından beri', days: -1 },
  { key: '1y', label: '1 yıl', days: 365 },
  { key: '3y', label: '3 yıl', days: 1095 },
  { key: '5y', label: '5 yıl', days: 1826 },
] as const;

export type PeriodKey = (typeof PERIODS)[number]['key'];

export interface PeriodReturn {
  period: PeriodKey;
  label: string;
  /** Kümülatif % — dönem verisi yetmiyorsa null */
  cumulative: number | null;
  /** Yıllıklandırılmış % — yalnız ≥1 yıl dönemlerde */
  annualized: number | null;
  /** Dönemde kaç gözlem var (şeffaflık) */
  observations: number;
}

/** YTD için yılbaşından itibaren keser. */
function sliceYtd(series: NavPoint[]): NavPoint[] {
  if (series.length === 0) return [];
  const year = series.at(-1)!.date.slice(0, 4);
  return series.filter((p) => p.date >= `${year}-01-01`);
}

/**
 * Seri, istenen dönemi GERÇEKTEN kapsıyor mu?
 *
 * ⚠️ Bu kontrol olmadan ciddi bir yanıltma oluşuyordu: 10 günlük geçmişi olan yeni
 * bir fon için "5 yıllık getiri" sorulduğunda dilim tüm seriyi döndürüyor ve 10
 * günlük getiri **"5 yıllık getiri" diye raporlanıyordu**. Fon sıralamasında bu,
 * yeni fonları uzun geçmişli fonlarla aynı kolonda yarıştırırdı.
 * Kural: dönemin en az %90'ı veriyle kapanmalı; yoksa metrik ÜRETİLMEZ.
 */
export function coversPeriod(series: NavPoint[], days: number): boolean {
  if (series.length < MIN_OBS.return) return false;
  return daySpan(series) >= days * PERIOD_COVERAGE;
}

export function periodReturns(series: NavPoint[]): PeriodReturn[] {
  const s = normalizeSeries(series);
  return PERIODS.map((p) => {
    // YTD tanımı gereği kısmi yıldır — kapsama kuralı uygulanmaz.
    const yeterli = p.key === 'ytd' ? s.length >= MIN_OBS.return : coversPeriod(s, p.days);
    const sub = p.key === 'ytd' ? sliceYtd(s) : sliceLastDays(s, p.days);
    return {
      period: p.key,
      label: p.label,
      cumulative: yeterli ? cumulativeReturn(sub) : null,
      annualized: yeterli ? annualizedReturn(sub) : null,
      observations: sub.length,
    };
  });
}

// ── F2-2: Üç katmanlı gerçek getiri ─────────────────────────────────────────

export interface LayeredReturn {
  /** Fonun ham getirisi % */
  nominal: number | null;
  /** Aynı dönemde risksiz getiri % (politika faizi, dönem-eşleşmeli) */
  riskFree: number | null;
  /** Nominal − risksiz = FAZLA GETİRİ % (fon riski almaya değdi mi?) */
  excess: number | null;
  /** Enflasyona göre REEL getiri % (Fisher) */
  real: number | null;
  /** Dönemde kullanılan enflasyon % (şeffaflık) */
  inflationUsed: number | null;
}

/**
 * Yıllık oranı döneme ölçekler — BİLEŞİK (basit orantı değil).
 * %37 yıllık faiz 6 ayda %18,5 değil %17,0'dır; fazla getiri hesabında bu fark
 * fonu haksız yere iyi/kötü gösterebilir.
 */
export function periodRate(annualPct: number, days: number): number {
  return ((1 + annualPct / 100) ** (days / 365) - 1) * 100;
}

/**
 * REEL getiri — FISHER (yaklaşık çıkarma DEĞİL).
 *
 * ⚠️ Bilinçli farklılık: `growth-momentum.realize()` ve banka motoru basit çıkarma
 * kullanıyor (nominal − enflasyon). Fonda Fisher kullanılıyor çünkü fark bu enflasyon
 * seviyesinde MATERYAL: %45 getiri / %32 enflasyonda çıkarma %13, Fisher %9,8 der —
 * 3 puanlık sapma fon sıralamasını değiştirir. (Birleştirme kararı ürün sahibinde.)
 */
export function realReturnFisher(nominalPct: number, inflationPct: number): number {
  return round(((1 + nominalPct / 100) / (1 + inflationPct / 100) - 1) * 100, 2);
}

export function layeredReturn(
  series: NavPoint[],
  opts: { policyRateAnnualPct: number | null; inflationAnnualPct: number | null },
): LayeredReturn {
  const s = normalizeSeries(series);
  const nominal = cumulativeReturn(s);
  if (nominal == null) {
    return { nominal: null, riskFree: null, excess: null, real: null, inflationUsed: null };
  }
  const days = daySpan(s);
  const riskFree = opts.policyRateAnnualPct == null ? null : round(periodRate(opts.policyRateAnnualPct, days), 2);
  const inflationPeriod = opts.inflationAnnualPct == null ? null : round(periodRate(opts.inflationAnnualPct, days), 2);
  return {
    nominal,
    riskFree,
    excess: riskFree == null ? null : round(nominal - riskFree, 2),
    real: inflationPeriod == null ? null : realReturnFisher(nominal, inflationPeriod),
    inflationUsed: inflationPeriod,
  };
}

// ── F2-3: Risk metrikleri ───────────────────────────────────────────────────

export interface RiskMetrics {
  /** Yıllık volatilite % */
  volatility: number | null;
  /** Sharpe — risksiz = politika faizi */
  sharpe: number | null;
  /** Sortino — yalnız aşağı yönlü sapma cezalandırılır */
  sortino: number | null;
  /** Maksimum düşüş % (negatif) */
  maxDrawdown: number | null;
  /** Calmar = yıllık getiri / |maxDD| */
  calmar: number | null;
  /** En kötü takvim ayı % */
  worstMonth: number | null;
  observations: number;
}

export function volatility(returns: number[]): number | null {
  if (returns.length < MIN_OBS.risk) return null;
  return round(stdDev(returns) * Math.sqrt(TRADING_DAYS) * 100, 2);
}

export function maxDrawdown(series: NavPoint[]): number | null {
  if (series.length < MIN_OBS.risk) return null;
  let peak = series[0]!.price;
  let worst = 0;
  for (const p of series) {
    if (p.price > peak) peak = p.price;
    if (peak > 0) worst = Math.min(worst, p.price / peak - 1);
  }
  return round(worst * 100, 2);
}

/** Takvim ayı bazında getiriler (en kötü ay için). */
export function monthlyReturns(series: NavPoint[]): Array<{ month: string; ret: number }> {
  const byMonth = new Map<string, NavPoint[]>();
  for (const p of series) {
    const m = p.date.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(p);
  }
  const out: Array<{ month: string; ret: number }> = [];
  for (const [month, pts] of [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (pts.length < 2) continue;
    out.push({ month, ret: round((pts.at(-1)!.price / pts[0]!.price - 1) * 100, 2) });
  }
  return out;
}

export function riskMetrics(
  series: NavPoint[],
  opts: { policyRateAnnualPct: number | null },
): RiskMetrics {
  const s = normalizeSeries(series);
  const rets = dailyReturns(s);
  const empty: RiskMetrics = {
    volatility: null, sharpe: null, sortino: null, maxDrawdown: null,
    calmar: null, worstMonth: null, observations: rets.length,
  };
  if (rets.length < MIN_OBS.risk) return empty;

  const vol = volatility(rets);
  const annualRet = annualizedReturn(s);
  const mdd = maxDrawdown(s);

  // Günlük risksiz getiri (bileşikten)
  const rfDaily = opts.policyRateAnnualPct == null
    ? null
    : (1 + opts.policyRateAnnualPct / 100) ** (1 / TRADING_DAYS) - 1;

  let sharpe: number | null = null;
  let sortino: number | null = null;
  if (rfDaily != null) {
    const excess = rets.map((r) => r - rfDaily);
    const sd = stdDev(excess);
    if (sd > 0) sharpe = round((mean(excess) / sd) * Math.sqrt(TRADING_DAYS), 2);
    // Sortino: yalnız NEGATİF sapmalar (yukarı oynaklık ceza değildir)
    const downside = excess.filter((x) => x < 0);
    if (downside.length >= 2) {
      const dd = Math.sqrt(downside.reduce((s2, x) => s2 + x ** 2, 0) / downside.length);
      if (dd > 0) sortino = round((mean(excess) / dd) * Math.sqrt(TRADING_DAYS), 2);
    }
  }

  const months = monthlyReturns(s);
  return {
    volatility: vol,
    sharpe,
    sortino,
    maxDrawdown: mdd,
    //
    // ⚠️ ÇOK KÜÇÜK DÜŞÜŞTE CALMAR ÜRETİLMEZ — sıfıra bölmeye yaklaşır.
    // Canlıda görüldü: en sert düşüşü %0,08 olan bir para piyasası fonunda
    // Calmar **589** çıkıyordu. Matematiksel olarak doğru ama bir ÖLÇÜ değil;
    // kullanıcı 589 ile 206'yı kıyaslayamaz ve büyük sayı "çok iyi" sanılır.
    // Böyle fonlarda anlamlı bilgi zaten "düşüş yok denecek kadar az"dır ve
    // onu `maxDrawdown` alanı doğrudan söylüyor.
    calmar:
      annualRet != null && mdd != null && mdd <= -CALMAR_MIN_DD
        ? round(annualRet / Math.abs(mdd), 2)
        : null,
    worstMonth: months.length ? Math.min(...months.map((m) => m.ret)) : null,
    observations: rets.length,
  };
}

// ── F2-4: Beceri metrikleri (şans ayrımı) ───────────────────────────────────

export interface SkillMetrics {
  /** Yıllık alfa % — ölçüte göre fazla getiri */
  alpha: number | null;
  /** Beta — ölçüte duyarlılık */
  beta: number | null;
  /** Information Ratio = alfa / izleme hatası — ASIL beceri ölçüsü */
  informationRatio: number | null;
  /** Kayan 12 aylık pencerelerde ölçütü geçme oranı % */
  rollingConsistency: number | null;
  /** Kaç pencere ölçüldü (şeffaflık) */
  rollingWindows: number;
  /** Toplam getirinin en iyi tek yıldan gelen payı % (tek-yıl bağımlılığı) */
  singleYearDependency: number | null;
}

/** En küçük kareler: fonGetiri = alfa + beta × ölçütGetiri */
export function alphaBeta(fundRets: number[], benchRets: number[]): { alpha: number | null; beta: number | null } {
  const n = Math.min(fundRets.length, benchRets.length);
  if (n < MIN_OBS.regression) return { alpha: null, beta: null };
  const f = fundRets.slice(-n), b = benchRets.slice(-n);
  const mf = mean(f), mb = mean(b);
  let cov = 0, varB = 0;
  for (let i = 0; i < n; i++) { cov += (f[i]! - mf) * (b[i]! - mb); varB += (b[i]! - mb) ** 2; }
  if (varB === 0) return { alpha: null, beta: null };
  const beta = cov / varB;
  // Günlük alfayı yıllıklandır
  return { alpha: round((mf - beta * mb) * TRADING_DAYS * 100, 2), beta: round(beta, 2) };
}

export function informationRatio(fundRets: number[], benchRets: number[]): number | null {
  const n = Math.min(fundRets.length, benchRets.length);
  if (n < MIN_OBS.regression) return null;
  const diff = fundRets.slice(-n).map((r, i) => r - benchRets.slice(-n)[i]!);
  const te = stdDev(diff);
  if (te === 0) return null;
  return round((mean(diff) / te) * Math.sqrt(TRADING_DAYS), 2);
}

/**
 * Kayan 12 aylık pencerelerde ölçütü geçme oranı.
 * NOKTA-NOKTA getiri DEĞİL: "5 yılda %200 getirdi" tek bir şanslı yıldan gelebilir;
 * bu ölçü tutarlılığı ölçer.
 */
export function rollingConsistency(
  fund: NavPoint[],
  bench: NavPoint[],
  windowDays = 365,
  stepDays = 30,
): { rate: number | null; windows: number } {
  const { a, b } = alignSeries(normalizeSeries(fund), normalizeSeries(bench));
  if (a.length < MIN_OBS.regression) return { rate: null, windows: 0 };

  const start = Date.parse(a[0]!.date);
  const end = Date.parse(a.at(-1)!.date);
  let wins = 0, total = 0;

  for (let t = start; t + windowDays * 86_400_000 <= end; t += stepDays * 86_400_000) {
    const lo = new Date(t).toISOString().slice(0, 10);
    const hi = new Date(t + windowDays * 86_400_000).toISOString().slice(0, 10);
    const fw = a.filter((p) => p.date >= lo && p.date <= hi);
    const bw = b.filter((p) => p.date >= lo && p.date <= hi);
    if (fw.length < 2 || bw.length < 2) continue;
    const fr = fw.at(-1)!.price / fw[0]!.price - 1;
    const br = bw.at(-1)!.price / bw[0]!.price - 1;
    total++;
    if (fr > br) wins++;
  }
  if (total < MIN_OBS.rollingWindows) return { rate: null, windows: total };
  return { rate: round((wins / total) * 100, 1), windows: total };
}

/**
 * Tek-yıl bağımlılığı: toplam bileşik getirinin ne kadarı EN İYİ tek takvim yılından?
 * %100'e yakınsa "5 yıllık başarı" aslında tek yılın parlaması demektir (tuzak #3).
 */
export function singleYearDependency(series: NavPoint[]): number | null {
  const s = normalizeSeries(series);
  const byYear = new Map<string, NavPoint[]>();
  for (const p of s) {
    const y = p.date.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(p);
  }
  const yearly: number[] = [];
  for (const pts of byYear.values()) {
    if (pts.length < 2) continue;
    yearly.push(pts.at(-1)!.price / pts[0]!.price);
  }
  if (yearly.length < 2) return null;
  const totalGrowth = yearly.reduce((a, b) => a * b, 1) - 1;
  if (totalGrowth <= 0) return null;
  const best = Math.max(...yearly) - 1;
  return round(Math.min(100, (best / totalGrowth) * 100), 1);
}

export function skillMetrics(fund: NavPoint[], bench: NavPoint[] | null): SkillMetrics {
  const f = normalizeSeries(fund);
  const empty: SkillMetrics = {
    alpha: null, beta: null, informationRatio: null,
    rollingConsistency: null, rollingWindows: 0,
    singleYearDependency: singleYearDependency(f),
  };
  if (!bench || bench.length === 0) return empty;

  const { a, b } = alignSeries(f, normalizeSeries(bench));
  const fr = dailyReturns(a), br = dailyReturns(b);
  const ab = alphaBeta(fr, br);
  const rc = rollingConsistency(f, bench);
  return {
    alpha: ab.alpha,
    beta: ab.beta,
    informationRatio: informationRatio(fr, br),
    rollingConsistency: rc.rate,
    rollingWindows: rc.windows,
    singleYearDependency: singleYearDependency(f),
  };
}

// ── Birleşik çıktı ──────────────────────────────────────────────────────────

export interface FundMetricsInput {
  series: NavPoint[];
  /** Kategori medyanı veya fonun kendi ölçütü (yoksa beceri metrikleri null) */
  benchmark?: NavPoint[] | null;
  policyRateAnnualPct: number | null;
  inflationAnnualPct: number | null;
}

export interface FundMetrics {
  /** Ölçüm yapılabildi mi (seri yeterli mi) */
  applicable: boolean;
  asOf: string | null;
  observations: number;
  /** Serinin kapsadığı takvim günü */
  historyDays: number;
  periods: PeriodReturn[];
  layered: LayeredReturn;
  risk: RiskMetrics;
  skill: SkillMetrics;
  /** Ölçüm neden yapılamadı (applicable=false ise) */
  reason?: string;
}

export function computeFundMetrics(input: FundMetricsInput): FundMetrics {
  const s = normalizeSeries(input.series);
  if (s.length < MIN_OBS.return) {
    return {
      applicable: false, asOf: s.at(-1)?.date ?? null, observations: s.length, historyDays: 0,
      periods: [], layered: { nominal: null, riskFree: null, excess: null, real: null, inflationUsed: null },
      risk: { volatility: null, sharpe: null, sortino: null, maxDrawdown: null, calmar: null, worstMonth: null, observations: 0 },
      skill: { alpha: null, beta: null, informationRatio: null, rollingConsistency: null, rollingWindows: 0, singleYearDependency: null },
      reason: 'Yeterli fiyat geçmişi yok',
    };
  }
  return {
    applicable: true,
    asOf: s.at(-1)!.date,
    observations: s.length,
    historyDays: Math.round(daySpan(s)),
    periods: periodReturns(s),
    layered: layeredReturn(s, {
      policyRateAnnualPct: input.policyRateAnnualPct,
      inflationAnnualPct: input.inflationAnnualPct,
    }),
    risk: riskMetrics(s, { policyRateAnnualPct: input.policyRateAnnualPct }),
    skill: skillMetrics(s, input.benchmark ?? null),
  };
}
