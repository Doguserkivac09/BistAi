/**
 * FAZ 6A-0 — erken uyarı sinyallerinin GERİYE DÖNÜK ÖLÇÜMÜ (zorunlu ön adım).
 *
 * ⚠️ NEDEN VAR: "yatırımcı kaçışı fiyat çöküşünü önceden haber verir" bir ALFA
 * İDDİASIDIR ve tek vakadan (PHE) doğdu. Bu projede alfa iddiaları ölçülmeden
 * yayınlanmaz. Betik `lib/fund-alerts.ts`'in AYNI fonksiyonlarını geçmişe
 * uygular — ölçtüğümüz kod ile canlıda çalışacak kod aynıdır.
 *
 * ⚠️ LOOK-AHEAD BIAS YOK: seri her t gününde KESİLİR, sinyal yalnız o ana kadarki
 * veriyle üretilir, sonuç ise t+20'de ölçülür.
 *
 * ⚠️ ÖRNEKLEM BAĞIMSIZ DEĞİL: ardışık günler aynı olayı tekrar sayar (overlap).
 * Bu yüzden hem GÜN bazlı hem EPİZOT bazlı (ardışık tetikler tek olay) rapor
 * edilir; karar epizot sayılarına göre verilir.
 *
 * Kullanım:
 *   npx tsx scripts/fund-alert-backtest.ts            # TEFAS
 *   npx tsx scripts/fund-alert-backtest.ts BES
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { getFlowSeries, type FlowPoint } from '../lib/fund-store';
import { buildAlerts, measureAlerts, medyan, ortalama, LONG_WINDOW, SHORT_WINDOW, type FundAlertId } from '../lib/fund-alerts';
import type { FundUniverse } from '../lib/fund-universe';

/** Sonucun ölçüldüğü ufuk (iş günü). */
const FORWARD = 20;
/** Sinyal üretmeye başlamadan önce gereken en az geçmiş. */
const MIN_HISTORY = 70;
/** "Kötü sonuç" eşiği (%) — kullanıcıyı korumak istediğimiz olay. */
const BAD = -10;

function loadEnv(): Record<string, string> {
  const p = path.join(process.cwd(), '.env.local');
  return Object.fromEntries(
    fs.readFileSync(p, 'utf8').split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
  );
}

interface Vaka {
  code: string;
  date: string;
  ids: FundAlertId[];
  forwardPct: number;
  /** Aynı fonda ardışık tetiklerin ilki mi (epizot başı). */
  epizotBasi: boolean;
}

function ozet(etiket: string, getiriler: number[], taban: number[]): string {
  if (getiriler.length === 0) return `${etiket.padEnd(28)} — hiç tetiklenmedi`;
  const ort = ortalama(getiriler)!;
  const med = medyan(getiriler)!;
  const kotu = (getiriler.filter((x) => x <= BAD).length / getiriler.length) * 100;
  const tabanOrt = ortalama(taban) ?? 0;
  const tabanKotu = taban.length ? (taban.filter((x) => x <= BAD).length / taban.length) * 100 : 0;
  return (
    `${etiket.padEnd(28)} n=${String(getiriler.length).padStart(5)} · ` +
    `ort %${ort.toFixed(1).padStart(6)} (taban %${tabanOrt.toFixed(1)}) · ` +
    `medyan %${med.toFixed(1).padStart(6)} · ` +
    `kötü(≤%${BAD}) %${kotu.toFixed(1).padStart(5)} (taban %${tabanKotu.toFixed(1)})`
  );
}

async function main() {
  const universe = (process.argv[2] ?? 'TEFAS') as FundUniverse;
  if (universe !== 'TEFAS' && universe !== 'BES') throw new Error('evren TEFAS veya BES olmalı');

  const env = loadEnv();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`[6A-0] ${universe} — akım serileri okunuyor…`);
  const seriler = await getFlowSeries(sb, universe, '2000-01-01');
  console.log(`[6A-0] ${seriler.size} fon okundu.`);

  // Kategori medyanı kapısı için: tarih → o gün tüm evrenin 5g fiyat değişimi.
  // (Gerçek kategori haritası 6D'de gelecek; şimdilik EVREN medyanı kullanılıyor
  //  ve bu rapor için yeterli — amaç sinyalin ayrıştırıcılığını ölçmek.)
  const evrenDegisim = new Map<string, number[]>();
  for (const [, s] of seriler) {
    const sirali = [...s].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = SHORT_WINDOW; i < sirali.length; i++) {
      const on = sirali[i - SHORT_WINDOW]!, su = sirali[i]!;
      if (!(on.price > 0)) continue;
      const d = ((su.price - on.price) / on.price) * 100;
      if (!Number.isFinite(d)) continue;
      if (!evrenDegisim.has(su.date)) evrenDegisim.set(su.date, []);
      evrenDegisim.get(su.date)!.push(d);
    }
  }
  const evrenMedyan = new Map<string, number>();
  for (const [d, xs] of evrenDegisim) { const m = medyan(xs); if (m != null) evrenMedyan.set(d, m); }

  const vakalar: Vaka[] = [];
  const taban: number[] = [];
  let denenen = 0;

  for (const [code, ham] of seriler) {
    const s = [...ham].sort((a, b) => a.date.localeCompare(b.date));
    if (s.length < MIN_HISTORY + FORWARD) continue;
    let oncekiTetikIdx = -99;

    for (let i = MIN_HISTORY; i + FORWARD < s.length; i++) {
      const su = s[i]!, ileri = s[i + FORWARD]!;
      if (!(su.price > 0) || !(ileri.price > 0)) continue;
      const forwardPct = ((ileri.price - su.price) / su.price) * 100;
      if (!Number.isFinite(forwardPct)) continue;

      denenen++;
      taban.push(forwardPct);

      const kesit: FlowPoint[] = s.slice(0, i + 1);
      const alerts = buildAlerts({
        series: kesit,
        peerMedianPriceChangePct: evrenMedyan.get(su.date) ?? null,
      });
      if (alerts.length === 0) continue;

      vakalar.push({
        code, date: su.date,
        ids: alerts.map((a) => a.id),
        forwardPct,
        epizotBasi: i - oncekiTetikIdx > 5,
      });
      oncekiTetikIdx = i;
    }
  }

  console.log(`[6A-0] ${denenen} fon-gün denendi, ${vakalar.length} tetik.\n`);

  const ids: FundAlertId[] = ['fon-sert-dusus', 'fon-yatirimci-kacisi', 'fon-ayrisma'];
  console.log(`=== ${universe} · sonraki ${FORWARD} işlem günü getirisi ===`);
  console.log(ozet('TABAN (tüm fon-gün)', taban, taban));
  console.log('');

  for (const id of ids) {
    const gun = vakalar.filter((v) => v.ids.includes(id));
    const epizot = gun.filter((v) => v.epizotBasi);
    const oran = (gun.length / Math.max(1, denenen)) * 100;
    console.log(ozet(`${id} (gün)`, gun.map((v) => v.forwardPct), taban));
    console.log(ozet(`${id} (epizot)`, epizot.map((v) => v.forwardPct), taban));
    console.log(`${''.padEnd(28)} tetiklenme oranı %${oran.toFixed(2)}` +
      (oran > 70 ? '  ⚠️ KALİBRASYON: evrenin çoğunda tetikliyor → bağlam' : ''));
    console.log('');
  }

  // En sert epizotlar — gözle denetim için
  const enKotu = [...vakalar].filter((v) => v.epizotBasi && v.ids.includes('fon-ayrisma'))
    .sort((a, b) => a.forwardPct - b.forwardPct).slice(0, 10);
  if (enKotu.length) {
    console.log('Ayrışma — en kötü sonuçlanan 10 epizot:');
    for (const v of enKotu) console.log(`  ${v.code} ${v.date} → %${v.forwardPct.toFixed(1)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
