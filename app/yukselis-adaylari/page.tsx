import type { Metadata } from 'next';
import { YukselisAdaylari } from '@/components/YukselisAdaylari';

export const metadata: Metadata = {
  title: 'Yükseliş Adayları — Bebek Hisseler | BistAI',
  description:
    'Henüz yükselmemiş, yükselme potansiyeli yüksek BIST hisseleri. Yapısal kıtlık + sessiz birikim + temel ateşleme + katalist + zamanlama − tuzak filtresiyle skorlanır.',
};

export default function YukselisAdaylariPage() {
  return <YukselisAdaylari />;
}
