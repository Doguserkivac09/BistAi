import { createServerClient } from './supabase-server';

export class UnauthorizedError extends Error {
  readonly status: number;

  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
    this.status = 401;
  }
}

export async function getAuthenticatedUser(): Promise<{ id: string; email: string | null }> {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new UnauthorizedError();
  }

  return {
    id: user.id,
    email: user.email ?? null,
  };
}

