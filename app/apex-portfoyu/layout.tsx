import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'APEX Portföyü — Investable Edge',
  description: 'Agresif momentum stratejisi. relVol5≥3x + conf≥75 giriş filtresi. Günlük kararlar, tight stop, trailing exit.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
