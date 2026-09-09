/**
 * Fon geçmişi backfill — YEREL çalıştırıcı (FON-BACKFILL-PLAN FAZ 4).
 *
 * ⚠️ NEDEN YEREL: TEFAS, Vercel'in paylaşımlı IP'sini kısıtlıyor. Ölçüm
 * (2026-09-09): Vercel'den 2026-08-25/21/19/13/11 tarihleri **0 satır**
 * dönerken aynı anda yerelden **499 satır** geldi (2025-09-15 dahil, yani veri
 * 1 yıl geriye MEVCUT). Cron'un 300 sn sınırı + kısıtlama yüzünden koşu başına
 * net ~1 gün ilerliyordu; 250 günlük hedef bu yolla ulaşılamaz.
 *
 * Bu betik AYNI kütüphaneleri kullanır (`lib/fund-data` + `lib/fund-store`) —
 * yeni mantık yok, yalnız farklı host ve zaman sınırı yok. Günlük cron
 * güncel günü eklemeye devam eder; bu betik yalnız derin geçmiş içindir.
 *
 * Kullanım:
 *   npx tsx scripts/fund-backfill.ts                 # TEFAS, 250 iş günü
 *   npx tsx scripts/fund-backfill.ts BES 120         # evren + derinlik
 *
 * İdempotent: elde olan tarih tekrar çekilmez, istediğin zaman durdurup
 * yeniden başlatabilirsin.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { listFundsOnDate, POLITE_DELAY_MS } from '../lib/fund-data';
import {
  businessDaysBack, pickMissingDays, isDayComplete,
  getCoveredDays, getReferenceRowCount, recordDay, upsertMetaNames,
  getCoverageSummary,
} from '../lib/fund-store';
import type { FundUniverse } from '../lib/fund-universe';

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
  const targetDays = Number(process.argv[3] ?? 250);
  if (universe !== 'TEFAS' && universe !== 'BES') throw new Error('evren TEFAS veya BES olmalı');

  const env = loadEnv();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Vercel'den YANLIŞ "boş" kaydedilmiş günleri temizle — o kayıtlar kısıtlama
  // sonucuydu, gerçek tatil değil. Gerçekten boş olanlar (ör. 15 Temmuz) bu
  // koşuda yeniden boş kaydedilir; kayıp yok, yalnız bir kez tekrar denenir.
  const { data: bozuk } = await sb.from('fund_scan_days')
    .select('date').eq('universe', universe).eq('complete', false).eq('row_count', 0);
  if (bozuk?.length) {
    await sb.from('fund_scan_days').delete().eq('universe', universe)
      .eq('complete', false).eq('row_count', 0);
    console.log(`temizlendi: ${bozuk.length} yanlış-boş kayıt (Vercel kısıtlaması kaynaklı)`);
  }

  const target = businessDaysBack(targetDays);
  const from = target[target.length - 1]!;
  const covered = await getCoveredDays(sb, universe, from);
  const ref = await getReferenceRowCount(sb, universe);
  const missing = pickMissingDays(target, covered, Number.MAX_SAFE_INTEGER);

  console.log(`${universe}: hedef ${targetDays} iş günü · elde ${covered.size} · eksik ${missing.length}`);
  if (missing.length === 0) { console.log('hedef derinlik zaten tam.'); return; }

  const basladi = Date.now();
  let tam = 0, bos = 0, hata = 0;

  for (const [i, day] of missing.entries()) {
    if (i > 0) await sleep(POLITE_DELAY_MS);
    try {
      const res = await listFundsOnDate(universe, new Date(`${day}T00:00:00Z`));
      const complete = isDayComplete(res.data.length, res.dataQuality, ref);
      await recordDay(sb, universe, day, res.data, complete);
      if (res.data.length > 0) {
        await upsertMetaNames(sb, universe,
          res.data.filter((r) => r.name).map((r) => ({ code: r.code, name: r.name })));
      }
      if (complete) tam++; else bos++;
    } catch (e) {
      hata++;
      console.log(`  ${day} HATA: ${(e as Error).message.slice(0, 70)}`);
    }

    if ((i + 1) % 10 === 0 || i === missing.length - 1) {
      const gecen = (Date.now() - basladi) / 1000;
      const hiz = gecen / (i + 1);
      const kalanSn = Math.round(hiz * (missing.length - i - 1));
      console.log(
        `[${i + 1}/${missing.length}] tam ${tam} · boş ${bos} · hata ${hata} · ` +
        `${hiz.toFixed(1)} sn/gün · tahmini kalan ${Math.round(kalanSn / 60)} dk`,
      );
    }
  }

  const cov = await getCoverageSummary(sb, universe);
  console.log(`\nBİTTİ — kapsama ${cov.completeDays} tam gün (${cov.oldest} → ${cov.newest})`);
  console.log('Sırada: /api/cron/fund-scan çağır (metrikleri yeniden hesaplar).');
}

main().catch((e) => { console.error('BAŞARISIZ:', e); process.exit(1); });
