'use client';

/**
 * Hızlı sembol arama (design_handoff_kalan_ekranlar/Investable Edge Bugun.dc.html).
 * Beyaz kart input (solda yeşil › + uppercase yazım) → her tuş vuruşunda prefix
 * eşleşmesi (/api/symbol-search, debounce), en fazla 8 sonuç + N/8 sayacı.
 * Dropdown: eşleşen prefix yeşil altı çizili, fiyat + günlük değişim; satır → hisse detay.
 * Detaylı Tarama'nın yerine geçmez — gündelik hızlı erişim.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Result {
  sym: string;
  price: number | null;
  changePercent: number | null;
  sectorName: string | null;
}

const fmt = (v: number | null, d = 2) =>
  v == null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function SymbolSearch({ className = '', glass = false }: { className?: string; glass?: boolean }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const term = q.trim();
    if (!term) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    debounce.current = setTimeout(() => {
      fetch(`/api/symbol-search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d: { results?: Result[] }) => setResults(d.results ?? []))
        .catch(() => {});
    }, 200);
    return () => {
      ctrl.abort();
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q]);

  const prefix = q.trim().toLocaleUpperCase('tr-TR').replace(/İ/g, 'I').replace(/[^A-Z0-9]/g, '');
  const show = open && prefix.length > 0 && results.length > 0;

  function go(sym: string) {
    setQ('');
    setOpen(false);
    router.push(`/hisse/${sym}`);
  }

  return (
    <div className={`relative ${className}`}>
      <div
        className={`flex h-[46px] items-center gap-2.5 rounded-[14px] px-[15px] lg:h-[44px] ${
          glass ? 'ie-glass-flat' : 'border border-hairline bg-panel shadow-[0_1px_2px_rgba(15,20,30,0.03)]'
        }`}
      >
        <span className="font-mono text-[13px] font-semibold text-up">›</span>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results.length > 0) go(results[0]!.sym);
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Sembol yaz — THY, GAR…"
          aria-label="Hisse sembolü ara"
          className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold uppercase tracking-[0.04em] text-ink outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-t3"
        />
        {show && <span className="font-mono text-[11px] font-semibold text-t3">{results.length}/8</span>}
      </div>

      {show && (
        <div className="absolute left-0 right-0 top-[52px] z-40 overflow-hidden rounded-[16px] border border-hairline bg-panel shadow-[0_18px_44px_-10px_rgba(15,20,30,0.18)] lg:right-auto lg:w-[380px]">
          {results.map((r) => (
            <button
              key={r.sym}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(r.sym)}
              className="flex w-full items-center gap-3 border-b border-[#f6f7f8] px-4 py-[11px] text-left last:border-0 hover:bg-fill"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-fill font-mono text-[10px] font-semibold text-ink">
                {r.sym.slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[13px] font-semibold text-ink">
                  <span className="border-b-2 border-up/35 text-up">{r.sym.slice(0, prefix.length)}</span>
                  {r.sym.slice(prefix.length)}
                </span>
                <span className="block truncate text-[11px] font-medium text-t3">{r.sectorName ?? 'BIST'}</span>
              </span>
              <span className="font-mono text-[12px] font-semibold text-ink">{fmt(r.price)}</span>
              <span
                className="w-[52px] text-right font-mono text-[12px] font-semibold"
                style={{ color: r.changePercent == null ? '#9aa0ad' : r.changePercent >= 0 ? '#16a35b' : '#e5484d' }}
              >
                {r.changePercent == null ? '—' : `${r.changePercent >= 0 ? '+' : ''}${fmt(r.changePercent)}%`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
