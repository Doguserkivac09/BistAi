/**
 * DEV ONLY: signal_performance tablo durumunu gösterir.
 * GET /api/dev/eval-status
 *
 * Production'da çalışmaz — NODE_ENV=development zorunlu.
 * Evaluate engine'in sağlıklı çalışıp çalışmadığını kontrol eder.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env eksik — SUPABASE_SERVICE_ROLE_KEY ayarlanmamış');
  return createClient(url, key);
}

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Sadece development ortamında kullanılabilir.' }, { status: 403 });
  }

  try {
    const supabase = createAdminClient();

    // Toplam kayıt sayısı
    const { count: total } = await supabase
      .from('signal_performance')
      .select('*', { count: 'exact', head: true });

    // Evaluated=true sayısı
    const { count: evaluated } = await supabase
      .from('signal_performance')
      .select('*', { count: 'exact', head: true })
      .eq('evaluated', true);

    // Evaluated=false sayısı
    const { count: pending } = await supabase
      .from('signal_performance')
      .select('*', { count: 'exact', head: true })
      .eq('evaluated', false);

    // Son 5 evaluated kayıt
    const { data: recent } = await supabase
      .from('signal_performance')
      .select('id, sembol, signal_type, direction, entry_time, return_3d, return_7d, return_14d, return_30d, evaluated')
      .eq('evaluated', true)
      .order('entry_time', { ascending: false })
      .limit(5);

    // En eski pending kayıt (ne zaman evaluate olacak?)
    const { data: oldestPending } = await supabase
      .from('signal_performance')
      .select('id, sembol, signal_type, entry_time')
      .eq('evaluated', false)
      .order('entry_time', { ascending: true })
      .limit(1);

    // Sinyal tipine göre dağılım (evaluated)
    const { data: byType } = await supabase
      .from('signal_performance')
      .select('signal_type')
      .eq('evaluated', true);

    const typeCount: Record<string, number> = {};
    for (const row of (byType ?? [])) {
      typeCount[row.signal_type] = (typeCount[row.signal_type] ?? 0) + 1;
    }

    return NextResponse.json({
      summary: {
        total:     total     ?? 0,
        evaluated: evaluated ?? 0,
        pending:   pending   ?? 0,
        evalRate:  total ? `${Math.round(((evaluated ?? 0) / total) * 100)}%` : '0%',
      },
      bySignalType: typeCount,
      recentEvaluated: recent ?? [],
      oldestPending:   oldestPending?.[0] ?? null,
      diagnosis: (() => {
        if ((total ?? 0) === 0) return '❌ Tablo boş — scan-cache cron hiç çalışmamış veya SUPABASE_SERVICE_ROLE_KEY eksik';
        if ((evaluated ?? 0) === 0) return '⚠️ Hiç evaluated kayıt yok — henüz 3+ gün geçmemiş veya evaluate cron çalışmamış';
        if ((evaluated ?? 0) < 10) return '⚠️ Çok az evaluated kayıt — backtest güvenilirliği düşük';
        return '✅ Sistem sağlıklı — evaluate engine çalışıyor';
      })(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message, diagnosis: '❌ Supabase bağlantısı kurulamadı' }, { status: 500 });
  }
}
