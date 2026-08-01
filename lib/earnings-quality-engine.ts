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
  code: 'kağıt-üstü' | 'finansman-yükü' | 'gerçek-faaliyet' | 'faaliyet-zararı' | 'parasal-şişkin'
      | 'tahakkuk-şişkin' | 'alacak-balonu' | 'stok-balonu' | 'operasyon-dışı' | 'aşırı-borç';
  label: string;
  detail: string;
}

export interface EarningsQualityResult {
  applicable: boolean;
  verdict: EarningsVerdict;
  score: number;                        // 0-100 mutlak kalite
  periodBasis: 'ttm' | 'quarter';       // 'ttm'=son 12 ay, 'quarter'=tek çeyrek (4 çeyrek yoksa)
  plainSummary: string;                 // TEK CÜMLE sade cevap (yatırımcı dostu)
  watchTriggers: string[];              // "ne izlemeli / ne düzeltirse iyileşir" (kural-tabanlı)
  operatingTrend: { direction: 'iyileşiyor' | 'bozuluyor' | 'yatay'; detail: string } | null; // son çeyrekler faaliyet marjı yönü
  netIncome: number | null;             // net kâr (TL, dönem bazlı)
  cleanedNetIncome: number | null;      // enflasyon-arındırılmış kâr (tahmini): net − parasal kazanç
  bridge: ProfitBridgeStep[];           // TTM/çeyrek bazlı kâr köprüsü
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
  // ── Forensic (Kâr Kalitesi 2.0) — bilanço/nakit-akış kaynaklı şişirme kanalları ──
  accrualsRatio: number | null;         // (net kâr − faaliyet nakdi) / toplam varlık; yüksek+ = tahakkuk şişkin
  receivablesYoY: number | null;        // ticari alacak YoY (snapshot)
  inventoryYoY: number | null;          // stok YoY (snapshot)
  netDebtToEbitda: number | null;       // (finansal borç − nakit) / FAVÖK
  nonOperatingShare: number | null;     // vergi-öncesi kârın EBIT dışı (operasyon-dışı) payı
  effectiveTaxRate: number | null;      // |vergi| / vergi öncesi kâr
  flags: EarningsQualityFlag[];
  dataQuality: 'gerçek' | 'tahmini-tms29';  // TMS-29 tahmin içeriyorsa işaretle
  notes: string[];
}

const n = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : v);
const div = (a: number | null, b: number | null): number | null =>
  a == null || b == null || b === 0 ? null : a / b;
/** İşaretli yüzde: 0.34 → "+%34", -0.03 → "−%3" (çirkin "+%-3" olmaz) */
const sp = (v: number): string => `${v >= 0 ? '+' : '−'}%${Math.abs(Math.round(v * 100))}`;

function bridgeStep(key: string, label: string, amount: number | null, revenue: number | null): ProfitBridgeStep | null {
  if (amount == null) return null;
  return { key, label, amount, pctOfRevenue: revenue && revenue !== 0 ? (amount / revenue) * 100 : null };
}

export function computeEarningsQuality(
  quarters: IsyQuarter[],
  opts: { inflationRate?: number; isBank?: boolean } = {},
): EarningsQualityResult {
  const empty = (verdict: EarningsVerdict, note: string): EarningsQualityResult => ({
    applicable: false, verdict, score: 0, periodBasis: 'ttm', plainSummary: '', watchTriggers: [], operatingTrend: null, netIncome: null, cleanedNetIncome: null, bridge: [],
    operatingMargin: null, netMargin: null, interestCoverage: null, fcfConversion: null,
    operatingLeverage: null, ebitYoY: null, revenueYoY: null,
    netMonetaryPosition: null, estimatedMonetaryGain: null, monetaryShareOfNet: null, exportRatio: null,
    accrualsRatio: null, receivablesYoY: null, inventoryYoY: null, netDebtToEbitda: null, nonOperatingShare: null, effectiveTaxRate: null,
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
  // NET finansman: finansal gelir finansman giderini aşıyorsa finansman NET POZİTİF —
  // o durumda "faiz kârı yiyor" demek YANILTICI (finansman yardım ediyor). finExp negatif.
  const netFinance = (finInc ?? 0) + (finExp ?? 0);
  const financeIsBurden = netFinance < 0; // finansman net drag mı

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

  // ── FORENSIC KANALLAR (Kâr Kalitesi 2.0) — bilanço/nakit-akış şişirme ──
  const bs0 = latest.fields;
  const totalAssets = n(bs0.totalAssets);
  const ebitdaTTM = ebit != null && amort != null ? ebit + amort : ebit;

  // 1) Tahakkuk (accruals): kâr nakde dönüyor mu? (Sloan) — yüksek+ = kalitesiz
  const accrualsRatio = netIncome != null && opCash != null && totalAssets && totalAssets > 0
    ? (netIncome - opCash) / totalAssets : null;

  // 2/3) Alacak & stok YoY (snapshot, aynı çeyrek 1 yıl önce)
  let receivablesYoY: number | null = null, inventoryYoY: number | null = null;
  if (yoyIdx >= 0) {
    const py = quarters[yoyIdx]!.fields;
    const pRecv = n(py.tradeReceivables), pInv = n(py.inventory);
    const cRecv = n(bs0.tradeReceivables), cInv = n(bs0.inventory);
    receivablesYoY = pRecv && pRecv > 0 && cRecv != null ? (cRecv - pRecv) / pRecv : null;
    inventoryYoY = pInv && pInv > 0 && cInv != null ? (cInv - pInv) / pInv : null;
  }

  // 4) Net borç / FAVÖK
  const netDebt = (n(bs0.shortFinDebt) ?? 0) + (n(bs0.longFinDebt) ?? 0) - (n(bs0.cash) ?? 0) - (n(bs0.shortFinInvest) ?? 0);
  const netDebtToEbitda = ebitdaTTM != null && ebitdaTTM > 0 ? netDebt / ebitdaTTM : null;

  // 5) Operasyon-dışı bağımlılık: vergi-öncesi kâr EBIT'i AŞIYORSA fark operasyon-dışı gelirle şişmiş
  const pretax = tax != null ? netIncome - tax : null; // tax negatif gider → pretax = net − tax
  const nonOperatingShare = pretax != null && pretax > 0 && ebit != null ? (pretax - ebit) / pretax : null;

  // 6) Efektif vergi oranı
  const effectiveTaxRate = pretax != null && pretax > 0 && tax != null ? Math.abs(tax) / pretax : null;

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
      detail: 'Görünen kârın büyük kısmı nakit değil, enflasyon (parasal) kazancı — aşağıdaki arındırılmış kâra bakın.' });
  }
  if (ebit > 0 && interestCoverage != null && interestCoverage < 1.5 && financeIsBurden) {
    flags.push({ tone: 'turuncu', code: 'finansman-yükü', label: 'Finansman yükü',
      detail: `Faaliyet kârı pozitif ama net finansman gideri onu yiyor (faiz karşılama ${interestCoverage.toFixed(2)}×, <1.5).` });
  }
  // ── FORENSIC bayraklar (Kâr Kalitesi 2.0) ──
  // Tahakkuk şişkin: net kâr toplam varlığın >%8'i kadar nakitten fazla (Sloan)
  if (accrualsRatio != null && accrualsRatio > 0.08 && netIncome > 0) {
    flags.push({ tone: 'kırmızı', code: 'tahakkuk-şişkin', label: 'Tahakkukla şişmiş',
      detail: `Kâr nakde dönmüyor — net kâr, faaliyet nakdinin toplam varlığın ~%${Math.round(accrualsRatio * 100)}'i kadar üstünde. Tahakkuk kârı ileride geri döner.` });
  }
  // Alacak balonu: alacaklar hasılattan belirgin hızlı büyüyorsa (channel stuffing / tahsilat)
  if (receivablesYoY != null && revenueYoY != null && receivablesYoY - revenueYoY > 0.25 && receivablesYoY > 0.3) {
    flags.push({ tone: 'turuncu', code: 'alacak-balonu', label: 'Alacak balonu',
      detail: `Alacaklar hasılattan çok hızlı büyüyor (alacak ${sp(receivablesYoY)} vs hasılat ${sp(revenueYoY)}) — erken/riskli satış ya da tahsilat sorunu.` });
  }
  // Stok balonu: stok hasılattan hızlı → talep zayıf, gelecek değer düşüşü
  if (inventoryYoY != null && revenueYoY != null && inventoryYoY - revenueYoY > 0.25 && inventoryYoY > 0.3) {
    flags.push({ tone: 'turuncu', code: 'stok-balonu', label: 'Stok balonu',
      detail: `Stok hasılattan hızlı büyüyor (stok ${sp(inventoryYoY)} vs hasılat ${sp(revenueYoY)}) — talep zayıflıyor, ileride değer düşüşü/iskonto riski.` });
  }
  // Operasyon-dışı kâr: vergi öncesi kârın >%40'ı esas faaliyet dışı (finansal gelir/tek-seferlik)
  if (nonOperatingShare != null && nonOperatingShare > 0.4) {
    flags.push({ tone: 'turuncu', code: 'operasyon-dışı', label: 'Operasyon-dışı kâr',
      detail: `Vergi öncesi kârın ~%${Math.round(nonOperatingShare * 100)}'i esas faaliyet DIŞINDAN (finansal gelir/tek-seferlik) — operasyon kadar sürdürülebilir değil.` });
  }
  // Aşırı borç: net borç / FAVÖK > 4 (yüksek faizde rollover riski)
  if (netDebtToEbitda != null && netDebtToEbitda > 4) {
    flags.push({ tone: 'turuncu', code: 'aşırı-borç', label: 'Aşırı borç',
      detail: `Net borç FAVÖK'ün ${netDebtToEbitda.toFixed(1)}× katı (>4) — yüksek faizde borç çevirme riski.` });
  }
  if (ebit > 0 && (interestCoverage == null || interestCoverage >= 2) && (fcfConversion == null || fcfConversion >= 0.4) && (ebitYoY == null || ebitYoY >= 0)
      && (accrualsRatio == null || accrualsRatio <= 0.08) && (nonOperatingShare == null || nonOperatingShare <= 0.4)) {
    flags.push({ tone: 'yeşil', code: 'gerçek-faaliyet', label: 'Gerçek faaliyet kârı',
      detail: 'Faaliyet kârı pozitif, faizi rahat karşılıyor, nakde dönüyor ve esas işten geliyor.' });
  }

  // ── Skor (0-100 mutlak kalite) ──
  let score = 50;
  if (operatingMargin != null) score += Math.max(-20, Math.min(20, operatingMargin * 100)); // marj ±20
  if (interestCoverage != null) score += Math.max(-15, Math.min(15, (interestCoverage - 1.5) * 5)); // faiz karşılama
  if (fcfConversion != null) score += Math.max(-10, Math.min(12, (fcfConversion - 0.5) * 12)); // nakde dönüşüm
  if (ebitYoY != null) score += Math.max(-8, Math.min(10, ebitYoY * 20)); // faaliyet büyümesi
  if (ebit <= 0) score -= 25; // faaliyet zararı ağır ceza
  if (monetaryShareOfNet != null && monetaryShareOfNet > 0.5) score -= 12; // parasal şişkinlik
  // Forensic cezalar (Kâr Kalitesi 2.0)
  if (accrualsRatio != null) score -= Math.max(0, Math.min(15, (accrualsRatio - 0.03) * 120)); // tahakkuk şişkinliği
  if (netDebtToEbitda != null) score -= Math.max(0, Math.min(10, (netDebtToEbitda - 3) * 3)); // aşırı kaldıraç
  if (nonOperatingShare != null && nonOperatingShare > 0.4) score -= 8; // operasyon-dışı bağımlılık
  if (receivablesYoY != null && revenueYoY != null && receivablesYoY - revenueYoY > 0.25) score -= 6; // alacak balonu
  if (inventoryYoY != null && revenueYoY != null && inventoryYoY - revenueYoY > 0.25) score -= 5; // stok balonu
  score = Math.max(0, Math.min(100, Math.round(score)));

  // ── Verdict ──
  let verdict: EarningsVerdict;
  if (ebit <= 0) verdict = 'kağıt-üstü';
  else if (interestCoverage != null && interestCoverage < 1.5 && financeIsBurden) verdict = 'finansman-yükü';
  else if (score >= 60) verdict = 'gerçek';
  else verdict = 'zayıf';

  const notes: string[] = [];
  if (dataQuality === 'tahmini-tms29') notes.push('Net parasal pozisyon KAP dipnotundan değil bilançodan TAHMİN edildi.');
  if (!ttm) notes.push('4 çeyrek yok — TTM yerine son çeyrek kullanıldı.');

  // ── Enflasyon-arındırılmış kâr (tahmini): net kâr − tahmini parasal kazanç ──
  const cleanedNetIncome = estimatedMonetaryGain != null ? netIncome - estimatedMonetaryGain : null;

  // ── TEK CÜMLE sade cevap ──
  let plainSummary: string;
  if (ebit <= 0) {
    plainSummary = 'Esas faaliyetinden para kazanamıyor — görünen kâr operasyondan değil.';
  } else if (interestCoverage != null && interestCoverage < 1.5 && financeIsBurden) {
    plainSummary = 'Faaliyetten kâr ediyor ama net finansman gideri kârın çoğunu eritiyor.';
  } else if (nonOperatingShare != null && nonOperatingShare > 0.4) {
    plainSummary = 'Esas faaliyet kârı zayıf; net kârın büyük kısmı operasyon dışından (finansal gelir/tek-seferlik).';
  } else if (verdict === 'gerçek') {
    plainSummary = 'Esas faaliyetinden gerçek, nakde dönen kâr üretiyor.';
  } else {
    plainSummary = 'Faaliyet kârı var ama kâr kalitesi ortalama altı.';
  }
  if (monetaryShareOfNet != null && monetaryShareOfNet > 0.5) {
    plainSummary += ' Kârın büyük kısmı nakit değil, enflasyon muhasebesi kaynaklı (tahmini).';
  } else if (accrualsRatio != null && accrualsRatio > 0.08 && netIncome > 0) {
    plainSummary += ' Ayrıca kâr nakde dönmüyor (tahakkuk şişkin).';
  } else if (nonOperatingShare != null && nonOperatingShare > 0.4) {
    plainSummary += ' Ayrıca kârın önemli kısmı esas faaliyet dışından.';
  }

  // ── KATMAN 1: "Ne izlemeli / ne düzeltirse iyileşir" (kural-tabanlı, tahmin DEĞİL) ──
  const WATCH: Record<string, string> = {
    'alacak-balonu': 'Alacaklar nakde dönerse (tahsilat hızlanırsa) nakit akışı ve kâr kalitesi düzelir — bunu izleyin.',
    'stok-balonu': 'Stok eritilip satışa dönerse marj toparlar; dönmezse değer düşüşü/iskonto riski.',
    'finansman-yükü': 'Faiz düşüşü ya da borç azaltımı/refinansman finansman yükünü hafifletir.',
    'aşırı-borç': 'Net borç/FAVÖK düşmeli — borç azaltımı ya da özkaynak güçlenmesi gerekir.',
    'parasal-şişkin': 'Enflasyon düştükçe bu kâğıt kâr erir; gerçek operasyonel kâra bakın.',
    'faaliyet-zararı': 'Esas iş henüz kâr etmiyor; marj toparlaması ya da hasılat büyümesi şart.',
    'kağıt-üstü': 'Kâr operasyondan gelmeli; esas faaliyet kârına dönüş beklenmeli.',
    'tahakkuk-şişkin': 'Kâr nakde dönmeli — faaliyet nakit akışı net kâra yaklaşmalı.',
    'operasyon-dışı': 'Kâr esas faaliyete dayanmalı; finansal gelir/tek-seferliklere değil.',
  };
  const seen = new Set<string>();
  const watchTriggers: string[] = [];
  for (const fl of flags) {
    if (fl.tone === 'yeşil') continue;
    const w = WATCH[fl.code];
    if (w && !seen.has(w)) { seen.add(w); watchTriggers.push(w); }
  }

  // ── KATMAN 2: Operasyon trend (son ~4 çeyrek faaliyet marjı yönü — OLGUSAL) ──
  let operatingTrend: EarningsQualityResult['operatingTrend'] = null;
  const marginSeries = quarters.slice(-4)
    .map((q) => { const rv = n(q.fields.revenue), ep = n(q.fields.operatingProfit); return rv && rv > 0 && ep != null ? ep / rv : null; })
    .filter((x): x is number => x != null);
  if (marginSeries.length >= 3) {
    const half = Math.floor(marginSeries.length / 2);
    const early = marginSeries.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const late = marginSeries.slice(-half).reduce((a, b) => a + b, 0) / half;
    const deltaPp = (late - early) * 100;
    const dir = deltaPp > 2 ? 'iyileşiyor' : deltaPp < -2 ? 'bozuluyor' : 'yatay';
    operatingTrend = {
      direction: dir,
      detail: dir === 'yatay'
        ? 'Son çeyreklerde faaliyet marjı yatay seyrediyor.'
        : `Son çeyreklerde faaliyet marjı ${dir} (${deltaPp >= 0 ? '+' : ''}${deltaPp.toFixed(1)} puan).`,
    };
  }

  return {
    applicable: true, verdict, score, periodBasis: ttm ? 'ttm' : 'quarter',
    plainSummary, watchTriggers, operatingTrend, netIncome, cleanedNetIncome, bridge,
    operatingMargin, netMargin, interestCoverage, fcfConversion, operatingLeverage, ebitYoY, revenueYoY,
    netMonetaryPosition, estimatedMonetaryGain, monetaryShareOfNet, exportRatio,
    accrualsRatio, receivablesYoY, inventoryYoY, netDebtToEbitda, nonOperatingShare, effectiveTaxRate,
    flags, dataQuality, notes,
  };
}
