import { getAuthenticatedUser, UnauthorizedError } from '@/lib/auth-server';
import { NavbarClient } from '@/components/NavbarClient';

export async function Navbar() {
  let user: { id: string; email: string | null } | null = null;
  try {
    user = await getAuthenticatedUser();
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) {
      throw error;
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <NavbarClient user={user} />
    </header>
  );
}
