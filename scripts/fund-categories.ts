/**
 * FAZ 6D — GERÇEK kategori çekimi (YEREL betik, PARÇA PARÇA).
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  🛑 BU BETİK ŞU AN BEKLEMEDE — ÖNCE UCUZ YOL DENENMELİ.
 *
 *  2026-09-10'da TEFAS bağlantımızı engelledi ("The requested URL was
 *  rejected", F5/Shape WAF). Bu betiğin tasarımı fon başına 1 istek — ~2.400
 *  fon demek. Nezaket gecikmesi 4-6 sn'ye çıkarıldığı için süre ~3 SAATE
 *  uzadı ve o kadar süre boyunca tek IP'den sabit tempolu istek, engeli
 *  davet eden desenin ta kendisi.
 *
 *  ÖNCE ŞU ÖLÇÜLMELİ: `fonGnlBlgSiraliGetir` (toplu uç, tüm evren TEK istek)
 *  yanıtındaki satırlarda `fonKategori` alanı var mı? Varsa 2.400 istek yerine
 *  1 istek yeter ve bu betiğe hiç gerek kalmaz. Ölçüm yapılmadan çalıştırma.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ İDEMPOTENT VE KALDIĞI YERDEN DEVAM EDER: en eski `category_name_at`'ten
 * başlar (hiç çekilmemişler önce). Yarıda durdurup tekrar başlatabilirsin.
 *
 * ⚠️ VARSAYILAN TAVAN VAR: argümansız çağrıda tüm evreni değil `VARSAYILAN_TAVAN`
 * kadar fonu çeker. "Sınırsız" varsayılan, tek oturumda binlerce istek demekti.
 *
 * Kullanım:
 *   npx tsx scripts/fund-categories.ts                 # TEFAS, en fazla 200 fon
 *   npx tsx scripts/fund-categories.ts BES 150         # evren + tavan
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { getFundInfo, politeDelay, TefasBlockedError } from '../lib/fund-data';
import { getMeta, upsertRealCategories, CATEGORY_TTL_DAYS } from '../lib/fund-store';
import type { FundUniverse } from '../lib/fund-universe';

/** Bir seferde biriktirilip yazılan kayıt sayısı (kesilirse ilerleme kaybolmasın). */
const FLUSH = 25;

/**
 * Tek koşuda çekilecek EN FAZLA fon.
 *
 * ⚠️ Argümansız çağrı önce `Infinity` idi — 2.400 istek, ~3 saat, tek IP.
 * Engel yedikten sonra bunun savunulacak yanı yok. Gerekiyorsa birkaç güne
 * yayılır; kategori zaten nadiren değişen bir veridir, acelesi yoktur.
 */
const VARSAYILAN_TAVAN = 200;

function loadEnv(): Record<string, string> {
  const p = path.join(process.cwd(), '.env.local');
  return Object.fromEntries(
    fs.readFileSync(p, 'utf8').split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const universe = (process.argv[2] ?? 'TEFAS') as FundUniverse;
  const limit = Number(process.argv[3] ?? VARSAYILAN_TAVAN);
  if (universe !== 'TEFAS' && universe !== 'BES') throw new Error('evren TEFAS veya BES olmalı');

  const env = loadEnv();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const meta = await getMeta(sb, universe);
  const bayatSinir = Date.now() - CATEGORY_TTL_DAYS * 86_400_000;

  // Hiç çekilmemiş olanlar ÖNCE, sonra en bayat olanlar.
  const hedef = [...meta.values()]
    .filter((r) => r.categoryNameAt == null || Date.parse(r.categoryNameAt) < bayatSinir)
    .sort((a, b) => {
      if (a.categoryNameAt == null && b.categoryNameAt == null) return a.code.localeCompare(b.code);
      if (a.categoryNameAt == null) return -1;
      if (b.categoryNameAt == null) return 1;
      return Date.parse(a.categoryNameAt) - Date.parse(b.categoryNameAt);
    })
    .slice(0, limit);

  console.log(`[6D] ${universe}: ${meta.size} fon · ${hedef.length} tanesi tazelenecek`);
  if (hedef.length === 0) return;

  const tampon: Array<{ code: string; categoryName: string | null; categoryRank: number | null; categorySize: number | null }> = [];
  let ok = 0, bos = 0, hata = 0;
  const dagilim = new Map<string, number>();

  const yaz = async () => {
    if (tampon.length === 0) return;
    await upsertRealCategories(sb, universe, tampon);
    tampon.length = 0;
  };

  for (const [i, r] of hedef.entries()) {
    if (i > 0) await sleep(politeDelay());
    try {
      const info = await getFundInfo(r.code);
      if (!info || info.categoryName == null) {
        // ⚠️ Boş yanıt "kategorisi yok" demek DEĞİL — kaynak bu uçta hata yerine
        // boş liste döndürebiliyor. Yazmıyoruz ki bir sonraki koşu tekrar denesin.
        bos++;
      } else {
        tampon.push({
          code: r.code,
          categoryName: info.categoryName,
          categoryRank: info.categoryRank,
          categorySize: info.categorySize,
        });
        dagilim.set(info.categoryName, (dagilim.get(info.categoryName) ?? 0) + 1);
        ok++;
      }
    } catch (e) {
      // ⛔ ENGELLENDİYSE ANINDA DUR VE YAZILANI KAYDET (2026-09-10 dersi).
      // Bu betik fon başına 1 istek atıyor; engellenmiş hâlde devam etmek
      // binlerce reddedilen istek demek ve engeli kalıcılaştırır.
      if (e instanceof TefasBlockedError) {
        await yaz();
        console.error(`\n⛔ TEFAS ERİŞİMİ ENGELLEDİ: ${e.detay}`);
        console.error(`   ${ok} kategori kaydedildi, ${i}/${hedef.length} noktasında DURULDU.`);
        console.error('   Yeni istek GÖNDERME. Birkaç saat bekle, sonra betiği tekrar çalıştır');
        console.error('   (idempotenttir, kaldığı yerden devam eder).');
        process.exitCode = 2;
        return;
      }
      hata++;
      console.warn(`  ${r.code}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (tampon.length >= FLUSH) await yaz();
    if ((i + 1) % 100 === 0) {
      console.log(`  ${i + 1}/${hedef.length} · ${ok} yazıldı · ${bos} boş · ${hata} hata`);
    }
  }
  await yaz();

  console.log(`\n[6D] ${universe} bitti: ${ok} kategori yazıldı, ${bos} boş, ${hata} hata`);
  const sirali = [...dagilim.entries()].sort((a, b) => b[1] - a[1]);
  console.log('Kategori dağılımı:');
  for (const [ad, n] of sirali) {
    // n<5 olan gruplar emsal kıyasına giremez — `peerReliable` bunu zaten
    // yakalar, ama burada görmek granülerliğin bedelini erken gösterir.
    console.log(`  ${String(n).padStart(4)}  ${ad}${n < 5 ? '   ⚠️ emsal az' : ''}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
