/**
 * US Borsası Cron Guard
 * NYSE/NASDAQ: Pazartesi-Cuma, ABD federal tatilleri hariç.
 *
 * Kural (BIST guard ile paralel):
 *  - Cumartesi → ATLA
 *  - Pazar     → ÇALIŞ (Pazartesi açılışı için hazırlık)
 *  - ABD federal tatili, yarın borsa açılıyorsa → ÇALIŞ (son tatil günü)
 *  - ABD federal tatili, yarın da tatil/hafta sonu → ATLA
 *  - Normal iş günü → ÇALIŞ
 */

import { NextResponse } from 'next/server';
import { US_HOLIDAYS_2026 } from './time-align';

function formatDateUS(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dy}`;
}

function toETTime(d: Date): Date {
  return new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

function isUSTradingDay(d: Date): boolean {
  const et  = toETTime(d);
  const day = et.getDay();
  const ds  = formatDateUS(et);
  return day !== 0 && day !== 6 && !US_HOLIDAYS_2026.includes(ds);
}

export function shouldRunUSCron(now?: Date): { shouldRun: boolean; reason: string } {
  const d   = now ?? new Date();
  const et  = toETTime(d);
  const day = et.getDay();
  const ds  = formatDateUS(et);

  if (day === 6) return { shouldRun: false, reason: `Cumartesi — US Borsası kapalı (${ds})` };
  if (day === 0) return { shouldRun: true,  reason: 'Pazar — Pazartesi açılışı için hazırlık' };
  if (!US_HOLIDAYS_2026.includes(ds)) return { shouldRun: true, reason: `Normal US iş günü (${ds})` };

  // ABD tatil günü: yarın US trading day mi?
  const tomorrowUTC = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  if (isUSTradingDay(tomorrowUTC)) {
    const tomorrowStr = formatDateUS(toETTime(tomorrowUTC));
    return { shouldRun: true, reason: `Tatil son günü — yarın (${tomorrowStr}) US Borsası açılıyor` };
  }

  return { shouldRun: false, reason: `US federal tatil — ${ds}` };
}

export function usMarketGuard(now?: Date): NextResponse | null {
  const { shouldRun, reason } = shouldRunUSCron(now);
  if (!shouldRun) {
    console.log(`[us-market-guard] Atlandı: ${reason}`);
    return NextResponse.json({ ok: true, skipped: true, reason });
  }
  return null;
}
