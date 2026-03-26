import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env eksik.');
  return createClient(url, key);
}

/**
 * POST /api/profile/avatar
 * Body: FormData with "file" field
 * Uploads to Supabase Storage "avatars" bucket.
 * Returns { avatar_url: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Dosya bulunamadı.' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Sadece JPEG, PNG veya WebP yüklenebilir.' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Dosya boyutu en fazla 2MB olabilir.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
    const path = `${user.id}/avatar.${ext}`;

    // Upload (upsert = overwrite existing)
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage
      .from('avatars')
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('[avatar upload]', uploadError.message);
      return NextResponse.json({ error: 'Yükleme başarısız: ' + uploadError.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = admin.storage.from('avatars').getPublicUrl(path);
    const avatarUrl = urlData.publicUrl + '?t=' + Date.now(); // cache bust

    // Update profile
    const { error: updateError } = await admin
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', user.id);

    if (updateError) {
      return NextResponse.json({ error: 'Profil güncellenemedi.' }, { status: 500 });
    }

    return NextResponse.json({ avatar_url: avatarUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
