'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { TrendingUp, TrendingDown, Trophy, RefreshCw, Filter, AlertTriangle } from 'lucide-react';
import type { GecmisFirsatlarResponse, GecmisFirsat } from '@/app/api/gecmis-firsatlar/route';

const DIRECTION_OPTS = [
  { value: 'all',    label: 'Tümü' },
  { value: 'yukari', label: '▲ AL' },
  { value: 'asagi',  label: '▼ SAT' },
];
const SORT_OPTS = [
  { value: 'return7d',    label: '7G Getiri' },
  { value: 'return30d',   label: '30G Getiri' },
  { value: 'confluence',  label: 'Güven Skoru' },
  { value: 'date',        label: 'Tarih' },
];
const DAYS_OPTS = [
  { value: '30',  label: 'Son 30 Gün' },
  { value: '60',  label: 'Son 60 Gün' },
  { value: '90',  label: 'Son 90 Gün' },
  { value: '180', label: 'Son 180 Gün' },
];

function fmtPct(v: number | null, net = true) {
  if (v == null) return '—';
  const n = net ? v - 0.4 : v; // komisyon düşüm gösterimi
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit' });
}

function ReturnCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-text-muted text-xs">Bekleniyor</span>;
  const net = value - 0.4;
  const cls = net > 5 ? 'text-emerald-400 font-bold' : net > 0 ? 'text-emerald-400' : net > -5 ? 'text-red-400' : 'text-red-500 font-bold';
  return <span className={`tabular-nums text-xs ${cls}`}>{fmtPct(value)}</span>;
}

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-surface'}`}>
      <p className="text-[11px] text-text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${highlight ? 'text-emerald-400' : 'text-text-primary'}`}>{value}</p>
      {sub && <p className="text-[10px] text-text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

export default function GecmisFirsatlarPage() {
  const [data, setData]         = useState<GecmisFirsatlarResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [days, setDays]         = useState('90');
  const [direction, setDir]     = useState('all');
  const [sort, setSort]         = useState('return7d');
  const [minConf, setMinConf]   = useState(60);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days, direction, sort, minConfluence: String(minConf), limit: '200' });
      const res = await window.fetch(`/api/gecmis-firsatlar?${params}`);
      const json = await res.json();
      setData(json);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [days, direction, sort, minConf]);

  useEffect(() => { void fetch(); }, [fetch]);

  const items = data?.items ?? [];
  const stats = data?.stats;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-6xl px-4 py-8">

        {/* Başlık */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="h-6 w-6 text-amber-400" />
              <h1 className="text-2xl font-bold text-text-primary">Geçmiş Fırsatlar</h1>
            </div>
            <p className="text-sm text-text-secondary">
              Son {days} günde çıkmış yüksek güvenli sinyaller ve gerçekleşen getirileri.
              YEOTK gibi "keşke almıştım" an'larını bir daha kaçırma.
            </p>
          </div>
          <button onClick={() => void fetch()} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/50 px-3 py-2 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 self-start shrink-0">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {/* İstatistik kartları */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="Toplam Sinyal" value={String(stats.total)} sub={`${stats.evaluated} değerlendi`} />
            <StatCard
              label="Başarı Oranı"
              value={stats.winRate != null ? `%${stats.winRate.toFixed(0)}` : '—'}
              sub={`${stats.winners}/${stats.evaluated} kazandı`}
              highlight={(stats.winRate ?? 0) > 55}
            />
            <StatCard
              label="Ort. 7G Getiri"
              value={stats.avgReturn7d != null ? fmtPct(stats.avgReturn7d) : '—'}
              sub="komisyon düşülmüş"
              highlight={(stats.avgReturn7d ?? 0) > 0}
            />
            <StatCard
              label="En İyi"
              value={stats.bestReturn7d != null ? fmtPct(stats.bestReturn7d) : '—'}
              sub={stats.bestSembol ?? ''}
              highlight
            />
          </div>
        )}

        {/* Filtreler */}
        <div className="flex flex-wrap gap-2 mb-5 p-3 rounded-xl border border-border bg-surface/30">
          <Filter className="h-4 w-4 text-text-muted self-center shrink-0" />

          {/* Süre */}
          <div className="flex gap-1">
            {DAYS_OPTS.map((o) => (
              <button key={o.value} onClick={() => setDays(o.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${days === o.value ? 'bg-primary text-white' : 'bg-surface text-text-secondary hover:text-text-primary border border-border'}`}>
                {o.label}
              </button>
            ))}
          </div>

          <span className="text-border self-center">|</span>

          {/* Yön */}
          <div className="flex gap-1">
            {DIRECTION_OPTS.map((o) => (
              <button key={o.value} onClick={() => setDir(o.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${direction === o.value ? 'bg-primary text-white' : 'bg-surface text-text-secondary hover:text-text-primary border border-border'}`}>
                {o.label}
              </button>
            ))}
          </div>

          <span className="text-border self-center">|</span>

          {/* Sıralama */}
          <select value={sort} onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-text-secondary">
            {SORT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {/* Min güven */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-text-muted">Min Güven:</span>
            <input type="range" min={0} max={100} step={5} value={minConf}
              onChange={(e) => setMinConf(Number(e.target.value))}
              className="w-20" />
            <span className="text-xs font-mono text-text-secondary w-6">{minConf}</span>
          </div>
        </div>

        {/* Tablo */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-12 rounded-xl border border-border bg-surface/30 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface/30 p-10 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-text-muted mb-3" />
            <p className="text-sm text-text-muted">Bu dönemde {minConf}+ güven skorlu sinyal kaydı yok.</p>
            <p className="text-xs text-text-muted/60 mt-1">Min güveni düşürmeyi veya süreyi artırmayı dene.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface/60">
                    {['Hisse', 'Sinyal', 'Yön', 'Tarih', 'Güven', '3G', '7G', '14G', '30G', 'Durum'].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-text-muted font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <ItemRow key={item.id} item={item} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="mt-4 text-center text-[10px] text-text-muted/50">
          Geçmiş performans gelecek sonuçları garanti etmez. Tüm getiriler teorik, komisyon (%0.4) düşülmüştür.
        </p>
      </main>
    </div>
  );
}

function ItemRow({ item }: { item: GecmisFirsat }) {
  const isUp = item.direction === 'yukari';
  const confColor = (item.confluence_score ?? 0) >= 80 ? 'text-emerald-400 font-bold'
    : (item.confluence_score ?? 0) >= 65 ? 'text-emerald-400'
    : (item.confluence_score ?? 0) >= 50 ? 'text-yellow-400'
    : 'text-text-muted';

  const rowBg = item.isWinner === true ? 'bg-emerald-500/3 hover:bg-emerald-500/8'
    : item.isWinner === false ? 'bg-red-500/3 hover:bg-red-500/8'
    : 'hover:bg-white/5';

  return (
    <tr className={`border-b border-border/40 transition-colors ${rowBg}`}>
      <td className="px-3 py-2.5">
        <Link href={`/hisse/${item.sembol}`}
          className="font-bold text-text-primary hover:text-primary transition-colors">
          {item.sembol}
        </Link>
        <p className="text-[10px] text-text-muted">{item.daysAgo}g önce</p>
      </td>
      <td className="px-3 py-2.5 text-text-secondary whitespace-nowrap max-w-[140px] truncate">
        {item.signal_type}
      </td>
      <td className="px-3 py-2.5">
        {isUp
          ? <span className="text-emerald-400 font-semibold">▲ AL</span>
          : <span className="text-red-400 font-semibold">▼ SAT</span>}
      </td>
      <td className="px-3 py-2.5 text-text-muted whitespace-nowrap">{fmtDate(item.entry_time)}</td>
      <td className={`px-3 py-2.5 tabular-nums ${confColor}`}>{item.confluence_score ?? '—'}</td>
      <td className="px-3 py-2.5"><ReturnCell value={item.return_3d} /></td>
      <td className="px-3 py-2.5"><ReturnCell value={item.return_7d} /></td>
      <td className="px-3 py-2.5"><ReturnCell value={item.return_14d} /></td>
      <td className="px-3 py-2.5"><ReturnCell value={item.return_30d} /></td>
      <td className="px-3 py-2.5">
        {!item.evaluated
          ? <span className="text-[10px] text-text-muted/60 italic">Bekleniyor</span>
          : item.isWinner
          ? <span className="flex items-center gap-1 text-emerald-400"><TrendingUp className="h-3 w-3" /> Kazandı</span>
          : <span className="flex items-center gap-1 text-red-400"><TrendingDown className="h-3 w-3" /> Kaybetti</span>}
      </td>
    </tr>
  );
}
