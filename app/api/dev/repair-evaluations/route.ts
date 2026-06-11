/**
 * BUG-A geriye dönük onarım: kanonik ufuk returnu null kalmış evaluated=true
 * kayıtları yeniden değerlendirmeye açar (evaluated=false).
 *
 * Neden: evaluate-engine'ın eski SIGNAL_MIN_DAYS tablosu formasyon/pre-signal
 * tiplerini içermiyordu → 14g/30g ufuklu sinyaller 7. günde kapatıldı, kanonik
 * return alanları kalıcı null kaldı. Bu endpoint o kayıtları tespit edip yeniden
 * açar; cron/evaluate sonraki koşularda doğru ufukla doldurur.
 *
 * GÜVENLİ PENCERE: evaluate-engine OHLCV'yi son 70 günden çeker. entry_time
 * bundan eskiyse 3g/7g kapanışları pencere dışında kalır ve kayıt sonsuza dek
 * evaluated=false döngüsüne girer. Bu yüzden yalnızca son MAX_AGE_DAYS gün
 * içindeki kayıtlar onarılır (30g ufuk + tampon).
 *
 * GET /api/dev/repair-evaluations            → dry-run (sadece sayım)
 * GET /api/dev/repair-evaluations?apply=true → kayıtları yeniden aç
 * Header: Authorization: Bearer <CRON_SECRET>
 *
 * İdempotent — tekrar çağrılabilir; onarılacak kayıt kalmayınca repaired=0 döner.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCanonicalField, HORIZON_DAYS } from '@/lib/signal-horizons';

export const maxDuration = 120;

/** evaluate-engine'ın 70 günlük OHLCV penceresine sığan en eski giriş yaşı */
const MAX_AGE_DAYS = 60;
/** Tek çağrıda yeniden açılacak max kayıt (evaluate backlog'unu boğmamak için) */
const MAX_REPAIR = 1000;

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env eksik');
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const CRON_SECRET = process.env.CRON_SECRET;
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const isAuth = CRON_SECRET && token === CRON_SECRET;
  if (!isAuth && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
  }

  const apply = request.nextUrl.searchParams.get('apply') === 'true';

  try {
    const supabase = createAdminClient();
    const now = Date.now();
    const oldestIso = new Date(now - MAX_AGE_DAYS * 86_400_000).toISOString();

    // Aday kayıtlar: evaluated=true + son 60 gün. Kanonik alan null kontrolü
    // sinyal tipine bağlı olduğu için satır bazında yapılır.
    const { data, error } = await supabase
      .from('signal_performance')
      .select('id, signal_type, entry_time, return_7d, return_14d, return_30d')
      .eq('evaluated', true)
      .gte('entry_time', oldestIso)
      .order('entry_time', { ascending: true })
      .limit(5000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type Row = {
      id: number;
      signal_type: string | null;
      entry_time: string;
      return_7d: number | null;
      return_14d: number | null;
      return_30d: number | null;
    };

    const toReopen: number[] = [];
    const byType: Record<string, number> = {};

    for (const r of (data ?? []) as Row[]) {
      const field = getCanonicalField(r.signal_type ?? '');
      if (field === 'return_3d') continue; // 3g ufuk eski tabloda da doğruydu
      const horizonDays = HORIZON_DAYS[field];

      // Ufuk henüz dolmadıysa null normal — onarım gerekmez (yanlış da kapanmış
      // olamaz çünkü yeni getMinEvalDays bunu artık engelliyor; eski kayıtlarda
      // ufuk dolmuşsa ve alan null ise erken kapatılmış demektir).
      const ageDays = (now - new Date(r.entry_time).getTime()) / 86_400_000;
      if (ageDays < horizonDays + 1) continue;

      const canonicalValue =
        field === 'return_7d' ? r.return_7d :
        field === 'return_14d' ? r.return_14d : r.return_30d;
      if (canonicalValue !== null) continue;

      toReopen.push(r.id);
      const t = r.signal_type ?? '?';
      byType[t] = (byType[t] ?? 0) + 1;
      if (toReopen.length >= MAX_REPAIR) break;
    }

    let repaired = 0;
    if (apply && toReopen.length > 0) {
      const BATCH = 200;
      for (let i = 0; i < toReopen.length; i += BATCH) {
        const ids = toReopen.slice(i, i + BATCH);
        const { error: updErr } = await supabase
          .from('signal_performance')
          .update({ evaluated: false })
          .in('id', ids);
        if (updErr) {
          console.error('[repair-evaluations] UPDATE hatası:', updErr.message);
        } else {
          repaired += ids.length;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      mode: apply ? 'apply' : 'dry-run',
      candidates: toReopen.length,
      repaired,
      byType,
      note: 'Yeniden açılan kayıtları cron/evaluate (günlük 200 batch) dolduracak; backlog için response.remaining izlenebilir.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
