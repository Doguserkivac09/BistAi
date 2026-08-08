/**
 * GET /api/changelog/latest
 *
 * Make.com / Telegram otomasyonu için: repo kökündeki changelog.json'da henüz
 * gruba paylaşılmamış yama notu versiyonlarını döndürür. Sinyal paylaşımının
 * yerini alır — bot artık yalnızca yama notu yayınlar.
 *
 * Query params:
 *   limit — kaç versiyon dönsün (default: 5, max: 10)
 *
 * Response:
 *   { entries: ChangelogEntry[], hasNew: boolean }
 *
 * Davranış: dönen her versiyon, bu çağrının sonunda changelog_publish_log'a
 * yazılır (bir daha dönmez). Aynı GET tekrar çağrılırsa yalnızca changelog.json'a
 * o aralıkta eklenmiş yeni versiyonlar döner.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import changelogData from '@/changelog.json';

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

// ─── API Key Koruması ──────────────────────────────────────────────────────────
function isAuthorized(req: NextRequest): boolean {
  const key = req.headers.get('x-api-key') ?? req.nextUrl.searchParams.get('apiKey');
  const expected = process.env.SOCIAL_API_KEY;
  if (!expected) return true;
  return key === expected;
}

// ─── Changelog Şeması ──────────────────────────────────────────────────────────
type ItemCategory = 'yeni' | 'iyilestirme' | 'duzeltme';

interface ChangelogItem {
  category: ItemCategory;
  text: string;
}

interface ChangelogVersion {
  version: string;
  date: string;
  type: 'major' | 'minor' | 'patch';
  items: ChangelogItem[];
}

interface ChangelogEntry {
  version: string;
  date: string;
  telegramMessage: string;
}

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  yeni: '✨ Yenilikler',
  iyilestirme: '🛠️ İyileştirmeler',
  duzeltme: '🐛 Düzeltmeler',
};

const CATEGORY_ORDER: ItemCategory[] = ['yeni', 'iyilestirme', 'duzeltme'];

function formatTurkishDate(iso: string): string {
  const months = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
  ];
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return `${d} ${months[m! - 1]} ${y}`;
}

function buildTelegramMessage(stage: string, v: ChangelogVersion): string {
  const separator = '━━━━━━━━━━━━━━━━━━━━━━';

  const sections = CATEGORY_ORDER
    .map((cat) => {
      const items = v.items.filter((i) => i.category === cat);
      if (!items.length) return null;
      return `${CATEGORY_LABELS[cat]}\n` + items.map((i) => `• ${i.text}`).join('\n');
    })
    .filter((s): s is string => s !== null)
    .join('\n\n');

  return (
    `🆕 *Investable Edge — ${stage} v${v.version}*\n` +
    `📅 ${formatTurkishDate(v.date)}\n\n` +
    `${sections}\n\n` +
    `${separator}\n` +
    `🚧 _Bu sürüm ${stage} aşamasındadır — özellikler ve ölçümler değişebilir._`
  );
}

// ─── Ana Handler ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
  }

  const limitParam = Math.min(10, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '5', 10)));

  const stage = (changelogData as { stage: string }).stage ?? 'Pre-Alpha';
  const versions = (changelogData as { versions: ChangelogVersion[] }).versions ?? [];

  const supabase = createAdminClient();
  let publishedVersions = new Set<string>();
  if (supabase) {
    const { data } = await supabase
      .from('changelog_publish_log')
      .select('version');
    publishedVersions = new Set((data ?? []).map((r) => r.version));
  }

  const unpublished = versions
    .filter((v) => !publishedVersions.has(v.version))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limitParam);

  if (!unpublished.length) {
    return NextResponse.json({ entries: [], hasNew: false });
  }

  const entries: ChangelogEntry[] = unpublished.map((v) => ({
    version: v.version,
    date: v.date,
    telegramMessage: buildTelegramMessage(stage, v),
  }));

  if (supabase) {
    await supabase
      .from('changelog_publish_log')
      .upsert(
        unpublished.map((v) => ({ version: v.version })),
        { onConflict: 'version', ignoreDuplicates: true },
      );
  }

  return NextResponse.json(
    { entries, hasNew: true },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
