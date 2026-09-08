/**
 * Fon kalıcı depolama katmanı (FON-BACKFILL-PLAN FAZ 2).
 *
 * NEDEN VAR: `fetchRawWindow` her koşuda **son N iş gününü** istiyordu; elinde
 * zaten olan tarihi atlamıyordu. Üstüne `ai_cache` 75 günlük kayan pencere +
 * 5 günlük TTL üç şeyi birden kilitliyordu:
 *   1) aynı günler tekrar tekrar çekiliyordu → 429, boşa süre
 *   2) 75 gün kırpması her koşuda uygulanıyordu → derine inmek imkânsız
 *   3) cron 5 gün koşmazsa biriken pencere komple siliniyordu
 *
 * Bu katman GAP TESPİTİNİ kesinleştirir: eksik tarih = hedef − (tamamlanmış
 * tarihler). Böylece günlük cron 1-2 gün çeker, backfill koşusu bütçesini
 * doldurur — **aynı kod, farklı bütçe**, ayrı kod yolu yok.
 *
 * ⚠️ KISMİ TARİH TUZAĞI: TEFAS sayfalama ortasında 429 verirse o tarih EKSİK
 * yazılır. `complete=false` işaretlenir ve bir sonraki koşuda TEKRAR denenir —
 * yoksa yarım gün "var" sayılıp kalıcı delik bırakırdı.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FundDailyRow } from './fund-data';
import type { FundUniverse } from './fund-universe';
import type { NavPoint } from './fund-metrics';

/** Supabase varsayılan sayfa tavanı; daha fazlası sessizce kırpılır. */
const PAGE = 1000;

/** fund_prices upsert parti boyutu (tek istekte 2.000 satır göndermemek için). */
const UPSERT_CHUNK = 500;

/** Kategori haritası bu kadar gün tazeyse yeniden çekilmez (kategori vergisi). */
export const CATEGORY_TTL_DAYS = 7;

export interface FundMetaRow {
  code: string;
  name: string | null;
  category: number | null;
  categoryAt: string | null;
}

/** Akım analizi için gereken günlük nokta (F3 — pay adedi ana kaynak). */
export interface FlowPoint {
  date: string;
  price: number;
  shares: number | null;
  investors: number | null;
}

// ── Saf yardımcılar (I/O yok — test edilebilir) ──────────────────────────────

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Bugünden geriye `count` adet iş günü (hafta sonu atlanır — fon fiyatı yok).
 * EN YENİDEN ESKİYE sıralı döner.
 */
export function businessDaysBack(count: number, from: Date = new Date()): string[] {
  const out: string[] = [];
  const d = new Date(from);
  while (out.length < count) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(ymd(d));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

/**
 * Hedeften eksik olanları bütçe kadar seçer.
 *
 * SIRALAMA KARARI: en yeni eksikten geriye. Güncel veri her zaman öncelikli
 * (sayfa bugünü göstermeli); güncel dolunca kendiliğinden geriye iner.
 */
export function pickMissingDays(target: string[], covered: Set<string>, budget: number): string[] {
  return target.filter((d) => !covered.has(d)).slice(0, Math.max(0, budget));
}

/**
 * Tarih "tam" mı? Birincil sinyal TEFAS'ın kendi `dataQuality`'si; satır sayısı
 * ikincil koruma. Referans yoksa (ilk günler) yalnız dataQuality'ye güvenilir.
 */
export function isDayComplete(
  rowCount: number,
  dataQuality: 'tam' | 'kısmi' | 'yok',
  referenceCount: number | null,
): boolean {
  if (rowCount === 0 || dataQuality !== 'tam') return false;
  if (referenceCount == null) return true;
  return rowCount >= referenceCount * 0.8;
}

/** Kategori haritası tazeleme gerekiyor mu? */
export function categoryStale(categoryAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!categoryAt) return true;
  const age = now.getTime() - new Date(categoryAt).getTime();
  return age > CATEGORY_TTL_DAYS * 86_400_000;
}

// ── I/O ─────────────────────────────────────────────────────────────────────

/** Tamamlanmış tarihler (kısmi olanlar KASITLI olarak dışarıda — tekrar denenecek). */
export async function getCoveredDays(
  sb: SupabaseClient,
  universe: FundUniverse,
  fromISO?: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  let q = sb.from('fund_scan_days').select('date').eq('universe', universe).eq('complete', true);
  if (fromISO) q = q.gte('date', fromISO);
  const { data, error } = await q.order('date', { ascending: false }).limit(5000);
  if (error || !data) return out;
  for (const r of data as Array<{ date: string }>) out.add(String(r.date).slice(0, 10));
  return out;
}

/** Son tam günlerin medyan satır sayısı — kısmi gün tespitinin referansı. */
export async function getReferenceRowCount(
  sb: SupabaseClient,
  universe: FundUniverse,
): Promise<number | null> {
  const { data } = await sb
    .from('fund_scan_days')
    .select('row_count')
    .eq('universe', universe)
    .eq('complete', true)
    .order('date', { ascending: false })
    .limit(5);
  const xs = (data as Array<{ row_count: number }> | null)?.map((r) => r.row_count).filter((n) => n > 0) ?? [];
  if (xs.length === 0) return null;
  xs.sort((a, b) => a - b);
  return xs[Math.floor(xs.length / 2)]!;
}

/** Bir günün satırlarını + kapsama kaydını yazar. */
export async function recordDay(
  sb: SupabaseClient,
  universe: FundUniverse,
  dateISO: string,
  rows: FundDailyRow[],
  complete: boolean,
): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK).map((r) => ({
      universe,
      code: r.code,
      date: r.date,
      price: r.price,
      shares: r.shares,
      investors: r.investors,
      size: r.size,
    }));
    const { error } = await sb.from('fund_prices').upsert(chunk, { onConflict: 'universe,code,date' });
    if (error) throw new Error(`fund_prices upsert: ${error.message}`);
  }

  await sb.from('fund_scan_days').upsert(
    { universe, date: dateISO, row_count: rows.length, complete, fetched_at: new Date().toISOString() },
    { onConflict: 'universe,date' },
  );
}

/** Sayfalı okuma — Supabase 1000 satır tavanını aşmak için (~160k satır/yıl). */
async function readPaged<T>(
  sb: SupabaseClient,
  table: string,
  columns: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apply: (q: any) => any,
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await apply(sb.from(table).select(columns)).range(offset, offset + PAGE - 1);
    if (error) throw new Error(`${table} okuma: ${error.message}`);
    const page = (data ?? []) as T[];
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

/** Fon → NAV serisi (metrik motoruna girdi). */
export async function getSeries(
  sb: SupabaseClient,
  universe: FundUniverse,
  fromISO: string,
): Promise<Map<string, NavPoint[]>> {
  const rows = await readPaged<{ code: string; date: string; price: number }>(
    sb,
    'fund_prices',
    'code,date,price',
    (q) => q.eq('universe', universe).gte('date', fromISO).order('code').order('date'),
  );
  const map = new Map<string, NavPoint[]>();
  for (const r of rows) {
    const p = Number(r.price);
    if (!Number.isFinite(p) || p <= 0) continue;
    if (!map.has(r.code)) map.set(r.code, []);
    map.get(r.code)!.push({ date: String(r.date).slice(0, 10), price: p });
  }
  return map;
}

/** Fon → akım serisi (F3: pay adedi + yatırımcı sayısı). */
export async function getFlowSeries(
  sb: SupabaseClient,
  universe: FundUniverse,
  fromISO: string,
): Promise<Map<string, FlowPoint[]>> {
  const rows = await readPaged<{
    code: string; date: string; price: number; shares: number | null; investors: number | null;
  }>(
    sb,
    'fund_prices',
    'code,date,price,shares,investors',
    (q) => q.eq('universe', universe).gte('date', fromISO).order('code').order('date'),
  );
  const map = new Map<string, FlowPoint[]>();
  for (const r of rows) {
    if (!map.has(r.code)) map.set(r.code, []);
    map.get(r.code)!.push({
      date: String(r.date).slice(0, 10),
      price: Number(r.price),
      shares: r.shares == null ? null : Number(r.shares),
      investors: r.investors == null ? null : Number(r.investors),
    });
  }
  return map;
}

/**
 * Fon → son gözlemin meta bilgisi (yatırımcı/büyüklük) — evren eşiği için.
 *
 * ⚠️ Yatırımcı/büyüklük o gün boş geldiyse ÖNCEKİ dolu değer korunur: veri
 * yokluğu "eşiğin altında" demek DEĞİLDİR. Canlıda yakalandı (2026-09-09):
 * kısmi çekimde `kisiSayisi` boş gelince evren eşiği 2.034 fonun tamamını
 * eledi ve store 631 → 0'a düştü.
 */
export async function getLatestSnapshot(
  sb: SupabaseClient,
  universe: FundUniverse,
  fromISO: string,
): Promise<Map<string, { date: string; investors: number | null; size: number | null }>> {
  const rows = await readPaged<{
    code: string; date: string; investors: number | null; size: number | null;
  }>(
    sb,
    'fund_prices',
    'code,date,investors,size',
    (q) => q.eq('universe', universe).gte('date', fromISO).order('code').order('date'),
  );
  const map = new Map<string, { date: string; investors: number | null; size: number | null }>();
  for (const r of rows) {
    // Sıra (code, date) artan → her fon için EN SON tarih en son yazar.
    const prev = map.get(r.code);
    map.set(r.code, {
      date: String(r.date).slice(0, 10),
      investors: r.investors == null ? (prev?.investors ?? null) : Number(r.investors),
      size: r.size == null ? (prev?.size ?? null) : Number(r.size),
    });
  }
  return map;
}

export async function getMeta(
  sb: SupabaseClient,
  universe: FundUniverse,
): Promise<Map<string, FundMetaRow>> {
  const rows = await readPaged<{
    code: string; name: string | null; category: number | null; category_at: string | null;
  }>(
    sb,
    'fund_meta',
    'code,name,category,category_at',
    (q) => q.eq('universe', universe).order('code'),
  );
  const map = new Map<string, FundMetaRow>();
  for (const r of rows) {
    map.set(r.code, { code: r.code, name: r.name, category: r.category, categoryAt: r.category_at });
  }
  return map;
}

/** Ad güncellemesi (her koşuda) — kategoriye DOKUNMAZ. */
export async function upsertMetaNames(
  sb: SupabaseClient,
  universe: FundUniverse,
  rows: Array<{ code: string; name: string }>,
): Promise<void> {
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK).map((r) => ({
      universe, code: r.code, name: r.name, updated_at: now,
    }));
    await sb.from('fund_meta').upsert(chunk, { onConflict: 'universe,code' });
  }
}

/** Kategori atamaları (yalnız tazeleme koşusunda). */
export async function upsertMetaCategories(
  sb: SupabaseClient,
  universe: FundUniverse,
  entries: Array<{ code: string; category: number }>,
): Promise<void> {
  const now = new Date().toISOString();
  for (let i = 0; i < entries.length; i += UPSERT_CHUNK) {
    const chunk = entries.slice(i, i + UPSERT_CHUNK).map((r) => ({
      universe, code: r.code, category: r.category, category_at: now, updated_at: now,
    }));
    await sb.from('fund_meta').upsert(chunk, { onConflict: 'universe,code' });
  }
}

/** Kapsama özeti — backfill ilerlemesi görünür olsun. */
export async function getCoverageSummary(
  sb: SupabaseClient,
  universe: FundUniverse,
): Promise<{ oldest: string | null; newest: string | null; completeDays: number }> {
  const { data } = await sb
    .from('fund_scan_days')
    .select('date')
    .eq('universe', universe)
    .eq('complete', true)
    .order('date', { ascending: true })
    .limit(5000);
  const ds = (data as Array<{ date: string }> | null)?.map((r) => String(r.date).slice(0, 10)) ?? [];
  return { oldest: ds[0] ?? null, newest: ds[ds.length - 1] ?? null, completeDays: ds.length };
}
