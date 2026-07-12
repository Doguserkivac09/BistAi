/**
 * Hacim Profili (Volume Profile) hesabı — saf, deterministik.
 *
 * Belirli mumlar için fiyat seviyelerine göre hacim dağılımını (volume-at-price) üretir:
 *  - Görünür Aralık (VPVR): grafikte görünen mumlar → pan/zoom'da dinamik.
 *  - Sabit Aralık (FRVP): kullanıcının seçtiği zaman aralığındaki mumlar.
 * POC (Point of Control = en çok işlem gören fiyat) + Değer Alanı (Value Area, hacmin %70'i).
 */

import type { OHLCVCandle } from '@/types';

export interface VPBin {
  low: number;   // bin alt fiyat
  high: number;  // bin üst fiyat
  volume: number;
  buyVol: number;   // yükselen mum hacmi (yaklaşık alım)
  sellVol: number;  // düşen mum hacmi (yaklaşık satım)
}

export interface VolumeProfile {
  bins: VPBin[];
  pocPrice: number;   // POC — en yüksek hacimli bin'in orta fiyatı
  vaHigh: number;     // Değer Alanı üst sınırı
  vaLow: number;      // Değer Alanı alt sınırı
  maxVol: number;     // en yüksek bin hacmi (bar ölçekleme için)
  totalVol: number;
  priceMin: number;
  priceMax: number;
}

/**
 * @param candles Profil hesaplanacak mumlar.
 * @param binCount Fiyat kovası sayısı (satır sayısı).
 * @param valueAreaPct Değer alanı oranı (varsayılan 0.70).
 */
export function computeVolumeProfile(
  candles: OHLCVCandle[],
  binCount = 24,
  valueAreaPct = 0.7,
): VolumeProfile | null {
  if (!candles.length) return null;
  let priceMin = Infinity, priceMax = -Infinity;
  for (const c of candles) { if (c.low < priceMin) priceMin = c.low; if (c.high > priceMax) priceMax = c.high; }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax) || priceMax <= priceMin) return null;

  const range = priceMax - priceMin;
  const binSize = range / binCount;
  const bins: VPBin[] = Array.from({ length: binCount }, (_, i) => ({
    low: priceMin + i * binSize,
    high: priceMin + (i + 1) * binSize,
    volume: 0, buyVol: 0, sellVol: 0,
  }));

  for (const c of candles) {
    const vol = c.volume ?? 0;
    if (vol <= 0) continue;
    const lo = c.low, hi = c.high;
    const span = Math.max(hi - lo, binSize * 0.001);
    const isBuy = c.close >= c.open;
    // Mumun [low,high] aralığını kapsadığı bin'lere hacmi oransal dağıt
    const firstBin = Math.max(0, Math.floor((lo - priceMin) / binSize));
    const lastBin = Math.min(binCount - 1, Math.floor((hi - priceMin) / binSize));
    for (let b = firstBin; b <= lastBin; b++) {
      const bin = bins[b]!;
      const overlap = Math.min(hi, bin.high) - Math.max(lo, bin.low);
      if (overlap <= 0) continue;
      const w = overlap / span;
      const v = vol * w;
      bin.volume += v;
      if (isBuy) bin.buyVol += v; else bin.sellVol += v;
    }
  }

  let pocIdx = 0, maxVol = 0, totalVol = 0;
  bins.forEach((b, i) => { totalVol += b.volume; if (b.volume > maxVol) { maxVol = b.volume; pocIdx = i; } });

  // Değer Alanı: POC'tan başlayıp komşu bin'leri (yüksek olanı tercih ederek) %70'e kadar ekle
  let lo = pocIdx, hi = pocIdx, acc = bins[pocIdx]!.volume;
  const target = totalVol * valueAreaPct;
  while (acc < target && (lo > 0 || hi < binCount - 1)) {
    const nextLo = lo > 0 ? bins[lo - 1]!.volume : -1;
    const nextHi = hi < binCount - 1 ? bins[hi + 1]!.volume : -1;
    if (nextHi >= nextLo && nextHi >= 0) { hi++; acc += nextHi; }
    else if (nextLo >= 0) { lo--; acc += nextLo; }
    else break;
  }

  const pocBin = bins[pocIdx]!;
  return {
    bins,
    pocPrice: (pocBin.low + pocBin.high) / 2,
    vaHigh: bins[hi]!.high,
    vaLow: bins[lo]!.low,
    maxVol,
    totalVol,
    priceMin,
    priceMax,
  };
}
