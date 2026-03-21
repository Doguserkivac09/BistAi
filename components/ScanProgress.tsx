'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ScanProgressProps {
  current: number;
  total: number;
  symbol: string;
}

interface LogEntry {
  id: number;
  symbol: string;
  status: 'scanning' | 'done';
}

export function ScanProgress({ current, total, symbol }: ScanProgressProps) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  const [log, setLog] = useState<LogEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const entryId = useRef(0);

  useEffect(() => {
    if (!symbol) return;
    const id = ++entryId.current;
    setLog(prev => [...prev.slice(-14), { id, symbol, status: 'scanning' }]);
    const timer = setTimeout(() => {
      setLog(prev => prev.map(e => e.id === id ? { ...e, status: 'done' } : e));
    }, 120);
    return () => clearTimeout(timer);
  }, [symbol, current]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {/* Terminal başlık çubuğu */}
      <div className="flex items-center gap-2 border-b border-border/50 bg-[#13131f] px-4 py-2.5">
        <div className="h-3 w-3 rounded-full bg-red-500/70" />
        <div className="h-3 w-3 rounded-full bg-yellow-500/70" />
        <div className="h-3 w-3 rounded-full bg-green-500/70" />
        <span className="ml-3 font-mono text-[11px] uppercase tracking-widest text-text-secondary">
          BistAI — Sinyal Tarama Sistemi
        </span>
        <span className="ml-auto font-mono text-xs font-medium text-primary">
          {current}/{total}
        </span>
      </div>

      {/* Log alanı */}
      <div
        ref={logRef}
        className="h-52 overflow-y-auto bg-[#0c0c18] px-5 py-4 font-mono text-xs"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div className="mb-1 text-green-500/50">
          {'>'} BistAI Sinyal Tarayıcı v2.0 başlatılıyor...
        </div>
        <div className="mb-3 text-green-500/35">
          {'>'} {total} sembol yüklendi — toplu tarama başlıyor (batch_size=5)
        </div>

        <AnimatePresence initial={false}>
          {log.map(entry => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.12 }}
              className="flex items-center gap-2 py-[2px]"
            >
              <span className="text-border">{'>'}</span>
              <span className={`w-[68px] font-semibold ${entry.status === 'done' ? 'text-indigo-400' : 'text-amber-400'}`}>
                [{entry.symbol}]
              </span>
              {entry.status === 'scanning' ? (
                <span className="text-amber-400/60">taranıyor</span>
              ) : (
                <span className="text-green-400">✓ tamamlandı</span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Yanıp sönen imleç */}
        <div className="mt-1 flex items-center gap-2 py-[2px]">
          <span className="text-border">{'>'}</span>
          <motion.span
            className="inline-block h-[13px] w-[7px] bg-green-400"
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 0.75, repeat: Infinity }}
          />
        </div>
      </div>

      {/* Progress bar */}
      <div className="border-t border-border/30 bg-[#0c0c18] px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/50">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-violet-500 to-indigo-400"
              initial={{ width: '0%' }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
          <span className="w-10 text-right font-mono text-xs font-semibold text-primary">
            %{percent}
          </span>
        </div>
        <p className="mt-1.5 font-mono text-[10px] text-text-secondary/50">
          {current < total
            ? `Şu an: ${symbol || '...'}`
            : 'Tarama tamamlandı.'}
        </p>
      </div>
    </div>
  );
}
