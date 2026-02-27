import { cookies } from 'next/headers';
import { createServerClient as createSupabaseServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase server client için NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY environment değişkenleri tanımlanmalıdır.');
}

type Cookie = {
  name: string;
  value: string;
  options?: CookieOptions;
};

/**
 * Next.js 14 App Router için, cookie tabanlı Supabase server client.
 *
 * - Sadece server component, route handler ve middleware içinde kullanılmalıdır.
 * - Session, `cookies()` API üzerinden otomatik olarak okunur/yazılır.
 * - Browser tarafındaki `lib/supabase.ts` client'ı ile çakışmaz; bu dosya hiçbir zaman client bundle'a girmemelidir.
 */
export async function createServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  const client = createSupabaseServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll(cookiesToSet: Cookie[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component içinde cookie yazmaya çalışıldığında Next.js hata fırlatabilir.
          // Bu durumda session yenileme işlemi middleware veya route handler üzerinden ele alınmalıdır.
        }
      },
    },
  });

  return client;
}

