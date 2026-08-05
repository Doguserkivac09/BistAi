'use client';

/**
 * Fırsat Sicili şeridi — "gösterdiklerimiz gerçekte ne getirdi?"
 *
 * Bir tarayıcıyı güvenilir kılan tek şey yayınladığı sonuçların ölçülmesidir.
 * Bu şerit o ölçümü ürünün merkezine koyar: ortalama net getiri, BIST'i geçme
 * oranı, isabet — hepsi İLERİYE DÖNÜK kaydedilmiş (`firsat_picks`) pick'lerden.
 *
 * DÜRÜSTLÜK: örneklem yetersizken rakam GÖSTERİLMEZ; "kayıt birikiyor" denir.
 * Geriye dönük kurgu yapılamaz — yayın kapısı/skor bağlamı saklanmıyordu, bu
 * yüzden sicil ancak kayıt başladığı andan itibaren doğrudur ve öyle yazılır.
 */

import { useEffect, useState } from 'react';

interface HorizonStats {
  horizon: string;
  label: string;
  n: number;
  winRate: number | null;
  avgNet: number | null;
  beatRate: number | null;
  avgBist: number | null;
  avgExcess: number | null;
}

interface SicilResp {
  available: boolean;
  collecting: boolean;
  minSample?: number;
  firstWeek?: string | null;
  totalPicks?: number;
  pendingPicks?: number;
  horizons?: HorizonStats[];
  message?: string;
}

const fmtPct = (v: number | null | undefined) =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

const trTarih = (iso?: string | null) =>
  !iso ? null : new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

export function SicilSeridi({ className = '' }: { className?: string }) {
  const [data, setData] = useState<SicilResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/firsat-sicil')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SicilResp | null) => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className={`ie-glass h-[86px] animate-pulse rounded-[16px] ${className}`} />;
  if (!data) return null;

  // Ölçülebilir en uzun ufuk (1 ay > 2 hafta > 1 hafta) — en anlamlı iddia
  const olculen = (data.horizons ?? [])
    .filter((h) => h.winRate !== null)
    .sort((a, b) => b.n - a.n);
  const one = [...olculen].reverse().find((h) => h.horizon === '4w') ?? olculen[0] ?? null;

  // Kayıt yeni → dürüst "birikiyor" hâli
  if (!data.available || data.collecting || !one) {
    return (
      <div className={`ie-glass rounded-[16px] px-[18px] py-[14px] ${className}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-extrabold text-ink">Sicil</span>
          <span className="rounded-[7px] border border-hairline bg-fill px-1.5 py-px text-[9.5px] font-bold text-t3">
            kayıt birikiyor
          </span>
        </div>
        <p className="mt-1 text-[11.5px] font-medium leading-[1.5] text-t2">
          Her hafta yayınladığımız listeyi fiyatıyla kaydedip 1/2/4 hafta sonra gerçekleşen
          getirisini ve BIST karşılaştırmasını ölçüyoruz.{' '}
          {data.totalPicks
            ? `Şu ana kadar ${data.totalPicks} kurulum kayıtlı${data.pendingPicks ? `, ${data.pendingPicks} tanesi ufkunu bekliyor` : ''}.`
            : 'Kayıt henüz başlamadı.'}{' '}
          <strong className="font-semibold">
            Yeterli örneklem oluşmadan oran yayınlamıyoruz
          </strong>{' '}
          — geçmişe dönük kurgu yapılamaz, sicil kayıt başladığı andan itibaren gerçektir.
        </p>
      </div>
    );
  }

  const excessPos = (one.avgExcess ?? 0) >= 0;

  return (
    <div className={`ie-glass rounded-[16px] px-[18px] py-[14px] ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-extrabold text-ink">Sicil · onaylı kurulumlar</span>
          <span className="rounded-[7px] border border-hairline bg-fill px-1.5 py-px text-[9.5px] font-bold text-t3">
            {one.label} · {one.n} kurulum
          </span>
        </div>
        {data.firstWeek && (
          <span className="text-[10.5px] font-medium text-t3">{trTarih(data.firstWeek)}’den beri</span>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div>
          <div className="text-[10.5px] font-medium text-t3">Ortalama getiri</div>
          <div
            className="font-mono text-[17px] font-bold"
            style={{ color: (one.avgNet ?? 0) >= 0 ? '#16a35b' : '#e5484d' }}
          >
            {fmtPct(one.avgNet)}
          </div>
        </div>
        <div>
          <div className="text-[10.5px] font-medium text-t3">Aynı dönemde BIST</div>
          <div className="font-mono text-[17px] font-bold text-t2">{fmtPct(one.avgBist)}</div>
        </div>
        <div>
          <div className="text-[10.5px] font-medium text-t3">BIST’i geçen</div>
          <div className="font-mono text-[17px] font-bold text-ink">
            {one.beatRate == null ? '—' : `%${one.beatRate.toFixed(0)}`}
          </div>
        </div>
        <div>
          <div className="text-[10.5px] font-medium text-t3">İsabet</div>
          <div className="font-mono text-[17px] font-bold text-ink">
            {one.winRate == null ? '—' : `%${one.winRate.toFixed(0)}`}
          </div>
        </div>
      </div>

      <p className="mt-2 text-[10.5px] font-medium leading-[1.5] text-t3">
        Komisyon düşülmüş, yön düzeltmeli (kısa kurulumda düşüş kazançtır) net getiri.
        {one.avgExcess != null && (
          <>
            {' '}Ortalama <strong className={`font-semibold ${excessPos ? 'text-up' : 'text-down'}`}>
              {fmtPct(one.avgExcess)}
            </strong> göreli getiri.
          </>
        )}
        {' '}Geçmiş performans gelecek getiriyi garanti etmez.
      </p>
    </div>
  );
}

export default SicilSeridi;
