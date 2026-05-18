/**
 * Gün İçi Portföy Alarm Cron
 * GET /api/cron/portfolio-alerts
 *
 * Her scan_cache güncellemesinden sonra çalışır (günde 3 kez):
 *  - 07:35 UTC (10:35 TRT) — sabah kontrolü
 *  - 09:05 UTC (12:05 TRT) — öğle kontrolü
 *  - 14:55 UTC (17:55 TRT) — kapanış öncesi kontrolü
 *
 * Kontrol eder:
 *  1. Stop'a yakın pozisyonlar (<%3 mesafe) — alert email
 *  2. Trailing stop tetiklendi mi?
 *  3. Sinyal zayıfladı mı? (giriş conf ≥75 iken şimdi <45)
 *  4. Büyük gün içi hareket (>+%5 veya <-%5)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CRON_SECRET = process.env.CRON_SECRET;

const STOP_WARN_PCT     = 3.0;   // Stop'a bu kadar yakınsa uyar
const SIGNAL_WEAK_CONF  = 45;    // Bu altına düşerse sinyal zayıf sayılır
const BIG_MOVE_PCT      = 5.0;   // Gün içi bu kadar hareket ederse not et

function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

interface Alert {
  portfolio: 'ai' | 'apex';
  sembol: string;
  type: 'stop_warning' | 'trailing_triggered' | 'signal_weak' | 'big_move';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  currentPrice: number;
  entryPrice: number;
  returnPct: number;
}

export async function GET(req: NextRequest) {
  const isVercel = req.headers.get('x-vercel-cron') === '1';
  const token    = req.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!isVercel && !(CRON_SECRET && token === CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db     = createAdmin();
  const alerts: Alert[] = [];

  // ── Tüm açık pozisyonları çek ──────────────────────────────────────
  const [{ data: aiPositions }, { data: apexPositions }] = await Promise.all([
    db.from('ai_portfolio_positions').select('sembol, entry_price, stop_loss, trailing_stop, current_price').eq('is_open', true),
    db.from('apex_portfolio_positions').select('sembol, entry_price, stop_loss, trailing_stop, current_price, entry_confluence').eq('is_open', true),
  ]);

  const allSymbols = [
    ...(aiPositions ?? []).map((p) => p.sembol),
    ...(apexPositions ?? []).map((p) => p.sembol),
  ];
  const uniqueSymbols = [...new Set(allSymbols)];

  if (uniqueSymbols.length === 0) {
    return NextResponse.json({ ok: true, alerts: [], message: 'Açık pozisyon yok' });
  }

  // ── scan_cache'den güncel fiyat + sinyal ──────────────────────────
  const { data: scanRows } = await db
    .from('scan_cache')
    .select('sembol, last_close, confluence_score, change_percent')
    .in('sembol', uniqueSymbols);

  const scanMap = new Map((scanRows ?? []).map((r) => [r.sembol, r]));

  // ── AI Portföy kontrol ────────────────────────────────────────────
  for (const pos of aiPositions ?? []) {
    const scan = scanMap.get(pos.sembol);
    if (!scan?.last_close) continue;
    const current  = scan.last_close;
    const ret      = ((current - pos.entry_price) / pos.entry_price) * 100;
    const stopDist = pos.stop_loss ? ((current - pos.stop_loss) / current) * 100 : null;

    if (stopDist !== null && stopDist < STOP_WARN_PCT) {
      alerts.push({
        portfolio: 'ai', sembol: pos.sembol, type: 'stop_warning', severity: 'critical',
        message: `Stop'a çok yakın: mevcut ${current.toFixed(2)} → stop ${pos.stop_loss?.toFixed(2)} (-%${stopDist.toFixed(1)})`,
        currentPrice: current, entryPrice: pos.entry_price, returnPct: parseFloat(ret.toFixed(2)),
      });
    }

    if (pos.trailing_stop && current <= pos.trailing_stop && ret > 0) {
      alerts.push({
        portfolio: 'ai', sembol: pos.sembol, type: 'trailing_triggered', severity: 'critical',
        message: `Trailing stop tetiklendi: ${current.toFixed(2)} ≤ trailing ${pos.trailing_stop.toFixed(2)} — yarın çıkılacak`,
        currentPrice: current, entryPrice: pos.entry_price, returnPct: parseFloat(ret.toFixed(2)),
      });
    }

    if (Math.abs(scan.change_percent ?? 0) >= BIG_MOVE_PCT) {
      alerts.push({
        portfolio: 'ai', sembol: pos.sembol, type: 'big_move', severity: 'info',
        message: `Büyük hareket: bugün ${(scan.change_percent ?? 0) > 0 ? '+' : ''}${(scan.change_percent ?? 0).toFixed(1)}%`,
        currentPrice: current, entryPrice: pos.entry_price, returnPct: parseFloat(ret.toFixed(2)),
      });
    }
  }

  // ── APEX Kontrol ──────────────────────────────────────────────────
  for (const pos of apexPositions ?? []) {
    const scan = scanMap.get(pos.sembol);
    if (!scan?.last_close) continue;
    const current  = scan.last_close;
    const ret      = ((current - pos.entry_price) / pos.entry_price) * 100;
    const stopDist = pos.stop_loss ? ((current - pos.stop_loss) / current) * 100 : null;

    if (stopDist !== null && stopDist < STOP_WARN_PCT) {
      alerts.push({
        portfolio: 'apex', sembol: pos.sembol, type: 'stop_warning', severity: 'critical',
        message: `APEX STOP UYARISI: mevcut ${current.toFixed(2)} → stop ${pos.stop_loss?.toFixed(2)} (-%${stopDist.toFixed(1)})`,
        currentPrice: current, entryPrice: pos.entry_price, returnPct: parseFloat(ret.toFixed(2)),
      });
    }

    if (pos.trailing_stop && current <= pos.trailing_stop && ret > 0) {
      alerts.push({
        portfolio: 'apex', sembol: pos.sembol, type: 'trailing_triggered', severity: 'critical',
        message: `APEX Trailing tetiklendi: +${ret.toFixed(1)}% kâr → ${current.toFixed(2)} ≤ trailing ${pos.trailing_stop.toFixed(2)}`,
        currentPrice: current, entryPrice: pos.entry_price, returnPct: parseFloat(ret.toFixed(2)),
      });
    }

    // Sinyal zayıflaması (giriş güçlüydü, şimdi düştü)
    const confNow = scan.confluence_score ?? 100;
    const entryConf = pos.entry_confluence ?? 75;
    if (entryConf >= 75 && confNow < SIGNAL_WEAK_CONF && ret < 0) {
      alerts.push({
        portfolio: 'apex', sembol: pos.sembol, type: 'signal_weak', severity: 'warning',
        message: `APEX sinyal çöktü: giriş conf ${entryConf} → şimdi ${confNow}. Zarar ${ret.toFixed(1)}%. Rotasyon değerlendir.`,
        currentPrice: current, entryPrice: pos.entry_price, returnPct: parseFloat(ret.toFixed(2)),
      });
    }

    if (Math.abs(scan.change_percent ?? 0) >= BIG_MOVE_PCT) {
      alerts.push({
        portfolio: 'apex', sembol: pos.sembol, type: 'big_move', severity: 'info',
        message: `APEX büyük hareket: bugün ${(scan.change_percent ?? 0) > 0 ? '+' : ''}${(scan.change_percent ?? 0).toFixed(1)}%`,
        currentPrice: current, entryPrice: pos.entry_price, returnPct: parseFloat(ret.toFixed(2)),
      });
    }
  }

  // ── Kritik alertleri Supabase'e yaz (ileride bildirim için) ────────
  const criticalAlerts = alerts.filter((a) => a.severity === 'critical');
  if (criticalAlerts.length > 0) {
    console.warn(`[portfolio-alerts] ${criticalAlerts.length} KRİTİK UYARI:`,
      criticalAlerts.map((a) => `${a.portfolio.toUpperCase()} ${a.sembol}: ${a.message}`).join(' | ')
    );
  }

  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    totalPositions: uniqueSymbols.length,
    alerts,
    criticalCount: criticalAlerts.length,
    warningCount:  alerts.filter((a) => a.severity === 'warning').length,
  });
}
