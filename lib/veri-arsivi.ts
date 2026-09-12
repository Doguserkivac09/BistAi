/**
 * VERİ ARŞİVİ — kendi point-in-time kaydımızı üreten katman.
 *
 * SORUN (ölçülerek tespit edildi, 2026-09-12): temel veriyi çekebiliyoruz ama
 * "bu rakam hangi gün açıklandı / ne zaman revize edildi" bilgisi geçmişe dönük
 * hiçbir ücretsiz kaynakta yok — KAP aktif bot tespiti arkasında (fingerprint
 * script'i + WAF), İş Yatırım'ın yabancı oranı yazısı evrenin %2'si.
 * Bu yüzden geriye dönük temel-veri backtest'i YAPISAL OLARAK sahtedir.
 *
 * ÇÖZÜM: geçmişi satın alamayız, geleceği bugünden kaydederiz.
 * Her koşuda içerik hash'lenir; hash değişmediyse yeni satır açılmaz.
 * Satır = bir içeriğin İLK görüldüğü an → bizim ürettiğimiz revizyon damgası.
 *
 * ⚠️ FİYAT TÜREVİ ALAN ARŞİVLENMEZ. marketCap/F-K/PD-DD/52H/hareketli ortalama
 * her gün değişir; hash'i her gün bozar, arşivi şişirir ve "revizyon" kavramını
 * anlamsızlaştırır. Fiyat zaten scan_cache/OHLCV tarafında var. Burada yalnız
 * YAVAŞ DEĞİŞEN, REVİZE EDİLEBİLİR alanlar tutulur.
 *
 * ⚠️ LİSANS: ham tablo redistribüte edilmez (VIOP/fon ilkesi) — RLS service_role.
 */

import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchIsyFinancials, recentQuarterRefs, type IsyPeriodRef } from './isyatirim-financials';
import { fetchYahooFundamentals } from './yahoo-fundamentals';

export type ArsivKaynak = 'isyatirim-mali' | 'yahoo-temel';

export interface ArsivKaydi {
  kaynak: ArsivKaynak;
  sembol: string;
  anahtar: string;
  icerik: Record<string, unknown>;
  icerik_hash: string;
}

/**
 * Anahtar sırasından bağımsız kanonik JSON.
 * Aynı içerik farklı alan sırasıyla gelirse AYNI hash üretmeli — yoksa her koşu
 * sahte "revizyon" yazar.
 */
export function kanonikJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(kanonikJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  const anahtarlar = Object.keys(o).sort();
  return `{${anahtarlar.map((k) => `${JSON.stringify(k)}:${kanonikJson(o[k])}`).join(',')}}`;
}

export function icerikHash(icerik: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(kanonikJson(icerik)).digest('hex');
}

/** Yahoo'dan arşivlenecek alanlar — fiyat türevi olanlar BİLEREK dışarıda. */
const YAHOO_ARSIV_ALANLARI = [
  'sector', 'industry', 'eps', 'bookValue', 'profitMargin', 'dividendYield',
  'currentRatio', 'totalDebt', 'totalCash', 'freeCashflow',
  'institutionsPercentHeld', 'insidersPercentHeld', 'shortRatio',
  'floatShares', 'sharesOutstanding', 'firstTradeMs',
  'pegRatio', 'enterpriseToEbitda',
  'revenueGrowth', 'earningsGrowth', 'returnOnEquity', 'returnOnAssets',
  'operatingMargins', 'debtToEquity', 'beta',
  'recommendationMean', 'recommendationKey', 'targetMeanPrice', 'numberOfAnalystOpinions',
  'nextEarningsTimestamp',
] as const;

/** Fiyattan türeyen ve bilerek arşivlenmeyen alanlar (belge amaçlı, teste kilitli). */
export const FIYAT_TUREVI_ALANLAR = [
  'marketCap', 'peRatio', 'priceToBook', 'week52High', 'week52Low',
  'movingAverage50', 'movingAverage200', 'currentPrice', 'reportedDate',
] as const;

export function yahooArsivIcerigi(f: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of YAHOO_ARSIV_ALANLARI) out[k] = f[k] ?? null;
  return out;
}

// ── Yazma ────────────────────────────────────────────────────────────────

export interface ArsivSonuc {
  bakilan: number;      // hash'i hesaplanan kayıt
  yeni: number;         // ilk kez görülen içerik → YENİ satır (revizyon)
  degismeyen: number;   // aynı içerik → yalnız son_gorulme güncellendi
  hata: number;
}

/**
 * Kayıtları arşive işler. Aynı içerik ikinci kez satır AÇMAZ.
 * Tek yazıcı (cron) varsayımıyla oku-değiştir-yaz güvenlidir.
 */
export async function arsivle(
  sb: SupabaseClient | null,
  kayitlar: ArsivKaydi[],
  opts: { dryRun?: boolean } = {},
): Promise<ArsivSonuc> {
  const sonuc: ArsivSonuc = { bakilan: kayitlar.length, yeni: 0, degismeyen: 0, hata: 0 };
  if (!kayitlar.length) return sonuc;

  if (opts.dryRun || !sb) {
    // Yazmadan ne olacağını raporla (migration öncesi / test)
    sonuc.yeni = kayitlar.length;
    return sonuc;
  }

  const hashler = kayitlar.map((k) => k.icerik_hash);
  const { data: mevcut, error } = await sb
    .from('veri_arsivi')
    .select('id, kaynak, sembol, anahtar, icerik_hash, gorulme_sayisi')
    .in('icerik_hash', hashler);
  if (error) throw new Error(`veri_arsivi okuma: ${error.message}`);

  const bulunan = new Map<string, { id: number; gorulme_sayisi: number }>();
  for (const r of (mevcut ?? []) as Array<{ id: number; kaynak: string; sembol: string; anahtar: string; icerik_hash: string; gorulme_sayisi: number }>) {
    bulunan.set(`${r.kaynak}|${r.sembol}|${r.anahtar}|${r.icerik_hash}`, { id: r.id, gorulme_sayisi: r.gorulme_sayisi });
  }

  const eklenecek: Array<Omit<ArsivKaydi, 'icerik'> & { icerik: Record<string, unknown> }> = [];
  const gorulen: Array<{ id: number; gorulme_sayisi: number }> = [];
  for (const k of kayitlar) {
    const v = bulunan.get(`${k.kaynak}|${k.sembol}|${k.anahtar}|${k.icerik_hash}`);
    if (v) gorulen.push(v);
    else eklenecek.push(k);
  }

  if (eklenecek.length) {
    const { error: insErr } = await sb.from('veri_arsivi').insert(eklenecek);
    if (insErr) throw new Error(`veri_arsivi yazma: ${insErr.message}`);
    sonuc.yeni = eklenecek.length;
  }

  const simdi = new Date().toISOString();
  for (const g of gorulen) {
    const { error: upErr } = await sb
      .from('veri_arsivi')
      .update({ son_gorulme: simdi, gorulme_sayisi: g.gorulme_sayisi + 1 })
      .eq('id', g.id);
    if (upErr) sonuc.hata++;
    else sonuc.degismeyen++;
  }

  return sonuc;
}

// ── Toplayıcılar ─────────────────────────────────────────────────────────

function suAnkiCeyrek(now = new Date()): { yil: number; ceyrek: 1 | 2 | 3 | 4 } {
  const ay = now.getUTCMonth() + 1;
  return { yil: now.getUTCFullYear(), ceyrek: (Math.ceil(ay / 3) as 1 | 2 | 3 | 4) };
}

/** İş Yatırım: son N çeyreğin ham alanları. Anahtar = 'yıl-dönem'. */
export async function toplaIsyatirim(sembol: string, ceyrekSayisi = 4): Promise<ArsivKaydi[]> {
  const { yil, ceyrek } = suAnkiCeyrek();
  const refs: IsyPeriodRef[] = recentQuarterRefs(yil, ceyrek, ceyrekSayisi);
  const { isBank, periods } = await fetchIsyFinancials(sembol, refs);
  if (isBank || !periods.length) return [];
  const out: ArsivKaydi[] = [];
  for (const p of periods) {
    const doluAlan = Object.values(p.fields).filter((v) => v !== null && v !== undefined).length;
    if (doluAlan === 0) continue;   // boş dönem arşivlenmez (henüz açıklanmamış)
    const icerik = { ...p.fields } as Record<string, unknown>;
    out.push({ kaynak: 'isyatirim-mali', sembol, anahtar: `${p.year}-${p.period}`, icerik, icerik_hash: icerikHash(icerik) });
  }
  return out;
}

/** Yahoo: yavaş değişen temel + analist + bilanço takvimi. Anahtar = 'ozet'. */
export async function toplaYahoo(sembol: string): Promise<ArsivKaydi[]> {
  const f = await fetchYahooFundamentals(sembol) as unknown as Record<string, unknown>;
  const icerik = yahooArsivIcerigi(f);
  const dolu = Object.values(icerik).filter((v) => v !== null).length;
  if (dolu === 0) return [];
  return [{ kaynak: 'yahoo-temel', sembol, anahtar: 'ozet', icerik, icerik_hash: icerikHash(icerik) }];
}

// ── Çalıştırıcı ──────────────────────────────────────────────────────────

export interface ArsivKosuSonuc extends ArsivSonuc {
  sembol: number;
  atlanan: number;
  sureMs: number;
  kalan: number;
  dryRun: boolean;
}

/**
 * Sembol listesini gezer, bütçe dolunca durur ve `kalan` döndürür
 * (scan-cache/fon motorundaki bütçe deseni — timeout'ta hiçbir şey kaybolmaz).
 */
export async function runVeriArsivi(
  sb: SupabaseClient | null,
  opts: { symbols: string[]; budgetMs?: number; dryRun?: boolean; kaynaklar?: ArsivKaynak[] },
): Promise<ArsivKosuSonuc> {
  const t0 = Date.now();
  const butce = opts.budgetMs ?? 240_000;
  const kaynaklar = opts.kaynaklar ?? ['isyatirim-mali', 'yahoo-temel'];
  const sonuc: ArsivKosuSonuc = { bakilan: 0, yeni: 0, degismeyen: 0, hata: 0, sembol: 0, atlanan: 0, sureMs: 0, kalan: 0, dryRun: !!opts.dryRun };

  let i = 0;
  for (; i < opts.symbols.length; i++) {
    if (Date.now() - t0 > butce) break;
    const sembol = opts.symbols[i]!;
    const kayitlar: ArsivKaydi[] = [];
    for (const kaynak of kaynaklar) {
      try {
        if (kaynak === 'isyatirim-mali') kayitlar.push(...(await toplaIsyatirim(sembol)));
        else kayitlar.push(...(await toplaYahoo(sembol)));
      } catch {
        sonuc.hata++;
      }
    }
    if (!kayitlar.length) { sonuc.atlanan++; continue; }
    try {
      const r = await arsivle(sb, kayitlar, { dryRun: opts.dryRun });
      sonuc.bakilan += r.bakilan; sonuc.yeni += r.yeni; sonuc.degismeyen += r.degismeyen; sonuc.hata += r.hata;
      sonuc.sembol++;
    } catch {
      sonuc.hata++;
    }
  }

  sonuc.kalan = Math.max(0, opts.symbols.length - i);
  sonuc.sureMs = Date.now() - t0;
  return sonuc;
}
