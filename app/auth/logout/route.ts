import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const supabase = await createServerClient();

  try {
    await supabase.auth.signOut();
  } catch {
    // ignore sign out error and always redirect
  }

  return NextResponse.redirect(new URL('/', request.url));
}

