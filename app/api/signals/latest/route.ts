/**
 * GET /api/signals/latest
 *
 * n8n otomasyonu için: en güçlü BIST sinyalini döndürür.
 * API key ile korunur — yalnızca yetkili n8n workflow çağırabilir.
 *
 * Query params:
 *   limit  — kaç sinyal dönsün (default: 1, max: 5)
 *   dir    — yön filtresi: yukari | asagi | hepsi (default: hepsi)
 *
 * Response:
 *   { signals: SocialSignal[], scannedAt: string, scannedCount: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchOHLCV } from '@/lib/yahoo';
import { detectAllSignals, computeConfluence } from '@/lib/signals';
import type { StockSignal } from '@/types';

// ─── API Key Koruması ──────────────────────────────────────────────────────────
// .env.local'a ekle: SOCIAL_API_KEY=istedigin-gizli-anahtar
function isAuthorized(req: NextRequest): boolean {
  const key = req.headers.get('x-api-key') ?? req.nextUrl.searchParams.get('apiKey');
  const expected = process.env.SOCIAL_API_KEY;
  if (!expected) return true; // env ayarlanmamışsa geliştirme modunda geç
  return key === expected;
}

// ─── En likit 30 BIST hissesi ─────────────────────────────────────────────────
const TOP_BIST_SYMBOLS = [
  'THYAO', 'GARAN', 'ASELS', 'SISE',  'AKBNK',
  'YKBNK', 'KCHOL', 'BIMAS', 'EREGL', 'TUPRS',
  'SAHOL', 'TOASO', 'FROTO', 'PGSUS', 'TCELL',
  'HALKB', 'VAKBN', 'ISCTR', 'KOZAL', 'ENKAI',
  'MGROS', 'ARCLK', 'SODA',  'EKGYO', 'PETKM',
  'CIMSA', 'KRDMD', 'TAVHL', 'AEFES', 'ULKER',
];

export interface SocialSignal {
  /** Tekrar paylaşımı önlemek için benzersiz anahtar */
  id: string;
  symbol: string;
  signalType: string;
  direction: string;
  severity: string;
  confluenceScore: number;
  currentPrice: number;
  changePercent: number;
  candlesAgo: number;
  weeklyAligned: boolean;
  /** Telegram'a direkt gönderilecek hazır mesaj */
  telegramMessage: string;
  /** X (Twitter) için kısa versiyon */
  twitterMessage: string;
  detectedAt: string;
}

// ─── Yardımcılar ───────────────────────────────────────────────────────────────

const SIGNAL_DESCRIPTIONS: Record<string, { yukari: string; asagi: string; nötr: string }> = {
  'RSI Uyumsuzluğu': {
    yukari: 'Fiyat yeni dip yaparken RSI yükselen dip oluşturdu. Satış baskısı azalıyor, yükseliş dönüşümü yakın.',
    asagi:  'Fiyat yeni zirve yaparken RSI düşen zirve oluşturdu. Alış gücü zayıflıyor, düşüş riski var.',
    nötr:   'RSI fiyatla uyumsuz hareket ediyor, yön değişimi sinyali.',
  },
  'Hacim Anomalisi': {
    yukari: 'Ortalamanın çok üzerinde hacimle güçlü alım baskısı tespit edildi. Kurumsal ilgi artıyor olabilir.',
    asagi:  'Ortalamanın çok üzerinde hacimle güçlü satış baskısı tespit edildi. Çıkış hareketine dikkat.',
    nötr:   'Olağandışı yüksek hacim, yön baskısı belirsiz.',
  },
  'Trend Başlangıcı': {
    yukari: 'Kısa vadeli ortalama uzun vadeli ortalamanın üzerine geçti. Yeni yükseliş trendi başlıyor olabilir.',
    asagi:  'Kısa vadeli ortalama uzun vadeli ortalamanın altına geçti. Yeni düşüş trendi başlıyor olabilir.',
    nötr:   'Hareketli ortalamalar kesişti, trend değişim sinyali.',
  },
  'Destek/Direnç Kırılımı': {
    yukari: 'Önemli direnç seviyesi yukarı kırıldı. Kırılım devam ederse güçlü yükseliş hareketi bekleniyor.',
    asagi:  'Önemli destek seviyesi aşağı kırıldı. Kırılım devam ederse güçlü düşüş hareketi bekleniyor.',
    nötr:   'Kritik fiyat seviyesi kırıldı.',
  },
  'MACD Kesişimi': {
    yukari: 'MACD sinyal çizgisini yukarı kesti, histogram pozitife döndü. Momentum yükseliş yönünde güçleniyor.',
    asagi:  'MACD sinyal çizgisini aşağı kesti, histogram negatife döndü. Momentum düşüş yönünde güçleniyor.',
    nötr:   'MACD kesişimi gerçekleşti, momentum değişiyor.',
  },
  'RSI Seviyesi': {
    yukari: 'RSI aşırı satım bölgesinden çıktı. Dip bölgesinden toparlanma başlıyor olabilir.',
    asagi:  'RSI aşırı alım bölgesinde seyrediyor. Zirve bölgesinde düzeltme riski yüksek.',
    nötr:   'RSI kritik bölgede seyrediyor.',
  },
  'Bollinger Sıkışması': {
    yukari: 'Bollinger Bantları daraldı, sıkışma sona eriyor. Güçlü bir çıkış hareketi yaklaşıyor.',
    asagi:  'Bollinger Bantları daraldı, sıkışma sona eriyor. Güçlü bir çıkış hareketi yaklaşıyor.',
    nötr:   'Volatilite sıkışması tespit edildi, büyük hareket bekleniyor.',
  },
  'Altın Çapraz': {
    yukari: '50 günlük ortalama 200 günlük ortalamanın üzerine çıktı (Altın Çapraz). Güçlü uzun vadeli yükseliş sinyali.',
    asagi:  '50 günlük ortalama 200 günlük ortalamanın altına geçti (Ölüm Çaprazı). Güçlü uzun vadeli düşüş sinyali.',
    nötr:   'Uzun vadeli hareketli ortalamalar kesişti.',
  },
};

function getSignalDescription(signalType: string, direction: string): string {
  const desc = SIGNAL_DESCRIPTIONS[signalType];
  if (!desc) return 'Teknik analiz sinyali tespit edildi.';
  return desc[direction as keyof typeof desc] ?? desc.nötr;
}

function directionEmoji(dir: string): string {
  if (dir === 'yukari') return '🟢';
  if (dir === 'asagi')  return '🔴';
  return '🟡';
}

function directionLabel(dir: string): string {
  if (dir === 'yukari') return 'YUKARI';
  if (dir === 'asagi')  return 'AŞAĞI';
  return 'NÖTR';
}

function severityLabel(sev: string): string {
  if (sev === 'güçlü') return '💪 GÜÇLÜ';
  if (sev === 'orta')  return '⚡ ORTA';
  return '📊 ZAYIF';
}

function buildTelegramMessage(sig: SocialSignal): string {
  const emoji = directionEmoji(sig.direction);
  const wTag  = sig.weeklyAligned ? '✅ Haftalık trend onaylıyor' : '⬜ Haftalık onay yok';
  const changeSign = sig.changePercent >= 0 ? '+' : '';
  const freshnessTag = sig.candlesAgo === 0 ? '🔥 Bugün oluştu' : `📅 ${sig.candlesAgo} gün önce oluştu`;
  const description = getSignalDescription(sig.signalType, sig.direction);
  const separator = '━━━━━━━━━━━━━━━━━━━━';
  return (
    `${emoji} *${sig.symbol}* — AI Teknik Sinyal\n` +
    `${separator}\n\n` +
    `📌 *${sig.signalType}*\n` +
    `_${description}_\n\n` +
    `📈 Yön: *${directionLabel(sig.direction)}*\n` +
    `${severityLabel(sig.severity)}\n` +
    `🎯 Güven Skoru: *${sig.confluenceScore}/100*\n` +
    `${wTag}\n` +
    `${freshnessTag}\n\n` +
    `💰 Fiyat: *${sig.currentPrice.toFixed(2)} TL* ` +
    `(${changeSign}${sig.changePercent.toFixed(2)}%)\n\n` +
    `${separator}`
  );
}

function buildTwitterMessage(sig: SocialSignal): string {
  const emoji = directionEmoji(sig.direction);
  return (
    `${emoji} AI bu hissede sinyal verdi\n\n` +
    `${sig.symbol} — ${sig.signalType}\n` +
    `Yön: ${directionLabel(sig.direction)}\n` +
    `Güven: ${sig.confluenceScore}/100\n\n` +
    `Detaylar içeride 👇`
  );
}

// ─── Concurrency limiter ───────────────────────────────────────────────────────
async function pLimit<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<T[]> {
  const results: T[] = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]!();
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// ─── Ana handler ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
  }

  const limitParam = Math.min(5, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '1', 10)));
  const dirFilter  = req.nextUrl.searchParams.get('dir') ?? 'hepsi'; // yukari | asagi | hepsi

  // Her sembol için OHLCV çek + sinyal hesapla
  type SymbolResult = {
    symbol: string;
    signals: StockSignal[];
    confluenceScore: number;
    currentPrice: number;
    changePercent: number;
  } | null;

  const tasks = TOP_BIST_SYMBOLS.map((symbol) => async (): Promise<SymbolResult> => {
    try {
      const { candles, currentPrice, changePercent } = await fetchOHLCV(symbol, 252);
      if (candles.length < 30) return null;

      const signals = detectAllSignals(symbol, candles);
      if (!signals.length) return null;

      const { score, dominantDirection } = computeConfluence(signals);

      // Yön filtresi
      if (dirFilter !== 'hepsi' && dominantDirection !== dirFilter) return null;

      return {
        symbol,
        signals,
        confluenceScore: score,
        currentPrice:    currentPrice ?? candles[candles.length - 1]!.close,
        changePercent:   changePercent ?? 0,
      };
    } catch {
      return null;
    }
  });

  const rawResults = await pLimit(tasks, 5);

  // Null'ları filtrele ve confluence'a göre sırala
  const results = rawResults
    .filter((r): r is NonNullable<SymbolResult> => r !== null)
    .sort((a, b) => b.confluenceScore - a.confluenceScore)
    .slice(0, limitParam);

  if (!results.length) {
    return NextResponse.json({
      signals: [],
      scannedAt: new Date().toISOString(),
      scannedCount: TOP_BIST_SYMBOLS.length,
      message: 'Şu an güçlü sinyal bulunamadı.',
    });
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const socialSignals: SocialSignal[] = results.map((r) => {
    const { score, dominantDirection } = computeConfluence(r.signals);
    const topSig = r.signals
      .filter((s) => s.direction === dominantDirection || dominantDirection === 'nötr')
      .sort((a, b) => {
        const sev = { güçlü: 3, orta: 2, zayıf: 1 } as Record<string, number>;
        return (sev[b.severity] ?? 0) - (sev[a.severity] ?? 0);
      })[0]!;

    const partial: Omit<SocialSignal, 'telegramMessage' | 'twitterMessage'> = {
      id:             `${r.symbol}-${topSig.type.replace(/\s/g, '_')}-${today}`,
      symbol:         r.symbol,
      signalType:     topSig.type,
      direction:      dominantDirection,
      severity:       topSig.severity,
      confluenceScore: score,
      currentPrice:   r.currentPrice,
      changePercent:  r.changePercent,
      candlesAgo:     topSig.candlesAgo ?? 0,
      weeklyAligned:  topSig.weeklyAligned ?? false,
      detectedAt:     new Date().toISOString(),
    };

    const full: SocialSignal = {
      ...partial,
      telegramMessage: buildTelegramMessage(partial as SocialSignal),
      twitterMessage:  buildTwitterMessage(partial as SocialSignal),
    };

    return full;
  });

  return NextResponse.json(
    {
      signals:      socialSignals,
      scannedAt:    new Date().toISOString(),
      scannedCount: TOP_BIST_SYMBOLS.length,
    },
    {
      headers: {
        // n8n her saat çekecek — 55 dakika cache, 5 dakika stale-while-revalidate
        'Cache-Control': 'public, s-maxage=3300, stale-while-revalidate=300',
      },
    },
  );
}
