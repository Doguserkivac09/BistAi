import { NextResponse } from 'next/server';
import { shouldRunBistCron } from './time-align';

/**
 * BIST cron guard — tatil/hafta sonu kontrolü.
 * null döndürürse cron normal çalışmalı.
 * NextResponse döndürürse cron atlanmalı (erken return).
 */
export function bistGuard(now?: Date): NextResponse | null {
  const { shouldRun, reason } = shouldRunBistCron(now);
  if (!shouldRun) {
    console.log(`[bist-guard] Atlandı: ${reason}`);
    return NextResponse.json({ ok: true, skipped: true, reason });
  }
  return null;
}
