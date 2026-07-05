'use client';

/**
 * "Tarama" ekranı (design_handoff_kalan_ekranlar) — hi-fi, açık tema.
 * Basit filtre kurucu: Yön segmenti + RSI slider + AI skoru slider (mürdüm)
 * + yüksek hacim toggle → canlı eşleşme sayısı + AI skor barlı sonuç listesi.
 * Veri: mevcut /api/screener (scan_cache). Eski gelişmiş tarama git geçmişinde.
 * Masaüstü: sol 300px filtre paneli + sağda sonuç tablosu.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

interface ScreenerRow {
  sembol: string;
  changePercent: number | null;
  lastClose: number | null;
  confluenceScore: number | null;
  sectorName: string | null;
}

interface ScreenerResponse {
  ok: boolean;
  totalMatched: number;
  results: ScreenerRow[];
}

type Direction = '' | 'yukari' | 'asagi';

const fmt = (v: number | null, d = 2) =>
  v == null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${fmt(v)}%`);
const colOf = (v: number | null) => (v == null ? '#9aa0ad' : v >= 0 ? '#16a35b' : '#e5484d');

/** Tasarımdaki slider: ray + dolu kısım + 18px tutamaç (native input görünmez overlay). */
function Slider({
  value,
  min,
  max,
  color,
  fillFromRight,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  color: string;
  fillFromRight?: boolean;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="relative h-[18px]">
      <div className="absolute inset-x-0 top-1/2 h-[6px] -translate-y-1/2 rounded-[3px] bg-hairline" />
      <div
        className="absolute top-1/2 h-[6px] -translate-y-1/2 rounded-[3px]"
        style={fillFromRight ? { right: 0, width: `${100 - pct}%`, background: color } : { left: 0, width: `${pct}%`, background: color }}
      />
      <div
        className="pointer-events-none absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_2px_6px_rgba(0,0,0,0.18)]"
        style={{ left: `${pct}%`, background: color }}
      />
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 w-full cursor-pointer opacity-0"
      />
    </div>
  );
}

export function TaramaScreen() {
  const [direction, setDirection] = useState<Direction>('');
  const [rsiMax, setRsiMax] = useState(70);
  const [scoreMin, setScoreMin] = useState(40);
  const [highVolume, setHighVolume] = useState(true);

  const [rows, setRows] = useState<ScreenerRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllMobile, setShowAllMobile] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const ctrl = new AbortController();

    debounce.current = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ market: 'BIST', limit: '100' });
      if (direction) params.set('direction', direction);
      if (rsiMax < 90) params.set('rsiMax', String(rsiMax));
      if (scoreMin > 0) params.set('confluenceMin', String(scoreMin));
      if (highVolume) params.set('volumeMin', '10000000');

      fetch(`/api/screener?${params}`, { signal: ctrl.signal })
        .then((r) => r.json() as Promise<ScreenerResponse>)
        .then((d) => {
          setRows((d.results ?? []).sort((a, b) => (b.confluenceScore ?? 0) - (a.confluenceScore ?? 0)));
          setTotal(d.totalMatched ?? d.results?.length ?? 0);
          setLoading(false);
        })
        .catch(() => {});
    }, 400);

    return () => {
      ctrl.abort();
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [direction, rsiMax, scoreMin, highVolume]);

  function reset() {
    setDirection('');
    setRsiMax(70);
    setScoreMin(40);
    setHighVolume(true);
  }

  const filters = (
    <div className="flex flex-col gap-5">
      {/* Yön segmenti */}
      <div>
        <div className="mb-2.5 text-[13px] font-bold text-ink">Sinyal yönü</div>
        <div className="flex gap-2">
          {([['', 'Tümü'], ['yukari', 'Yükseliş'], ['asagi', 'Düşüş']] as [Direction, string][]).map(([v, label]) => (
            <button
              key={label}
              onClick={() => setDirection(v)}
              className={`flex-1 rounded-[11px] py-[9px] text-center text-[12px] transition-colors ${
                direction === v ? 'bg-ink font-bold text-onink' : 'bg-fill font-semibold text-t2 hover:bg-hairline'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* RSI */}
      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[13px] font-bold text-ink">RSI</span>
          <span className="font-mono text-[12px] font-semibold text-t2">{rsiMax >= 90 ? 'Tümü' : `≤ ${rsiMax}`}</span>
        </div>
        <Slider value={rsiMax} min={20} max={90} color="#16181d" onChange={setRsiMax} />
      </div>

      {/* AI skoru */}
      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[13px] font-bold text-ink">AI skoru</span>
          <span className="font-mono text-[12px] font-semibold text-ai">≥ {scoreMin}</span>
        </div>
        <Slider value={scoreMin} min={0} max={90} color="#6b6ff5" fillFromRight onChange={setScoreMin} />
      </div>

      {/* Hacim toggle */}
      <div className="flex items-center justify-between rounded-[14px] border border-hairline px-4 py-3">
        <div>
          <div className="text-[13px] font-bold text-ink">Yüksek hacim</div>
          <div className="text-[11px] font-medium text-t3">Günlük hacim ≥ 10M ₺</div>
        </div>
        <button
          onClick={() => setHighVolume((v) => !v)}
          className={`relative h-[27px] w-[46px] shrink-0 rounded-full transition-colors ${highVolume ? 'bg-up' : 'bg-[#d4d7dc]'}`}
          aria-pressed={highVolume}
        >
          <span className={`absolute top-[3px] h-[21px] w-[21px] rounded-full bg-white transition-all ${highVolume ? 'left-[22px]' : 'left-[3px]'}`} />
        </button>
      </div>
    </div>
  );

  const resultRow = (r: ScreenerRow) => (
    <Link key={r.sembol} href={`/hisse/${r.sembol}`} className="flex items-center gap-3 border-b border-[#f6f7f8] px-0 py-3 hover:bg-fill lg:px-3.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-fill font-mono text-[11px] font-semibold text-ink">
        {r.sembol.slice(0, 2)}
      </span>
      <span className="min-w-0 flex-[2]">
        <span className="block truncate text-[13px] font-bold text-ink">{r.sembol}</span>
        <span className="block truncate text-[11px] font-medium text-t3">{r.sectorName ?? '—'}</span>
      </span>
      <span className="hidden flex-1 text-right font-mono text-[13px] font-semibold text-ink sm:block">{fmt(r.lastClose)}</span>
      <span className="flex-1 text-right font-mono text-[13px] font-semibold" style={{ color: colOf(r.changePercent) }}>
        {fmtPct(r.changePercent)}
      </span>
      <span className="flex flex-[1.6] items-center gap-2.5 pl-4 lg:pl-5">
        <span className="h-[7px] flex-1 overflow-hidden rounded-[4px] bg-hairline">
          <span className="block h-full rounded-[4px] bg-ai" style={{ width: `${r.confluenceScore ?? 0}%` }} />
        </span>
        <span className="w-[26px] font-mono text-[13px] font-bold text-ink">{r.confluenceScore ?? '—'}</span>
      </span>
    </Link>
  );

  return (
    <div className="lg:flex lg:min-h-[calc(100vh-68px)]">
      {/* ── Masaüstü sol filtre paneli ── */}
      <div className="hidden w-[300px] shrink-0 flex-col border-r border-[#f0f1f3] px-6 py-[22px] lg:flex">
        {filters}
        <div className="flex-1" />
        <button
          onClick={reset}
          className="mt-5 h-12 rounded-[14px] border-[1.5px] border-[#e7e9ec] text-[13px] font-bold text-t2 transition-colors hover:bg-fill"
        >
          Filtreleri sıfırla
        </button>
      </div>

      {/* ── Sonuçlar (masaüstü) / tüm akış (mobil) ── */}
      <div className="min-w-0 flex-1 px-6 py-5 lg:px-[26px] lg:py-[22px]">
        <div className="mb-1 lg:hidden">
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-ink">Tarama</h1>
          <p className="text-[12px] font-medium text-t3">Kendi filtreni oluştur</p>
        </div>

        {/* Mobil filtreler */}
        <div className="mt-4 lg:hidden">{filters}</div>

        {/* Eşleşme sayısı */}
        <div className="mt-5 flex items-baseline gap-2 lg:mt-0 lg:mb-3.5">
          <span className="font-mono text-[18px] font-bold text-ink lg:text-[22px]">{loading ? '…' : total ?? 0}</span>
          <span className="text-[13px] font-semibold text-t3 lg:text-[14px]">hisse eşleşiyor</span>
          <div className="flex-1" />
          <button onClick={reset} className="text-[12px] font-semibold text-t3 hover:text-ink lg:hidden">
            Sıfırla
          </button>
        </div>

        {/* Masaüstü tablo başlığı */}
        <div className="hidden border-b border-[#f0f1f3] px-3.5 pb-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-t4 lg:flex">
          <span className="w-9" />
          <span className="ml-3 flex-[2]">Sembol</span>
          <span className="flex-1 text-right">Fiyat</span>
          <span className="flex-1 text-right">Değişim</span>
          <span className="flex-[1.6] pl-5">AI skoru</span>
        </div>

        {/* Liste: mobilde önizleme(5) + genişlet; masaüstünde tamamı */}
        <div className="mt-1">
          {loading && rows.length === 0 ? (
            <div className="py-8 text-center text-[13px] font-medium text-t3">Tarama yükleniyor…</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-[13px] font-medium text-t3">Bu filtrelerle eşleşen hisse yok — kriterleri gevşetmeyi dene.</div>
          ) : (
            <>
              <div className="lg:hidden">{(showAllMobile ? rows : rows.slice(0, 5)).map(resultRow)}</div>
              <div className="hidden lg:block">{rows.map(resultRow)}</div>
            </>
          )}
        </div>

        {/* Mobil: tümünü gör */}
        {!showAllMobile && rows.length > 5 && (
          <button
            onClick={() => setShowAllMobile(true)}
            className="mt-4 flex h-[50px] w-full items-center justify-center rounded-[15px] bg-ink text-[15px] font-bold text-onink lg:hidden"
          >
            {rows.length} sonucu gör
          </button>
        )}

        <p className="mt-5 text-[11px] font-medium text-t4">
          AI skoru = teknik confluence (0-100). Sonuçlar günde 3 kez taranan scan-cache&apos;ten gelir. Yatırım tavsiyesi değildir.
        </p>
      </div>
    </div>
  );
}
