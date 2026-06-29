import type { Metadata } from 'next';
import { AkilliPara } from '@/components/AkilliPara';

export const metadata: Metadata = {
  title: 'Bugün — Ne Yapmalıyım? | BistAI',
  description:
    'Günlük tek net aksiyon: teknik sinyal + akıllı para birikimini birleştiren kural-tabanlı motor. Uzak Dur / İzle / Değerlendir / Güçlü İzle.',
};

export default function BugunPage() {
  return (
    <AkilliPara
      heading="Bugün — Ne Yapmalıyım?"
      intro={
        <>
          Bugünün tek net aksiyonu: teknik sinyal + akıllı para birikimi tek karara çevrilir.
          Tüm hesaplar kural-tabanlı; özet AI ile sadeleştirilir.
        </>
      }
    />
  );
}
