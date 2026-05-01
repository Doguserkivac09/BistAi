'use client';

import { useState, useRef } from 'react';

interface InfoPopoverProps {
  /** Pencerede gösterilecek başlık (kalın, üstte) */
  title: string;
  /** Açıklama metni (alt satır, biraz açık renk) */
  description: string;
  /** İstenirse alt başlık altına eklenecek ek satır (örn. ağırlıklar) */
  meta?: string;
  /** Buton boyutu (px) — default 14 */
  size?: number;
  /** Pencere yönü — default 'top' */
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * Küçük "?" ikonu — üzerine gelince/tıklayınca açıklama paneli açılır.
 * Mouse hover + dokunmatik için onClick toggle birlikte çalışır.
 *
 * Kullanım:
 * <InfoPopover title="Yatırım Skoru" description="..." />
 */
export function InfoPopover({
  title,
  description,
  meta,
  size = 14,
  placement = 'top',
}: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const handleLeave = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  const placementClasses = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left:   'right-full top-1/2 -translate-y-1/2 mr-2',
    right:  'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onFocus={handleEnter}
        onBlur={handleLeave}
        aria-label={`${title} hakkında bilgi`}
        aria-expanded={open}
        className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 text-white/55 hover:border-white/40 hover:text-white/85 hover:bg-white/10 transition-colors cursor-help font-semibold leading-none select-none"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.7) }}
      >
        ?
      </button>

      {open && (
        <div
          role="tooltip"
          className={`absolute z-50 w-64 rounded-lg border border-white/15 bg-[#0d0d1a] px-3 py-2.5 text-left shadow-2xl shadow-black/60 ${placementClasses[placement]}`}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          <p className="text-xs font-bold text-white mb-1">{title}</p>
          <p className="text-[11px] leading-snug text-white/70">{description}</p>
          {meta && (
            <p className="mt-1.5 text-[10px] font-mono text-white/40 border-t border-white/10 pt-1.5">
              {meta}
            </p>
          )}
        </div>
      )}
    </span>
  );
}
