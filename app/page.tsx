import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

const LandingPage = dynamic(() => import('@/components/LandingPage'), {
  loading: () => (
    <div className="min-h-screen bg-[#0a0a18] flex items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  ),
});

export const metadata: Metadata = {
  title: 'Investable Edge — BIST Hisselerinde AI Destekli Sinyal Analizi',
  description:
    'BIST hisse senetlerini tarayın, RSI uyumsuzluğu, hacim anomalisi ve trend sinyallerini yapay zeka açıklamalarıyla takip edin.',
};

export default function Page() {
  return <LandingPage />;
}
