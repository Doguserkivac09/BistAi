import type { Metadata } from 'next';
import { AppShell } from '@/components/new/AppShell';
import { ProfilScreen } from '@/components/new/ProfilScreen';

export const metadata: Metadata = {
  title: 'Profil | bistAI',
  description: 'Hesap, üyelik, bildirim tercihleri ve ayarlar.',
};

export default function ProfilPage() {
  return (
    <AppShell>
      <ProfilScreen />
    </AppShell>
  );
}
