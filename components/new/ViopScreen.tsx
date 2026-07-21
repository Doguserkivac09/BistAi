'use client';

/**
 * VIOP hub ekranı (design_handoff_viop_hub, liquid glass) — çok varlıklı vadeli analiz.
 *
 * Eski sayfa yalnızca XU030 endeks vadelisini analiz ediyordu. Yeni kurgu dört varlık
 * sınıfını (Endeksler · Bankalar · Emtia · Döviz) yatay sekme şeridiyle tarar, her
 * kontrat için net LONG/SHORT/NÖTR karar üretir (`lib/viop-engine.ts`, klonlanmadı —
 * spot decision-engine'den AYRI: kaldıraç/teminat/likidasyon katmanı). Üstte Makro rejim
 * paneli (gerçek /api/macro verisi — risk iştahı/TL yönü/TCMB/DXY/ons altın/Brent),
 * sağ rayda tüm varlıklardaki en güçlü long+short (Öne çıkan işlemler).
 *
 * Dürüstlük notu: handoff'un kalıcı "fiyat grafiği" istediği kart-içi mum grafiği bu
 * turda YOK — handoff'un kendi "Genişletme adayları" listesi bunu "henüz yok, kart
 * genişletince" olarak zaten ileri bir işe bırakıyor; eklemek emtia/döviz dayanaklarının
 * (sentetik gram-TL/composite anahtar) gerçek Yahoo sembolü OLMAMASI nedeniyle yanlış
 * sembolle grafik çekme riski taşırdı — dürüstçe atlandı.
 *
 * Veri: /api/viop (cron precompute, ai_cache tek satır — istek anında fan-out YOK) +
 * /api/macro (Makro rejim paneli, gerçek TCMB/DXY/ons altın/Brent/USD-TRY).
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PREMIUM_PREVIEW } from '@/lib/tier-guard';
import { VIOP_ASSET_CLASSES, type ViopAssetClass } from '@/lib/viop-symbols';
import type { ViopSignalResult } from '@/lib/viop-engine';

interface ViopResponse {
  items: ViopSignalResult[];
  generatedAt: string | null;
  stale: boolean;
  message?: string;
}

interface MacroQuote { price: number; changePercent: number }
interface MacroResp {
  score?: { score: number; wind: string; label: string };
  indicators?: { dxy?: MacroQuote | null; gold?: MacroQuote | null; brent?: MacroQuote | null; usdtry?: MacroQuote | null };
  turkey?: { policyRate?: { value: number } | null };
}

const fmt = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
const fmt0 = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 0 });

type DirFilter = 'tumu' | 'long' | 'short';
const DIR_FILTERS: { key: DirFilter; label: string }[] = [
  { key: 'tumu', label: 'Tümü' },
  { key: 'long', label: 'Long' },
  { key: 'short', label: 'Short' },
];

function dirBadge(d: ViopSignalResult['direction']) {
  if (d === 'long') return { text: '▲ LONG', color: '#16a35b', bg: 'rgba(22,163,91,0.12)' };
  if (d === 'short') return { text: '▼ SHORT', color: '#e5484d', bg: 'rgba(229,72,77,0.12)' };
  return { text: '● NÖTR', color: '#9aa0ad', bg: 'rgba(154,160,173,0.14)' };
}
function dirSentence(d: ViopSignalResult['direction']) {
  if (d === 'long') return 'Yukarı yönlü senaryo';
  if (d === 'short') return 'Aşağı yönlü senaryo';
  return 'Nötr / belirsiz';
}
function scoreColor(score: number) {
  if (score >= 70) return '#16a35b';
  if (score >= 55) return '#c98a00';
  return '#9aa0ad';
}

// ── Makro rejim yorumu (gerçek /api/macro verisinden türetilir, sabit metin YOK) ──
function macroSummary(m: MacroResp | null): string {
  if (!m?.score) return 'Makro veri yükleniyor…';
  const wind = m.score.wind;
  const riskText = wind.includes('positive') ? 'risk iştahı olumlu' : wind.includes('negative') ? 'risk iştahı zayıf' : 'risk iştahı nötr';
  const usdtry = m.indicators?.usdtry;
  const tlText = usdtry
    ? usdtry.changePercent > 0.2 ? 'TL zayıflıyor' : usdtry.changePercent < -0.2 ? 'TL güçleniyor' : 'TL yatay'
    : null;
  const rate = m.turkey?.policyRate?.value;
  return [riskText, tlText, rate != null ? `TCMB %${fmt0(rate)}` : null].filter(Boolean).join(' · ');
}

export function ViopScreen() {
  const [data, setData] = useState<ViopResponse | null>(null);
  const [macro, setMacro] = useState<MacroResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ViopAssetClass>('endeks');
  const [dir, setDir] = useState<DirFilter>('tumu');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/viop')
      .then(async (r) => {
        if (r.status === 403) { if (!cancelled) setForbidden(true); return null; }
        if (!r.ok) throw new Error('yüklenemedi');
        return r.json() as Promise<ViopResponse>;
      })
      .then((d) => { if (d && !cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError('VIOP analizi yüklenemedi.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    fetch('/api/macro')
      .then((r) => (r.ok ? (r.json() as Promise<MacroResp>) : null))
      .then((d) => { if (!cancelled) setMacro(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const items = data?.items ?? [];
  const byTab = useMemo(() => items.filter((i) => i.cls === tab), [items, tab]);
  // NÖTR kontratlar yalnızca "Tümü" filtresinde görünür (kendi direction'ı long/short
  // olmadığı için long/short filtresine zaten girmiyor — ek koşul gerekmez).
  const filtered = useMemo(() => (dir === 'tumu' ? byTab : byTab.filter((i) => i.direction === dir)), [byTab, dir]);

  const { topLong, topShort } = useMemo(() => {
    let tl: ViopSignalResult | null = null;
    let ts: ViopSignalResult | null = null;
    for (const i of items) {
      if (i.direction === 'long' && (!tl || i.score > tl.score)) tl = i;
      if (i.direction === 'short' && (!ts || i.score > ts.score)) ts = i;
    }
    return { topLong: tl, topShort: ts };
  }, [items]);

  // ── Premium upsell ──
  if (forbidden) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <div className="rounded-3xl border border-hairline bg-surface-dark p-10 text-white">
          <div className="mb-3 text-3xl">🔒</div>
          <h1 className="mb-2 font-manrope text-xl font-bold">VIOP Analizi — Premium</h1>
          <p className="mb-6 text-sm text-white/70">
            Vadeli işlem analizleri (endeks, hisse, emtia, döviz) premium üyeliğe özeldir.
          </p>
          <Link
            href="/profil"
            className="inline-flex items-center rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-ink"
          >
            Premium'a yükselt
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="ie-ambient relative min-h-full overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-[50px] -top-[50px] h-[250px] w-[280px] blur-[24px]" style={{ background: 'radial-gradient(circle,rgba(107,111,245,0.2),rgba(107,111,245,0) 68%)' }} />
        <div className="absolute -right-[60px] -top-[30px] h-[230px] w-[280px] blur-[26px]" style={{ background: 'radial-gradient(circle,rgba(22,163,91,0.18),rgba(22,163,91,0) 66%)' }} />
      </div>

      <div className="relative px-6 py-5 lg:px-7 lg:py-[22px]">
        {/* ── Başlık ── */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[25px] font-extrabold tracking-[-0.03em] text-ink lg:text-[27px]">VIOP Vadeli Analiz</h1>
              <span className="rounded-full bg-ai-panel px-2 py-0.5 text-[10px] font-bold text-ai">PREMIUM</span>
              {PREMIUM_PREVIEW && (
                <span className="rounded-full bg-up-badge px-2 py-0.5 text-[10px] font-bold text-up">Tanıtım · şu an ücretsiz</span>
              )}
            </div>
            <p className="mt-0.5 text-[13px] font-medium text-t3">Endeks · Banka · Emtia · Döviz — kaldıraç-farkındalıklı senaryo</p>
          </div>
          <ProxyBadge generatedAt={data?.generatedAt ?? null} stale={data?.stale ?? true} />
        </div>

        {/* ── Kalıcı risk ibaresi ── */}
        <div className="mb-4 rounded-xl border border-warn/30 bg-warn/8 px-4 py-3 text-[12px] leading-relaxed text-warn">
          <strong>Analiz — yatırım tavsiyesi değildir.</strong> Vadeli işlemler kaldıraçlıdır;
          yatırdığınız teminatın tamamını ve daha fazlasını kaybedebilirsiniz. Buradaki içerik
          genel senaryo değerlendirmesidir, kişiye özel alım-satım önerisi içermez.
        </div>

        {/* Makro rejim — mobil (kompakt, üstte); masaüstünde sağ rayda tam kart */}
        <div className="mb-4 lg:hidden">
          <MacroPanel macro={macro} />
        </div>

        {/* ── Varlık sekmeleri ── */}
        <div className="flex gap-1 overflow-x-auto border-b border-hairline">
          {VIOP_ASSET_CLASSES.map((c) => (
            <button
              key={c.key}
              onClick={() => setTab(c.key)}
              className={`shrink-0 border-b-2 px-4 py-3 text-[14px] font-bold transition-colors ${tab === c.key ? 'border-up text-ink' : 'border-transparent text-t3 hover:text-ink'}`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3.5 lg:flex-row lg:gap-6">
          {/* ── Sol: kontrat listesi ── */}
          <div className="min-w-0 lg:flex-[1.7]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {DIR_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setDir(f.key)}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors ${dir === f.key ? 'bg-ink text-onink' : 'bg-fill text-t3 hover:text-ink'}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <span className="shrink-0 text-[12px] font-semibold text-t3">{filtered.length} kontrat</span>
            </div>

            {error && <div className="py-16 text-center text-sm text-down">{error}</div>}

            <div className="mt-3 space-y-4">
              {loading ? (
                [...Array(3)].map((_, i) => <div key={i} className="ie-glass h-[220px] animate-pulse rounded-[20px]" />)
              ) : filtered.length === 0 ? (
                <div className="ie-glass rounded-[20px] px-4 py-10 text-center text-sm text-t3">
                  {items.length === 0
                    ? (data?.message ?? 'VIOP analizi henüz hazır değil. Cron ilk taramayı yaptığında görünecek.')
                    : 'Bu filtrede kontrat yok.'}
                </div>
              ) : (
                filtered.map((item) => <ViopCard key={item.code} item={item} />)
              )}
            </div>
          </div>

          {/* ── Sağ ray: makro rejim + öne çıkan işlemler (masaüstü) ── */}
          <div className="hidden flex-col gap-3.5 lg:flex lg:w-[320px] lg:shrink-0">
            <MacroPanel macro={macro} />
            <TopTrades topLong={topLong} topShort={topShort} onPick={(c, d) => { setTab(c); setDir(d); }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProxyBadge({ generatedAt, stale }: { generatedAt: string | null; stale: boolean }) {
  const when = generatedAt
    ? new Date(generatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : '—';
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-hairline bg-fill px-2.5 py-1.5 text-[11px] font-medium text-t3">
      <span className={`h-1.5 w-1.5 rounded-full ${stale ? 'bg-warn' : 'bg-up'}`} />
      Proxy / gecikmeli · {when}
    </div>
  );
}

// ── Makro rejim paneli — gerçek /api/macro verisi, sabit metin yok ──────────────
function MacroPanel({ macro }: { macro: MacroResp | null }) {
  const wind = macro?.score?.wind;
  const riskColor = wind?.includes('positive') ? '#16a35b' : wind?.includes('negative') ? '#e5484d' : '#c98a00';
  const usdtry = macro?.indicators?.usdtry;
  const tlColor = usdtry ? (usdtry.changePercent > 0.2 ? '#e5484d' : usdtry.changePercent < -0.2 ? '#16a35b' : '#c98a00') : '#9aa0ad';
  const tlLabel = usdtry ? (usdtry.changePercent > 0.2 ? 'Zayıflıyor' : usdtry.changePercent < -0.2 ? 'Güçleniyor' : 'Yatay') : '—';

  const cells: { label: string; value: string; color?: string }[] = [
    { label: 'Risk İştahı', value: macro?.score?.label ?? '—', color: riskColor },
    { label: 'TL Yönü', value: tlLabel, color: tlColor },
    { label: 'TCMB Faizi', value: macro?.turkey?.policyRate?.value != null ? `%${fmt0(macro.turkey.policyRate.value)}` : '—' },
    { label: 'Küresel (DXY)', value: macro?.indicators?.dxy ? fmt(macro.indicators.dxy.price) : '—' },
    { label: 'Ons Altın ($)', value: macro?.indicators?.gold ? fmt0(macro.indicators.gold.price) : '—' },
    { label: 'Brent ($)', value: macro?.indicators?.brent ? fmt(macro.indicators.brent.price) : '—' },
  ];

  return (
    <div className="ie-glass-ai rounded-[16px] px-[17px] py-[15px]">
      <div className="flex items-center gap-2"><span className="font-mono text-[11px] font-bold text-ai">✦</span><span className="text-[13px] font-bold text-ink">Makro rejim</span></div>
      <p className="mt-2 text-[12px] font-medium leading-[1.5] text-t2">{macroSummary(macro)}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {cells.map((c) => (
          <div key={c.label} className="rounded-[10px] bg-fill px-2.5 py-2 text-center">
            <div className="font-mono text-[14px] font-bold" style={c.color ? { color: c.color } : { color: 'var(--ink)' }}>{c.value}</div>
            <div className="mt-0.5 text-[10px] font-medium text-t3">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Öne çıkan işlemler — tüm varlıklarda en güçlü long + short ──────────────────
function TopTrades({
  topLong, topShort, onPick,
}: { topLong: ViopSignalResult | null; topShort: ViopSignalResult | null; onPick: (cls: ViopAssetClass, dir: DirFilter) => void }) {
  if (!topLong && !topShort) return null;
  return (
    <div className="ie-glass rounded-[16px] px-[17px] py-[15px]">
      <div className="mb-2.5 text-[14px] font-extrabold text-ink">Öne çıkan işlemler</div>
      <div className="flex flex-col gap-2">
        {topLong && <TopTradeRow item={topLong} onClick={() => onPick(topLong.cls, 'long')} />}
        {topShort && <TopTradeRow item={topShort} onClick={() => onPick(topShort.cls, 'short')} />}
      </div>
    </div>
  );
}

function TopTradeRow({ item, onClick }: { item: ViopSignalResult; onClick: () => void }) {
  const b = dirBadge(item.direction);
  return (
    <button onClick={onClick} className="rounded-[12px] border border-hairline px-3 py-2.5 text-left transition-colors hover:bg-fill">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-[7px] px-2 py-0.5 text-[10px] font-extrabold" style={{ background: b.bg, color: b.color }}>{b.text}</span>
        <span className="font-mono text-[13px] font-bold" style={{ color: scoreColor(item.score) }}>{item.score}</span>
      </div>
      <div className="mt-1.5 text-[12px] font-bold text-ink">{item.label}</div>
      <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-t3">
        <span>Giriş {fmt(item.risk.entryPrice)}</span>
        <span>·</span>
        <span>Hedef {fmt(item.risk.targetPrice)}</span>
        {item.risk.riskRewardRatio != null && <><span>·</span><span>R/R {item.risk.riskRewardRatio}</span></>}
      </div>
    </button>
  );
}

function ViopCard({ item }: { item: ViopSignalResult }) {
  const badge = dirBadge(item.direction);

  return (
    <article className="ie-glass overflow-hidden rounded-[20px]">
      {/* Üst: dayanak çipi + kontrat + yön + skor */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-[7px] bg-ai-panel px-2 py-0.5 font-mono text-[11px] font-bold text-ai">{item.underlying}</span>
            <span className="font-manrope text-[16px] font-bold text-ink">{item.label}</span>
            {item.settlement === 'fiziki' && (
              <span className="rounded-[6px] bg-warn/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.03em] text-warn" title="Vadede kapatılmazsa gerçek pay teslimi gerekir">
                Fiziki teslimat
              </span>
            )}
          </div>
          <div className="mt-1 font-mono text-[11px] text-t4">{item.code} · {dirSentence(item.direction)}</div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <span className="rounded-[9px] px-3 py-1.5 text-[12px] font-extrabold" style={{ background: badge.bg, color: badge.color }}>{badge.text}</span>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-t4">Skor</div>
            <div className="font-mono text-2xl font-bold" style={{ color: scoreColor(item.score) }}>{item.score}</div>
            <div className="text-[10px] text-t4">{item.confidence} güven</div>
          </div>
        </div>
      </div>

      {/* Kaldıraç / teminat / likidasyon — 8 hücre risk grid (koyu feature kart) */}
      <div className="m-5 rounded-xl bg-surface-dark p-4 text-white">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-white/60">
          Kaldıraç &amp; Risk
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Metric label="Giriş" value={fmt(item.risk.entryPrice)} />
          <Metric label="Stop" value={fmt(item.risk.stopPrice)} sub={`%${item.risk.stopDistancePct}`} accent="#ff8a8a" />
          <Metric label="Hedef" value={fmt(item.risk.targetPrice)} accent="#7ee0a8" />
          <Metric label="R/R" value={item.risk.riskRewardRatio != null ? String(item.risk.riskRewardRatio) : '—'} />
          <Metric label="Kaldıraç" value={`~${item.risk.leverage}x`} accent="#c9aaff" />
          <Metric label="Teminat/kontrat" value={`₺${fmt(item.risk.initialMarginPerContract)}`} sub={`Notional ₺${fmt(item.risk.notionalPerContract)}`} />
          <Metric label="Margin call" value={`~%${item.risk.marginCallMovePct}`} sub={`Teminat biter ~%${item.risk.liquidationMovePct}`} accent="#ffb27a" />
          <Metric label="Vadeye" value={`${item.expiry.daysToExpiry}g`} />
        </div>
        <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-white/70">
          <span className="shrink-0">⚠️</span>
          <span>{item.risk.warning}</span>
        </div>
        {item.settlementWarning && (
          <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-warn/15 px-3 py-2 text-[11px] leading-relaxed text-[#ffd08a]">
            <span className="shrink-0">📦</span>
            <span>{item.settlementWarning}</span>
          </div>
        )}
        {item.expiry.rollWarning && (
          <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-white/70">
            <span className="shrink-0">🗓️</span>
            <span>{item.expiry.rollWarning}</span>
          </div>
        )}
      </div>

      {/* Alt satır: baz + gerekçe + sinyaller */}
      <div className="border-t border-hairline px-5 py-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-t4">
          Baz {item.basis >= 0 ? '+' : ''}{fmt(item.basis)} · {item.regime}
        </div>
        <p className="text-[13px] leading-relaxed text-t2">{item.rationale}</p>
        {item.technical.topSignals.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.technical.topSignals.map((s) => (
              <span key={s} className="rounded-md bg-fill px-2 py-0.5 text-[11px] font-medium text-t3">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function Metric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-white/50">{label}</div>
      <div className="font-mono text-[15px] font-bold" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="font-mono text-[10px] text-white/50">{sub}</div>}
    </div>
  );
}

export default ViopScreen;
