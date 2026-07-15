/**
 * Gelişmiş AI Analiz — sentez motoru (premium özellik).
 *
 * Sayfadaki tüm hazır analizi (kompozit karar, teknik/makro/sektör skorları, hedefler,
 * karar faktörleri, 90g bant) Claude ile TEK kapsamlı premium rapora sentezler:
 * genel görünüm → güncel teknik durum → değerleme & risk → sonuç & yatırımcı rehberi.
 *
 * AKD/kurum/fon/virman modülleri broker-seviyesi ücretli veri gerektirir (kodda yok) →
 * UI'da "yakında" yer tutucu; bu motor yalnız elimizdeki veriyle çalışır (uydurma YOK).
 */

import Anthropic from '@anthropic-ai/sdk';
import { getBISTMarketStatus, getUSMarketStatus } from './time-align';

/**
 * Rapor tazeleme aralığı (ai_cache TTL) — piyasa durumuna göre.
 * Amaç: en düşük API maliyeti + maksimum tazelik.
 *  - Seans açık   → 3sa: fiyat/teknik canlı değişiyor (8sa seansta ~2-3 üretim).
 *  - Açılış öncesi → 1sa: açılışta taze raporla başlansın (bayat gece raporu kalmasın).
 *  - Kapalı/hafta sonu/tatil → 12sa: veri değişmiyor, boşuna üretme.
 */
export function advancedReportTtlMs(market: 'BIST' | 'US' = 'BIST', now?: Date): number {
  const status = market === 'US' ? getUSMarketStatus(now) : getBISTMarketStatus(now);
  if (status === 'open') return 3 * 60 * 60 * 1000;
  if (status === 'pre_market') return 1 * 60 * 60 * 1000;
  return 12 * 60 * 60 * 1000;
}

export interface AdvancedReportInput {
  sembol: string;
  shortName?: string;
  sectorName?: string;
  currentPrice?: number | null;
  changePercent?: number | null;
  decisionTr: string;
  confidence: number;
  compositeScore: number;
  technicalScore: number;
  macroScore: number;
  sectorScore: number;
  explanation?: string;
  targets?: { entry?: number | null; stop?: number | null; target1?: number | null; target2?: number | null; riskReward?: number | null };
  factors?: { name: string; value: number }[];
  fairValue?: { label?: string; premiumPct?: number | null; fairPrice?: number | null };
  high90d?: number | null;
  low90d?: number | null;
  topSignals?: string[];
}

export interface AdvancedReport {
  headline: string;        // tek cümle özet karar
  genelGorunum: string;    // hissenin genel görünümü
  guncelTeknik: string;    // güncel teknik durum
  degerlemeRisk: string;   // değerleme & risk
  sonuc: string;           // sonuç
  rehber: string[];        // yatırımcı rehberi maddeleri
  generatedAt: string;
}

const SYSTEM = `Sen Investable Edge'ın kıdemli borsa analistisin. Türk bireysel yatırımcıya BIST hisseleri için PROFESYONEL, kapsamlı ama sade Türkçe bir analiz raporu yazıyorsun.

KURALLAR:
- SADECE sana verilen verilere dayan. Elinde olmayan hiçbir veriyi UYDURMA: aracı kurum dağılımı,
  fon hareketi, takas/virman YOK. Sana verilmeyen gösterge değerlerini (RSI, EMA, MACD sayıları)
  uydurma — yalnız verilen skorları/rakamları kullan.
- Yatırım tavsiyesi verme; "senaryo/olasılık/değerlendirme" dili kullan.
- Rakamları somut kullan (fiyat, skor, hedef, %). Jargonu açıkla.
- UZUNLUK (önemli — çıktı kesilmemeli): her paragraf EN FAZLA 3-4 cümle; "rehber" 3-5 KISA madde
  (her madde tek cümle). Toplam yanıt kısa ve öz olsun.
- Çıktı YALNIZCA geçerli JSON olacak — kod bloğu (\`\`\`) veya başka metin YOK. Şema:
{"headline": "tek cümle genel değerlendirme",
 "genelGorunum": "3-4 cümle — hissenin genel görünümü, trend, sektör/makro bağlam",
 "guncelTeknik": "3-4 cümle — güncel teknik durum: fiyat, skorlar, sinyaller, destek/direnç seviyeleri",
 "degerlemeRisk": "3-4 cümle — değerleme, risk/ödül, 90g bant, risk seviyesi",
 "sonuc": "2-3 cümle — bütünsel sonuç",
 "rehber": ["3-5 kısa madde, her biri tek cümle — neye dikkat, hangi seviyeler, hangi senaryoda ne"]}`;

function buildUserPrompt(inp: AdvancedReportInput): string {
  const t = inp.targets ?? {};
  const lines = [
    `Hisse: ${inp.sembol}${inp.shortName ? ` (${inp.shortName})` : ''}${inp.sectorName ? ` — ${inp.sectorName} sektörü` : ''}`,
    inp.currentPrice != null ? `Güncel fiyat: ${inp.currentPrice} TL${inp.changePercent != null ? ` (bugün %${inp.changePercent.toFixed(2)})` : ''}` : '',
    `Kompozit karar: ${inp.decisionTr} · güven %${Math.round(inp.confidence)} · kompozit skor ${inp.compositeScore}/100`,
    `Alt skorlar → teknik ${inp.technicalScore}, makro ${inp.macroScore}, sektör ${inp.sectorScore}`,
    inp.explanation ? `Kısa açıklama: ${inp.explanation}` : '',
    inp.topSignals?.length ? `Aktif teknik sinyaller: ${inp.topSignals.join(', ')}` : '',
    t.entry != null || t.stop != null || t.target1 != null ? `Hedefler → giriş ${t.entry ?? '—'}, stop ${t.stop ?? '—'}, hedef1 ${t.target1 ?? '—'}${t.target2 != null ? `, hedef2 ${t.target2}` : ''}${t.riskReward != null ? ` · R/Ö ${t.riskReward}` : ''}` : '',
    inp.fairValue?.label ? `Değerleme: ${inp.fairValue.label}${inp.fairValue.premiumPct != null ? ` (%${inp.fairValue.premiumPct.toFixed(1)} ${inp.fairValue.premiumPct >= 0 ? 'primli' : 'iskontolu'})` : ''}${inp.fairValue.fairPrice != null ? ` · adil değer ${inp.fairValue.fairPrice} TL` : ''}` : '',
    inp.high90d != null && inp.low90d != null ? `90 günlük bant: ${inp.low90d} – ${inp.high90d} TL` : '',
    inp.factors?.length ? `Karar faktörleri: ${inp.factors.map((f) => `${f.name} ${f.value >= 0 ? '+' : ''}${f.value}`).join(', ')}` : '',
  ].filter(Boolean);
  return `Aşağıdaki analiz verilerinden yararlanarak ${inp.sembol} için kapsamlı raporu JSON olarak üret:\n\n${lines.join('\n')}`;
}

/** Metinden geçerli JSON nesnesini çıkar (Haiku bazen ```json fence sarar). */
function extractJson(text: string): Record<string, unknown> | null {
  // 1) Kod bloğu fence'lerini temizle
  const cleaned = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  for (const candidate of [cleaned, text]) {
    try { return JSON.parse(candidate); } catch { /* devam */ }
  }
  // 2) İlk { ... son } aralığını dene
  const first = cleaned.indexOf('{'), last = cleaned.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try { return JSON.parse(cleaned.slice(first, last + 1)); } catch { /* devam */ }
  }
  return null;
}

/** Analiz bundle → yapılandırılmış premium rapor (Claude Haiku). */
export async function synthesizeAdvancedReport(
  input: AdvancedReportInput,
  apiKey: string,
): Promise<AdvancedReport> {
  const anthropic = new Anthropic({ apiKey });
  const now = new Date().toISOString();
  let raw = '';
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      // Türkçe rapor uzun; düşük limit JSON'u ortadan keser → parse patlar (e2e testte yakalandı)
      max_tokens: 3000,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
    });
    const block = res.content.find((b) => b.type === 'text');
    raw = block && 'text' in block ? block.text.trim() : '';
  } catch (err) {
    throw new Error(`Claude çağrısı başarısız: ${err instanceof Error ? err.message : 'bilinmeyen'}`);
  }

  const parsed = extractJson(raw);
  const asStr = (v: unknown, fb = ''): string => (typeof v === 'string' ? v : fb);
  const asArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

  if (!parsed) {
    // Zarif düşüş: ham metni sonuç olarak sun
    return {
      headline: `${input.sembol} — ${input.decisionTr} (güven %${Math.round(input.confidence)})`,
      genelGorunum: '', guncelTeknik: '', degerlemeRisk: '',
      sonuc: raw || 'Rapor oluşturulamadı.', rehber: [], generatedAt: now,
    };
  }
  return {
    headline: asStr(parsed.headline, `${input.sembol} — ${input.decisionTr}`),
    genelGorunum: asStr(parsed.genelGorunum),
    guncelTeknik: asStr(parsed.guncelTeknik),
    degerlemeRisk: asStr(parsed.degerlemeRisk),
    sonuc: asStr(parsed.sonuc),
    rehber: asArr(parsed.rehber),
    generatedAt: now,
  };
}
