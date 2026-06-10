import type { Metadata } from 'next'
import BuyuyenSirketler from '@/components/BuyuyenSirketler'

export const metadata: Metadata = {
  title: 'Büyüyen Şirketler — Investable Edge',
  description:
    'İşi büyüyen, kârlılığı artan ve hisse başı kazancı (EPS) yükselen BIST şirketleri. Son 5 yıllık finansallardan enflasyona göre reel büyüme momentumu skoru.',
}

export default function Page() {
  return <BuyuyenSirketler />
}
