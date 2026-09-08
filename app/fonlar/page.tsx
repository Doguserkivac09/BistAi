import type { Metadata } from 'next';
import { AppShell } from '@/components/new/AppShell';
import { FonlarScreen } from '@/components/new/FonlarScreen';

export const metadata: Metadata = {
  title: 'Fonlar | bistAI',
  description:
    'TEFAS ve BES fonları — nominal, risksize göre ve enflasyona göre getiri birlikte; risk-ayarlı ve getiri sıralaması yan yana.',
};

export default function FonlarPage() {
  return (
    <AppShell>
      <FonlarScreen />
    </AppShell>
  );
}
