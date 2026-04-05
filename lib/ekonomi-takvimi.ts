/**
 * Ekonomi takvimi — statik veri + yardımcı fonksiyonlar.
 * Veriler manuel olarak güncellenir (veya API'den beslenebilir).
 */

export type Ulke = 'TR' | 'US' | 'EU';
export type Onem = 'yuksek' | 'orta' | 'dusuk';

export interface EkonomiEvent {
  id: string;
  tarih: string;      // YYYY-MM-DD
  saat: string;       // HH:MM (TRT)
  ulke: Ulke;
  onem: Onem;
  baslik: string;
  aciklama?: string;
  onceki?: string;
  beklenti?: string;
  gerceklesen?: string;
}

/** Ekonomi takvimi verileri — Nisan–Mayıs 2026 */
export const EKONOMI_EVENTS: EkonomiEvent[] = [
  // === Türkiye ===
  {
    id: 'tr-tcmb-faiz-apr',
    tarih: '2026-04-17',
    saat: '14:00',
    ulke: 'TR',
    onem: 'yuksek',
    baslik: 'TCMB Faiz Kararı',
    aciklama: 'Para Politikası Kurulu toplantısı',
    onceki: '%42,5',
    beklenti: '%40,0',
  },
  {
    id: 'tr-tufe-mar',
    tarih: '2026-04-03',
    saat: '10:00',
    ulke: 'TR',
    onem: 'yuksek',
    baslik: 'Türkiye TÜFE (Mart)',
    aciklama: 'Tüketici Fiyat Endeksi yıllık değişim',
    onceki: '%39,05',
    beklenti: '%37,2',
    gerceklesen: '%38,10',
  },
  {
    id: 'tr-ufe-mar',
    tarih: '2026-04-03',
    saat: '10:00',
    ulke: 'TR',
    onem: 'orta',
    baslik: 'Türkiye ÜFE (Mart)',
    aciklama: 'Üretici Fiyat Endeksi yıllık değişim',
    onceki: '%24,18',
    gerceklesen: '%23,72',
  },
  {
    id: 'tr-buyume-q4',
    tarih: '2026-04-07',
    saat: '10:00',
    ulke: 'TR',
    onem: 'yuksek',
    baslik: 'Türkiye GSYİH (4Ç 2025)',
    aciklama: 'Yıllık büyüme oranı',
    onceki: '%2,1',
    beklenti: '%2,5',
  },
  {
    id: 'tr-isgucu-feb',
    tarih: '2026-04-15',
    saat: '10:00',
    ulke: 'TR',
    onem: 'orta',
    baslik: 'Türkiye İşsizlik Oranı (Şubat)',
    onceki: '%8,6',
    beklenti: '%8,4',
  },
  {
    id: 'tr-dis-ticaret-feb',
    tarih: '2026-04-30',
    saat: '10:00',
    ulke: 'TR',
    onem: 'orta',
    baslik: 'Türkiye Dış Ticaret Dengesi (Şubat)',
    onceki: '-$7,2B',
  },
  {
    id: 'tr-tufe-apr',
    tarih: '2026-05-04',
    saat: '10:00',
    ulke: 'TR',
    onem: 'yuksek',
    baslik: 'Türkiye TÜFE (Nisan)',
    aciklama: 'Tüketici Fiyat Endeksi yıllık değişim',
    onceki: '%38,10',
    beklenti: '%35,8',
  },
  {
    id: 'tr-tcmb-faiz-may',
    tarih: '2026-05-22',
    saat: '14:00',
    ulke: 'TR',
    onem: 'yuksek',
    baslik: 'TCMB Faiz Kararı (Mayıs)',
    aciklama: 'Para Politikası Kurulu toplantısı',
    onceki: '%40,0',
    beklenti: '%37,5',
  },

  // === ABD ===
  {
    id: 'us-fed-apr',
    tarih: '2026-05-07',
    saat: '21:00',
    ulke: 'US',
    onem: 'yuksek',
    baslik: 'Fed Faiz Kararı (FOMC)',
    aciklama: 'Federal Açık Piyasa Komitesi toplantısı',
    onceki: '%4,25-%4,50',
    beklenti: '%4,25-%4,50',
  },
  {
    id: 'us-cpi-mar',
    tarih: '2026-04-10',
    saat: '15:30',
    ulke: 'US',
    onem: 'yuksek',
    baslik: 'ABD CPI (Mart)',
    aciklama: 'Tüketici Fiyat Endeksi yıllık değişim',
    onceki: '%2,8',
    beklenti: '%2,6',
    gerceklesen: '%2,4',
  },
  {
    id: 'us-nonfarm-apr',
    tarih: '2026-05-01',
    saat: '15:30',
    ulke: 'US',
    onem: 'yuksek',
    baslik: 'ABD Tarım Dışı İstihdam (Nisan)',
    onceki: '228K',
    beklenti: '135K',
  },
  {
    id: 'us-gdp-q1',
    tarih: '2026-04-30',
    saat: '15:30',
    ulke: 'US',
    onem: 'yuksek',
    baslik: 'ABD GSYİH 1Ç 2026 (Ön)',
    onceki: '%2,4',
    beklenti: '%0,4',
  },
  {
    id: 'us-retail-mar',
    tarih: '2026-04-16',
    saat: '15:30',
    ulke: 'US',
    onem: 'orta',
    baslik: 'ABD Perakende Satışlar (Mart)',
    onceki: '%0,2',
    beklenti: '%1,3',
    gerceklesen: '%1,4',
  },
  {
    id: 'us-pce-mar',
    tarih: '2026-04-30',
    saat: '15:30',
    ulke: 'US',
    onem: 'orta',
    baslik: 'ABD PCE Enflasyonu (Mart)',
    onceki: '%2,5',
    beklenti: '%2,3',
  },
  {
    id: 'us-ism-apr',
    tarih: '2026-05-01',
    saat: '17:00',
    ulke: 'US',
    onem: 'orta',
    baslik: 'ABD ISM İmalat PMI (Nisan)',
    onceki: '49,0',
    beklenti: '48,5',
  },

  // === Avrupa ===
  {
    id: 'eu-ecb-apr',
    tarih: '2026-04-17',
    saat: '15:15',
    ulke: 'EU',
    onem: 'yuksek',
    baslik: 'ECB Faiz Kararı',
    aciklama: 'Avrupa Merkez Bankası toplantısı',
    onceki: '%2,50',
    beklenti: '%2,25',
  },
  {
    id: 'eu-cpi-mar',
    tarih: '2026-04-02',
    saat: '12:00',
    ulke: 'EU',
    onem: 'orta',
    baslik: 'Euro Bölgesi HICP (Mart)',
    onceki: '%2,3',
    beklenti: '%2,2',
    gerceklesen: '%2,2',
  },
  {
    id: 'eu-gdp-q1',
    tarih: '2026-04-30',
    saat: '12:00',
    ulke: 'EU',
    onem: 'yuksek',
    baslik: 'Euro Bölgesi GSYİH 1Ç (İlk)',
    onceki: '%1,2',
    beklenti: '%1,0',
  },
  {
    id: 'eu-pmi-apr',
    tarih: '2026-04-23',
    saat: '11:00',
    ulke: 'EU',
    onem: 'orta',
    baslik: 'Avrupa Bölgesi PMI (Nisan)',
    onceki: '50,9',
    beklenti: '50,5',
  },
];

/** Bugünden itibaren gelen olaylar */
export function getUpcomingEvents(events: EkonomiEvent[]): EkonomiEvent[] {
  const today = new Date().toISOString().slice(0, 10);
  return events
    .filter((e) => e.tarih >= today)
    .sort((a, b) => a.tarih.localeCompare(b.tarih) || a.saat.localeCompare(b.saat));
}

/** Bir sonraki yüksek önemli olay */
export function getNextHighEvent(events: EkonomiEvent[]): EkonomiEvent | null {
  const today = new Date().toISOString().slice(0, 10);
  return (
    events
      .filter((e) => e.onem === 'yuksek' && e.tarih >= today && !e.gerceklesen)
      .sort((a, b) => a.tarih.localeCompare(b.tarih) || a.saat.localeCompare(b.saat))[0] ?? null
  );
}

/** Olayları tarihe göre grupla */
export function groupByDate(events: EkonomiEvent[]): Record<string, EkonomiEvent[]> {
  return events.reduce<Record<string, EkonomiEvent[]>>((acc, e) => {
    (acc[e.tarih] ??= []).push(e);
    return acc;
  }, {});
}
