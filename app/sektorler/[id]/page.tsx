import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SECTORS } from '@/lib/sectors';
import type { SectorId } from '@/lib/sectors';
import { SectorDetailClient } from './SectorDetailClient';

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const sector = SECTORS[params.id as SectorId];
  if (!sector) return { title: 'Sektör bulunamadı' };
  return {
    title: `${sector.name} Sektörü — BIST Analiz`,
    description: `${sector.name} sektöründeki tüm BIST hisseleri, performans karşılaştırması, momentum analizi.`,
  };
}

export default function SectorDetailPage({ params }: { params: { id: string } }) {
  const sector = SECTORS[params.id as SectorId];
  if (!sector) notFound();
  return <SectorDetailClient sectorId={params.id as SectorId} />;
}
