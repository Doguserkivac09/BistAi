/**
 * Kâr Kalitesi Motoru (Bilanço Öngörü FAZ B1).
 * Kullanıcının 1. sorusu: "Bu şirket faaliyet kârı yapıyor mu, GERÇEKTEN kâr edebiliyor mu?"
 *
 * Saf/deterministik. İş Yatırım standalone çeyreklerini (lib/isyatirim-financials) alır.
 * Net kâr TMS-29 ile operasyonu ölçmüyor (net parasal pozisyon kazancı/kaybı içeriyor) →
 * FAALİYET kârı dürüst sayı. Bu motor kârın NEREDEN geldiğini ayrıştırır.
 *
 * Girdiler İş Yatırım'dan GERÇEK raporlanmış (EBIT 3HACA, finansman gideri 3HC, net kâr 3L,
 * faaliyet nakdi 4C) — profit bridge tahmin değil. Yalnız TMS-29 net parasal pozisyon
 * bilançodan TAHMİN edilir (KAP dipnotu bloklu) → 'estimated' etiketiyle işaretlenir.
 */

import type { IsyQuarter } from '@/lib/isyatirim-financials';
import { computeTTM } from '@/lib/isyatirim-financials';

export type EarningsVerdict = 'gerçek' | 'finansman-yükü' | 'kağıt-üstü' | 'zayıf' | 'belirsiz';

export interface ProfitBridgeStep {
  key: string;
  label: string;
  amount: number;        // TL
  pctOfRevenue: number | null;  // hasılatın %'si
}

export interface EarningsQualityFlag {
  tone: 'kırmızı' | 'turuncu' | 'yeşil';
  code: 'kağıt-üstü' | 'finansman-yükü' | 'gerçek-faaliyet' | 'faaliyet-zararı' | 'parasal-şişkin';
  label: string;
  detail: string;
}

export interface EarningsQualityResult {
  applicable: boolean;
  verdict: EarningsVerdict;
  score: number;                        // 0-100 mutlak kalite
  bridge: ProfitBridgeStep[];           // TTM bazlı kâr köprüsü
  // Metrikler (TTM/YoY)
  operatingMargin: number | null;       // EBIT / hasılat
  netMargin: number | null;
  interestCoverage: number | null;      // EBIT / |finansman gideri|
  fcfConversion: number | null;         // faaliyet nakdi / net kâr
  operatingLeverage: number | null;     // ΔEBIT% / ΔHasılat% (YoY)
  ebitYoY: number | null;
  revenueYoY: number | null;
  // TMS-29 (TAHMİN)
  netMonetaryPosition: number | null;   // (nakit+alacak) − (finansal borç+ticari borç); <0 = borçlu
  estimatedMonetaryGain: number | null; // |netMonPos| × enflasyon (borçluysa)
  monetaryShareOfNet: number | null;    // tahmini parasal kazancın net kâra oranı
  exportRatio: number | null;           // yurtdışı / hasılat
  flags: EarningsQualityFlag[];
  dataQuality: 'gerçek' | 'tahmini-tms29';  // TMS-29 tahmin içeriyorsa işaretle
  notes: string[];
}

const n = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : v);
const div = (a: number | null, b: number | null): number | null =>
  a == null || b == null || b === 0 ? null : a / b;

function bridgeStep(key: string, label: string, amount: number | null, revenue: number | null): ProfitBridgeStep | null {
  if (amount == null) return null;
  return { key, label, amount, pctOfRevenue: revenue && revenue !== 0 ? (amount / revenue) * 100 : null };
}

export function computeEarningsQuality(
  quarters: IsyQuarter[],
  opts: { inflationRate?: number; isBank?: boolean } = {},
): EarningsQualityResult {
  const empty = (verdict: EarningsVerdict, note: string): EarningsQualityResult => ({
    applicable: false, verdict, score: 0, bridge: [],
    operatingMargin: null, netMargin: null, interestCoverage: null, fcfConversion: null,
    operatingLeverage: null, ebitYoY: null, revenueYoY: null,
    netMonetaryPosition: null, estimatedMonetaryGain: null, monetaryShareOfNet: null, exportRatio: null,
    flags: [], dataQuality: 'gerçek', notes: [note],
  });

  if (opts.isBank) return empty('belirsiz', 'Banka/finans — kâr kalitesi motoru sanayi/UFRS içindir (banka analizi ayrı).');
  if (!quarters.length) return empty('belirsiz', 'Çeyreklik veri yok.');

  const latest = quarters[quarters.length - 1]!;
  const ttm = computeTTM(quarters);
  // TTM yoksa (4 çeyrekten az) son çeyrekle sınırlı çalış
  const f = ttm ?? latest.fields;

  const revenue    = n(f.revenue);
  const grossProfit= n(f.grossProfit);
  const ebit       = n(f.operatingProfit);
  const amort      = n(f.amortization);
  const ebitda     = ebit != null && amort != null ? ebit + amort : null;
  const finExp     = n(f.financialExpense);   // negatif
  const finInc     = n(f.financialIncome);
  const tax        = n(f.tax);
  const netIncome  = n(f.netIncome);
  const opCash     = n(f.operatingCashFlow);
  const exportS    = n(f.exportSales);

  if (revenue == null || ebit == null || netIncome == null) {
    return empty('belirsiz', 'Temel kalemler (hasılat/faaliyet kârı/net kâr) eksik.');
  }

  // ── Kâr köprüsü (TTM) ──
  const bridge = [
    bridgeStep('revenue', 'Hasılat', revenue, revenue),
    bridgeStep('grossProfit', 'Brüt Kâr', grossProfit, revenue),
    bridgeStep('ebitda', 'FAVÖK', ebitda, revenue),
    bridgeStep('ebit', 'Faaliyet Kârı (EBIT)', ebit, revenue),
    bridgeStep('finExp', 'Finansman Gideri', finExp, revenue),
    bridgeStep('finInc', 'Finansal Gelir', finInc, revenue),
    bridgeStep('tax', 'Vergi', tax, revenue),
    bridgeStep('net', 'Net Kâr', netIncome, revenue),
  ].filter((x): x is ProfitBridgeStep => x != null);

  // ── Metrikler ──
  const operatingMargin = div(ebit, revenue);
  const netMargin = div(netIncome, revenue);
  const interestCoverage = finExp != null && finExp !== 0 ? ebit / Math.abs(finExp) : null;
  const fcfConversion = div(opCash, netIncome);
  const exportRatio = div(exportS, revenue);

  // YoY (aynı çeyrek, 1 yıl önce) — faaliyet kaldıracı
  let ebitYoY: number | null = null, revenueYoY: number | null = null, operatingLeverage: number | null = null;
  const yoyIdx = quarters.length - 5;
  if (yoyIdx >= 0) {
    const prev = quarters[yoyIdx]!;
    const pRev = n(prev.fields.revenue), pEbit = n(prev.fields.operatingProfit);
    revenueYoY = pRev && pRev !== 0 ? ((n(latest.fields.revenue) ?? 0) - pRev) / Math.abs(pRev) : null;
    ebitYoY = pEbit && pEbit !== 0 ? ((n(latest.fields.operatingProfit) ?? 0) - pEbit) / Math.abs(pEbit) : null;
    operatingLeverage = revenueYoY != null && revenueYoY !== 0 && ebitYoY != null ? ebitYoY / revenueYoY : null;
  }

  // ── TMS-29 net parasal pozisyon (TAHMİN, snapshot son çeyrek) ──
  const bs = latest.fields;
  const monetaryAssets = (n(bs.cash) ?? 0) + (n(bs.shortFinInvest) ?? 0) + (n(bs.tradeReceivables) ?? 0);
  const monetaryLiab = (n(bs.shortFinDebt) ?? 0) + (n(bs.longFinDebt) ?? 0) + (n(bs.tradePayablesShort) ?? 0) + (n(bs.tradePayablesLong) ?? 0);
  const netMonetaryPosition = monetaryAssets || monetaryLiab ? monetaryAssets - monetaryLiab : null;
  let estimatedMonetaryGain: number | null = null;
  let monetaryShareOfNet: number | null = null;
  let dataQuality: EarningsQualityResult['dataQuality'] = 'gerçek';
  if (netMonetaryPosition != null && opts.inflationRate != null) {
    // Net parasal YÜKÜMLÜLÜK (borçlu, <0) enflasyonda kazanç yazar
    estimatedMonetaryGain = netMonetaryPosition < 0 ? Math.abs(netMonetaryPosition) * opts.inflationRate : -(netMonetaryPosition * opts.inflationRate);
    monetaryShareOfNet = netIncome > 0 ? estimatedMonetaryGain / netIncome : null;
    dataQuality = 'tahmini-tms29';
  }

  // ── Bayraklar ──
  const flags: EarningsQualityFlag[] = [];
  if (ebit <= 0 && netIncome > 0) {
    flags.push({ tone: 'kırmızı', code: 'kağıt-üstü', label: 'Kâğıt üstü kâr',
      detail: 'Net kâr pozitif ama FAALİYET kârı negatif — kâr operasyondan gelmiyor (finansal/parasal kalemler).' });
  }
  if (ebit <= 0) {
    flags.push({ tone: 'kırmızı', code: 'faaliyet-zararı', label: 'Faaliyet zararı',
      detail: 'Esas faaliyet kârı negatif — şirket ana işinden para kazanamıyor.' });
  }
  if (monetaryShareOfNet != null && monetaryShareOfNet > 0.5 && netIncome > 0) {
    flags.push({ tone: 'kırmızı', code: 'parasal-şişkin', label: 'Parasal kazançla şişmiş',
      detail: `Net kârın ~%${Math.round(monetaryShareOfNet * 100)}'i tahmini enflasyon (parasal) kazancı — nakit girişi değil.` });
  }
  if (ebit > 0 && interestCoverage != null && interestCoverage < 1.5) {
    flags.push({ tone: 'turuncu', code: 'finansman-yükü', label: 'Finansman yükü',
      detail: `Faaliyet kârı pozitif ama faiz gideri onu yiyor (faiz karşılama ${interestCoverage.toFixed(1)}×, <1.5).` });
  }
  if (ebit > 0 && (interestCoverage == null || interestCoverage >= 2) && (fcfConversion == null || fcfConversion >= 0.4) && (ebitYoY == null || ebitYoY >= 0)) {
    flags.push({ tone: 'yeşil', code: 'gerçek-faaliyet', label: 'Gerçek faaliyet kârı',
      detail: 'Faaliyet kârı pozitif, faizi rahat karşılıyor ve nakde dönüyor.' });
  }

  // ── Skor (0-100 mutlak kalite) ──
  let score = 50;
  if (operatingMargin != null) score += Math.max(-20, Math.min(20, operatingMargin * 100)); // marj ±20
  if (interestCoverage != null) score += Math.max(-15, Math.min(15, (interestCoverage - 1.5) * 5)); // faiz karşılama
  if (fcfConversion != null) score += Math.max(-10, Math.min(12, (fcfConversion - 0.5) * 12)); // nakde dönüşüm
  if (ebitYoY != null) score += Math.max(-8, Math.min(10, ebitYoY * 20)); // faaliyet büyümesi
  if (ebit <= 0) score -= 25; // faaliyet zararı ağır ceza
  if (monetaryShareOfNet != null && monetaryShareOfNet > 0.5) score -= 12; // parasal şişkinlik
  score = Math.max(0, Math.min(100, Math.round(score)));

  // ── Verdict ──
  let verdict: EarningsVerdict;
  if (ebit <= 0) verdict = 'kağıt-üstü';
  else if (interestCoverage != null && interestCoverage < 1.5) verdict = 'finansman-yükü';
  else if (score >= 60) verdict = 'gerçek';
  else verdict = 'zayıf';

  const notes: string[] = [];
  if (dataQuality === 'tahmini-tms29') notes.push('Net parasal pozisyon KAP dipnotundan değil bilançodan TAHMİN edildi.');
  if (!ttm) notes.push('4 çeyrek yok — TTM yerine son çeyrek kullanıldı.');

  return {
    applicable: true, verdict, score, bridge,
    operatingMargin, netMargin, interestCoverage, fcfConversion, operatingLeverage, ebitYoY, revenueYoY,
    netMonetaryPosition, estimatedMonetaryGain, monetaryShareOfNet, exportRatio,
    flags, dataQuality, notes,
  };
}
