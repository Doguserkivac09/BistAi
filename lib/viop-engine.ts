/**
 * VIOP Analiz Motoru — kaldıraç-farkındalıklı (FAZ V1 — VIOP-TRADINGVIEW-PLAN.md).
 *
 * Spot decision-engine'i KLONLAMAZ. Teknik katmanı (RSI/trend/formasyon) `lib/signals.ts`'ten
 * YENİDEN KULLANIR (hesap enstrümandan bağımsız) ama karar/skor/risk AYRI:
 *  - Kaldıraç katmanı: pozisyon boyutu (teminat + risk %), likidasyon mesafesi, baz/vade ayarlı stop.
 *  - Vade sayacı: vadeye < N gün → roll/belirsizlik uyarısı.
 *
 * Çerçeve: "sinyal servisi" DEĞİL → analiz & senaryo dili + zorunlu kaldıraç risk ibaresi.
 * Saf & deterministik (harici I/O yok) — cron veriyi hazırlayıp buraya geçer; test edilebilir.
 */

import type { OHLCVCandle, StockSignal } from '@/types';
import { detectAllSignals, computeConfluence } from './signals';
import type { ViopAssetClass, ViopContract } from './viop-symbols';

/** Motora dışarıdan verilen makro/rejim bağlamı (cron doldurur; -100..100 bias, 0-100 risk). */
export interface ViopMacroContext {
  /** Genel piyasa yön eğilimi: -100 (güçlü ayı) … +100 (güçlü boğa). */
  biasScore?: number;
  /** Rejim/makro etiketi (ör. "risk-on", "nötr"). */
  label?: string;
  /** Makro risk skoru 0-100 (yüksek = temkinli). */
  riskScore?: number;
}

export interface ViopEngineInput {
  contract: ViopContract;
  /** Proxy vadeli OHLCV (baz zaten gömülü). */
  candles: OHLCVCandle[];
  daysToExpiry: number;
  basis: number;
  regime: 'contango' | 'backwardation' | 'flat';
  macro?: ViopMacroContext;
  /** Vadeye kaç günden az kalınca roll uyarısı verilsin (varsayılan 7). */
  rollWarnDays?: number;
}

export interface ViopRiskBlock {
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  stopDistancePct: number;
  riskRewardRatio: number | null;
  /** Kontrat başına notional (₺). */
  notionalPerContract: number;
  /** Kontrat başına başlangıç teminatı (₺). */
  initialMarginPerContract: number;
  /** Kontrat başına sürdürme teminatı (₺) — bunun altına düşünce margin call. */
  maintenanceMarginPerContract: number;
  /** Etkin kaldıraç (≈ 1 / teminat oranı). */
  leverage: number;
  /**
   * MARGIN CALL eşiği: teminatı sürdürme seviyesinin altına düşüren ters hareket %'si.
   * Tasfiye riski BURADA başlar — teminatın tamamının silinmesini beklemez.
   */
  marginCallMovePct: number;
  /** Teminatın TAMAMINI silen ters hareket yüzdesi (margin call'dan sonra gelir). */
  liquidationMovePct: number;
  /** Stop, margin call'dan ÖNCE mi devrede? (true = güvenli kurgu.) */
  stopBeforeMarginCall: boolean;
  /** Kaldıraç/likidasyon uyarı metni. */
  warning: string;
}

export interface ViopSignalResult {
  code: string;
  underlying: string;
  cls: ViopAssetClass;
  label: string;
  direction: 'long' | 'short' | 'notr';
  score: number; // 0-100
  confidence: 'düşük' | 'orta' | 'yüksek';
  technical: {
    confluenceScore: number;
    dominantDirection: 'yukari' | 'asagi' | 'nötr';
    signalCount: number;
    topSignals: string[];
  };
  risk: ViopRiskBlock;
  expiry: { daysToExpiry: number; rollWarning: string | null };
  /** Uzlaşma yöntemi — 'fiziki' ise vade sonunda gerçek pay teslim yükümlülüğü doğar. */
  settlement: 'nakdi' | 'fiziki';
  /** Fiziki teslimatlı sözleşmelerde vade yaklaşırken gösterilecek uyarı. */
  settlementWarning: string | null;
  basis: number;
  regime: 'contango' | 'backwardation' | 'flat';
  dataQuality: 'proxy' | 'delayed' | 'realtime';
  rationale: string;
  disclaimer: string;
}

const DISCLAIMER =
  'Bu içerik genel bir analiz/senaryo değerlendirmesidir, yatırım tavsiyesi değildir. ' +
  'Vadeli işlemler kaldıraçlıdır: yatırdığınız teminatın tamamını ve daha fazlasını ' +
  'kaybedebilirsiniz. Kararlarınızdan yalnızca siz sorumlusunuz.';

/** ATR(14) — futures mumları üzerinde (proxy). */
function computeATR(candles: OHLCVCandle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!, p = candles[i - 1]!;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/** Dominant sinyalin stop/target'ını al; yoksa ATR-tabanlı türet. */
function deriveLevels(
  signals: StockSignal[],
  direction: 'long' | 'short' | 'notr',
  entry: number,
  atr: number | null
): { stop: number; target: number } {
  const sevMap: Record<string, number> = { güçlü: 2, orta: 1, zayıf: 0 };
  const dir = direction === 'long' ? 'yukari' : direction === 'short' ? 'asagi' : null;
  const aligned = dir ? signals.filter((s) => s.direction === dir) : [];
  const dominant = [...aligned].sort((a, b) => (sevMap[b.severity] ?? 0) - (sevMap[a.severity] ?? 0))[0];

  if (dominant?.stopLoss && dominant?.targetPrice) {
    return { stop: dominant.stopLoss, target: dominant.targetPrice };
  }
  // ATR-tabanlı fallback (baz/vade ayarı proxy mumlarda zaten gömülü)
  const a = atr ?? entry * 0.02;
  if (direction === 'short') {
    return { stop: entry + a * 1.5, target: entry - a * 2.5 };
  }
  return { stop: entry - a * 1.5, target: entry + a * 2.5 };
}

/**
 * VIOP kontratı için kaldıraç-farkındalıklı analiz üretir.
 */
export function analyzeViop(input: ViopEngineInput): ViopSignalResult {
  const { contract, candles, daysToExpiry, basis, regime, macro } = input;
  const rollWarnDays = input.rollWarnDays ?? 7;
  /** Fiyatı sözleşmenin minimum fiyat adımına yuvarlar (girilebilir emir seviyesi). */
  const toTick = (v: number) => {
    const t = contract.tickSize;
    if (!t || t <= 0) return parseFloat(v.toFixed(2));
    return parseFloat((Math.round(v / t) * t).toFixed(6));
  };

  const entry = candles[candles.length - 1]?.close ?? 0;

  // ── Teknik katman (signals.ts yeniden kullanılır) ──
  const signals = detectAllSignals(contract.code, candles);
  const conf = computeConfluence(signals);
  const atr = computeATR(candles);

  // ── Yön ──
  let direction: 'long' | 'short' | 'notr' =
    conf.dominantDirection === 'yukari' ? 'long' : conf.dominantDirection === 'asagi' ? 'short' : 'notr';

  // ── Skor: confluence + makro hizası ──
  // Confluence 0-100'ü yön-nötr güç; makro bias yönle hizalıysa +, tersse −.
  let score = conf.score;
  const bias = macro?.biasScore ?? 0;
  if (direction === 'long') score += Math.round(bias * 0.15);
  else if (direction === 'short') score -= Math.round(bias * 0.15);
  // Makro riski yüksekse (temkinli rejim) kaldıraçlı yönlü skoru kıs
  if ((macro?.riskScore ?? 0) >= 70) score -= 8;
  // Vadeye çok az kaldıysa belirsizlik → skoru kıs
  if (daysToExpiry <= rollWarnDays) score -= 6;
  score = Math.max(0, Math.min(100, score));

  // Çok zayıf skorda yönü nötrle
  if (score < 20 && direction !== 'notr') direction = 'notr';

  const confidence: ViopSignalResult['confidence'] =
    score >= 65 ? 'yüksek' : score >= 40 ? 'orta' : 'düşük';

  // ── Kaldıraç / risk bloğu ──
  const raw = deriveLevels(signals, direction, entry, atr);
  const stop = toTick(raw.stop);
  const target = toTick(raw.target);
  const stopDistance = Math.abs(entry - stop);
  const stopDistancePct = entry > 0 ? (stopDistance / entry) * 100 : 0;
  const rewardDistance = Math.abs(target - entry);
  const riskRewardRatio = stopDistance > 0 ? parseFloat((rewardDistance / stopDistance).toFixed(2)) : null;

  const notionalPerContract = entry * contract.multiplier;
  const initialMarginPerContract = notionalPerContract * contract.initialMarginRate;
  const maintenanceMarginPerContract = notionalPerContract * contract.maintenanceMarginRate;
  const leverage = contract.initialMarginRate > 0 ? parseFloat((1 / contract.initialMarginRate).toFixed(1)) : 0;

  // MARGIN CALL: teminat sürdürme seviyesinin altına düşünce tetiklenir. Zarar
  // notional üzerinden birikir → ters hareket %'si = (başlangıç − sürdürme) oranı.
  // Bu, teminatın TAMAMINI silen harekettén (başlangıç oranı) belirgin şekilde ÖNCE gelir.
  const marginCallMovePct = (contract.initialMarginRate - contract.maintenanceMarginRate) * 100;
  const liquidationMovePct = contract.initialMarginRate * 100;
  const stopBeforeMarginCall = stopDistancePct > 0 && stopDistancePct < marginCallMovePct;

  const warning = stopBeforeMarginCall
    ? `Stop mesafesi (%${stopDistancePct.toFixed(1)}) margin call eşiğinin (~%${marginCallMovePct.toFixed(1)}) altında — plan dahilinde stop önce devreye girer. Yine de ~%${liquidationMovePct.toFixed(0)} ters hareket teminatın tamamını siler.`
    : `⚠️ Stop mesafesi (%${stopDistancePct.toFixed(1)}) margin call eşiğine (~%${marginCallMovePct.toFixed(1)}) yakın/aşıyor — stop tetiklenmeden teminat tamamlama çağrısı gelebilir. Pozisyon açılmadan teminat/stop yeniden değerlendirilmeli.`;

  // ── Fiziki teslimat (pay vadelileri) ──
  const settlementWarning = contract.settlement === 'fiziki'
    ? `Bu sözleşme FİZİKİ TESLİMATLIDIR: vadede kapatılmayan pozisyon, ${contract.multiplier} adet payın gerçekten alınması/verilmesi yükümlülüğü doğurur (tam bedel veya pay gerekir). Nakdi uzlaşma YOKTUR.`
    : null;

  // ── Vade uyarısı ──
  const rollWarning = daysToExpiry <= rollWarnDays
    ? `Vadeye ${daysToExpiry} gün kaldı — vade yaklaştıkça baz oynak, roll (bir sonraki vadeye geçiş) düşünülmeli.`
    : null;

  // ── İnsan-okur gerekçe (senaryo dili, AL/SAT emri DEĞİL) ──
  const topSignals = signals
    .slice()
    .sort((a, b) => ({ güçlü: 2, orta: 1, zayıf: 0 }[b.severity] ?? 0) - ({ güçlü: 2, orta: 1, zayıf: 0 }[a.severity] ?? 0))
    .slice(0, 3)
    .map((s) => s.type);

  const dirText = direction === 'long' ? 'yukarı yönlü' : direction === 'short' ? 'aşağı yönlü' : 'belirsiz/nötr';
  const rationale =
    `${contract.label}: teknik tablo ${dirText} bir senaryoya işaret ediyor (confluence ${conf.score}/100` +
    (topSignals.length ? `, öne çıkan: ${topSignals.join(', ')}` : '') + `). ` +
    `Baz ${basis >= 0 ? '+' : ''}${basis.toFixed(0)} puan (${regime}); ` +
    (macro?.label ? `makro: ${macro.label}. ` : '') +
    (rollWarning ? rollWarning + ' ' : '') +
    `Kaldıraç ~${leverage}x — küçük bir ters hareket teminatta büyük etki yapar.`;

  return {
    code: contract.code,
    underlying: contract.underlying,
    cls: contract.cls,
    label: contract.label,
    direction,
    score,
    confidence,
    technical: {
      confluenceScore: conf.score,
      dominantDirection: conf.dominantDirection,
      signalCount: signals.length,
      topSignals,
    },
    risk: {
      entryPrice: toTick(entry),
      stopPrice: stop,
      targetPrice: target,
      stopDistancePct: parseFloat(stopDistancePct.toFixed(2)),
      riskRewardRatio,
      notionalPerContract: parseFloat(notionalPerContract.toFixed(2)),
      initialMarginPerContract: parseFloat(initialMarginPerContract.toFixed(2)),
      maintenanceMarginPerContract: parseFloat(maintenanceMarginPerContract.toFixed(2)),
      leverage,
      marginCallMovePct: parseFloat(marginCallMovePct.toFixed(2)),
      liquidationMovePct: parseFloat(liquidationMovePct.toFixed(1)),
      stopBeforeMarginCall,
      warning,
    },
    expiry: { daysToExpiry, rollWarning },
    settlement: contract.settlement,
    settlementWarning,
    basis: parseFloat(basis.toFixed(2)),
    regime,
    dataQuality: 'proxy',
    rationale,
    disclaimer: DISCLAIMER,
  };
}
