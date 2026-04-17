/**
 * Investment Score — AI Açıklama Prompt'u
 *
 * Kurallar (katı):
 * 1. Skoru DEĞİŞTİRMEZ, SORGULAMAZ, YENİDEN HESAPLAMAZ.
 * 2. Sadece <fundamentals> bloğundaki verilere dayanır.
 * 3. Bilmediğini uydurmaz — "belirsiz" demek yanlış bilgiye yeğlenir.
 * 4. Yatırım tavsiyesi vermez; bilgilendirme yapar.
 * 5. Çıktı sadece geçerli JSON — başka metin yok.
 *
 * Prompt injection koruması: Kullanıcıdan gelen tek alan `sembol`, o da
 * `sanitizeTicker()` ile 1-10 büyük harf/rakam sınırlandırılmış durumda.
 * Fundamentals alanları sayı veya Yahoo'dan gelen kontrollü string
 * (sektör/endüstri adı) — prompt injection yüzeyi minimum. Yine de
 * `sanitizeKapField()` ile geçirilir.
 */

import { sanitizeKapField } from './sanitize';
import type { YahooFundamentals } from './yahoo-fundamentals';
import type { InvestableScore } from './investment-score';

/**
 * Sayıyı güvenli biçimlendir.
 * - null → "yok"
 * - 0.15 (oran) isRatio=true ise "%15.0"
 * - 1000000 → "1.0M" (isCurrency)
 */
function fmt(val: number | null, opts?: {
  isRatio?: boolean;     // 0.15 → %15.0
  isCurrency?: boolean;  // 1e6 → 1.0M
  digits?: number;
}): string {
  if (val === null || !isFinite(val)) return 'yok';
  const digits = opts?.digits ?? 2;

  if (opts?.isRatio) {
    return `%${(val * 100).toFixed(1)}`;
  }

  if (opts?.isCurrency) {
    if (Math.abs(val) >= 1e12) return `${(val / 1e12).toFixed(1)}T`;
    if (Math.abs(val) >= 1e9)  return `${(val / 1e9).toFixed(1)}B`;
    if (Math.abs(val) >= 1e6)  return `${(val / 1e6).toFixed(1)}M`;
    return val.toFixed(0);
  }

  return val.toFixed(digits);
}

/**
 * Claude'a gönderilecek prompt'u oluşturur.
 */
export function buildInvestmentScorePrompt(
  sembol: string,
  f: YahooFundamentals,
  score: InvestableScore,
): string {
  const sanitizedSector = sanitizeKapField(f.sector ?? '', 60) || 'Belirtilmemiş';
  const sanitizedIndustry = sanitizeKapField(f.industry ?? '', 100) || '';
  const sanitizedName = sanitizeKapField(f.shortName ?? sembol, 100);

  const bugun = new Date().toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return `Sen Türkiye Borsa İstanbul (BIST) odaklı deneyimli bir sermaye piyasası analistisin.
Bugün: ${bugun}

KURALLAR (ihlal edilemez):
- Skoru DEĞİŞTİRME, SORGULAMA, YENİDEN HESAPLAMA. Skor deterministik bir motor tarafından belirlenmiştir.
- Sadece <fundamentals> bloğundaki verilere dayan. Dışarıdan bilgi uydurma.
- "Bu veri yok" veya "belirsiz" demek, yanlış bilgi vermekten daha değerlidir.
- Kısa, net, profesyonel Türkçe. Jargondan kaçın; gerçek yatırımcıya konuşur gibi.
- Yatırım tavsiyesi verme; bilgilendirme yap. "Değerlendirilebilir", "risk oluşturabilir" gibi tarafsız ifadeler kullan.
- Çıktı sadece geçerli JSON. Üç ters tırnaklı kod bloğu (JSON fence) KOYMA, başka metin EKLEME.

<symbol>${sembol}</symbol>
<name>${sanitizedName}</name>
<sector>${sanitizedSector}${sanitizedIndustry && sanitizedIndustry !== sanitizedSector ? ` / ${sanitizedIndustry}` : ''}</sector>

<score>
Toplam: ${score.score}/100 → ${score.ratingLabel}
Alt-skorlar (0-100):
  - Değerleme: ${score.subScores.valuation}
  - Büyüme: ${score.subScores.growth}
  - Kârlılık: ${score.subScores.profitability}
  - Risk (yüksek = düşük risk): ${score.subScores.risk}
Ağırlıklar (bu hisse için uygulanan): Değerleme %${(score.appliedWeights.valuation * 100).toFixed(0)} | Büyüme %${(score.appliedWeights.growth * 100).toFixed(0)} | Kârlılık %${(score.appliedWeights.profitability * 100).toFixed(0)} | Risk %${(score.appliedWeights.risk * 100).toFixed(0)}
Güven seviyesi: ${score.confidence === 'high' ? 'Yüksek' : score.confidence === 'medium' ? 'Orta' : 'Düşük'} (${score.presentCount}/${score.totalMetrics} metrik mevcut)
</score>

<fundamentals>
Piyasa Değeri: ${fmt(f.marketCap, { isCurrency: true })} TL
F/K: ${fmt(f.peRatio, { digits: 1 })}
PEG: ${fmt(f.pegRatio, { digits: 2 })}
F/DD: ${fmt(f.priceToBook, { digits: 2 })}
EV/FAVÖK: ${fmt(f.enterpriseToEbitda, { digits: 1 })}
EPS: ${fmt(f.eps, { digits: 2 })}
Gelir Büyümesi (YoY): ${fmt(f.revenueGrowth, { isRatio: true })}
Kâr Büyümesi (YoY): ${fmt(f.earningsGrowth, { isRatio: true })}
ROE: ${fmt(f.returnOnEquity, { isRatio: true })}
ROA: ${fmt(f.returnOnAssets, { isRatio: true })}
Faaliyet Marjı: ${fmt(f.operatingMargins, { isRatio: true })}
Net Kâr Marjı: ${fmt(f.profitMargin, { isRatio: true })}
Borç/Özsermaye: ${fmt(f.debtToEquity, { digits: 2 })}
Cari Oran: ${fmt(f.currentRatio, { digits: 2 })}
Serbest Nakit Akışı: ${fmt(f.freeCashflow, { isCurrency: true })} TL
Beta: ${fmt(f.beta, { digits: 2 })}
Temettü Verimi: ${fmt(f.dividendYield, { isRatio: true })}
</fundamentals>

${score.missingMetrics.length > 0 ? `<missing_metrics>${score.missingMetrics.join(', ')}</missing_metrics>\n` : ''}
Şimdi aşağıdaki JSON formatında yanıt ver (başka hiçbir şey yazma):

{
  "summary": "3-4 cümle: Skorun temel nedeni nedir? Hangi alt-skor belirleyici? (Verilen sayılara referans ver)",
  "risks": ["En kritik 2-3 risk — veri tabanlı, somut (örn: yüksek borç/özsermaye oranı X seviyesinde)"],
  "opportunities": ["En belirgin 1-3 fırsat — veri tabanlı (örn: gelir büyümesi pozitif %Y)"]
}`;
}
