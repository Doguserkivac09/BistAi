import type { Metadata } from 'next';
import { AppShell } from '@/components/new/AppShell';
import { YardimScreen } from '@/components/new/YardimScreen';

export const metadata: Metadata = {
  title: 'Yardım & Destek — BistAI',
  description: 'SSS, formasyon ve sinyal rehberleri, risk yönetimi ve AI asistan desteği.',
};

// Yeni tasarım (açık tema) — Yardım & Destek. Alt sayfalar (/yardim/*) eski temada kalır.
export default function YardimPage() {
  return (
    <AppShell>
      <YardimScreen />
    </AppShell>
  );
}
