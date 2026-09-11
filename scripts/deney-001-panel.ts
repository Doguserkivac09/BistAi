/**
 * DENEY-001 — panel üretimi (DENEY-001-CONFLUENCE-IC.md §1, §4.1). Kilit: 267a17e.
 *
 * Her hisse-gün t için CANLI `detectAllSignals` yalnız `candles[t-251..t]` üzerinde
 * çalışır (canlı taramayla aynı 252 mumluk pencere). Saklanan: sinyal listesi
 * (tip, yön, şiddet) + canlı `computeConfluence` skoru ve baskın yönü — ikincisi
 * analizdeki formül kopyasının PARİTE kontrolü içindir.
 *
 * ⚠️ Getiriye BAKILMAZ: bu betik gelecekteki hiçbir fiyatı okumaz.
 *
 *   npx tsx scripts/deney-001-panel.ts <önbellek> <panel-çıktı> <shard> <shardSayısı>
 */

import fs from 'node:fs';
import path from 'node:path';
import { detectAllSignals, computeConfluence } from '../lib/signals';
import type { OHLCVCandle } from '../types';

const WIN = 252;
const [cache, out, shardS, nShardS] = process.argv.slice(2);
if (!cache || !out) { console.error('kullanım: <önbellek> <çıktı> [shard] [shardSayısı]'); process.exit(1); }
const shard = Number(shardS ?? 0);
const nShard = Number(nShardS ?? 1);
fs.mkdirSync(out, { recursive: true });

/** Tarihe göre sırala, aynı tarihli tekrarları at (son kaydı tut). */
export function temizMumlar(ham: OHLCVCandle[]): OHLCVCandle[] {
  const m = new Map<string, OHLCVCandle>();
  for (const c of ham) m.set(String(c.date), c);
  return [...m.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

const dosyalar = fs.readdirSync(cache).filter((f) => f.endsWith('.json') && f !== '_manifest.json' && f !== 'XU100.json').sort();
const benim = dosyalar.filter((_, i) => i % nShard === shard);
const basla = Date.now();
let bitti = 0;

for (const f of benim) {
  const hedef = path.join(out, f);
  if (fs.existsSync(hedef)) { bitti++; continue; }
  const sym = f.replace('.json', '');
  const bars = temizMumlar(JSON.parse(fs.readFileSync(path.join(cache, f), 'utf8')) as OHLCVCandle[]);
  // days[tarih] = [sinyaller [tip, yön, şiddet][], canlı skor, canlı baskın yön]
  const days: Record<string, [Array<[string, string, string]>, number, string]> = {};
  for (let t = WIN - 1; t < bars.length; t++) {
    const sinyaller = detectAllSignals(sym, bars.slice(t - WIN + 1, t + 1));
    if (!sinyaller.length) continue;
    const c = computeConfluence(sinyaller);
    days[String(bars[t]!.date)] = [sinyaller.map((s) => [s.type, s.direction, s.severity]), c.score, c.dominantDirection];
  }
  // Atomik yazım: yarım kalan koşu eksik dosya bırakmaz (idempotent devam).
  fs.writeFileSync(`${hedef}.tmp`, JSON.stringify({ sym, n: bars.length, days }));
  fs.renameSync(`${hedef}.tmp`, hedef);
  bitti++;
  if (bitti % 10 === 0) console.log(`[shard ${shard}] ${bitti}/${benim.length} · ${((Date.now() - basla) / 60000).toFixed(1)} dk`);
}
console.log(`[shard ${shard}] BİTTİ ${bitti}/${benim.length} · ${((Date.now() - basla) / 60000).toFixed(1)} dk`);
