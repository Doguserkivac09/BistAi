'use client';

/**
 * Fırsat Detayı (FIRSATLAR-SUNUM-PLAN — 3. yüzey, progressive disclosure).
 *
 * Kart yüzeyinde gerekçeler EN FAZLA 4 rozetle gösteriliyor (bilinçli sınır).
 * Burası o sınırın karşılığı: **tüm gerekçeler kısıtsız**, her birinin açıklaması,
 * risk seviyeleri (giriş/stop/hedef/R-R) ve "bu kurulum geçmişte nasıl performans
 * gösterdi" kanıtı. Yeni hesap YOK — hepsi FirsatItem'da zaten var olan veriler.
 *
 * Hisse detay sayfasını (/hisse/[sembol]) TEKRARLAMAZ: burada yalnız fırsatın
 * KENDİSİ açıklanır, derin analiz için oraya link verilir.
 */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import type { FirsatItem } from '@/app/api/firsatlar/route';
import { deriveReasons, firsatToInput, buildSummary, type Reason } from '@/lib/opportunity-reasons';
import { displayRating } from '@/lib/decision-engine';

const TONE_CLS: Record<Reason['tone'], { dot: string; text: string }> = {
  pos: { dot: 'bg-up', text: 'text-up' },
  warn: { dot: 'bg-warn', text: 'text-warn' },
  neutral: { dot: 'bg-t3', text: 'text-t2' },
};

const fmt = (v: number | null | undefined, suffix = '') =>
  v == null ? '—' : `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}`;

const fmtPct = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);

function advText(tl: number | null): string {
  if (tl == null) return '—';
  if (tl >= 1_000_000_000) return `${(tl / 1_000_000_000).toFixed(1)} milyar ₺`;
  if (tl >= 1_000_000) return `${Math.round(tl / 1_000_000)} milyon ₺`;
  return `${Math.round(tl / 1000)} bin ₺`;
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium text-t3">{label}</div>
      <div
        className={`mt-0.5 font-mono text-[14px] font-bold ${
          tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-ink'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export function FirsatDetay({ firsat, onClose }: { firsat: FirsatItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  // Kartta 4 ile sınırlı; DETAYDA kısıt YOK (progressive disclosure).
  const reasons = deriveReasons(firsatToInput(firsat));
  const ozet = buildSummary(reasons);
  const rating = firsat.decision?.rating ?? 'Tut';

  // YÖN FARKINDA: kısa (asagi) kurulumda stop YUKARIDA, hedef AŞAĞIDADIR. İşaretli
  // yüzde göstermek "hedef +-42.6%" gibi saçma çıktı üretiyordu → mesafe + anlam yazılır.
  const dist = (p: number | null) =>
    p == null || !firsat.entryPrice ? null : (Math.abs(p - firsat.entryPrice) / firsat.entryPrice) * 100;
  const stopDist = dist(firsat.stopLoss);
  const hedefDist = dist(firsat.targetPrice);
  const kisa = firsat.direction === 'asagi';

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${firsat.sembol} fırsat detayı`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[22px] bg-panel shadow-2xl sm:rounded-[20px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Başlık */}
        <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[19px] font-extrabold tracking-[-0.02em] text-ink">{firsat.sembol}</span>
              <span className="rounded-[7px] bg-fill px-2 py-[3px] text-[11px] font-extrabold text-t2">
                {displayRating(rating)}
              </span>
              <span
                className="font-mono text-[13px] font-semibold"
                style={{ color: firsat.changePercent == null ? '#9aa0ad' : firsat.changePercent >= 0 ? '#16a35b' : '#e5484d' }}
              >
                {fmtPct(firsat.changePercent)}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[12px] font-medium text-t3">
              {firsat.sektorAdi} · {fmt(firsat.entryPrice, ' ₺')}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="text-right">
              <div className="font-mono text-[20px] font-extrabold leading-none text-ai">{Math.round(firsat.adjustedScore)}</div>
              <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-t3">skor</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="rounded-lg px-2 py-1 text-lg leading-none text-t3 hover:bg-fill"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <p className="text-[13px] font-semibold leading-[1.5] text-ink">{ozet}</p>

          {firsat.tier === 'teknik' && firsat.tierNote && (
            <div className="mt-2.5 rounded-[10px] border border-hairline bg-fill px-3 py-2 text-[11.5px] font-medium text-t2">
              Yalnız teknik kurulum — {firsat.tierNote.toLocaleLowerCase('tr-TR')}
            </div>
          )}

          {/* TÜM gerekçeler — kısıt YOK */}
          <div className="mt-4">
            <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-t3">
              Neden bu hisse? ({reasons.length})
            </div>
            <div className="mt-2 flex flex-col gap-2">
              {reasons.length === 0 && (
                <div className="text-[12px] font-medium text-t3">Belirgin bir gerekçe üretilemedi.</div>
              )}
              {reasons.map((r) => (
                <div key={r.id} className="flex gap-2.5">
                  <span className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${TONE_CLS[r.tone].dot}`} />
                  <div className="min-w-0">
                    <div className={`text-[12.5px] font-bold ${TONE_CLS[r.tone].text}`}>{r.text}</div>
                    {(r.detail || r.evidence) && (
                      <div className="text-[11.5px] font-medium leading-[1.45] text-t3">
                        {r.evidence ?? r.detail}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Risk seviyeleri */}
          <div className="mt-4 rounded-[14px] border border-hairline px-4 py-3">
            <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-t3">Risk planı</div>
            <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <Row label="Giriş" value={fmt(firsat.entryPrice, ' ₺')} />
              <Row
                label="Zarar kes"
                value={firsat.stopLoss == null ? '—' : `${fmt(firsat.stopLoss)} ₺`}
                tone={firsat.stopLoss == null ? null : 'down'}
              />
              <Row
                label="Hedef"
                value={firsat.targetPrice == null ? '—' : `${fmt(firsat.targetPrice)} ₺`}
                tone={firsat.targetPrice == null ? null : 'up'}
              />
              <Row label="Risk/Ödül" value={firsat.riskRewardRatio == null ? '—' : `1 : ${firsat.riskRewardRatio.toFixed(1)}`} />
            </div>
            {(stopDist != null || hedefDist != null) && (
              <div className="mt-2 text-[11px] font-medium leading-[1.45] text-t3">
                {kisa && <span className="font-semibold text-t2">Kısa (düşüş) kurulumu: </span>}
                {stopDist != null && `zarar kes %${stopDist.toFixed(1)} ${kisa ? 'yukarıda' : 'aşağıda'}`}
                {stopDist != null && hedefDist != null && ' · '}
                {hedefDist != null && `hedef %${hedefDist.toFixed(1)} ${kisa ? 'aşağıda' : 'yukarıda'}`}
                {' — '}ATR tabanlı otomatik hesap, emir değildir.
              </div>
            )}
          </div>

          {/* Geçmiş performans kanıtı */}
          <div className="mt-3 rounded-[14px] border border-hairline px-4 py-3">
            <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-t3">
              Bu kurulum geçmişte nasıl performans gösterdi?
            </div>
            {firsat.combo ? (
              <div className="mt-2">
                <div className="text-[12.5px] font-bold text-up">
                  {firsat.combo.members.join(' + ')}
                </div>
                <div className="mt-0.5 font-mono text-[12px] font-semibold text-up">
                  %{firsat.combo.winRate.toFixed(0)} isabet · ort {firsat.combo.avgNet >= 0 ? '+' : ''}
                  {firsat.combo.avgNet.toFixed(1)}%
                  <span className="ml-1 font-sans font-medium text-t3">(n={firsat.combo.n} geçmiş kurulum)</span>
                </div>
              </div>
            ) : firsat.historicalWinRate != null && firsat.winRateN >= 5 ? (
              <div className="mt-2 font-mono text-[12px] font-semibold text-t2">
                {firsat.sinyaller[0] ?? 'Sinyal'}: %{Math.round(firsat.historicalWinRate * 100)} isabet
                <span className="ml-1 font-sans font-medium text-t3">(n={firsat.winRateN})</span>
              </div>
            ) : (
              <div className="mt-2 text-[11.5px] font-medium leading-[1.45] text-t3">
                Bu kurulum için yeterli geçmiş örneklem yok (en az 5 değerlendirilmiş sinyal gerekir).
                Ölçüm olmadan isabet oranı <strong className="font-semibold">iddia edilmiyor</strong>.
              </div>
            )}
          </div>

          {/* Bağlam */}
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded-[14px] border border-hairline px-4 py-3 sm:grid-cols-3">
            <Row label="Günlük hacim (20g)" value={advText(firsat.avgDailyVolumeTL)} />
            <Row label="Sinyal yaşı" value={`${Math.round(firsat.ageHours)} saat`} />
            <Row label="Sektörde sinyal" value={`${firsat.sektorSinyalSayisi} hisse`} />
          </div>

          <p className="mt-3 text-[10.5px] font-medium leading-[1.5] text-t3">
            Skorlar teknik + makro + sektör + temel + katalist birleşimidir; olasılık belirtir,
            kesinlik değil. Yatırım tavsiyesi değildir.
          </p>
        </div>

        <div className="border-t border-hairline px-5 py-3">
          <Link
            href={`/hisse/${firsat.sembol}`}
            className="flex h-11 items-center justify-center rounded-[12px] bg-ink text-[13px] font-bold text-onink"
          >
            {firsat.sembol} detaylı analiz →
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default FirsatDetay;
