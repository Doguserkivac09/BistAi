/**
 * Swing sicil — veritabanına YAZMADAN deneme koşusu (gerçek Yahoo verisiyle).
 * Migration çalıştırılmadan önce cron mantığını uçtan uca görmek için.
 *
 *   npx tsx scripts/swing-sicil-dryrun.ts            # tüm ABD evreni
 *   npx tsx scripts/swing-sicil-dryrun.ts AAPL,NVDA  # alt evren
 */

import { runSwingSicil } from '../lib/swing-sicil-runner';

const symbols = process.argv[2]?.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
runSwingSicil(null, { dryRun: true, symbols, budgetMs: 280_000 })
  .then((r) => console.log(JSON.stringify(r, null, 2)))
  .catch((e) => { console.error('BAŞARISIZ:', e); process.exit(1); });
