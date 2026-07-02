import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SECTORS } from '@/lib/sectors';
import type { SectorId } from '@/lib/sectors';
import { AppShell } from '@/components/new/AppShell';
import { SektorDetayScreen } from '@/components/new/SektorDetayScreen';

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

// Yeni tasarım (açık tema) — Sektör detay. /sektorler listesi eski temada kalır.
export default function SectorDetailPage({ params }: { params: { id: string } }) {
  const sector = SECTORS[params.id as SectorId];
  if (!sector) notFound();
  return (
    <AppShell>
      <SektorDetayScreen sectorId={params.id as SectorId} />
    </AppShell>
  );
}
