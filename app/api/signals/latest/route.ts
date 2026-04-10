/**
 * GET /api/signals/latest
 *
 * Make.com / Telegram otomasyonu için: en güçlü BIST sinyallerini döndürür.
 * API key ile korunur — yalnızca yetkili otomasyon çağırabilir.
 *
 * Query params:
 *   limit  — kaç sinyal dönsün (default: 5, max: 5)
 *   dir    — yön filtresi: yukari | asagi | hepsi (default: hepsi)
 *
 * Response:
 *   { signals: SocialSignal[], scannedAt: string, scannedCount: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchOHLCV } from '@/lib/yahoo';
import { detectAllSignals, computeConfluence } from '@/lib/signals';
import type { StockSignal } from '@/types';

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

// ─── API Key Koruması ──────────────────────────────────────────────────────────
function isAuthorized(req: NextRequest): boolean {
  const key = req.headers.get('x-api-key') ?? req.nextUrl.searchParams.get('apiKey');
  const expected = process.env.SOCIAL_API_KEY;
  if (!expected) return true;
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

/** Sinyalin neden (tekrar) paylaşıldığını açıklar */
export type ChangeContext =
  | 'new_signal'       // Normal yeni sinyal
  | 'critical_drop'    // Kritik düşüş (%4+, taze sinyal)
  | 'critical_rise'    // Kritik yükseliş (%4+, taze sinyal)
  | 'flip_buy_to_sell' // Yükseliş sinyali düşüşe döndü
  | 'flip_sell_to_buy'; // Düşüş sinyali yükselişe döndü

export interface SocialSignal {
  /** Tekrar paylaşımı önlemek için benzersiz anahtar (symbol-type-direction-date[-KRITIK]) */
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
  /** Kritik güncelleme: büyük fiyat hareketi veya yön değişimi */
  critical: boolean;
  /** Paylaşım bağlamı — mesaj tonunu belirler */
  changeContext: ChangeContext;
  /** Telegram'a direkt gönderilecek hazır mesaj */
  telegramMessage: string;
  /** X (Twitter) için kısa versiyon */
  twitterMessage: string;
  detectedAt: string;
}

// ─── Sinyal Açıklamaları ───────────────────────────────────────────────────────
const SIGNAL_DESCRIPTIONS: Record<string, { yukari: string; asagi: string; nötr: string }> = {
  'RSI Uyumsuzluğu': {
    yukari: 'Fiyat yeni dip yaparken RSI yükselen dip oluşturdu — satış baskısı azalıyor, yükseliş dönüşümü yakın.',
    asagi:  'Fiyat yeni zirve yaparken RSI düşen zirve oluşturdu — alış gücü zayıflıyor, düşüş riski artıyor.',
    nötr:   'RSI fiyatla uyumsuz hareket ediyor, yön değişimi sinyali izleniyor.',
  },
  'Hacim Anomalisi': {
    yukari: 'Ortalamanın çok üzerinde hacimle güçlü alım baskısı tespit edildi. Kurumsal ilgi artıyor olabilir.',
    asagi:  'Ortalamanın çok üzerinde hacimle güçlü satış baskısı tespit edildi. Çıkış hareketine dikkat.',
    nötr:   'Olağandışı yüksek hacim tespit edildi, yön baskısı netleşmedi.',
  },
  'Trend Başlangıcı': {
    yukari: 'Kısa vadeli ortalama uzun vadeli ortalamanın üzerine geçti. Yeni yükseliş trendi başlıyor olabilir.',
    asagi:  'Kısa vadeli ortalama uzun vadeli ortalamanın altına geçti. Yeni düşüş trendi başlıyor olabilir.',
    nötr:   'Hareketli ortalamalar kesişti, trend değişim sinyali oluştu.',
  },
  'Destek/Direnç Kırılımı': {
    yukari: 'Önemli direnç seviyesi yukarı kırıldı. Kırılım devam ederse güçlü yükseliş hareketi bekleniyor.',
    asagi:  'Önemli destek seviyesi aşağı kırıldı. Kırılım devam ederse güçlü düşüş hareketi bekleniyor.',
    nötr:   'Kritik fiyat seviyesi kırıldı, yön teyidi bekleniyor.',
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

// ─── Template Commentary Sistemi ──────────────────────────────────────────────

/** Deterministik ama çeşitli seçim için hash tabanlı seçici */
function pickByHash(arr: readonly string[], seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return arr[Math.abs(h) % arr.length]!;
}

const OPENING_HOOKS = [
  'Radar ekranına girdi 👀',
  'Fırsatçılar not alsın 📌',
  'Teknik tabloda dikkat çekici hareket 📊',
  'Grafik konuşuyor 🗣️',
  'Alım baskısı hissediliyor 💥',
  'Kırılım sinyali geldi 🔔',
  'Momentum topluyor ⚡',
  'Hacimde hareketlilik başladı 🔄',
  'Güçlü bir setup oluştu 💪',
  'Teknik analiz devrede 🔭',
  'Sistem bu sinyali işaretledi 🎯',
  'Dikkat çekici fiyat hareketi 🧲',
  'Trendin dili değişiyor mu? 🔀',
  'Akıllı para bu hissede hareketleniyor gibi 🧠',
  'Teknik tabloda olumlu gelişme 📈',
  'Bu hisse gündem olmaya aday 🌟',
  'Sessiz sedasız güçleniyor ✨',
  'Sinyal sistemimiz uyarıyor 🚨',
  'Uzun süredir beklenen hareket başladı mı? ⏳',
  'Grafik bir şeyler söylüyor 💬',
  'Kritik seviye test ediliyor 🏔️',
  'Hacim + fiyat = güçlü sinyal 🔥',
  'Kurumsal iz var mı acaba? 🏦',
  'Sinyaller örtüşüyor — dikkatle izle 🔍',
] as const;

const RISK_REMINDERS = [
  '⚠️ _Bu analiz yatırım tavsiyesi değildir. Risk yönetimini unutma._',
  '💡 _Stop\\-loss belirle, pozisyon büyüklüğüne dikkat et._',
  '📋 _Kendi araştırmanı yap — bu sinyal bir başlangıç noktası._',
  '🛡️ _Sermayeni koru. Her işlemde risk\\/ödül oranını hesapla._',
  '🎯 _Giriş noktası kritik. Acele karar verme._',
  '⚖️ _Portföyünün yalnızca belirli bir kısmını riske at._',
  '🧘 _Piyasa sabırlıları ödüllendirir._',
  '📊 _Teknik analiz rehberdir, kehanet değil._',
  '🔍 _Haberleri ve makro verileri de takip et._',
  '🌊 _Piyasalar dalgalanır — sakin kal, planına sadık ol._',
  '💰 _Sadece kaybetmeyi göze aldığın miktarı yatır._',
  '🔔 _Uyarı fiyatı koy, grafik değişimini yakın takip et._',
  '📉 _Her sinyal tutmaz — diversifikasyon şart._',
  '⏱️ _Zamanlama kritik, aceleci davranma._',
  '💼 _Yatırım kararları kişisel durumuna ve risk toleransına göre değişir._',
] as const;

const ACTION_TEXTS: Record<string, Record<string, readonly string[]>> = {
  yukari: {
    güçlü: [
      'Alım fırsatı değerlendirilebilir',
      'Güçlü AL sinyali — pozisyon açılabilir',
      'Yükseliş momentumu güçlü, takipte tut',
      'Teknik olarak alım bölgesine girdi',
      'Kademeli alım düşünülebilir',
    ],
    orta: [
      'Orta vadeli alım düşünülebilir',
      'İncelemeye değer, hareketi takip et',
      'Kademeli pozisyon stratejisi uygulanabilir',
      'Onay gelirse alım yapılabilir',
    ],
    zayıf: [
      'Uzaktan takip et, onay bekle',
      'Küçük test pozisyonu düşünülebilir',
      'Henüz erken — geliştirmeleri izle',
    ],
  },
  asagi: {
    güçlü: [
      'Sat / çık sinyali güçlü',
      'SAT baskısı artıyor — çıkış değerlendirilebilir',
      'Güçlü düşüş sinyali, pozisyon küçültülebilir',
      'Stop\\-loss sıkıştır, çıkış hazırlığı yap',
    ],
    orta: [
      'Temkinli ol, stop\\-loss gözden geçir',
      'Çıkış ya da hedge düşünülebilir',
      'Bekleme moduna geç',
      'Yeni alım yapmaktan kaçın',
    ],
    zayıf: [
      'İzle, henüz acele etme',
      'Stop\\-loss sıkıştır, gelişmeleri takip et',
      'Düşük hacimse paniklemene gerek yok',
    ],
  },
  nötr: {
    güçlü: [
      'Yön kırılımını bekle — büyük hareket yaklaşıyor',
      'Volatilite artışı bekleniyor',
      'Kırılım yönüne göre pozisyon al',
    ],
    orta: [
      'Konsolidasyon aşamasında, yönü izle',
      'Net sinyal için sabır gerekiyor',
    ],
    zayıf: [
      'Bekleme sürecinde — net sinyal için sabır',
      'Henüz taraf belli değil',
    ],
  },
};

function getActionText(direction: string, severity: string, symbol: string): string {
  const dir = ACTION_TEXTS[direction] ?? ACTION_TEXTS['nötr']!;
  const sev = dir[severity] ?? dir['orta'] ?? ['Takipte tut'];
  return pickByHash(sev, symbol + direction + severity);
}

function getSessionContext(): string {
  const trtHour = new Date().getUTCHours() + 3;
  if (trtHour >= 10 && trtHour < 12) return 'Sabah seansında sinyalin gücü dikkat çekiyor.';
  if (trtHour >= 12 && trtHour < 13) return 'Öğle saatlerinde momentum korunuyor.';
  if (trtHour >= 13 && trtHour < 15) return 'Öğleden sonra seansında hareketlilik var.';
  if (trtHour >= 15 && trtHour < 18) return 'Kapanış öncesi kritik bölge.';
  return 'Piyasa saatleri dışında tespit edildi, açılışı izle.';
}

function scoreBar(score: number): string {
  const filled = Math.round(score / 10);
  return '▓'.repeat(filled) + '░'.repeat(10 - filled);
}

// ─── Yardımcılar ───────────────────────────────────────────────────────────────

function directionEmoji(dir: string): string {
  if (dir === 'yukari') return '🟢';
  if (dir === 'asagi')  return '🔴';
  return '🟡';
}

function directionLabel(dir: string): string {
  if (dir === 'yukari') return '📈 YUKARI';
  if (dir === 'asagi')  return '📉 AŞAĞI';
  return '↔️ NÖTR';
}

function severityLabel(sev: string): string {
  if (sev === 'güçlü') return '💪 GÜÇLÜ';
  if (sev === 'orta')  return '⚡ ORTA';
  return '📊 ZAYIF';
}

// ─── Bağlama Özel Banner & Açıklamalar ────────────────────────────────────────

const CONTEXT_BANNERS: Record<ChangeContext, string> = {
  new_signal:       '',
  critical_rise:    '🚀 *KRİTİK YÜKSELİŞ* — Güçlü alım baskısı tespit edildi\\!\n\n',
  critical_drop:    '🚨 *KRİTİK DÜŞÜŞ* — Sert satış baskısı tespit edildi\\!\n\n',
  flip_buy_to_sell: '🔄 *SİNYAL DEĞİŞİMİ* — AL sinyali SAT\'a döndü\\!\n\n',
  flip_sell_to_buy: '🔄 *SİNYAL DEĞİŞİMİ* — SAT sinyali AL\'a döndü\\!\n\n',
};

const CONTEXT_INTROS: Record<ChangeContext, readonly string[]> = {
  new_signal: [],
  critical_rise: [
    'Gün içinde güçlü alım hareketi başladı — grafik bunu net gösteriyor.',
    'Fiyat sert yükselirken hacim de destekliyor. Momentumu izle.',
    'Bugün dikkat çekici bir kırılım yaşandı. Takipçiler not alsın.',
  ],
  critical_drop: [
    'Satış dalgası beklenmedik bir şiddetle geldi. Stop\\-loss\'ları gözden geçir.',
    'Gün içi sert bir düşüş yaşandı — pozisyon yönetimi kritik.',
    'Fiyat önemli destek seviyelerini test ediyor. Dikkatli ol.',
  ],
  flip_buy_to_sell: [
    'Sabah güçlü görünen tablo değişti. Yükseliş sinyali artık aşağı baskıya dönüştü.',
    'Trend tersine döndü\\! Bugün öne çıkan bu hissede yön değişti — pozisyonunu gözden geçir.',
    'Dikkat: Daha önce AL görünen bu hissede SAT sinyali oluştu. Tablo değişti.',
    'Sabahın görünümü ile öğleden sonrası arasında ciddi bir dönüşüm var — SAT baskısı arttı.',
  ],
  flip_sell_to_buy: [
    'Baskı azaldı, yön değişti\\! Düşüş sinyali yerini yükselişe bıraktı.',
    'Güzel bir dönüşüm\\! Bugün aşağı baskı altındaki hissede toparlanma sinyali oluştu.',
    'Seans içi güçlü bir değişim: SAT baskısı geride kaldı, AL sinyali devreye girdi.',
    'Bu hisse kendini toparlıyor — önceki zayıflık artık güce dönüşüyor gibi görünüyor.',
  ],
};

function getContextIntro(ctx: ChangeContext, seed: string): string {
  const intros = CONTEXT_INTROS[ctx];
  if (!intros.length) return '';
  return pickByHash(intros, seed) + '\n\n';
}

// ─── Telegram Mesaj Oluşturucu ─────────────────────────────────────────────────

function buildTelegramMessage(sig: SocialSignal): string {
  const emoji         = directionEmoji(sig.direction);
  const changeSign    = sig.changePercent >= 0 ? '+' : '';
  const freshnessTag  = sig.candlesAgo === 0
    ? '🔥 Taze sinyal (bugün oluştu)'
    : `📅 ${sig.candlesAgo} gün önce oluştu`;
  const wTag          = sig.weeklyAligned
    ? '✅ Haftalık trend onaylıyor'
    : '⬜ Haftalık onay bekleniyor';
  const description   = getSignalDescription(sig.signalType, sig.direction);
  const separator     = '━━━━━━━━━━━━━━━━━━━━━━';
  const thinLine      = '─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─';
  const today         = new Date().toISOString().slice(0, 10);
  const hook          = pickByHash(OPENING_HOOKS, sig.symbol + sig.signalType + today);
  const reminder      = pickByHash(RISK_REMINDERS, sig.id);
  const actionText    = getActionText(sig.direction, sig.severity, sig.symbol);
  const sessionCtx    = getSessionContext();
  const contextBanner = CONTEXT_BANNERS[sig.changeContext];
  const contextIntro  = getContextIntro(sig.changeContext, sig.symbol + sig.changeContext + today);

  // TRT saati
  const trtTime = new Date(Date.now() + 3 * 60 * 60 * 1000)
    .toISOString().slice(11, 16);

  return (
    `${emoji} *${sig.symbol}*\n` +
    `${hook}\n` +
    `${separator}\n\n` +
    `${contextBanner}` +
    `${contextIntro}` +
    `📌 *${sig.signalType}*\n` +
    `_${description}_\n\n` +
    `${directionLabel(sig.direction)}  |  ${severityLabel(sig.severity)}\n\n` +
    `🎯 *Güven Skoru:* ${sig.confluenceScore}/100\n` +
    `${scoreBar(sig.confluenceScore)}  %${sig.confluenceScore}\n\n` +
    `${wTag}\n` +
    `${freshnessTag}\n\n` +
    `💰 *${sig.currentPrice.toFixed(2)} TL*  ` +
    `(${changeSign}${sig.changePercent.toFixed(2)}%)\n\n` +
    `${thinLine}\n` +
    `📌 _${actionText}_\n` +
    `_${sessionCtx}_\n` +
    `${thinLine}\n\n` +
    `${reminder}\n\n` +
    `${separator}\n` +
    `🕐 _${trtTime} TRT_`
  );
}

function buildTwitterMessage(sig: SocialSignal): string {
  const emoji = directionEmoji(sig.direction);
  return (
    `${emoji} ${sig.symbol} — ${sig.signalType}\n\n` +
    `Yön: ${sig.direction === 'yukari' ? 'YUKARI 📈' : sig.direction === 'asagi' ? 'AŞAĞI 📉' : 'NÖTR'}\n` +
    `Güven: ${sig.confluenceScore}/100\n\n` +
    `Detaylar kanalda 👇`
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

// ─── Ana Handler ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
  }

  const limitParam = Math.min(5, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '5', 10)));
  const dirFilter  = req.nextUrl.searchParams.get('dir') ?? 'hepsi';

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

  const today = new Date().toISOString().slice(0, 10);

  // ── Bugün daha önce kayıtlı yönleri çek (flip tespiti için) ────────────────
  const supabase = createAdminClient();
  const prevDirectionMap = new Map<string, string>(); // symbol → önceki yön
  if (supabase) {
    const symbols = results.map((r) => r.symbol);
    const { data } = await supabase
      .from('signal_direction_log')
      .select('symbol, direction')
      .in('symbol', symbols)
      .eq('signal_date', today);
    for (const row of data ?? []) {
      prevDirectionMap.set(row.symbol, row.direction);
    }
  }

  const socialSignals: SocialSignal[] = results.map((r) => {
    const { score, dominantDirection } = computeConfluence(r.signals);
    const topSig = r.signals
      .filter((s) => s.direction === dominantDirection || dominantDirection === 'nötr')
      .sort((a, b) => {
        const sev = { güçlü: 3, orta: 2, zayıf: 1 } as Record<string, number>;
        return (sev[b.severity] ?? 0) - (sev[a.severity] ?? 0);
      })[0]!;

    // Kritik: büyük gün içi hareket (≥4%) VE taze sinyal
    const isCritical = Math.abs(r.changePercent) >= 4.0 && (topSig.candlesAgo ?? 0) === 0;
    const critSuffix = isCritical ? '_KRITIK' : '';

    // ID'ye yön dahil edildi: yön değişiminde otomatik yeniden paylaşım
    const safeType = topSig.type.replace(/\s/g, '_');
    const safeDir  = dominantDirection.replace(/ö/g, 'o');
    const signalId = `${r.symbol}-${safeType}-${safeDir}-${today}${critSuffix}`;

    // ── Bağlam Tespiti ──────────────────────────────────────────────────────────
    // DB'deki bugünün ilk yönüyle karşılaştır → aynı gün flip tespiti
    const prevDirection = prevDirectionMap.get(r.symbol);
    const isFlip = prevDirection !== undefined
      && prevDirection !== dominantDirection
      && dominantDirection !== 'nötr'
      && prevDirection !== 'nötr';

    let changeContext: ChangeContext;
    if (isCritical && r.changePercent > 0) {
      changeContext = 'critical_rise';
    } else if (isCritical && r.changePercent < 0) {
      changeContext = 'critical_drop';
    } else if (isFlip && dominantDirection === 'asagi') {
      changeContext = 'flip_buy_to_sell';
    } else if (isFlip && dominantDirection === 'yukari') {
      changeContext = 'flip_sell_to_buy';
    } else {
      changeContext = 'new_signal';
    }

    const partial: Omit<SocialSignal, 'telegramMessage' | 'twitterMessage'> = {
      id:             signalId,
      symbol:         r.symbol,
      signalType:     topSig.type,
      direction:      dominantDirection,
      severity:       topSig.severity,
      confluenceScore: score,
      currentPrice:   r.currentPrice,
      changePercent:  r.changePercent,
      candlesAgo:     topSig.candlesAgo ?? 0,
      weeklyAligned:  topSig.weeklyAligned ?? false,
      critical:       isCritical,
      changeContext,
      detectedAt:     new Date().toISOString(),
    };

    return {
      ...partial,
      telegramMessage: buildTelegramMessage(partial as SocialSignal),
      twitterMessage:  buildTwitterMessage(partial as SocialSignal),
    };
  });

  // ── Bugünün yönlerini logla (ilk kayıt korunur — ON CONFLICT DO NOTHING) ───
  if (supabase) {
    const logRows = socialSignals.map((s) => ({
      symbol:      s.symbol,
      signal_date: today,
      direction:   s.direction,
      signal_type: s.signalType,
    }));
    await supabase
      .from('signal_direction_log')
      .upsert(logRows, { onConflict: 'symbol,signal_date', ignoreDuplicates: true });
  }

  return NextResponse.json(
    {
      signals:      socialSignals,
      scannedAt:    new Date().toISOString(),
      scannedCount: TOP_BIST_SYMBOLS.length,
    },
    {
      headers: {
        // 30 dakika cache — günde 5 çalışma arasında yeterli yenilik
        'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=300',
      },
    },
  );
}
