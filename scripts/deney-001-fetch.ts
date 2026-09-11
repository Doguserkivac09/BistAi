/**
 * DENEY-001 — veri çekme (bkz. DENEY-001-CONFLUENCE-IC.md §1).
 *
 * Yahoo v8 chart, `period1=2000-01-01` → şimdi, `interval=1d`, ham OHLCV.
 * ⚠️ `range=10y` 2016-09'da başlıyor, `range=max` aylık muma düşüyor —
 * günlük tam geçmişi yalnız açık tarih aralığı veriyor.
 *
 * İdempotent: önbellekte olan sembol tekrar çekilmez. Art arda 8 hata → durur
 * (engelde ısrar etme). Kullanıcının ev IP'sinden çalışır → nazik gecikme.
 *
 *   npx tsx scripts/deney-001-fetch.ts <önbellek-klasörü>
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { BIST_SYMBOLS } from '../types';

interface Mum { date: string; open: number; high: number; low: number; close: number; volume: number }

const dir = process.argv[2];
if (!dir) { console.error('kullanım: npx tsx scripts/deney-001-fetch.ts <klasör>'); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PERIOD1 = 946_684_800; // 2000-01-01T00:00:00Z

async function cek(ySym: string): Promise<Mum[]> {
  const period2 = Math.floor(Date.now() / 1000);
  let son: Error | null = null;
  for (const host of ['query1', 'query2']) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${ySym}?period1=${PERIOD1}&period2=${period2}&interval=1d`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(60_000),
      });
      if (r.status === 404) return [];
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json() as any;
      const res = j?.chart?.result?.[0];
      const ts: number[] = res?.timestamp ?? [];
      const q = res?.indicators?.quote?.[0] ?? {};
      const out: Mum[] = [];
      for (let i = 0; i < ts.length; i++) {
        const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
        if (o == null || h == null || l == null || c == null || c <= 0) continue;
        out.push({ date: new Date(ts[i]! * 1000).toISOString().slice(0, 10), open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? 0 });
      }
      return out;
    } catch (e) { son = e as Error; }
  }
  throw son ?? new Error('bilinmeyen hata');
}

async function main() {
  const hedefler = ['XU100', ...new Set(BIST_SYMBOLS as readonly string[])];
  let ardisik = 0, cekilen = 0, bos = 0, atlanan = 0;
  for (const [i, sym] of hedefler.entries()) {
    const file = path.join(dir!, `${sym}.json`);
    if (fs.existsSync(file)) { atlanan++; continue; }
    try {
      const m = await cek(`${sym}.IS`);
      fs.writeFileSync(file, JSON.stringify(m));
      if (m.length) cekilen++; else bos++;
      ardisik = 0;
    } catch (e) {
      ardisik++;
      console.log(`  ${sym} HATA: ${(e as Error).message}`);
      if (ardisik >= 8) { console.error('⛔ art arda 8 hata — DURULDU (idempotent, sonra tekrar koş).'); process.exitCode = 2; return; }
    }
    if ((i + 1) % 50 === 0) console.log(`[${i + 1}/${hedefler.length}] çekilen ${cekilen} · boş ${bos} · önbellekte ${atlanan}`);
    await sleep(400 + Math.random() * 500);
  }
  // Tekrarlanabilirlik: önbellek içeriğinin hash'i (spesifikasyon §11)
  const hash = crypto.createHash('sha256');
  for (const f of fs.readdirSync(dir!).filter((x) => x.endsWith('.json') && x !== '_manifest.json').sort()) hash.update(f).update(fs.readFileSync(path.join(dir!, f)));
  const manifest = { fetchedAt: new Date().toISOString(), symbols: hedefler.length, cekilen, bos, atlanan, sha256: hash.digest('hex') };
  fs.writeFileSync(path.join(dir!, '_manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('BİTTİ', JSON.stringify(manifest));
}

main().catch((e) => { console.error('BAŞARISIZ:', e); process.exit(1); });
