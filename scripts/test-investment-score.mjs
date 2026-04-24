/**
 * Smoke test — Yahoo Finance → Investment Score
 *
 * lib/yahoo-fundamentals.ts + lib/investment-score.ts'in mantığını
 * plain JS olarak tekrar çalıştırır (node .ts alamaz, o yüzden inline).
 *
 * Çalıştır: node scripts/test-investment-score.mjs
 */

import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

const TEST_SYMBOLS = ['THYAO', 'EREGL', 'ASELS', 'SASA', 'BIMAS'];

// ── Yahoo Fundamentals fetch (lib/yahoo-fundamentals.ts ile eş) ─────────────

async function fetchFundamentals(sembol) {
  const ticker = sembol.endsWith('.IS') ? sembol : `${sembol}.IS`;

  const qs = await yahooFinance.quoteSummary(ticker, {
    modules: ['summaryDetail', 'defaultKeyStatistics', 'financialData', 'price'],
  });

  const sd = qs.summaryDetail ?? {};
  const ks = qs.defaultKeyStatistics ?? {};
  const fd = qs.financialData ?? {};
  const pr = qs.price ?? {};

  const n = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

  return {
    symbol: ticker,
    shortName: pr.shortName ?? null,
    sector: null, // assetProfile çağrısı ayrı, smoke test için atlıyoruz
    // Valuation
    peRatio: n(sd.trailingPE ?? ks.trailingPE),
    pegRatio: n(ks.pegRatio),
    priceToBook: n(ks.priceToBook),
    enterpriseToEbitda: n(ks.enterpriseToEbitda),
    eps: n(ks.trailingEps),
    // Growth
    revenueGrowth: n(fd.revenueGrowth),
    earningsGrowth: n(fd.earningsGrowth),
    // Profitability
    returnOnEquity: n(fd.returnOnEquity),
    returnOnAssets: n(fd.returnOnAssets),
    operatingMargins: n(fd.operatingMargins),
    profitMargin: n(fd.profitMargins ?? ks.profitMargins),
    // Risk
    debtToEquity: n(fd.debtToEquity),
    currentRatio: n(fd.currentRatio),
    freeCashflow: n(fd.freeCashflow),
    beta: n(sd.beta ?? ks.beta),
    // Meta
    marketCap: n(pr.marketCap),
    dividendYield: n(sd.dividendYield),
  };
}

// ── Scoring engine (lib/investment-score.ts ile eş) ─────────────────────────

function scale(val, min, max, reverse = false) {
  if (val === null || val === undefined || !isFinite(val)) return null;
  if (max === min) return null;
  const clamped = Math.max(min, Math.min(max, val));
  const pct = ((clamped - min) / (max - min)) * 100;
  return reverse ? 100 - pct : pct;
}

function triangular(val, min, optimal, max) {
  if (val === null || val === undefined || !isFinite(val)) return null;
  if (val <= min || val >= max) return 0;
  if (val <= optimal) return ((val - min) / (optimal - min)) * 100;
  return ((max - val) / (max - optimal)) * 100;
}

function mean(scores) {
  const valid = scores.filter((s) => s !== null && isFinite(s));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function computeScore(f, inflation = null) {
  // Enflasyon düzeltme faktörleri
  const peUpperBound = inflation !== null ? 40 * (1 + Math.min((inflation / 100) * 0.75, 1.5)) : 40;
  const toReal = (nominal) => inflation === null ? nominal : (1 + nominal) / (1 + inflation / 100) - 1;

  // Valuation (F/K üst sınırı enflasyonla genişler)
  const pe = scale(f.peRatio, 5, peUpperBound, true);
  const peg = scale(f.pegRatio, 0.5, 3, true);
  const pb = scale(f.priceToBook, 0.5, 5, true);
  const evEb = scale(f.enterpriseToEbitda, 3, 20, true);
  const valScore = mean([pe, peg, pb, evEb]);

  // Growth (nominal → reel)
  const realRev = f.revenueGrowth !== null ? toReal(f.revenueGrowth) : null;
  const realEarn = f.earningsGrowth !== null ? toReal(f.earningsGrowth) : null;
  const revPct = realRev !== null ? realRev * 100 : null;
  const earnPct = realEarn !== null ? realEarn * 100 : null;
  const revS = scale(revPct, -20, 40);
  const earnS = scale(earnPct, -30, 50);
  const groScore = mean([revS, earnS]);

  // Profitability
  const roeS = scale(f.returnOnEquity !== null ? f.returnOnEquity * 100 : null, 0, 30);
  const roaS = scale(f.returnOnAssets !== null ? f.returnOnAssets * 100 : null, 0, 15);
  const opS = scale(f.operatingMargins !== null ? f.operatingMargins * 100 : null, 0, 30);
  const netS = scale(f.profitMargin !== null ? f.profitMargin * 100 : null, 0, 20);
  const proScore = mean([roeS, roaS, opS, netS]);

  // Risk
  let d2e = f.debtToEquity;
  if (d2e !== null && d2e > 10) d2e = d2e / 100;
  const d2eS = scale(d2e, 0, 3, true);
  const currS = triangular(f.currentRatio, 0.3, 1.5, 4);
  const fcfS = f.freeCashflow !== null ? (f.freeCashflow > 0 ? 100 : 0) : null;
  const betaS = f.beta !== null ? scale(Math.abs(f.beta - 1), 0, 1.5, true) : null;
  const risScore = mean([d2eS, currS, fcfS, betaS]);

  // Normalize weights
  const base = { valuation: 0.30, growth: 0.25, profitability: 0.20, risk: 0.25 };
  const dims = [
    { key: 'valuation', score: valScore, w: base.valuation },
    { key: 'growth', score: groScore, w: base.growth },
    { key: 'profitability', score: proScore, w: base.profitability },
    { key: 'risk', score: risScore, w: base.risk },
  ];
  const present = dims.filter((d) => d.score !== null);
  const sumW = present.reduce((s, d) => s + d.w, 0);

  const applied = { valuation: 0, growth: 0, profitability: 0, risk: 0 };
  let sum = 0;
  if (sumW > 0) {
    for (const d of present) {
      const w = d.w / sumW;
      applied[d.key] = w;
      sum += d.score * w;
    }
  }
  const finalScore = present.length === 0 ? 50 : Math.round(sum);

  const subScores = {
    valuation: valScore === null ? 50 : Math.round(valScore),
    growth: groScore === null ? 50 : Math.round(groScore),
    profitability: proScore === null ? 50 : Math.round(proScore),
    risk: risScore === null ? 50 : Math.round(risScore),
  };

  const all = ['peRatio','pegRatio','priceToBook','enterpriseToEbitda','revenueGrowth','earningsGrowth','returnOnEquity','returnOnAssets','operatingMargins','profitMargin','debtToEquity','currentRatio','freeCashflow','beta'];
  const missing = all.filter((k) => {
    const v = f[k];
    return v === null || v === undefined || !isFinite(v);
  });
  const presentCount = all.length - missing.length;
  const confidence = presentCount >= 12 ? 'high' : presentCount >= 7 ? 'medium' : 'low';

  const ratingLabel =
    finalScore >= 80 ? 'Güçlü Al' :
    finalScore >= 65 ? 'Al' :
    finalScore >= 45 ? 'Tut' :
    finalScore >= 30 ? 'Sat' : 'Güçlü Sat';

  return {
    score: finalScore,
    subScores,
    appliedWeights: applied,
    missingMetrics: missing,
    presentCount,
    totalMetrics: all.length,
    confidence,
    ratingLabel,
  };
}

// ── Test runner ─────────────────────────────────────────────────────────────

async function testSymbol(sembol, inflation = null) {
  try {
    const f = await fetchFundamentals(sembol);
    const sBefore = computeScore(f, null);      // Enflasyon düzeltmesiz (v1)
    const s = computeScore(f, inflation);       // Enflasyon düzeltmeli (v2)
    const delta = s.score - sBefore.score;
    const deltaStr = delta === 0 ? '' : delta > 0 ? ` (enf. düzeltme: +${delta})` : ` (enf. düzeltme: ${delta})`;

    console.log(`\n━━━ ${sembol} (${f.shortName ?? '—'}) ━━━`);
    console.log(`  Skor:   ${s.score}/100 → ${s.ratingLabel}${deltaStr}`);
    console.log(`  Güven:  ${s.confidence} (${s.presentCount}/${s.totalMetrics} metrik)`);
    console.log(`  Alt:    V=${s.subScores.valuation} B=${s.subScores.growth} K=${s.subScores.profitability} R=${s.subScores.risk}`);
    const reweighted = Math.abs(s.appliedWeights.valuation - 0.30) > 0.01;
    console.log(`  Ağırl.: V%${Math.round(s.appliedWeights.valuation*100)} B%${Math.round(s.appliedWeights.growth*100)} K%${Math.round(s.appliedWeights.profitability*100)} R%${Math.round(s.appliedWeights.risk*100)}${reweighted ? ' *normalize edildi' : ''}`);
    if (s.missingMetrics.length) console.log(`  Eksik:  ${s.missingMetrics.join(', ')}`);
    console.log(`  Ham:    F/K=${f.peRatio?.toFixed(1) ?? '—'}  PEG=${f.pegRatio?.toFixed(2) ?? '—'}  F/DD=${f.priceToBook?.toFixed(2) ?? '—'}  EV/EBITDA=${f.enterpriseToEbitda?.toFixed(1) ?? '—'}`);
    console.log(`          ROE=${f.returnOnEquity !== null ? (f.returnOnEquity*100).toFixed(1)+'%' : '—'}  ROA=${f.returnOnAssets !== null ? (f.returnOnAssets*100).toFixed(1)+'%' : '—'}  OpMargin=${f.operatingMargins !== null ? (f.operatingMargins*100).toFixed(1)+'%' : '—'}`);
    console.log(`          RevGrowth=${f.revenueGrowth !== null ? (f.revenueGrowth*100).toFixed(1)+'%' : '—'}  EarnGrowth=${f.earningsGrowth !== null ? (f.earningsGrowth*100).toFixed(1)+'%' : '—'}`);
    console.log(`          D/E=${f.debtToEquity?.toFixed(1) ?? '—'}  CurR=${f.currentRatio?.toFixed(2) ?? '—'}  Beta=${f.beta?.toFixed(2) ?? '—'}  FCF=${f.freeCashflow !== null ? (f.freeCashflow/1e9).toFixed(2)+'B' : '—'}`);
  } catch (err) {
    console.log(`\n━━━ ${sembol} ━━━`);
    console.log(`  HATA: ${err?.message ?? err}`);
  }
}

// TÜFE değeri — prod'da TCMB EVDS'den gelir, burada son bilinen seviye
const TUFE_YOY = 30.9;

console.log('Investment Score — Canlı Smoke Test (Enflasyon düzeltmeli v2)');
console.log(`TÜFE yıllık: %${TUFE_YOY} — F/K üst sınırı ${(40 * (1 + (TUFE_YOY/100) * 0.75)).toFixed(1)}, nominal büyüme reel'e çevrildi\n`);
for (const s of TEST_SYMBOLS) {
  await testSymbol(s, TUFE_YOY);
}
console.log('\n✓ Test tamamlandı.');
