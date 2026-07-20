'use client';

/**
 * VIOP ekranı (FAZ V2 — VIOP-TRADINGVIEW-PLAN.md), yeni tasarım / AppShell.
 *
 * Özet şerit (aktif kontrat, genel piyasa yönü, baz durumu) + kontrat kartları:
 * yön + skor + KALDIRAÇ/TEMİNAT/LİKİDASYON bloğu (bg-surface-dark feature kart) +
 * SignalChart (FAZ LC). Kalıcı "analiz — yatırım tavsiyesi değildir" + kaldıraç risk
 * ibaresi. Gecikmeli/proxy veri rozeti. Premium (403) → upsell.
 *
 * Veri: /api/viop (cron precompute, ai_cache tek satır — istek anında fan-out YOK).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SignalChart, type SignalMarker } from '@/components/new/SignalChart';
import { PREMIUM_PREVIEW } from '@/lib/tier-guard';
import type { ViopSignalResult } from '@/lib/viop-engine';

interface ViopResponse {
  items: ViopSignalResult[];
  generatedAt: string | null;
  stale: boolean;
  message?: string;
}

const fmt = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
const fmt0 = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 0 });

function dirLabel(d: ViopSignalResult['direction']) {
  if (d === 'long') return { text: 'Yukarı yönlü senaryo', color: '#16a35b' };
  if (d === 'short') return { text: 'Aşağı yönlü senaryo', color: '#e5484d' };
  return { text: 'Nötr / belirsiz', color: '#9aa0ad' };
}

export function ViopScreen() {
  const [data, setData] = useState<ViopResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    return () => { cancelled = true; };
  }, []);

  // ── Premium upsell ──
  if (forbidden) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <div className="rounded-3xl border border-hairline bg-surface-dark p-10 text-white">
          <div className="mb-3 text-3xl">🔒</div>
          <h1 className="mb-2 font-manrope text-xl font-bold">VIOP Analizi — Premium</h1>
          <p className="mb-6 text-sm text-white/70">
            Vadeli işlem analizleri (XU030 endeks vadeli ve dahası) premium üyeliğe özeldir.
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
    <div className="mx-auto max-w-4xl px-5 py-6 lg:px-8">
      {/* ── Başlık ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-manrope text-2xl font-bold text-ink">VIOP Vadeli Analiz</h1>
            <span className="rounded-full bg-ai-panel px-2 py-0.5 text-[10px] font-bold text-ai">PREMIUM</span>
            {PREMIUM_PREVIEW && (
              <span className="rounded-full bg-up-badge px-2 py-0.5 text-[10px] font-bold text-up">Tanıtım · şu an ücretsiz</span>
            )}
          </div>
          <p className="text-sm text-t3">Endeks vadeli kontratları — kaldıraç-farkındalıklı senaryo</p>
        </div>
        <ProxyBadge generatedAt={data?.generatedAt ?? null} stale={data?.stale ?? true} />
      </div>

      {/* ── Kalıcı risk ibaresi ── */}
      <div className="mb-5 rounded-xl border border-warn/30 bg-warn/8 px-4 py-3 text-[12px] leading-relaxed text-warn">
        <strong>Analiz — yatırım tavsiyesi değildir.</strong> Vadeli işlemler kaldıraçlıdır;
        yatırdığınız teminatın tamamını ve daha fazlasını kaybedebilirsiniz. Buradaki içerik
        genel senaryo değerlendirmesidir, kişiye özel alım-satım önerisi içermez.
      </div>

      {loading && <div className="py-16 text-center text-sm text-t3">Yükleniyor…</div>}
      {error && <div className="py-16 text-center text-sm text-down">{error}</div>}

      {!loading && data && data.items.length === 0 && (
        <div className="rounded-xl border border-hairline bg-fill px-4 py-10 text-center text-sm text-t3">
          {data.message ?? 'VIOP analizi henüz hazır değil. Cron ilk taramayı yaptığında görünecek.'}
        </div>
      )}

      {/* ── Kontrat kartları ── */}
      <div className="space-y-6">
        {data?.items.map((item) => (
          <ViopCard key={item.code} item={item} />
        ))}
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

function ViopCard({ item }: { item: ViopSignalResult }) {
  const dl = dirLabel(item.direction);
  const markers: SignalMarker[] =
    item.direction === 'notr' ? [] : [{ direction: item.direction === 'long' ? 'al' : 'sat', label: dl.text }];

  return (
    <article className="overflow-hidden rounded-2xl border border-hairline bg-panel">
      {/* Üst: kontrat + yön + skor */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4">
        <div>
          <div className="font-manrope text-lg font-bold text-ink">{item.label}</div>
          <div className="font-mono text-[11px] text-t4">{item.code} · dayanak {item.underlying}</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-t4">Yön</div>
            <div className="text-sm font-bold" style={{ color: dl.color }}>{dl.text}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-t4">Skor</div>
            <div className="font-mono text-2xl font-bold text-ink">{item.score}</div>
            <div className="text-[10px] text-t4">{item.confidence} güven</div>
          </div>
        </div>
      </div>

      {/* Kaldıraç / teminat / likidasyon — feature kart (koyu) */}
      <div className="m-5 rounded-xl bg-surface-dark p-4 text-white">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-white/60">
          Kaldıraç &amp; Risk
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Metric label="Giriş" value={fmt(item.risk.entryPrice)} />
          <Metric label="Kaldıraç" value={`~${item.risk.leverage}x`} />
          <Metric label="Stop" value={fmt(item.risk.stopPrice)} sub={`%${item.risk.stopDistancePct}`} accent="#ff8a8a" />
          <Metric label="Hedef" value={fmt(item.risk.targetPrice)} sub={item.risk.riskRewardRatio ? `R/R ${item.risk.riskRewardRatio}` : undefined} accent="#7ee0a8" />
          <Metric label="Teminat/kontrat" value={`₺${fmt0(item.risk.initialMarginPerContract)}`} />
          <Metric label="Notional/kontrat" value={`₺${fmt0(item.risk.notionalPerContract)}`} />
          <Metric label="Likidasyon eşiği" value={`~%${item.risk.liquidationMovePct}`} accent="#ffb27a" />
          <Metric label="Vadeye" value={`${item.expiry.daysToExpiry}g`} />
        </div>
        <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-white/70">
          <span className="shrink-0">⚠️</span>
          <span>{item.risk.warning}</span>
        </div>
        {item.expiry.rollWarning && (
          <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-white/70">
            <span className="shrink-0">🗓️</span>
            <span>{item.expiry.rollWarning}</span>
          </div>
        )}
      </div>

      {/* Grafik (SignalChart — dayanak spot proxy) */}
      <div className="px-5 pb-3">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-t4">
          {item.underlying} spot (proxy) · baz {item.basis >= 0 ? '+' : ''}{fmt(item.basis)} · {item.regime}
        </div>
        <SignalChart
          symbol={item.underlying}
          height={280}
          markers={markers}
          stopPrice={item.risk.stopPrice}
          targetPrice={item.risk.targetPrice}
        />
      </div>

      {/* Gerekçe + sinyaller */}
      <div className="border-t border-hairline px-5 py-4">
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
