import type { Metadata } from 'next';
import { SektorlerClient } from './SektorlerClient';

export const metadata: Metadata = {
  title: 'Sektör & Piyasa Analizi',
  description: 'BIST sektörlerinin momentum analizi, emtia ve döviz kuru takibi.',
};

export default function SektorlerPage() {
  return <SektorlerClient />;
}
