import type { Metadata } from 'next';
import { AkilliPara } from '@/components/AkilliPara';

export const metadata: Metadata = {
  title: 'Akıllı Para Sinyali — BistAI',
  description:
    'BIST hisseleri için teknik sinyal + akıllı para (fiyat-hacim) birikimini tek basit karara çeviren kural-tabanlı motor: ne yapmalı? (Uzak Dur / İzle / Değerlendir / Güçlü İzle)',
};

export default function AkilliParaPage() {
  return <AkilliPara />;
}
