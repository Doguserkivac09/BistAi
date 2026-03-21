import type { Metadata } from 'next';
import LandingPage from '@/components/LandingPage';

export const metadata: Metadata = {
  title: 'BistAI — BIST Hisselerinde AI Destekli Sinyal Analizi',
  description:
    'BIST hisse senetlerini tarayın, RSI uyumsuzluğu, hacim anomalisi ve trend sinyallerini yapay zeka açıklamalarıyla takip edin.',
};

export default function Page() {
  return <LandingPage />;
}
