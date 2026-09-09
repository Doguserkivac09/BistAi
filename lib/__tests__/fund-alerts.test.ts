/**
 * Fon erken uyarı motoru testleri (FON-FAZ6-PLAN 6A-3).
 *
 * ⚠️ PHE fixture'ı GERÇEK VERİDİR — `fund_prices` tablosundan alındı
 * (TEFAS · PUSULA PORTFÖY HİSSE SENEDİ FONU · 2026-03-17 → 2026-08-13).
 * Uydurulmuş sayı yok; bu yüzden testler gerçek dünya davranışını kilitler.
 *
 * Bu dosyanın en önemli testi "PHE'de ayrışma tetiklenir" DEĞİL — 6A-0 ölçümü
 * o hipotezi çürüttü. En önemli testler, motorun VERİ YOKLUĞUNDA ve YÖN
 * ÇELİŞKİSİNDE sinyal UYDURMADIĞINI kanıtlayanlardır.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAlerts, measureAlerts, alertsToFlags, periodZScore, stdSapma, medyan,
  MIN_DIST_OBS, FLIGHT_Z,
} from '../fund-alerts';
import type { FlowPoint } from '../fund-store';

/** [tarih, fiyat, pay adedi, yatırımcı] — gerçek PHE verisi. */
const PHE_HAM: Array<[string, number, number, number]> = [
  ['2026-03-17', 2.398859, 6935018126, 47737], ['2026-03-18', 2.426963, 6886438854, 49220],
  ['2026-03-19', 2.431588, 7028167345, 49715], ['2026-03-23', 2.40375, 7107148768, 50489],
  ['2026-03-24', 2.461937, 7088085682, 50691], ['2026-03-25', 2.498236, 6075848635, 51441],
  ['2026-03-26', 2.546488, 6501628814, 49794], ['2026-03-27', 2.562147, 6803702860, 51461],
  ['2026-03-30', 2.572269, 7457476675, 54120], ['2026-03-31', 2.580167, 7748828217, 55610],
  ['2026-04-01', 2.606992, 8007045249, 57732], ['2026-04-02', 2.622766, 8375988599, 59500],
  ['2026-04-03', 2.638986, 8785405577, 61832], ['2026-04-06', 2.631541, 9207238699, 63980],
  ['2026-04-07', 2.648981, 9408657014, 65684], ['2026-04-08', 2.638286, 9656243440, 67957],
  ['2026-04-09', 2.725876, 9876991178, 69410], ['2026-04-10', 2.722281, 10216077548, 70774],
  ['2026-04-13', 2.768049, 10616658152, 72905], ['2026-04-14', 2.770983, 11337753369, 75166],
  ['2026-04-15', 2.765117, 11638909410, 77997], ['2026-04-16', 2.773872, 12126423625, 80337],
  ['2026-04-17', 2.767785, 12302627265, 82662], ['2026-04-20', 2.822538, 12428548739, 84113],
  ['2026-04-21', 2.828791, 12273507666, 85163], ['2026-04-22', 2.830321, 12390056203, 86661],
  ['2026-04-24', 2.82182, 12698851533, 87891], ['2026-04-27', 2.828884, 13152452155, 89020],
  ['2026-04-28', 2.856028, 12968629269, 89982], ['2026-04-29', 2.817793, 12961418675, 90471],
  ['2026-04-30', 2.816142, 12938999822, 90659], ['2026-05-04', 2.858748, 13008460777, 91003],
  ['2026-05-05', 2.855704, 12901562201, 90786], ['2026-05-06', 2.871541, 12809188066, 91414],
  ['2026-05-07', 2.893337, 12951840959, 91375], ['2026-05-08', 2.919987, 12994778514, 91677],
  ['2026-05-11', 2.912932, 13495097264, 92153], ['2026-05-12', 2.92482, 13534824857, 92625],
  ['2026-05-13', 2.932508, 13797113627, 93590], ['2026-05-14', 2.940961, 13460231188, 93327],
  ['2026-05-15', 2.947942, 13403986683, 92812], ['2026-05-18', 2.88907, 13431093067, 92886],
  ['2026-05-20', 2.891955, 13729143867, 93214], ['2026-05-21', 2.905221, 12804597537, 93356],
  ['2026-05-22', 2.778949, 12543945595, 90603], ['2026-05-25', 2.827022, 12526623905, 88339],
  ['2026-05-26', 2.84544, 12735435138, 87581], ['2026-06-01', 2.86433, 12333493936, 87509],
  ['2026-06-02', 2.899997, 12255471481, 85125], ['2026-06-03', 3.008753, 11835425730, 85516],
  ['2026-06-04', 3.048807, 11969397793, 84206], ['2026-06-05', 3.10418, 12311318541, 84450],
  ['2026-06-08', 3.143424, 12844859068, 85567], ['2026-06-09', 3.236871, 12966484947, 86877],
  ['2026-06-10', 3.269763, 13202246698, 89364], ['2026-06-11', 3.292996, 13281473968, 91745],
  ['2026-06-12', 3.329603, 13722659025, 94000], ['2026-06-15', 3.405477, 14281876894, 96167],
  ['2026-06-16', 3.49162, 14675061048, 98086], ['2026-06-17', 3.52699, 14640226053, 103118],
  ['2026-06-18', 3.563461, 15087298183, 107248], ['2026-06-19', 3.646957, 15214074391, 111413],
  ['2026-06-22', 3.675052, 15874358962, 115095], ['2026-06-23', 3.682039, 16383723367, 118477],
  ['2026-06-24', 3.689558, 16721372035, 124832], ['2026-06-25', 3.692454, 17264636426, 128756],
  ['2026-06-26', 3.692406, 17720534746, 131626], ['2026-06-29', 3.695813, 18177241393, 134050],
  ['2026-06-30', 3.703281, 18161878803, 135112], ['2026-07-01', 3.702618, 18334726961, 136933],
  ['2026-07-02', 3.723714, 18434357328, 137563], ['2026-07-03', 3.748901, 18375405725, 138836],
  ['2026-07-06', 3.751613, 18581652894, 139846], ['2026-07-07', 3.751815, 18827566319, 141398],
  ['2026-07-08', 3.771043, 18903887617, 144628], ['2026-07-09', 3.780487, 18658704219, 145604],
  ['2026-07-10', 3.821399, 18362370818, 146098], ['2026-07-13', 3.863468, 18449141679, 146667],
  ['2026-07-14', 3.868203, 18701713475, 147938], ['2026-07-16', 3.891826, 19055327130, 151330],
  ['2026-07-17', 3.910068, 19239419585, 153264], ['2026-07-20', 3.88273, 19455177217, 156969],
  ['2026-07-21', 3.881661, 19550361622, 158766], ['2026-07-22', 3.890899, 19368942552, 161211],
  ['2026-07-23', 3.935705, 18920294734, 160454], ['2026-07-24', 3.941443, 18784541627, 159246],
  ['2026-07-27', 3.935875, 18995916633, 159672], ['2026-07-28', 3.938124, 18986438547, 160788],
  ['2026-07-29', 3.922141, 18424044456, 162385], ['2026-07-30', 3.856122, 17912460714, 160805],
  ['2026-07-31', 3.818508, 16622324975, 159675], ['2026-08-03', 3.824175, 14984573933, 154990],
  ['2026-08-04', 3.819628, 13601059263, 147034], ['2026-08-05', 3.835123, 13294251495, 141301],
  ['2026-08-06', 3.826917, 12169801125, 138786], ['2026-08-07', 3.851426, 11978757248, 134555],
  ['2026-08-10', 3.875102, 11076076378, 133320], ['2026-08-11', 3.895899, 10963304693, 130071],
  ['2026-08-12', 3.929228, 10401623849, 129852], ['2026-08-13', 4.001128, 10234463814, 127794],
];

const PHE: FlowPoint[] = PHE_HAM.map(([date, price, shares, investors]) => ({
  date, price, shares, investors, size: null,
}));

/** Deterministik "kıpırtılı" seri — sabit seri sıfır varyans üretir, z hesaplanamaz. */
function seri(n: number, opts: {
  fiyatGunlukPct?: number; yatirimciGunlukPct?: number; payGunlukPct?: number;
} = {}): FlowPoint[] {
  const { fiyatGunlukPct = 0.1, yatirimciGunlukPct = 0.1, payGunlukPct = 0.1 } = opts;
  const out: FlowPoint[] = [];
  let p = 10, y = 100_000, s = 1_000_000_000;
  let tohum = 42;
  const kipir = () => { tohum = (tohum * 1103515245 + 12345) % 2147483648; return (tohum / 2147483648 - 0.5) * 0.4; };
  for (let i = 0; i < n; i++) {
    const g = new Date(Date.UTC(2026, 0, 5 + Math.floor(i / 5) * 7 + (i % 5)));
    p *= 1 + (fiyatGunlukPct + kipir()) / 100;
    y *= 1 + (yatirimciGunlukPct + kipir()) / 100;
    s *= 1 + (payGunlukPct + kipir()) / 100;
    out.push({ date: g.toISOString().slice(0, 10), price: p, shares: Math.round(s), investors: Math.round(y), size: null });
  }
  return out;
}

describe('istatistik yardımcıları', () => {
  test('sabit seride standart sapma null (sıfıra bölme yok)', () => {
    assert.equal(stdSapma([5, 5, 5, 5]), null);
  });

  test('tek gözlemde standart sapma null', () => {
    assert.equal(stdSapma([5]), null);
  });

  test('medyan çift ve tek uzunlukta doğru', () => {
    assert.equal(medyan([3, 1, 2]), 2);
    assert.equal(medyan([4, 1, 2, 3]), 2.5);
    assert.equal(medyan([]), null);
  });

  test('yetersiz gözlemde z-skoru üretilmez (uydurulmaz)', () => {
    const az = new Array(MIN_DIST_OBS - 1).fill(0).map((_, i) => (i % 2 ? 1 : -1));
    assert.equal(periodZScore(az, -30, 20), null);
  });

  test('dönem z-skoru günlük sigmayı √n ile ölçekler', () => {
    // Günlük ort 0, sd 1 → 20 günlük beklenen 0, sd √20 ≈ 4.47.
    const gunluk = new Array(60).fill(0).map((_, i) => (i % 2 ? 1 : -1));
    const z = periodZScore(gunluk, -4.472, 20);
    assert.ok(z != null && Math.abs(z + 1) < 0.05, `z ≈ −1 bekleniyordu, gelen ${z}`);
  });
});

describe('measureAlerts — look-ahead bias yok', () => {
  test('serinin son günü "şimdi" kabul edilir', () => {
    const m = measureAlerts(PHE);
    assert.equal(m.asOf, '2026-08-13');
  });

  test('seriyi erken kesmek ölçümü değiştirir (gelecek sızmıyor)', () => {
    const tam = measureAlerts(PHE);
    const kesik = measureAlerts(PHE.slice(0, 60));
    assert.notEqual(tam.investorsChangeLong, kesik.investorsChangeLong);
    assert.equal(kesik.asOf, PHE[59]!.date);
  });

  test('PHE 13 Ağustos: yatırımcı çıkışı gerçekten ölçülüyor', () => {
    const m = measureAlerts(PHE);
    assert.ok(m.investorsChangeLong != null && m.investorsChangeLong < -10,
      `yatırımcı 20g değişimi negatif olmalı, gelen ${m.investorsChangeLong}`);
    assert.ok(m.investorsZ != null && m.investorsZ < FLIGHT_Z,
      `z eşiğin altında olmalı, gelen ${m.investorsZ}`);
  });
});

describe('buildAlerts — sinyal üretimi', () => {
  test('PHE 13 Ağustos: yatırımcı kaçışı ve ayrışma tetiklenir', () => {
    const a = buildAlerts({ series: PHE, peerMedianPriceChangePct: null });
    const ids = a.map((x) => x.id);
    assert.ok(ids.includes('fon-yatirimci-kacisi'), `gelen: ${ids.join(',')}`);
    assert.ok(ids.includes('fon-ayrisma'), `gelen: ${ids.join(',')}`);
  });

  test('⚠️ YÖN KAPISI: yatırımcı ARTARKEN kaçış/ayrışma üretilmez', () => {
    // Canlıda yakalanan hata: hızlı büyüyen fonda +%39 artış bile kendi
    // dağılımına göre negatif z veriyordu ve "çıkış var" deniyordu.
    // PHE'nin 21 Mayıs kesiti tam olarak bu durumdadır.
    const kesit = PHE.filter((p) => p.date <= '2026-05-21');
    const m = measureAlerts(kesit);
    assert.ok(m.investorsChangeLong != null && m.investorsChangeLong > 0,
      'bu kesitte yatırımcı sayısı ARTMIŞ olmalı');
    const ids = buildAlerts({ series: kesit, peerMedianPriceChangePct: null }).map((x) => x.id);
    assert.ok(!ids.includes('fon-yatirimci-kacisi'), `çıkış üretilmemeliydi: ${ids.join(',')}`);
    assert.ok(!ids.includes('fon-ayrisma'), `ayrışma üretilmemeliydi: ${ids.join(',')}`);
  });

  test('piyasa geneli düşüşte sert düşüş uyarısı ÜRETİLMEZ', () => {
    const s = seri(120, { fiyatGunlukPct: -1 });
    const m = measureAlerts(s);
    // Kategori de aynı oranda düştüyse bu fonun kusuru değildir.
    const ids = buildAlerts({ series: s, peerMedianPriceChangePct: m.priceChangeShort })
      .map((x) => x.id);
    assert.ok(!ids.includes('fon-sert-dusus'), `piyasa düşüşü uyarı olmamalı: ${ids.join(',')}`);
  });

  test('emsalinden ayrışan düşüşte sert düşüş uyarısı ÜRETİLİR', () => {
    const s = seri(120, { fiyatGunlukPct: -3 });
    const m = measureAlerts(s);
    const ids = buildAlerts({ series: s, peerMedianPriceChangePct: (m.priceChangeShort ?? 0) + 20 })
      .map((x) => x.id);
    assert.ok(ids.includes('fon-sert-dusus'), `gelen: ${ids.join(',')}`);
  });

  test('emsal medyanı yoksa sert düşüş iddiası EDİLMEZ', () => {
    const s = seri(120, { fiyatGunlukPct: -3 });
    const ids = buildAlerts({ series: s, peerMedianPriceChangePct: null }).map((x) => x.id);
    assert.ok(!ids.includes('fon-sert-dusus'), 'emsalsiz kıyas iddia edilemez');
  });

  test('yetersiz geçmişte hiçbir uyarı üretilmez (uydurulmaz)', () => {
    const ids = buildAlerts({ series: seri(15), peerMedianPriceChangePct: -30 }).map((x) => x.id);
    assert.deepEqual(ids.filter((i) => i !== 'fon-sert-dusus').length, 0);
  });

  test('boş seri çökmez', () => {
    assert.deepEqual(buildAlerts({ series: [], peerMedianPriceChangePct: null }), []);
  });

  test('yatırımcı verisi eksik günler atlanır, 0 sayılmaz', () => {
    const s = seri(120);
    // Serinin ortasındaki yatırımcı verisini boşalt — sahte %-100 çöküş üretmemeli.
    const delikli = s.map((p, i) => (i > 50 && i < 60 ? { ...p, investors: null } : p));
    const m = measureAlerts(delikli);
    assert.ok(m.investorsChangeLong == null || m.investorsChangeLong > -50,
      `boş gün 0 sayılmış olabilir: ${m.investorsChangeLong}`);
  });
});

describe('alertsToFlags — 6A-0 ölçüm kararı', () => {
  test('ÇÜRÜTÜLEN sinyaller rozet olarak yayınlanmaz', () => {
    // 6A-0: ayrışma ve yatırımcı kaçışının kötü-sonuç oranı taban orandan
    // düşük çıktı. Bunlar bağlam rozeti olarak bile gösterilmez.
    const flags = alertsToFlags(buildAlerts({ series: PHE, peerMedianPriceChangePct: null }));
    assert.ok(!flags.some((f) => f.id === 'fon-ayrisma'), 'ayrışma yayınlanmamalı');
    assert.ok(!flags.some((f) => f.id === 'fon-yatirimci-kacisi'), 'kaçış yayınlanmamalı');
  });

  test('DOĞRULANAN sert düşüş uyarı tonuyla yayınlanır', () => {
    const s = seri(120, { fiyatGunlukPct: -3 });
    const m = measureAlerts(s);
    const flags = alertsToFlags(buildAlerts({
      series: s, peerMedianPriceChangePct: (m.priceChangeShort ?? 0) + 20,
    }));
    const f = flags.find((x) => x.id === 'fon-sert-dusus');
    assert.ok(f, 'sert düşüş rozeti bekleniyordu');
    assert.equal(f!.tone, 'warn');
  });

  test('sert düşüş metni YÖN tahmini yapmaz', () => {
    // Ölçümde bu grubun ortalama getirisi POZİTİFTİ; "düşecek" demek yanlış olur.
    const s = seri(120, { fiyatGunlukPct: -3 });
    const m = measureAlerts(s);
    const f = alertsToFlags(buildAlerts({
      series: s, peerMedianPriceChangePct: (m.priceChangeShort ?? 0) + 20,
    }))[0]!;
    assert.match(f.detail!, /süreceği anlamına gelmez/);
  });
});
