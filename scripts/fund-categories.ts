/**
 * FAZ 6D — GERÇEK kategori çekimi (haftalık, YEREL betik).
 *
 * ⚠️ NEDEN CRON DEĞİL: fon başına 1 istek × ~2.400 fon × 2,2 sn ≈ 90 dakika.
 * Vercel'in 300 sn sınırına sığmaz ve zaten kategori nadiren değişir.
 * `scripts/fund-backfill.ts` ile aynı desen: bütçesiz, kesilebilir, idempotent.
 *
 * ⚠️ İDEMPOTENT VE KALDIĞI YERDEN DEVAM EDER: en eski `category_name_at`'ten
 * başlar (hiç çekilmemişler önce). Yarıda durdurup tekrar başlatabilirsin.
 *
 * Kullanım:
 *   npx tsx scripts/fund-categories.ts             # TEFAS, tüm eksikler
 *   npx tsx scripts/fund-categories.ts BES 300     # evren + en fazla N fon
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { getFundInfo, POLITE_DELAY_MS } from '../lib/fund-data';
import { getMeta, upsertRealCategories, CATEGORY_TTL_DAYS } from '../lib/fund-store';
import type { FundUniverse } from '../lib/fund-universe';

/** Bir seferde biriktirilip yazılan kayıt sayısı (kesilirse ilerleme kaybolmasın). */
const FLUSH = 25;

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
  const limit = Number(process.argv[3] ?? Infinity);
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
    if (i > 0) await sleep(POLITE_DELAY_MS);
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
