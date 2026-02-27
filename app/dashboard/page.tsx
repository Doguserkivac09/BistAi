import { redirect } from 'next/navigation';
import { getAuthenticatedUser, UnauthorizedError } from '@/lib/auth-server';

export default async function DashboardPage() {
  console.log('ENV URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  try {
    const user = await getAuthenticatedUser();

    return (
      <div>
        <h1>Dashboard</h1>
        <p>Hoş geldin, {user.email}</p>
      </div>
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect('/giris?redirect=/dashboard');
    }

    throw error;
  }
}
