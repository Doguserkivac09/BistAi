'use client';

/**
 * FirsatKarti — birleşik karar motoru çıktısını gösteren paylaşımlı kart
 *
 * /firsatlar ve /ters-portfolyo iki sayfada da aynı görünüm + skor parite.
 * Tek SoT: lib/decision-engine + /api/firsatlar.
 */

import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, AlertTriangle, ChevronRight, Users, Clock, Star, Zap, Bookmark, BookmarkCheck, Flame, ArrowDownToLine,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import type { FirsatItem } from '@/app/api/firsatlar/route';
import { InfoPopover } from '@/components/InfoPopover';
import { detectPhase } from '@/lib/market-phase';

// ── Sinyal güç seviyeleri ────────────────────────────────────────────

const SINYAL_GUC: Record<string, 'guclu' | 'orta' | 'destekleyici'> = {
  'Altın Çapraz':            'guclu',
  'Trend Başlangıcı':        'guclu',
  'Destek/Direnç Kırılımı':  'guclu',
  'Higher Lows':             'guclu',  // leading — erken pattern
  'RSI Uyumsuzluğu':         'orta',
  'MACD Kesişimi':           'orta',
  'RSI Seviyesi':            'orta',
  'Hacim Anomalisi':         'destekleyici',
  'Bollinger Sıkışması':     'destekleyici',
  // Pre-signals — orta güçte (kesişim henüz olmadı)
  'Altın Çapraz Yaklaşıyor': 'orta',
  'Trend Olgunlaşıyor':      'orta',
  'Direnç Testi':            'orta',
  'MACD Daralıyor':          'destekleyici',
  // Formasyonlar — klasik teknik analiz, güçlü
  'Çift Dip':                'guclu',
  'Çift Tepe':               'guclu',
  'Bull Flag':               'guclu',
  'Bear Flag':               'guclu',
  'Cup & Handle':            'guclu',
  'Ters Omuz-Baş-Omuz':      'guclu',
  'Yükselen Üçgen':          'guclu',
};

const SINYAL_KISALT: Record<string, string> = {
  'RSI Uyumsuzluğu':        'RSI Div.',
  'Hacim Anomalisi':         'Hacim',
  'Trend Başlangıcı':        'Trend',
  'Destek/Direnç Kırılımı': 'D/D Kır.',
  'MACD Kesişimi':           'MACD',
  'RSI Seviyesi':            'RSI',
  'Altın Çapraz':            'Altın Çpz.',
  'Bollinger Sıkışması':     'BB Sık.',
  'Higher Lows':             '⚡ HL/LH',
  // Pre-signals — ⚡ ile vurgu
  'Altın Çapraz Yaklaşıyor': '⚡ AÇ Yakın',
  'Trend Olgunlaşıyor':      '⚡ Trend Olg.',
  'Direnç Testi':            '⚡ Direnç Test',
  'MACD Daralıyor':          '⚡ MACD Dar.',
  // Formasyonlar — 📐 ile vurgu
  'Çift Dip':                '📐 Çift Dip',
  'Çift Tepe':               '📐 Çift Tepe',
  'Bull Flag':               '📐 Bull Flag',
  'Bear Flag':               '📐 Bear Flag',
  'Cup & Handle':            '📐 Kupa-Kulp',
  'Ters Omuz-Baş-Omuz':      '📐 Ters OBO',
  'Yükselen Üçgen':          '📐 Yks. Üçgen',
};

export function sinyalEtiket(sinyal: string) {
  const guc = SINYAL_GUC[sinyal] ?? 'destekleyici';
  const kisalt = SINYAL_KISALT[sinyal] ?? sinyal;
  const stil = {
    guclu:        'bg-green-500/15 border-green-500/30 text-green-400',
    orta:         'bg-yellow-500/15 border-yellow-500/30 text-yellow-400',
    destekleyici: 'bg-blue-500/15 border-blue-500/30 text-blue-400',
  }[guc];
  return (
    <span key={sinyal} title={sinyal} className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stil}`}>
      {kisalt}
    </span>
  );
}

// ── Yardımcılar ──────────────────────────────────────────────────────

export function sinyalYasi(entryTime: string): string {
  const diff = Date.now() - new Date(entryTime).getTime();
  const saat = Math.floor(diff / (1000 * 60 * 60));
  if (saat < 24) return 'Bugün';
  if (saat < 48) return 'Dün';
  return `${Math.floor(saat / 24)}g önce`;
}

export function confluenceColor(score: number) {
  if (score >= 70) return 'text-green-400';
  if (score >= 55) return 'text-yellow-400';
  return 'text-orange-400';
}

export function confluenceBg(score: number) {
  if (score >= 70) return 'bg-green-500/15 border-green-500/30';
  if (score >= 55) return 'bg-yellow-500/15 border-yellow-500/30';
  return 'bg-orange-500/15 border-orange-500/30';
}

export function confluenceLabel(score: number) {
  if (score >= 70) return 'Güçlü';
  if (score >= 55) return 'Orta';
  return 'Zayıf';
}

function adjustmentBadges(f: FirsatItem) {
  const badges: { key: string; text: string; cls: string; title: string }[] = [];

  if (f.adjustments.winRate !== 0) {
    const positive = f.adjustments.winRate > 0;
    badges.push({
      key: 'wr',
      text: `Geçmiş ${positive ? '+' : ''}${f.adjustments.winRate}`,
      cls: positive ? 'text-green-400 border-green-500/25 bg-green-500/10'
                    : 'text-red-400 border-red-500/25 bg-red-500/10',
      title: `Bu sinyal tipinin geçmiş win rate'i: %${Math.round((f.historicalWinRate ?? 0) * 100)} (n=${f.winRateN})`,
    });
  }

  if (f.adjustments.regimeFit !== 0) {
    const positive = f.adjustments.regimeFit > 0;
    badges.push({
      key: 'rg',
      text: `Rejim ${positive ? '+' : ''}${f.adjustments.regimeFit}`,
      cls: positive ? 'text-green-400 border-green-500/25 bg-green-500/10'
                    : 'text-red-400 border-red-500/25 bg-red-500/10',
      title: positive ? 'XU100 trendi sinyal yönü ile uyumlu' : 'XU100 trendi sinyal yönü ile ters',
    });
  }

  if (f.adjustments.macroAlign !== 0) {
    const positive = f.adjustments.macroAlign > 0;
    badges.push({
      key: 'mc',
      text: `Makro ${positive ? '+' : ''}${f.adjustments.macroAlign}`,
      cls: positive ? 'text-green-400 border-green-500/25 bg-green-500/10'
                    : 'text-red-400 border-red-500/25 bg-red-500/10',
      title: positive ? 'Makro ortam sinyal yönü ile uyumlu' : 'Makro ortam sinyal yönü ile ters',
    });
  }

  if (f.adjustments.timeDecay < 0.85) {
    badges.push({
      key: 'td',
      text: `Yaş ×${f.adjustments.timeDecay.toFixed(2)}`,
      cls: 'text-orange-400 border-orange-500/25 bg-orange-500/10',
      title: `${f.ageHours}s önce — time decay uygulandı (half-life 48s)`,
    });
  }

  if (f.adjustments.mtfAlign !== 0) {
    const positive = f.adjustments.mtfAlign > 0;
    badges.push({
      key: 'mtf',
      text: `MTF ${positive ? '+' : ''}${f.adjustments.mtfAlign}`,
      cls: positive ? 'text-green-400 border-green-500/25 bg-green-500/10'
                    : 'text-red-400 border-red-500/25 bg-red-500/10',
      title: positive ? 'Haftalık trend sinyal yönü ile uyumlu' : 'Haftalık trend sinyal yönü ile ters',
    });
  }

  if (f.adjustments.kapEvent !== 0) {
    badges.push({
      key: 'kap',
      text: `KAP ${f.adjustments.kapEvent}`,
      cls: 'text-amber-400 border-amber-500/25 bg-amber-500/10',
      title: `Son 7 günde kritik KAP duyurusu — sinyal event'ten etkilenmiş olabilir`,
    });
  }

  return badges;
}

// Yatırım Skoru rozeti — investment-score rating eşikleriyle (80/65/45/30) hizalı
function investmentScoreBadge(score: number): string {
  if (score >= 65) return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300';
  if (score >= 45) return 'bg-sky-500/10 border-sky-500/30 text-sky-300';
  if (score >= 30) return 'bg-amber-500/10 border-amber-500/30 text-amber-300';
  return 'bg-red-500/10 border-red-500/30 text-red-300';
}

function formatADV(tl: number | null): string | null {
  if (tl === null) return null;
  if (tl >= 1_000_000_000) return `${(tl / 1_000_000_000).toFixed(1)}B₺`;
  if (tl >= 1_000_000)     return `${(tl / 1_000_000).toFixed(0)}M₺`;
  return `${Math.round(tl / 1000)}K₺`;
}

function rrColor(rr: number | null): string {
  if (rr === null) return 'text-text-muted';
  if (rr >= 3)   return 'text-green-400';
  if (rr >= 2)   return 'text-emerald-400';
  if (rr >= 1.5) return 'text-yellow-400';
  return 'text-orange-400';
}

// ── Sektör badge ─────────────────────────────────────────────────────

export function SektorBadge({ sektorAdi, sektorSinyalSayisi }: { sektorAdi: string; sektorSinyalSayisi: number }) {
  if (sektorSinyalSayisi >= 3) return (
    <span className="flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-semibold text-purple-400 border border-purple-500/25">
      <Users className="h-2.5 w-2.5" /> {sektorAdi}: {sektorSinyalSayisi} hisse
    </span>
  );
  if (sektorSinyalSayisi === 2) return (
    <span className="flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-400 border border-indigo-500/25">
      <Users className="h-2.5 w-2.5" /> {sektorAdi}: 2 hisse
    </span>
  );
  return (
    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-text-muted border border-border">
      {sektorAdi}
    </span>
  );
}

// ── Watchlist Butonu (mini) ───────────────────────────────────────────

function MiniWatchlistBtn({ sembol, inList, onToggle }: {
  sembol: string;
  inList: boolean;
  onToggle: (sembol: string, currentState: boolean) => void;
}) {
  return (
    <button
      onClick={(e) => { e.preventDefault(); onToggle(sembol, inList); }}
      title={inList ? 'İzleme listesinden çıkar' : 'İzleme listesine ekle'}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
        inList
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border bg-surface text-text-muted hover:border-primary/40 hover:text-primary'
      }`}
    >
      <Star className={`h-3.5 w-3.5 ${inList ? 'fill-primary' : ''}`} />
    </button>
  );
}

// ── Fırsat Kartı ──────────────────────────────────────────────────────

export function FirsatKarti({
  firsat,
  index,
  inWatchlist,
  onWatchlistToggle,
  source = 'firsatlar',
}: {
  firsat: FirsatItem;
  index: number;
  inWatchlist: boolean;
  onWatchlistToggle: (sembol: string, currentState: boolean) => void;
  source?: 'firsatlar' | 'tersportfolyo';
}) {
  const isAl  = firsat.direction === 'yukari';
  const isSat = firsat.direction === 'asagi';

  // ── C: Sinyal takipçisi state ───────────────────────────────────────
  const [tracked, setTracked]   = useState(false);
  const [tracking, setTracking] = useState(false);

  const handleTrack = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (tracking) return;
    setTracking(true);
    try {
      if (tracked) {
        const params = new URLSearchParams({ sembol: firsat.sembol, signal_type: firsat.sinyaller[0] ?? '' });
        await fetch(`/api/signal-tracker?${params}`, { method: 'DELETE' });
        setTracked(false);
        toast.success(`${firsat.sembol} takipten çıkarıldı`);
      } else {
        await fetch('/api/signal-tracker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sembol:           firsat.sembol,
            signal_type:      firsat.sinyaller[0] ?? '',
            direction:        firsat.direction,
            entry_price:      firsat.entryPrice,
            confluence_score: firsat.confluenceScore,
            sector_name:      firsat.sektorAdi,
          }),
        });
        setTracked(true);
        toast.success(`${firsat.sembol} takibe alındı — fiyat hareketi bildirilecek`);
      }
    } catch {
      toast.error('İşlem başarısız');
    } finally {
      setTracking(false);
    }
  }, [firsat, tracked, tracking]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
    >
      <Link
        href={`/hisse/${firsat.sembol}?from=${source}&snapshotScore=${firsat.adjustedScore}&snapshotAt=${encodeURIComponent(firsat.entryTime)}`}
        className="block rounded-xl border border-border bg-surface p-4 transition-all hover:border-primary/40 hover:bg-white/5 hover:shadow-lg hover:shadow-primary/5"
      >
        {/* Üst: sembol + yön + confluence */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-bold text-text-primary">{firsat.sembol}</span>
              {isAl && (
                <span className="flex items-center gap-0.5 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-bold text-green-400 border border-green-500/25">
                  <TrendingUp className="h-3 w-3" /> AL
                </span>
              )}
              {isSat && (
                <span className="flex items-center gap-0.5 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-400 border border-red-500/25">
                  <TrendingDown className="h-3 w-3" /> SAT
                </span>
              )}
              <span className={`flex items-center gap-0.5 text-[10px] ${
                firsat.ageHours > 120 ? 'text-orange-400 font-semibold' :
                firsat.ageHours > 72  ? 'text-amber-400' : 'text-text-muted'
              }`}>
                <Clock className="h-2.5 w-2.5" />
                {sinyalYasi(firsat.entryTime)}
                {firsat.ageHours > 120 && (
                  <span className="ml-0.5" title="Sinyal 5+ gün eski — fiyat hareketi başlamış olabilir">
                    🐌
                  </span>
                )}
              </span>
              {/* Tavan badge */}
              {firsat.isTavan && (
                <span title="Bugün tavan yaptı — günlük limit dolu"
                  className="flex items-center gap-0.5 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  🚀 TAVAN
                </span>
              )}
              {/* Taban badge */}
              {firsat.isTaban && (
                <span title="Bugün taban yaptı — günlük limit dolu"
                  className="flex items-center gap-0.5 rounded-full border border-red-400/50 bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-300">
                  <ArrowDownToLine className="h-2.5 w-2.5" /> TABAN
                </span>
              )}
              {/* Tavan ihtimali badge */}
              {!firsat.isTavan && !firsat.isTaban && firsat.tavanLabel && (
                <span
                  title={`Tavan İhtimali: ${firsat.tavanScore}/100\nBugün: ${firsat.changePercent != null ? `${firsat.changePercent > 0 ? '+' : ''}${firsat.changePercent.toFixed(1)}%` : '—'}`}
                  className={`flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    firsat.tavanLabel === 'kritik' ? 'border-orange-400/50 bg-orange-500/15 text-orange-300' :
                    firsat.tavanLabel === 'yuksek' ? 'border-amber-400/40 bg-amber-500/10 text-amber-300' :
                    'border-yellow-400/30 bg-yellow-500/8 text-yellow-400'
                  }`}>
                  <Flame className="h-2.5 w-2.5" />
                  {firsat.tavanLabel === 'kritik' ? `Tavan: ${firsat.tavanScore}` :
                   firsat.tavanLabel === 'yuksek' ? `Tavan: ${firsat.tavanScore}` :
                   `Tavan: ${firsat.tavanScore}`}
                </span>
              )}
              {/* Tavana yaklaşıyor badge */}
              {firsat.tavanYaklasıyor && !firsat.isTavan && (
                <span title={`Tavana yaklaşıyor: ${firsat.changePercent?.toFixed(1)}%`}
                  className="flex items-center gap-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/8 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  ⚡ Tavana Yakın
                </span>
              )}
              {/* B: Hâlâ Geçerli badge */}
              {firsat.persistedDays != null && (
                <span
                  title={`Bu sinyal ${firsat.persistedDays} gün önce de fırsatlar sayfasındaydı — kalıcı momentum`}
                  className="flex items-center gap-0.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-400">
                  🔁 {firsat.persistedDays}g Geçerli
                </span>
              )}
            </div>
            {firsat.ageHours > 120 && (
              <p className="mt-1.5 text-[10px] text-orange-400/80 leading-snug">
                ⚠️ Geç sinyal — fiyat hareketi muhtemelen başlamış, dikkatli ol
              </p>
            )}
          </div>

          <div className="flex items-start gap-2 shrink-0">
            {/* C: Takibe Al butonu */}
            <button
              onClick={handleTrack}
              disabled={tracking}
              title={tracked ? 'Takipten çıkar' : 'Takibe al — fiyat hareketi bildirilir'}
              className={`rounded-lg border p-1.5 transition-colors disabled:opacity-50 ${
                tracked
                  ? 'border-violet-500/40 bg-violet-500/10 text-violet-400'
                  : 'border-border text-text-muted hover:border-violet-500/30 hover:text-violet-400'
              }`}
            >
              {tracked
                ? <BookmarkCheck className="h-3.5 w-3.5" />
                : <Bookmark className="h-3.5 w-3.5" />}
            </button>
            <MiniWatchlistBtn
              sembol={firsat.sembol}
              inList={inWatchlist}
              onToggle={onWatchlistToggle}
            />
            <div className={`relative flex flex-col items-center rounded-xl border px-3 py-1.5 ${confluenceBg(firsat.adjustedScore)}`}>
              <div className="absolute -top-1.5 -right-1.5">
                <InfoPopover
                  title="Fırsat Skoru"
                  description="Aynı anda birden fazla teknik sinyalin örtüştüğü ve henüz tükenmemiş anomalileri puanlar. Yeni sinyallere yüksek, eskiyenlere düşük puan verir; piyasa rejimine göre düzeltilir."
                  meta={`Confluence × yaş çürümesi × rejim · Aralık 0-100\nHam: ${firsat.confluenceScore} · Yaş: ${firsat.ageHours}s · Net: ${firsat.adjustedScore}`}
                  size={12}
                />
              </div>
              <span className="text-[8px] font-bold uppercase tracking-wider text-text-secondary/60">
                Fırsat
              </span>
              <span className={`text-xl font-bold leading-none ${confluenceColor(firsat.adjustedScore)}`}>
                {firsat.adjustedScore}
              </span>
              <span className={`text-[9px] font-semibold uppercase tracking-wide ${confluenceColor(firsat.adjustedScore)}`}>
                {confluenceLabel(firsat.adjustedScore)}
              </span>
            </div>
          </div>
        </div>

        <div className="mb-2 flex flex-wrap gap-1.5">
          {firsat.sinyaller.map((s) => sinyalEtiket(s))}
        </div>

        {(() => {
          const badges = adjustmentBadges(firsat);
          if (badges.length === 0) return null;
          return (
            <div className="mb-3 flex flex-wrap gap-1">
              {badges.map((b) => (
                <span
                  key={b.key}
                  title={b.title}
                  className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${b.cls}`}
                >
                  {b.text}
                </span>
              ))}
            </div>
          );
        })()}

        {firsat.kapUyarisi?.var && (
          <div
            className="mb-2 flex items-start gap-1.5 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-300"
            title={firsat.kapUyarisi.mesaj}
          >
            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
            <span className="truncate">
              <span className="font-semibold">KAP:</span> {firsat.kapUyarisi.mesaj}
            </span>
          </div>
        )}

        {firsat.riskRewardRatio !== null && firsat.stopLoss !== null && firsat.targetPrice !== null && (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-border/50 bg-surface-alt/30 px-2 py-1 text-[10px]">
            <span className="font-semibold text-text-muted">R/R:</span>
            <span className={`font-bold ${rrColor(firsat.riskRewardRatio)}`}>
              1 : {firsat.riskRewardRatio.toFixed(1)}
            </span>
            <span className="text-text-muted">·</span>
            <span title="Stop-loss" className="text-red-400">
              ↓ {firsat.stopLoss.toFixed(2)}
            </span>
            <span className="text-text-muted">·</span>
            <span title="Hedef" className="text-green-400">
              ↑ {firsat.targetPrice.toFixed(2)}
            </span>
          </div>
        )}

        {/* Hedef fiyat satırı — öne çıkarıldı */}
        {firsat.targetPrice && firsat.riskRewardRatio && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5 text-[11px]">
            <span className="text-emerald-400 font-semibold shrink-0">🎯 Hedef</span>
            <span className="text-emerald-400 font-bold tabular-nums">{firsat.targetPrice.toFixed(2)}₺</span>
            <span className="text-text-muted">·</span>
            <span className="text-emerald-400/80">
              +{(((firsat.targetPrice - firsat.entryPrice) / firsat.entryPrice) * 100).toFixed(1)}%
            </span>
            <span className="ml-auto text-text-muted text-[10px]">
              R/R {firsat.riskRewardRatio.toFixed(1)}:1
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <SektorBadge sektorAdi={firsat.sektorAdi} sektorSinyalSayisi={firsat.sektorSinyalSayisi} />

            {/* Piyasa Aşaması Rozeti */}
            {(() => {
              // ageHours'dan RSI'yi tahmin edemeyiz, sadece sinyal tazeyse Birikim ikonunu göster
              // Gerçek RSI FirsatItem'da yok — sadece taze sinyal uyarısı
              return null; // Şimdilik — hisse detay sayfasında gösterilecek
            })()}

            {/* ⭐ ÇİFT ONAY: Teknik güçlü + Temel güçlü */}
            {(() => {
              const teknikGuclu = firsat.adjustedScore >= 70;
              const temelGuclu  = firsat.investmentScore && firsat.investmentScore.score >= 60;
              if (!teknikGuclu || !temelGuclu) return null;
              return (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold text-amber-300"
                  title={`Çift Onay: Teknik ${firsat.adjustedScore} + Temel ${firsat.investmentScore?.score}/100 — her iki perspektif uyumlu`}
                >
                  <Zap className="h-2.5 w-2.5" />
                  ÇİFT ONAY
                </span>
              );
            })()}

            {firsat.avgDailyVolumeTL !== null && (
              <span
                className="rounded-full bg-white/5 border border-border px-2 py-0.5 text-[9px] text-text-muted"
                title="20 gün ortalama günlük TL işlem hacmi"
              >
                {formatADV(firsat.avgDailyVolumeTL)}
              </span>
            )}
            {firsat.weeklyAligned === true && (
              <span
                className="rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 text-[9px] font-semibold text-emerald-400"
                title="Haftalık trend sinyal yönü ile uyumlu — güçlü kurulum"
              >
                MTF ✓
              </span>
            )}
            {firsat.investmentScore && (
              <span
                className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${investmentScoreBadge(firsat.investmentScore.score)}`}
                title={`Yatırım Skoru: ${firsat.investmentScore.score}/100 → ${firsat.investmentScore.rating}`}
              >
                YS {firsat.investmentScore.score}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className="font-semibold text-text-secondary">{firsat.entryPrice.toFixed(2)} ₺</span>
            <ChevronRight className="h-3.5 w-3.5 text-primary" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
