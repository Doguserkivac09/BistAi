'use client';

/**
 * Gelişmiş AI Analiz — premium özellik (hisse detay "Gelişmiş" görünümünün başı).
 *
 * /api/hisse-ai-analiz (premium) mevcut tüm analizi Claude ile kapsamlı rapora sentezler:
 * genel görünüm · güncel teknik durum · değerleme & risk · sonuç & yatırımcı rehberi.
 * AKD/kurum/fon/virman modülleri broker-seviyesi ücretli veri gerektirdiği için "yakında"
 * yer tutucu (uydurma veri YOK). Premium değilse upsell gösterir.
 *
 * PERFORMANS/MALİYET: Bileşen Basit moda geçince unmount olur; Gelişmiş'e her dönüşte
 * yeniden fetch (auth+profil+cache = 3 Supabase round-trip + spinner) yapmamak için rapor
 * modül-seviyesi OTURUM CACHE'inde tutulur. Cache, sunucunun döndürdüğü `expiresAt`e kadar
 * geçerli (piyasa açıkken 3sa / açılış öncesi 1sa / kapalı 12sa) → toggle anında, sıfır istek.
 * Eşzamanlı istekler in-flight map ile tekilleştirilir.
 *
 * Yeni tasarım token'ları (bg-panel/ink/ai-panel…), açık/karanlık tema.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface AdvancedReport {
  headline: string;
  genelGorunum: string;
  guncelTeknik: string;
  degerlemeRisk: string;
  sonuc: string;
  rehber: string[];
  generatedAt: string;
}

// ── Oturum cache (modül seviyesi — unmount/remount'ta hayatta kalır) ──────────
interface CacheEntry { report: AdvancedReport | null; forbidden: boolean; expiresAt: number; }
const reportCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();

const cacheKeyOf = (sembol: string, market: string) => `${market}:${sembol}`;
const freshEntry = (key: string): CacheEntry | null => {
  const hit = reportCache.get(key);
  return hit && Date.now() < hit.expiresAt ? hit : null;
};

/** Raporu getir — taze cache varsa istek atmaz; eşzamanlı çağrıları tekilleştirir. */
function loadReport(sembol: string, market: string): Promise<CacheEntry> {
  const key = cacheKeyOf(sembol, market);
  const hit = freshEntry(key);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;

  const p = (async (): Promise<CacheEntry> => {
    const r = await fetch(`/api/hisse-ai-analiz?symbol=${encodeURIComponent(sembol)}${market === 'US' ? '&market=US' : ''}`);
    if (r.status === 403) {
      // Premium değil — tekrar tekrar 403 almamak için oturumda 1sa hatırla
      const e: CacheEntry = { report: null, forbidden: true, expiresAt: Date.now() + 60 * 60 * 1000 };
      reportCache.set(key, e);
      return e;
    }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error((j as { error?: string })?.error ?? 'Rapor alınamadı');
    }
    const d = (await r.json()) as { report: AdvancedReport; expiresAt?: string };
    const e: CacheEntry = {
      report: d.report,
      forbidden: false,
      // Sunucu TTL'ini birebir izle; yoksa güvenli varsayılan 3sa
      expiresAt: d.expiresAt ? new Date(d.expiresAt).getTime() : Date.now() + 3 * 60 * 60 * 1000,
    };
    reportCache.set(key, e);
    return e;
  })().finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

// Broker-seviyesi ücretli veri gerektiren modüller — şimdilik "yakında"
const YAKINDA_MODULLER: { icon: string; title: string; desc: string }[] = [
  { icon: '🏦', title: 'AKD Maliyet Analizi', desc: 'Aracı kurum ortalama maliyet dağılımı' },
  { icon: '📊', title: 'AKD Hacim Analizi', desc: 'Kurum bazlı alım/satım hacmi' },
  { icon: '🥇', title: 'En Aktif Kurumlar', desc: 'Net alan/satan aracı kurumlar' },
  { icon: '👥', title: 'Kurumsal / Bireysel Dağılım', desc: 'Sahiplik yapısı kırılımı' },
  { icon: '💼', title: 'Yatırım Fonu Hareketleri', desc: 'Fonların pozisyon değişimi' },
  { icon: '🔁', title: 'Virman Analizi', desc: 'Kurumlar arası takas transferleri' },
];

interface Props {
  sembol: string;
  market?: 'BIST' | 'US';
}

export function GelismisAiAnaliz({ sembol, market = 'BIST' }: Props) {
  // Lazy init: taze oturum cache'i varsa İLK render'da rapor hazır → spinner hiç görünmez
  const initial = freshEntry(cacheKeyOf(sembol, market));
  const [report, setReport] = useState<AdvancedReport | null>(initial?.report ?? null);
  const [forbidden, setForbidden] = useState(initial?.forbidden ?? false);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hit = freshEntry(cacheKeyOf(sembol, market));
    if (hit) {
      // Toggle (Basit ↔ Gelişmiş) — istek YOK, bekleme YOK
      setReport(hit.report); setForbidden(hit.forbidden); setError(null); setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true); setError(null); setForbidden(false); setReport(null);
    loadReport(sembol, market)
      .then((e) => { if (cancelled) return; setReport(e.report); setForbidden(e.forbidden); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Hata'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sembol, market]);

  const Header = (
    <div className="mb-3 flex items-center gap-2">
      <span className="font-mono text-[12px] font-bold text-ai">✦ AI</span>
      <h3 className="font-manrope text-[16px] font-extrabold tracking-[-0.01em] text-ink">Gelişmiş AI Analiz</h3>
      <span className="rounded-full bg-ai-panel px-2 py-0.5 text-[10px] font-bold text-ai">PREMIUM</span>
    </div>
  );

  // Premium değil → upsell
  if (forbidden) {
    return (
      <section className="rounded-2xl border border-ai-panel-border bg-ai-panel p-6">
        {Header}
        <p className="mb-4 max-w-xl text-[13px] leading-relaxed text-t2">
          Tüm teknik + temel + makro analizi tek kapsamlı rapora sentezleyen, hissenin genel
          görünümünü ve yatırımcı rehberini çıkaran <strong>en premium özelliğimiz</strong>.
          AKD maliyet/hacim, kurumsal dağılım, fon hareketleri ve virman analizi de yolda.
        </p>
        <Link href="/profil" className="inline-flex items-center rounded-xl bg-ink px-5 py-2.5 text-[14px] font-bold text-onink">
          Premium&apos;a yükselt
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-hairline bg-panel p-5 lg:p-6">
      {Header}

      {loading && (
        <div className="flex items-center gap-3 py-8 text-[13px] text-t3">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-ai border-t-transparent" />
          Yapay zeka {sembol} için kapsamlı raporu hazırlıyor…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-down/25 bg-down/8 px-4 py-3 text-[13px] text-down">{error}</div>
      )}

      {report && !loading && (
        <div className="space-y-4">
          {report.headline && (
            <p className="rounded-xl bg-ai-panel px-4 py-3 text-[14px] font-semibold leading-snug text-ink">
              {report.headline}
            </p>
          )}
          <ReportBlock title="Genel Görünüm" body={report.genelGorunum} />
          <ReportBlock title="Güncel Teknik Durum" body={report.guncelTeknik} />
          <ReportBlock title="Değerleme ve Risk" body={report.degerlemeRisk} />
          <ReportBlock title="Sonuç" body={report.sonuc} />
          {report.rehber.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-t4">Yatırımcı Rehberi</div>
              <ul className="space-y-1.5">
                {report.rehber.map((r, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-t2">
                    <span className="mt-0.5 shrink-0 text-ai">→</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-t4">
            Bu içerik bir yapay zeka sentezidir, yatırım tavsiyesi değildir. Kararlarınızdan yalnızca siz sorumlusunuz.
          </p>
        </div>
      )}

      {/* Yakında — broker-seviyesi kurumsal veri modülleri */}
      <div className="mt-6 border-t border-hairline pt-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[13px] font-bold text-ink">Kurumsal Veri Modülleri</span>
          <span className="rounded-full bg-fill px-2 py-0.5 text-[10px] font-bold text-t3">YAKINDA</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
          {YAKINDA_MODULLER.map((m) => (
            <div key={m.title} className="relative overflow-hidden rounded-xl border border-hairline bg-fill/60 p-3">
              <div className="flex items-center gap-2">
                <span className="text-[16px] opacity-60">{m.icon}</span>
                <span className="text-[12px] font-bold text-t2">{m.title}</span>
              </div>
              <p className="mt-1 text-[10.5px] leading-snug text-t4">{m.desc}</p>
              <span className="absolute right-2 top-2 rounded-full bg-panel px-1.5 py-0.5 text-[8px] font-bold text-t4">🔒 yakında</span>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-t4">
          AKD (aracı kurum dağılımı), fon ve virman analizleri broker-seviyesi kurumsal veri
          entegrasyonu tamamlanınca bu rapora eklenecek.
        </p>
      </div>
    </section>
  );
}

function ReportBlock({ title, body }: { title: string; body: string }) {
  if (!body) return null;
  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-t4">{title}</div>
      <p className="text-[13px] leading-relaxed text-t2">{body}</p>
    </div>
  );
}

export default GelismisAiAnaliz;
