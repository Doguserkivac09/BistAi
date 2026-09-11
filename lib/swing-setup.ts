/**
 * Swing kurulumu — CANLI KURAL (tek kaynak). ABD günlük, yüksek hacimli hisseler.
 *
 * NEREDEN GELDİ: `scripts/swing-backtest.ts` (2026-09-11). Kullanıcının TradingView
 * kurulumu (RSI dip + ADX tepeden dönüş + VI+ dipten dönüş + OBV yeşile dönüş)
 * BIST 1s/1g ve ABD 1s'de rastgele girişten İYİ ÇIKMADI. Tek anlamlı sonuç:
 * ABD günlük + "−DI, +DI'yı yukarı kesince çık" → SPY'a göre işlem başına
 * +1,1 puan [+0,2, +2,1], iki yarıda pozitif, 8/8 varyant anlamlı.
 *
 * ⚠️ YAYINDA DEĞİL. Tanım aynı veride birkaç tur düzeltildi (geçmişe uydurma
 * riski). Bu dosya yalnız ileriye dönük SİCİL içindir (`lib/swing-sicil-runner.ts`):
 * sinyaller gizlice kaydedilir, aylar sonra gerçek sonuçla ölçülür.
 *
 * ⚠️ PARİTE: ölçülen tanımla birebir aynı olmalı. Bir şey değiştirirsen
 * `npx tsx scripts/swing-backtest.ts parity` ile doğrula ve SWING_RULE_VERSION'ı
 * artır — eski kayıtlar eski kuralla açıldı; karışırsa sicil anlamını yitirir.
 */

import type { OHLCVCandle } from '@/types';
import { calculateADX, calculateOBV, calculateRSIWilder, calculateSMA, calculateVortex } from './indicators';

export const SWING_RULE_VERSION = 'durum-v1-1d-di';

/** Kullanıcının TradingView ayarları + ölçümde sabitlenen pencereler. */
export const SWING = {
  rsiPeriod: 14,
  rsiLow: 30,
  diPeriod: 14,
  /** ADX anahtar seviyesi — zirve bunun üstünde olmalı */
  adxKey: 23,
  viPeriod: 7,
  obvSma: 21,
  /** ADX zirvesi son 10 mum içinde (pencere başında değil, bugün değil) */
  adxLook: 10,
  /** VI+ dibi = son 20 mumun minimumu, 1-5 mum önce */
  viWin: 20,
  viLook: 5,
  /** OBV, SMA21'i son 3 mum içinde alttan kesmiş */
  obvCrossLook: 3,
  /** Bayrakların hesaplanmaya başladığı ilk mum (ölçümdeki OBV_RANGE) */
  flagStart: 60,
  /** RSI dibi / ADX dönüşü / VI+ dönüşü son 5 mum içinde olmuş olmalı */
  zone: 5,
  /** Girişte eğim: ADX↓ −DI↓ VI+↑ VI−↓ son 1 mumda */
  egim: 1,
  /** Çıkış sinyali gelmezse en uzun tutma (mum) */
  maxHold: 60,
  /** "Yüksek hacimli" = 20 günlük medyan dolar hacmi */
  minDollarVol: 100_000_000,
  liqWindow: 20,
} as const;

export interface SwingSeries {
  /** t kapanışında giriş kurulumu tamamlandı → giriş t+1 AÇILIŞ */
  entry: boolean[];
  /** −DI t'de +DI'yı yukarı kesti → çıkış t+1 AÇILIŞ */
  exitCross: boolean[];
  /** 20 günlük medyan dolar hacmi ≥ eşik */
  liquid: boolean[];
}

function medyan(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function computeSwingSeries(candles: OHLCVCandle[], minDollarVol: number = SWING.minDollarVol): SwingSeries {
  const n = candles.length;
  const entry = new Array<boolean>(n).fill(false);
  const exitCross = new Array<boolean>(n).fill(false);
  const liquid = new Array<boolean>(n).fill(false);
  if (n === 0) return { entry, exitCross, liquid };

  const h = candles.map((c) => c.high), l = candles.map((c) => c.low);
  const c = candles.map((x) => x.close), v = candles.map((x) => x.volume);
  const rsi = calculateRSIWilder(c, SWING.rsiPeriod);
  const { plusDi, minusDi, adx } = calculateADX(h, l, c, SWING.diPeriod);
  const { viPlus, viMinus } = calculateVortex(h, l, c, SWING.viPeriod);
  const obv = calculateOBV(c, v);
  const obvSma = calculateSMA(obv, SWING.obvSma);
  const dolar = c.map((x, i) => x * v[i]!);

  const S = SWING.egim;
  let sonRsi = -1_000_000, sonAdx = -1_000_000, sonVi = -1_000_000;
  const icinde = (son: number, t: number) => t - son < SWING.zone;

  for (let t = 0; t < n; t++) {
    if (rsi[t]! <= SWING.rsiLow) sonRsi = t;

    let obvKes = false;
    if (t >= SWING.flagStart) {
      // ADX tepeden dönüş (−DI baskınken)
      if (Number.isFinite(adx[t - SWING.adxLook]) && Number.isFinite(adx[t])) {
        let p = t - SWING.adxLook;
        for (let j = t - SWING.adxLook; j <= t; j++) if (adx[j]! > adx[p]!) p = j;
        if (p > t - SWING.adxLook && p < t && adx[t]! < adx[t - 1]! && adx[p]! >= SWING.adxKey
          && minusDi[p]! > plusDi[p]!) sonAdx = t;
      }
      // VI+ dipten dönüş
      if (Number.isFinite(viPlus[t - SWING.viWin + 1])) {
        let mn = t - SWING.viWin + 1;
        for (let j = t - SWING.viWin + 1; j <= t; j++) if (viPlus[j]! < viPlus[mn]!) mn = j;
        if (t - mn >= 1 && t - mn <= SWING.viLook && viPlus[t]! > viPlus[t - 1]!) sonVi = t;
      }
      // OBV yeşile döndü (SMA21'i alttan kesti)
      let alttaydi = false;
      for (let j = t - SWING.obvCrossLook; j < t; j++) if (obv[j]! <= obvSma[j]!) alttaydi = true;
      obvKes = obv[t]! > obvSma[t]! && alttaydi;
    }

    entry[t] = obvKes
      && icinde(sonRsi, t) && icinde(sonAdx, t) && icinde(sonVi, t)
      && t >= S
      && adx[t]! < adx[t - S]! && minusDi[t]! < minusDi[t - S]!
      && viPlus[t]! > viPlus[t - S]! && viMinus[t]! < viMinus[t - S]!;

    exitCross[t] = t >= 1 && minusDi[t]! > plusDi[t]! && minusDi[t - 1]! <= plusDi[t - 1]!;

    if (t >= SWING.liqWindow - 1) liquid[t] = medyan(dolar.slice(t - SWING.liqWindow + 1, t + 1)) >= minDollarVol;
  }
  return { entry, exitCross, liquid };
}

export interface SwingTrade {
  /** Giriş mumu (sinyal+1). null → henüz oluşmadı */
  entryIdx: number | null;
  entryPrice: number | null;
  /** Çıkış fiyatının alındığı mum. null → işlem açık */
  exitIdx: number | null;
  exitPrice: number | null;
  exitReason: 'di-kesisim' | 'sure-doldu' | null;
  /** Kesişim görüldü ama çıkış mumu (t+1) henüz yok */
  exitSignalIdx: number | null;
  barsHeld: number | null;
}

/**
 * Sinyal mumundan işlemi mumlardan DETERMİNİSTİK olarak çözer (ölçümdeki
 * `cikisBul` ile aynı): giriş t+1 açılış; ilk −DI>+DI kesişimi k (k ≥ giriş)
 * → çıkış k+1 açılış; kesişim yoksa `maxHold`. mumunun kapanışı.
 * Her cron koşusunda baştan çözülür → idempotent, kaçırılan gün sorun olmaz.
 */
export function resolveSwingTrade(candles: OHLCVCandle[], series: SwingSeries, signalIdx: number): SwingTrade {
  const bos: SwingTrade = { entryIdx: null, entryPrice: null, exitIdx: null, exitPrice: null, exitReason: null, exitSignalIdx: null, barsHeld: null };
  const n = candles.length;
  const e = signalIdx + 1;
  if (signalIdx < 0 || e >= n) return bos;
  const giris = candles[e]!.open;
  const tr: SwingTrade = { ...bos, entryIdx: e, entryPrice: giris };
  const bitis = e + SWING.maxHold - 1;
  for (let k = e; k < n; k++) {
    if (series.exitCross[k]) {
      if (k + 1 < n) return { ...tr, exitIdx: k + 1, exitPrice: candles[k + 1]!.open, exitReason: 'di-kesisim', barsHeld: k - e + 1 };
      return { ...tr, exitSignalIdx: k };
    }
    if (k === bitis) return { ...tr, exitIdx: k, exitPrice: candles[k]!.close, exitReason: 'sure-doldu', barsHeld: SWING.maxHold };
  }
  return tr;
}
