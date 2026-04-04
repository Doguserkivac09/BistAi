'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Calendar, Clock, TrendingUp, TrendingDown, Minus, Sparkles, Bot, RefreshCw, Lock } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  EKONOMI_EVENTS,
  getUpcomingEvents,
  getNextHighEvent,
  groupByDate,
  type Ulke,
  type Onem,
} from '@/lib/ekonomi-takvimi';

const ULKE_FLAG: Record<Ulke, string> = { TR: '🇹🇷', US: '🇺🇸', EU: '🇪🇺' };
const ULKE_LABEL: Record<Ulke, string> = { TR: 'Türkiye', US: 'ABD', EU: 'Avrupa' };

const ONEM_COLOR: Record<Onem, string> = {
  yuksek: 'text-red-400',
  orta:   'text-orange-400',
  dusuk:  'text-zinc-400',
};

const ONEM_BG: Record<Onem, string> = {
  yuksek: 'bg-red-500/10 border-red-500/20',
  orta:   'bg-orange-500/10 border-orange-500/20',
  dusuk:  'bg-zinc-500/10 border-zinc-500/20',
};

const ONEM_LABEL: Record<Onem, string> = { yuksek: 'Yüksek', orta: 'Orta', dusuk: 'Düşük' };
const ONEM_DOTS: Record<Onem, number> = { yuksek: 3, orta: 2, dusuk: 1 };

function OnemDots({ onem }: { onem: Onem }) {
  const filled = ONEM_DOTS[onem];
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn('h-1.5 w-1.5 rounded-full', i <= filled ? ONEM_COLOR[onem].replace('text-', 'bg-') : 'bg-white/10')}
        />
      ))}
    </span>
  );
}

function useCountdown(targetDate: string, targetTime: string) {
  const [diff, setDiff] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    const target = new Date(`${targetDate}T${targetTime}:00+03:00`).getTime();
    const tick = () => {
      const delta = target - Date.now();
      if (delta <= 0) { setDiff({ days: 0, hours: 0, minutes: 0, seconds: 0 }); return; }
      setDiff({
        days:    Math.floor(delta / 86_400_000),
        hours:   Math.floor((delta % 86_400_000) / 3_600_000),
        minutes: Math.floor((delta % 3_600_000) / 60_000),
        seconds: Math.floor((delta % 60_000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate, targetTime]);

  return diff;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }).format(
    new Date(iso + 'T12:00:00')
  );
}

function isToday(iso: string) { return iso === new Date().toISOString().slice(0, 10); }
function isPast(iso: string)  { return iso < new Date().toISOString().slice(0, 10); }

function ValueChange({ onceki, gerceklesen, beklenti }: { onceki?: string; gerceklesen?: string; beklenti?: string }) {
  if (!onceki && !beklenti) return null;
  const parseNum = (s?: string) => {
    if (!s) return null;
    return parseFloat(s.replace('%', '').replace('K', '').replace('B', '').replace('$', '').replace(',', '.'));
  };
  let Icon = Minus;
  let color = 'text-zinc-400';
  if (gerceklesen && onceki) {
    const g = parseNum(gerceklesen), o = parseNum(onceki);
    if (g !== null && o !== null) {
      if (g > o) { Icon = TrendingUp; color = 'text-emerald-400'; }
      else if (g < o) { Icon = TrendingDown; color = 'text-red-400'; }
    }
  }
  return (
    <div className="flex items-center gap-3 text-[11px] mt-1.5 flex-wrap">
      {onceki && <span className="text-text-secondary/60">Önceki: <span className="text-text-secondary">{onceki}</span></span>}
      {beklenti && !gerceklesen && <span className="text-text-secondary/60">Beklenti: <span className="text-primary/80">{beklenti}</span></span>}
      {gerceklesen && (
        <span className={cn('flex items-center gap-0.5 font-semibold', color)}>
          <Icon className="h-3 w-3" /> {gerceklesen}
        </span>
      )}
    </div>
  );
}

function NextEventCard() {
  const next = useMemo(() => getNextHighEvent(EKONOMI_EVENTS), []);
  const countdown = useCountdown(next?.tarih ?? '', next?.saat ?? '');
  if (!next || !countdown) return null;
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 mb-6">
      <p className="text-[11px] font-semibold text-primary/60 uppercase tracking-wider mb-2">
        Bir Sonraki Önemli Olay
      </p>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <span>{ULKE_FLAG[next.ulke]}</span>
            {next.baslik}
          </p>
          <p className="text-xs text-text-secondary/60 mt-0.5 flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(next.tarih)} — {next.saat} TRT
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['days', 'hours', 'minutes', 'seconds'] as const).map((unit, i) => (
            <div key={unit} className="flex items-center gap-2">
              {i > 0 && <span className="text-text-secondary/30 text-sm">:</span>}
              <div className="text-center min-w-[36px]">
                <p className="text-lg font-bold text-primary tabular-nums leading-none">
                  {String(countdown[unit]).padStart(2, '0')}
                </p>
                <p className="text-[9px] text-text-secondary/50 uppercase tracking-wide mt-0.5">
                  {unit === 'days' ? 'gün' : unit === 'hours' ? 'saat' : unit === 'minutes' ? 'dk' : 'sn'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type FilterUlke = 'all' | Ulke;
type FilterOnem = 'all' | Onem;

export function TabTakvim() {
  const [ulkeFilter, setUlkeFilter] = useState<FilterUlke>('all');
  const [onemFilter, setOnemFilter] = useState<FilterOnem>('all');
  const [showPast,   setShowPast]   = useState(false);
  const [aiYorum,    setAiYorum]    = useState('');
  const [aiLoading,  setAiLoading]  = useState(false);
  const [aiError,    setAiError]    = useState<string | null>(null);
  const [aiUpgrade,  setAiUpgrade]  = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);

  const filtered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return EKONOMI_EVENTS.filter((e) => {
      if (!showPast && e.tarih < today) return false;
      if (ulkeFilter !== 'all' && e.ulke !== ulkeFilter) return false;
      if (onemFilter !== 'all' && e.onem !== onemFilter) return false;
      return true;
    }).sort((a, b) => a.tarih.localeCompare(b.tarih) || a.saat.localeCompare(b.saat));
  }, [ulkeFilter, onemFilter, showPast]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);
  const dates   = Object.keys(grouped).sort();

  return (
    <div>
      {/* Countdown */}
      <NextEventCard />

      {/* AI Makro Yorum */}
      <div className="mb-5">
        {!aiYorum && (
          <button
            onClick={async () => {
              if (aiLoading) return;
              setAiError(null);
              setAiLoading(true);
              setAiYorum('');
              aiAbortRef.current = new AbortController();
              try {
                const res = await fetch('/api/ekonomi-takvimi', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ events: filtered.slice(0, 15) }),
                  signal: aiAbortRef.current.signal,
                });
                if (!res.ok) {
                  const d = await res.json().catch(() => ({}));
                  if (d.upgrade) { setAiUpgrade(true); return; }
                  setAiError(d.error ?? 'Bir hata oluştu.');
                  return;
                }
                const reader = res.body?.getReader();
                if (!reader) return;
                const dec = new TextDecoder();
                let acc = '';
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  for (const line of dec.decode(value, { stream: true }).split('\n')) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                      const p = JSON.parse(line.slice(6));
                      if (p.text) { acc += p.text; setAiYorum(acc); }
                      if (p.error) setAiError(p.error);
                    } catch { /* ignore */ }
                  }
                }
              } catch (e) {
                if ((e as Error).name !== 'AbortError') setAiError('Bağlantı hatası.');
              } finally {
                setAiLoading(false);
              }
            }}
            disabled={aiLoading}
            className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2.5 text-sm font-medium text-violet-400 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
          >
            {aiLoading
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> AI analiz ediliyor…</>
              : <><Sparkles className="h-3.5 w-3.5" /> Bu Haftaki Verileri AI ile Yorumla</>
            }
          </button>
        )}

        {aiError && <p className="mt-2 text-xs text-red-400">{aiError}</p>}

        {aiUpgrade && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3">
            <Lock className="h-4 w-4 text-violet-400 shrink-0" />
            <p className="text-sm text-violet-300">AI Takvim Yorumu Pro ve Premium planlarda kullanılabilir.</p>
            <Link href="/fiyatlandirma" className="ml-auto shrink-0 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 transition-colors">
              Yükselt
            </Link>
          </div>
        )}

        {aiYorum && (
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Bot className="h-4 w-4 text-violet-400" />
              <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider">AI Makro Analizi</span>
              <button
                onClick={() => { setAiYorum(''); setAiError(null); }}
                className="ml-auto text-[11px] text-text-muted hover:text-text-secondary"
              >Kapat</button>
            </div>
            <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
              {aiYorum}
              {aiLoading && <span className="inline-block h-4 w-0.5 animate-pulse bg-violet-400 align-middle ml-0.5" />}
            </div>
          </div>
        )}
      </div>

      {/* Filtreler */}
      <div className="flex flex-wrap gap-2 mb-5">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface/50 p-1">
          {(['all', 'TR', 'US', 'EU'] as FilterUlke[]).map((u) => (
            <button
              key={u}
              onClick={() => setUlkeFilter(u)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                ulkeFilter === u ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
              )}
            >
              {u === 'all' ? 'Tümü' : `${ULKE_FLAG[u as Ulke]} ${ULKE_LABEL[u as Ulke]}`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface/50 p-1">
          {(['all', 'yuksek', 'orta', 'dusuk'] as FilterOnem[]).map((o) => (
            <button
              key={o}
              onClick={() => setOnemFilter(o)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                onemFilter === o ? 'bg-surface text-text-primary' : 'text-text-secondary hover:text-text-primary'
              )}
            >
              {o === 'all' ? 'Tüm Önem' : ONEM_LABEL[o]}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowPast(!showPast)}
          className={cn(
            'rounded-lg border px-3 py-1 text-xs font-medium transition-colors',
            showPast
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border text-text-secondary hover:text-text-primary'
          )}
        >
          Geçmiş Veriler {showPast ? '✓' : ''}
        </button>
      </div>

      {/* Liste */}
      {dates.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface/30 p-10 text-center text-sm text-text-secondary/50">
          Bu filtreye uygun olay bulunamadı.
        </div>
      ) : (
        <div className="space-y-6">
          {dates.map((date) => {
            const events = grouped[date]!;
            const today  = isToday(date);
            const past   = isPast(date);
            return (
              <div key={date}>
                <div className="flex items-center gap-2 mb-2">
                  <p className={cn(
                    'text-xs font-semibold uppercase tracking-wider',
                    today ? 'text-primary' : past ? 'text-text-secondary/40' : 'text-text-secondary'
                  )}>
                    {today && <span className="mr-1 rounded bg-primary/20 px-1.5 py-0.5 text-primary">Bugün</span>}
                    {formatDate(date)}
                  </p>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-2">
                  {events.map((ev) => (
                    <div
                      key={ev.id}
                      className={cn(
                        'rounded-lg border p-3 transition-colors',
                        past ? 'border-border/40 bg-surface/20 opacity-60' : ONEM_BG[ev.onem]
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <span className="text-lg leading-none mt-0.5">{ULKE_FLAG[ev.ulke]}</span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-text-primary">{ev.baslik}</p>
                              {ev.gerceklesen && (
                                <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                                  Açıklandı
                                </span>
                              )}
                            </div>
                            {ev.aciklama && <p className="text-[11px] text-text-secondary/50 mt-0.5">{ev.aciklama}</p>}
                            <ValueChange onceki={ev.onceki} gerceklesen={ev.gerceklesen} beklenti={ev.beklenti} />
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <OnemDots onem={ev.onem} />
                          <span className={cn('flex items-center gap-1 text-[11px]', ONEM_COLOR[ev.onem])}>
                            <Clock className="h-3 w-3" />
                            {ev.saat}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-center text-[11px] text-text-secondary/30">
        Saat bilgileri TRT (UTC+3) · Beklenti değerleri piyasa konsensüsüdür, kesin sonuç farklılık gösterebilir.
      </p>
    </div>
  );
}
