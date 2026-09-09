/**
 * Fon precompute çalıştırıcısı (FON-ANALIZ-PLAN F5/F7 + FON-BACKFILL-PLAN FAZ 2/3).
 *
 * İKİ GEÇİŞLİ (banka K2 dersi):
 *   1. geçiş — her fonun metrikleri hesaplanır (mutlak ölçümler)
 *   2. geçiş — KATEGORİ medyanları türetilir, bayrak/skor **emsale göreli** üretilir
 *
 * ⚠️ KALİBRASYON KURALI: bu projede iki kez aynı ders canlı veride yakalandı
 * (banka reel-ROE, banka NIM trendi). Mutlak eşik = BAĞLAM, asla veto değil;
 * ayrıştırıcı bayrak yalnız kendi kategorisindeki akranlara göre üretilir.
 * Kategoride n < MIN_PEER ise mutlak eşiğe düşülür ve rozet **sektör iddia ETMEZ**.
 *
 * DEPOLAMA (2026-09-09 değişti): ham NAV geçmişi artık **`fund_prices` tablosunda**.
 * Önceki tasarım ham seriyi `ai_cache` içinde 75 günlük kayan pencere olarak
 * tutuyordu; bu üç şeyi birden kilitliyordu — her koşu elindeki tarihi tekrar
 * çekiyordu, 75 gün kırpması derinliği imkânsız kılıyordu, 5 günlük TTL biriken
 * pencereyi silebiliyordu. `ai_cache` artık YALNIZ sunum önbelleği (hesaplanmış
 * `items`); doğruluk kaynağı tablodur.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { listFundsOnDate, POLITE_DELAY_MS, type FundDailyRow } from './fund-data';
import { FUND_CATEGORIES, guessAccessibility, guessBesCategory, categoryLabel, type FundUniverse } from './fund-universe';
import { computeFundMetrics, type NavPoint } from './fund-metrics';
import {
  businessDaysBack, pickMissingDays, isDayComplete, categoryStale,
  getCoveredDays, getReferenceRowCount, getRecentlyEmptyDays, recordDay, getFlowSeries, getDayRows,
  getMeta, upsertMetaNames, upsertMetaCategories, getCoverageSummary,
  getCategorySweep, recordCategorySweep,
  type FlowPoint,
} from './fund-store';
import { computeFlows, flowFlags, type FlowMetrics } from './fund-flows';

/**
 * Evren eşiği — KULLANICI KARARI (2026-09-09), canlı ölçümle seçildi.
 * `kisiSayisi >= 1000`: TEFAS 2.034 → 639 fon, varlığın %76,8'i korunuyor ve
 * **hiçbir kategori n<5'e düşmüyor** (en küçüğü Karma: 8→7). Serbest fonların
 * %89'u (994→108) doğal olarak eleniyor — davranışsal ölçüt, ad tahmininden güvenilir.
 */
export const MIN_INVESTORS = 1000;

/** Kategori medyanının güvenilir sayılması için gereken akran sayısı. */
export const MIN_PEER = 5;

/** Varsayılan derinlik hedefi (iş günü) — ~1 yıl. Kullanıcı kararı 2026-09-09. */
export const DEFAULT_TARGET_DAYS = 250;

/**
 * Bir günün BAŞLANGIÇ maliyet tahmini. İlk sürümde 13 sn'ydi; canlıda
 * (2026-09-09, Vercel'den) gerçek maliyet **~50 sn** ölçüldü — TEFAS paylaşımlı
 * IP'de 429 verip üstel geri çekilmeyi tetikliyor. Döngü ayrıca ÖLÇÜLEN
 * ortalamaya göre kendini ayarlar (aşağıdaki adaptif tahmin).
 * Bütçe SÜRE tabanlı: tahmine değil gerçek saate bakılır, böylece TEFAS
 * yavaşladığında koşu kendini keser (timeout'ta yazmadan ölmez).
 */
const DAY_COST_MS = 55_000;

/** Metrik/okuma/yazma için ayrılan pay — gün çekimi bunu yemez. */
const RESERVE_MS = 55_000;

/**
 * Kategori tazelemesi için AYRILAN pay (12 kategori × ≤4 sayfa, ölçülen ~100-130 sn).
 *
 * ⚠️ NEDEN REZERV: ilk sürümde kategori bloğu backfill'DEN SONRA "artan süre
 * varsa" koşuluyla çalışıyordu. Backfill bütçenin tamamını yediği için
 * (`budgetExhausted` her koşuda true) kategoriler **hiç** dolmuyordu — canlıda
 * 2026-09-09: 643 fon ölçüldü ama kategorisi olmadığı için emsal kıyası
 * kurulamadı ve skorların TAMAMI null kaldı. Kategori bir kerelik maliyet
 * (sonra 7 gün taze); gün çekimi ise sonsuz — o yüzden kategori ÖNCELİKLİ
 * rezerv alır, backfill kalanla çalışır.
 */
const CATEGORY_BUDGET_MS = 150_000;

export type FundFlagTone = 'pos' | 'warn' | 'neutral';

export interface FundFlag {
  id: string;
  tone: FundFlagTone;
  /** Sade Türkçe — fon dili: karşılaştırma/uygunluk, AL-SAT YOK */
  text: string;
  detail?: string;
}

export interface FundEntry {
  code: string;
  name: string;
  universe: FundUniverse;
  category: number | null;
  categoryLabel: string | null;
  accessibility: string;
  /** Erişilebilirlik AD TAHMİNİ — UI bunu göstermek zorunda */
  accessibilitySource: 'ad-tabanlı-tahmin';
  investors: number | null;
  size: number | null;
  asOf: string | null;
  observations: number;
  /** Üç katman */
  nominal: number | null;
  excess: number | null;
  real: number | null;
  /** Risk */
  volatility: number | null;
  sharpe: number | null;
  maxDrawdown: number | null;
  /** Kategoriye göre risk-ayarlı bileşik skor 0-100 (varsayılan sıralama) */
  score: number | null;
  /** Kategori içi sıralar — çifte sıralama görünürlüğü (F5-2) */
  rankByReturn: number | null;
  rankByScore: number | null;
  flags: FundFlag[];
  /** Kategori emsali güvenilir mi (n>=MIN_PEER) */
  peerReliable: boolean;
  /** F3 para akımı — Δ(pay adedi) × ort. fiyat. Büyüklük farkı DEĞİL. */
  netFlowTL: number | null;
  sharesChangePct: number | null;
  investorsChangePct: number | null;
  flowPattern: FlowMetrics['pattern'];
}

export interface FundCoverage {
  oldest: string | null;
  newest: string | null;
  completeDays: number;
}

/**
 * `ai_cache` içeriği — artık YALNIZ sunum önbelleği.
 * Ham seri ve kategori haritası tabloda; burada tutulmaz.
 */
export interface FundStore {
  scannedAt: string;
  universe: FundUniverse;
  items: FundEntry[];
  /** Makro bağlam (şeffaflık) */
  policyRate: number | null;
  inflation: number | null;
  /** Kapsama — "yeterli geçmiş yok" mesajlarının dayanağı */
  coverage?: FundCoverage;
  note?: string;
}

const cacheKey = (u: FundUniverse) => `fund-store:${u}`;

/**
 * Sunum önbelleği TTL'i cömert: doğruluk kaynağı tablo olduğu için süresi
 * dolsa bile veri kaybolmaz, yalnız yeniden hesaplanır. Kısa TTL (5g) eski
 * tasarımda ham pencereyi de sildiği için tehlikeliydi.
 */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

// ── 1. GEÇİŞ yardımcıları ───────────────────────────────────────────────────

export interface Measured {
  code: string;
  name: string;
  investors: number | null;
  size: number | null;
  category: number | null;
  nominal: number | null;
  excess: number | null;
  real: number | null;
  volatility: number | null;
  sharpe: number | null;
  maxDrawdown: number | null;
  observations: number;
  asOf: string | null;
  /** F3 para akımı — pay adedi tabanlı (fon büyüklüğünden DEĞİL) */
  flow: FlowMetrics;
}

/** 0-100'e ölçekler: değer medyanın ne kadar üstünde/altında (±%50 tam aralık). */
function relativeScore(value: number, med: number): number {
  if (med === 0) return 50;
  const vs = (value - med) / Math.abs(med);
  return Math.max(0, Math.min(100, Math.round(50 + (vs / 0.5) * 50)));
}

/**
 * Risk-ayarlı bileşik skor (SAF — test edilebilir).
 *
 * ⚠️ RİSK BİLEŞENİ YOKSA SKOR ÜRETİLMEZ (canlıda yakalandı, 2026-09-09):
 * pencere 11 gözlemken Sharpe/volatilite null kalıyordu, skor yalnız `excess`
 * bileşeninden türüyordu ve **631 fonun tamamı 70** çıkıyordu. Evrenin
 * tamamında aynı değeri veren gösterge bilgi taşımaz — üstelik adı
 * "risk-ayarlı" olduğu için doğrudan YANILTICI. Skorun adı risk diyorsa
 * riski ölçemediğimizde skor yoktur; ekran bunu açıkça söyler.
 *
 * Bileşen yoksa ağırlık YENİDEN NORMALİZE edilir (long-term-runner deseni) —
 * eksik bileşen 0 sayılmaz.
 */
export function computeCompositeScore(
  m: Pick<Measured, 'sharpe' | 'volatility' | 'excess'>,
  peer: { sharpe: number | null; vol: number | null },
  reliable: boolean,
): number | null {
  const parts: Array<{ v: number; w: number }> = [];
  const riskVar = reliable && m.sharpe != null && peer.sharpe != null;
  if (riskVar) parts.push({ v: relativeScore(m.sharpe!, peer.sharpe!), w: 60 });
  if (reliable && m.volatility != null && peer.vol != null) parts.push({ v: relativeScore(peer.vol, m.volatility), w: 25 });
  if (m.excess != null) parts.push({ v: m.excess >= 0 ? 70 : 30, w: 15 });
  const tw = parts.reduce((s, p) => s + p.w, 0);
  if (!riskVar || tw === 0) return null;
  return Math.round(parts.reduce((s, p) => s + p.v * p.w, 0) / tw);
}

/**
 * ⚠️ KÖTÜ KOŞU İYİ STORE'U EZMESİN (banka motorundaki aynı ders) — SAF.
 * Bu koşu öncekinin yarısından az fon ölçebildiyse yayın yapılmaz; sayfa
 * eldeki en iyi ölçümde kalır.
 */
export function selectPublished<T>(fresh: T[], previous: T[] | null | undefined): { items: T[]; weak: boolean } {
  const oncekiSayi = previous?.length ?? 0;
  const weak = oncekiSayi > 0 && fresh.length < oncekiSayi * 0.5;
  return { items: weak ? previous! : fresh, weak };
}

export function buildFlags(
  m: Measured,
  peer: { sharpe: number | null; vol: number | null; n: number } | null,
): FundFlag[] {
  const flags: FundFlag[] = [];
  const guvenilir = (peer?.n ?? 0) >= MIN_PEER;

  // BAĞLAM (mutlak) — her zaman gösterilir, ASLA veto değil (kalibrasyon kuralı)
  if (m.excess != null) {
    flags.push(
      m.excess >= 0
        ? { id: 'fon-fazla-poz', tone: 'pos', text: 'Risksiz getiriyi geçti', detail: `Fazla getiri +%${m.excess.toFixed(1)}` }
        : { id: 'fon-fazla-neg', tone: 'warn', text: 'Risksiz getirinin altında kaldı', detail: `Fazla getiri %${m.excess.toFixed(1)}` },
    );
  }
  if (m.real != null && m.real < 0) {
    flags.push({ id: 'fon-reel-neg', tone: 'warn', text: 'Enflasyona yenildi', detail: `Reel getiri %${m.real.toFixed(1)}` });
  }

  // AYRIŞTIRICI (emsale göreli) — yalnız kategori güvenilirse ve "emsal" dili kullanılır
  if (guvenilir && m.sharpe != null && peer!.sharpe != null) {
    if (m.sharpe > peer!.sharpe * 1.25) {
      flags.push({ id: 'fon-risk-ayarli-iyi', tone: 'pos', text: 'Emsallerine göre riskini daha iyi kullandı', detail: `Sharpe ${m.sharpe} · kategori medyanı ${peer!.sharpe.toFixed(2)}` });
    } else if (m.sharpe < peer!.sharpe * 0.75) {
      flags.push({ id: 'fon-risk-ayarli-zayif', tone: 'warn', text: 'Emsallerine göre aldığı riski karşılamadı', detail: `Sharpe ${m.sharpe} · kategori medyanı ${peer!.sharpe.toFixed(2)}` });
    }
  }
  if (guvenilir && m.volatility != null && peer!.vol != null && m.volatility < peer!.vol * 0.7) {
    flags.push({ id: 'fon-dusuk-dalga', tone: 'pos', text: 'Emsallerine göre daha az dalgalandı', detail: `Volatilite %${m.volatility} · kategori medyanı %${peer!.vol.toFixed(1)}` });
  }
  return flags;
}

/**
 * Serinin son DOLU yatırımcı/büyüklük değerleri.
 * O gün boş geldiyse önceki dolu değer korunur (veri yokluğu ≠ sıfır).
 */
function latestSnapshot(pts: FlowPoint[]): { investors: number | null; size: number | null } {
  let investors: number | null = null;
  let size: number | null = null;
  for (const p of pts) {
    if (p.investors != null) investors = p.investors;
    if (p.size != null) size = p.size;
  }
  return { investors, size };
}

// ── Artımlı backfill ────────────────────────────────────────────────────────

export interface BackfillResult {
  fetched: number;
  failed: number;
  remaining: number;
  /** Bütçe (süre) bittiği için mi durduk? */
  budgetExhausted: boolean;
}

/**
 * Eksik tarihleri hedefli çeker ve `fund_prices`'a yazar.
 *
 * Elde olan tarih **tekrar istenmez** — eski `fetchRawWindow` her koşuda son N
 * iş gününü baştan çekiyor ve 429 yiyordu. Günlük cron burada 1-2 gün çeker
 * (saniyeler), backfill koşusu bütçesini doldurur; **aynı kod yolu**.
 */
export async function backfillMissingDays(
  sb: SupabaseClient,
  universe: FundUniverse,
  targetDays: number,
  deadline: number,
): Promise<BackfillResult> {
  const target = businessDaysBack(targetDays);
  const from = target[target.length - 1]!;
  const covered = await getCoveredDays(sb, universe, from);
  const skipEmpty = await getRecentlyEmptyDays(sb, universe);
  const ref = await getReferenceRowCount(sb, universe);

  const allMissing = pickMissingDays(target, covered, Number.MAX_SAFE_INTEGER, skipEmpty);
  let fetched = 0, failed = 0, budgetExhausted = false;
  const names = new Map<string, string>();

  // Adaptif maliyet: ilk günden sonra GERÇEK ortalamayı kullan; sabit tahmin
  // yanlışsa (canlıda 13 sn sanılıyordu, 50 sn çıktı) döngü ya erken durur ya
  // da bütçeyi aşar. Ölçülen ortalama ikisini de engeller.
  let costEstimate = DAY_COST_MS;
  const loopStart = Date.now();

  for (const [i, day] of allMissing.entries()) {
    if (i > 0) costEstimate = Math.max(5_000, (Date.now() - loopStart) / i);
    if (Date.now() + costEstimate > deadline) { budgetExhausted = true; break; }
    if (i > 0) await sleep(POLITE_DELAY_MS);
    try {
      const res = await listFundsOnDate(universe, new Date(`${day}T00:00:00Z`));
      const complete = isDayComplete(res.data.length, res.dataQuality, ref);
      if (res.data.length === 0) {
        // Tatil mi 429 mu ayırt edilemez → complete=false yazılır, tekrar denenir.
        await recordDay(sb, universe, day, [], false);
        failed++;
        continue;
      }
      await recordDay(sb, universe, day, res.data, complete);
      for (const r of res.data) if (r.name) names.set(r.code, r.name);
      if (complete) fetched++; else failed++;
    } catch {
      // Kaydet ki throttle devreye girsin — aksi halde 429 alan gün her koşuda
      // baştan denenip bütçeyi yiyordu.
      try { await recordDay(sb, universe, day, [], false); } catch { /* yut */ }
      failed++;
    }
  }

  if (names.size > 0) {
    await upsertMetaNames(sb, universe, [...names].map(([code, name]) => ({ code, name })));
  }

  const remaining = allMissing.length - fetched - failed;
  return { fetched, failed, remaining: Math.max(0, remaining), budgetExhausted };
}

/**
 * Kategori haritasını tazeler (12 kategori × ≤4 sayfa ≈ 100-130 sn).
 *
 * Eskiden bu **her koşuda** ödeniyordu ve 300 sn'nin üçte birini yiyordu.
 * Artık `fund_meta.category_at` 7 günden tazeyse hiç çalışmaz.
 *
 * ⚠️ `onDate` VERİSİ OLDUĞU BİLİNEN bir tarih olmalı. İlk sürüm bugünün
 * tarihini kullanıyordu; TEFAS fon fiyatlarını akşam yayımladığı için sorgu
 * boş dönüyor ve kategori haritası HİÇ dolmuyordu (canlıda 2026-09-09:
 * 2.034 fonun kategorisi boş kaldı → emsal kıyası ve skor üretilemedi).
 *
 * ⚠️ KOŞULAR ARASI DEVAM: 12 kategori tek koşunun bütçesine sığmıyor (canlıda
 * 150 sn'de yalnız 577 fon işaretlendi). `skipCats` ile bu koşuda ZATEN TAZE
 * olan kategoriler atlanır; kalanlar sonraki koşuda alınır. Aksi halde döngü
 * her koşuda baştan başlayıp aynı ilk kategorileri tekrar çekerdi.
 */
export async function refreshCategories(
  sb: SupabaseClient,
  universe: FundUniverse,
  deadline: number,
  onDate: string,
  skipCats?: Set<number>,
): Promise<number> {
  const entries: Array<{ code: string; category: number }> = [];
  const denenen: number[] = [];
  const yapilacak = FUND_CATEGORIES.filter((c) => !(skipCats?.has(c.code) ?? false));
  for (const [i, c] of yapilacak.entries()) {
    if (Date.now() + 12_000 > deadline) break;
    if (i > 0) await sleep(POLITE_DELAY_MS);
    try {
      // Serbest kategorisi ~1000 fon → sayfa limiti geniş tutulmalı (ölçüldü)
      const r = await listFundsOnDate(universe, new Date(`${onDate}T00:00:00Z`), { sfonTurKod: c.code, maxPages: 4 });
      for (const f of r.data) entries.push({ code: f.code, category: c.code });
      // BOŞ dönse bile denendi sayılır — 103/172/173 TEFAS'ta boş, aksi halde
      // her koşuda yeniden sorgulanıp bütçe yakarlardı.
      denenen.push(c.code);
    } catch { /* bu kategori bu koşuda alınamadı; tablodaki önceki değeri KORUNUR */ }
  }
  if (entries.length > 0) await upsertMetaCategories(sb, universe, entries);
  await recordCategorySweep(sb, universe, denenen);
  return entries.length;
}

// ── Ana koşu ────────────────────────────────────────────────────────────────

export interface FundScanResult {
  store: FundStore;
  scored: number;
  skipped: number;
  backfill: BackfillResult;
  coverage: FundCoverage;
  categoryRefreshed: number;
}

export async function runFundScan(
  sb: SupabaseClient,
  universe: FundUniverse,
  opts: {
    targetDays?: number;
    /** Toplam süre bütçesi (ms) — cron maxDuration'dan küçük verilmeli. */
    budgetMs?: number;
    policyRate?: number | null;
    inflation?: number | null;
  } = {},
): Promise<FundScanResult> {
  const startedAt = Date.now();
  const budgetMs = opts.budgetMs ?? 270_000;
  const deadline = startedAt + budgetMs - RESERVE_MS;
  const targetDays = opts.targetDays ?? DEFAULT_TARGET_DAYS;

  const previous = await getFundStore(sb, universe);

  // Kategori ihtiyacını ÖNCE ölç (ucuz okuma) — gerekiyorsa backfill'in
  // bütçesinden pay ayrılır. Aksi halde backfill her şeyi yer ve kategori
  // hiç dolmaz (bkz. CATEGORY_BUDGET_MS notu).
  const metaOnce = await getMeta(sb, universe);
  const covOnce = await getCoverageSummary(sb, universe);
  // Hangi kategoriler ZATEN DENENDİ ve taze? (koşular arası devam)
  // Kaynak: açık tarama kaydı — fonların category_at'i DEĞİL. Gerekçe:
  // 103/172/173 kodlarında TEFAS hiç fon döndürmüyor, dolayısıyla "her kodun
  // taze fonu var mı" sorusu asla true olmuyor ve kategori tazelemesi sonsuz
  // tetikleniyordu (canlıda backfill'i 0 güne düşürdü).
  const sweep = await getCategorySweep(sb, universe);
  const tazeKategoriler = new Set<number>(
    FUND_CATEGORIES.filter((c) => !categoryStale(sweep[String(c.code)] ?? null)).map((c) => c.code),
  );
  const tumKategorilerTaze = FUND_CATEGORIES.every((c) => tazeKategoriler.has(c.code));
  // Kategori sorgusu VERİSİ OLAN bir tarih ister; hiç kapsama yoksa bu koşuda
  // yapılamaz (ilk koşu) — o zaman bütün bütçe backfill'e gider.
  // ⚠️ BES'te `sfonTurKod` filtresi TEFAS tarafından YOK SAYILIYOR (canlıda
  // ölçüldü: 12 sorgu × 400 fon = 4.800 çakışan kayıt, 400 fonun tamamı
  // kategorisiz kaldı). BES kategorisi fon ADINDAN çıkarılır → tarama gereksiz.
  const katGerekli = universe !== 'BES' && !tumKategorilerTaze && covOnce.newest != null;
  const katRezerv = katGerekli ? CATEGORY_BUDGET_MS : 0;

  // VERİ ÖNCELİKLİ (kategori rezervi düşüldükten sonra): kaçırılan gün telafi
  // edilemez, kategori ise 7 günde bir yeter.
  const backfill = await backfillMissingDays(sb, universe, targetDays, deadline - katRezerv);

  // ⚠️ META BACKFILL'DEN SONRA OKUNUR. İlk sürümde önce okunuyordu; adları
  // backfill yazdığı için harita boş kalıyor ve ölçüm döngüsü `!info?.name`
  // ile TÜM evreni eliyordu (canlıda 2026-09-09: scored 0 / skipped 2.034).
  let meta = await getMeta(sb, universe);
  let coverage = await getCoverageSummary(sb, universe);
  let categoryRefreshed = 0;

  if (katGerekli && coverage.newest) {
    categoryRefreshed = await refreshCategories(sb, universe, deadline, coverage.newest, tazeKategoriler);
    if (categoryRefreshed > 0) meta = await getMeta(sb, universe);
  }

  // ── Ölçüm: seriler tablodan ──
  const from = businessDaysBack(targetDays)[targetDays - 1]!;

  // ÖNCE EVREN, SONRA SERİ. Metrikler yalnız eşiği geçen fonlar için üretiliyor;
  // eskiden yine de TÜM fonların serisi okunuyordu → 240 günde 471.673 satır =
  // 472 istek (Supabase sayfa tavanı 1.000) ve cron TIMEOUT'a düştü.
  // Son günün satırları ucuz (~2.041) ve evreni belirlemeye yetiyor.
  const evrenGunu = coverage.newest;
  let kodlar: string[] | undefined;
  if (evrenGunu) {
    const gun = await getDayRows(sb, universe, evrenGunu);
    kodlar = gun.filter((r) => (r.investors ?? 0) >= MIN_INVESTORS).map((r) => r.code);
  }

  // TEK OKUMA: NAV serisi + akım + son snapshot aynı satırlardan türetilir.
  const flowSeries = await getFlowSeries(sb, universe, from, kodlar);

  const measured: Measured[] = [];
  let skipped = 0;
  for (const [code, pts] of flowSeries) {
    const info = meta.get(code);
    const snap = latestSnapshot(pts);
    // Yatırımcı sayısı: son DOLU gözlem. Veri yokluğu "eşiğin altında" demek
    // DEĞİLDİR — canlıda (2026-09-09) boş gelen kisiSayisi 2.034 fonun tamamını
    // eleyip store'u 631 → 0'a düşürmüştü.
    const investors = snap.investors;
    if ((investors ?? 0) < MIN_INVESTORS) { skipped++; continue; }
    // ⚠️ Meta yoksa ATLA (eski kod `meta.get(code)!` ile non-null iddia ediyordu →
    // hedefli backfill'de fon bu koşuda fiyat yayımlamadığında TypeError ile
    // TÜM koşuyu çökertiyordu). Artık meta tabloda kalıcı; yine de guard var.
    if (!info?.name) { skipped++; continue; }

    const points: NavPoint[] = pts
      .filter((x) => Number.isFinite(x.price) && x.price > 0)
      .map((x) => ({ date: x.date, price: x.price }));

    const fm = computeFundMetrics({
      series: points,
      benchmark: null, // kategori medyanı serisi ayrı faz
      policyRateAnnualPct: opts.policyRate ?? null,
      inflationAnnualPct: opts.inflation ?? null,
    });
    if (!fm.applicable) { skipped++; continue; }

    measured.push({
      code,
      name: info.name,
      investors,
      size: snap.size,
      // BES: kategori TEFAS'tan gelmiyor (yukarıdaki nota bak) → addan çıkarılır.
      category: universe === 'BES' ? guessBesCategory(info.name) : (info.category ?? null),
      nominal: fm.layered.nominal,
      excess: fm.layered.excess,
      real: fm.layered.real,
      volatility: fm.risk.volatility,
      sharpe: fm.risk.sharpe,
      maxDrawdown: fm.risk.maxDrawdown,
      observations: fm.observations,
      asOf: fm.asOf,
      flow: computeFlows(pts),
    });
  }

  // ── 2. GEÇİŞ: kategori medyanları + göreli skor/bayrak/sıra ──
  const byCat = new Map<number, Measured[]>();
  for (const m of measured) {
    if (m.category == null) continue;
    if (!byCat.has(m.category)) byCat.set(m.category, []);
    byCat.get(m.category)!.push(m);
  }

  const items: FundEntry[] = measured.map((m) => {
    const peers = m.category != null ? (byCat.get(m.category) ?? []) : [];
    const n = peers.length;
    const peerSharpe = median(peers.map((p) => p.sharpe).filter((x): x is number => x != null));
    const peerVol = median(peers.map((p) => p.volatility).filter((x): x is number => x != null));
    // Akım da EMSALE GÖRELİ okunur: piyasa genelinde çıkış varken "para çıkışı
    // var" tüm evrende tetiklenir ve bilgi taşımaz (kalibrasyon kuralı).
    const peerFlow = median(peers.map((p) => p.flow.sharesChangePct).filter((x): x is number => x != null));
    const reliable = n >= MIN_PEER;

    // Bileşik skor: risk-ayarlı getiri (emsale göre) + istikrar. Bileşen yoksa
    // ağırlık YENİDEN NORMALİZE edilir (long-term-runner deseni) — 0 sayılmaz.
    //
    // ⚠️ RİSK BİLEŞENİ YOKSA SKOR ÜRETİLMEZ (canlıda yakalandı, 2026-09-09):
    // pencere 11 gözlemken Sharpe/volatilite null kalıyordu, skor yalnız `excess`
    // bileşeninden türüyordu ve **631 fonun tamamı 70** çıkıyordu. Evrenin
    // tamamında aynı değeri veren gösterge bilgi taşımaz — üstelik adı
    // "risk-ayarlı" olduğu için doğrudan YANILTICI.
    const score = computeCompositeScore(m, { sharpe: peerSharpe, vol: peerVol }, reliable);

    const accessibility = guessAccessibility(m.name);
    return {
      code: m.code,
      name: m.name,
      universe,
      category: m.category,
      categoryLabel: categoryLabel(m.category),
      accessibility: accessibility.value,
      accessibilitySource: 'ad-tabanlı-tahmin' as const,
      investors: m.investors,
      size: m.size,
      asOf: m.asOf,
      observations: m.observations,
      nominal: m.nominal, excess: m.excess, real: m.real,
      volatility: m.volatility, sharpe: m.sharpe, maxDrawdown: m.maxDrawdown,
      score,
      rankByReturn: null,
      rankByScore: null,
      flags: [
        ...buildFlags(m, reliable ? { sharpe: peerSharpe, vol: peerVol, n } : null),
        ...flowFlags(m.flow, reliable ? peerFlow : null, m.size),
      ],
      peerReliable: reliable,
      netFlowTL: m.flow.netFlowTL,
      sharesChangePct: m.flow.sharesChangePct,
      investorsChangePct: m.flow.investorsChangePct,
      flowPattern: m.flow.pattern,
    };
  });

  // Çifte sıralama (F5-2): KATEGORİ İÇİ sıralar — elma-armut kıyası olmasın
  for (const [, peers] of byCat) {
    const kodlar = new Set(peers.map((p) => p.code));
    const grup = items.filter((i) => kodlar.has(i.code));
    [...grup].filter((i) => i.nominal != null).sort((a, b) => b.nominal! - a.nominal!)
      .forEach((i, idx) => { i.rankByReturn = idx + 1; });
    [...grup].filter((i) => i.score != null).sort((a, b) => b.score! - a.score!)
      .forEach((i, idx) => { i.rankByScore = idx + 1; });
  }

  coverage = await getCoverageSummary(sb, universe);

  // ⚠️ KÖTÜ KOŞU İYİ STORE'U EZMESİN (banka motorundaki aynı ders).
  // Tablo artık doğruluk kaynağı olduğu için ham veri kaybı riski yok; ama
  // tablo okuması kısmi kalırsa (sayfalama hatası) sayfa boşalmasın.
  const { items: yayin, weak: zayif } = selectPublished(items, previous?.items);

  const store: FundStore = {
    scannedAt: zayif ? previous!.scannedAt : new Date().toISOString(),
    universe,
    items: [...yayin].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
    policyRate: zayif ? previous!.policyRate : opts.policyRate ?? null,
    inflation: zayif ? previous!.inflation : opts.inflation ?? null,
    coverage,
    note: zayif
      ? `Bu koşu yalnız ${items.length} fon ölçebildi — önceki ölçüm korundu`
      : backfill.remaining > 0
        ? `Geçmiş dolduruluyor: ${coverage.completeDays}/${targetDays} gün hazır`
        : undefined,
  };
  await storeFundStore(sb, store);

  return { store, scored: yayin.length, skipped, backfill, coverage, categoryRefreshed };
}

// ── ai_cache tek satır — YALNIZ sunum önbelleği ─────────────────────────────

export async function storeFundStore(sb: SupabaseClient, store: FundStore): Promise<void> {
  await sb.from('ai_cache').upsert(
    {
      cache_key: cacheKey(store.universe),
      explanation: JSON.stringify(store),
      version: 2,
      hit_count: 0,
      expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    },
    { onConflict: 'cache_key' },
  );
}

export async function getFundStore(sb: SupabaseClient, universe: FundUniverse): Promise<FundStore | null> {
  try {
    const { data } = await sb
      .from('ai_cache')
      .select('explanation')
      .eq('cache_key', cacheKey(universe))
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (!data?.explanation) return null;
    return JSON.parse(data.explanation as string) as FundStore;
  } catch {
    return null;
  }
}
