export type Ulke = 'TR' | 'US' | 'EU';
export type Kategori = 'faiz' | 'enflasyon' | 'istihdam' | 'buyume' | 'pmi' | 'ticaret' | 'diger';
export type Onem = 'yuksek' | 'orta' | 'dusuk';

export interface EkonomiEvent {
  id: string;
  tarih: string; // YYYY-MM-DD
  saat: string;  // TRT (UTC+3) "HH:MM"
  ulke: Ulke;
  kategori: Kategori;
  baslik: string;
  aciklama?: string;
  onem: Onem;
  onceki?: string;
  beklenti?: string;
  gerceklesen?: string;
}

// ─── Statik takvim verisi (2026 Q1-Q3) ──────────────────────────────────────

export const EKONOMI_EVENTS: EkonomiEvent[] = [
  // ── MART 2026 (geçmiş) ──────────────────────────────────────────────────────
  {
    id: 'tr-tufe-2026-03',
    tarih: '2026-03-03',
    saat: '10:00',
    ulke: 'TR',
    kategori: 'enflasyon',
    baslik: 'TÜFE (Mart)',
    aciklama: 'Tüketici Fiyat Endeksi yıllık değişim',
    onem: 'yuksek',
    onceki: '%67.07',
    beklenti: '%65.0',
    gerceklesen: '%63.14',
  },
  {
    id: 'us-nfp-2026-03',
    tarih: '2026-03-06',
    saat: '16:30',
    ulke: 'US',
    kategori: 'istihdam',
    baslik: 'Tarım Dışı İstihdam (Şubat)',
    aciklama: 'Non-Farm Payrolls aylık değişim',
    onem: 'yuksek',
    onceki: '143K',
    beklenti: '155K',
    gerceklesen: '151K',
  },
  {
    id: 'us-cpi-2026-03',
    tarih: '2026-03-12',
    saat: '16:30',
    ulke: 'US',
    kategori: 'enflasyon',
    baslik: 'CPI (Şubat)',
    aciklama: 'ABD Tüketici Fiyat Endeksi yıllık',
    onem: 'yuksek',
    onceki: '%3.0',
    beklenti: '%2.9',
    gerceklesen: '%2.8',
  },
  {
    id: 'us-fomc-2026-03',
    tarih: '2026-03-19',
    saat: '21:00',
    ulke: 'US',
    kategori: 'faiz',
    baslik: 'Fed Faiz Kararı (FOMC)',
    aciklama: 'Federal Open Market Committee toplantısı',
    onem: 'yuksek',
    onceki: '%4.25-%4.50',
    beklenti: '%4.25-%4.50',
    gerceklesen: '%4.25-%4.50',
  },
  {
    id: 'tcmb-2026-03',
    tarih: '2026-03-20',
    saat: '14:00',
    ulke: 'TR',
    kategori: 'faiz',
    baslik: 'TCMB Faiz Kararı',
    aciklama: 'Para Politikası Kurulu faiz kararı',
    onem: 'yuksek',
    onceki: '%42.5',
    beklenti: '%40.0',
    gerceklesen: '%40.0',
  },
  {
    id: 'tr-gsyh-2026-q4',
    tarih: '2026-03-31',
    saat: '10:00',
    ulke: 'TR',
    kategori: 'buyume',
    baslik: 'GSYİH Q4 2025',
    aciklama: '2025 yılı son çeyrek büyüme verisi',
    onem: 'yuksek',
    onceki: '%2.1',
    beklenti: '%2.5',
    gerceklesen: '%2.4',
  },
  // ── NİSAN 2026 ──────────────────────────────────────────────────────────────
  {
    id: 'tr-tufe-2026-04',
    tarih: '2026-04-03',
    saat: '10:00',
    ulke: 'TR',
    kategori: 'enflasyon',
    baslik: 'TÜFE (Nisan)',
    aciklama: 'Tüketici Fiyat Endeksi yıllık değişim',
    onem: 'yuksek',
    onceki: '%63.14',
    beklenti: '%60.0',
  },
  {
    id: 'tr-ufe-2026-04',
    tarih: '2026-04-03',
    saat: '10:00',
    ulke: 'TR',
    kategori: 'enflasyon',
    baslik: 'ÜFE (Nisan)',
    aciklama: 'Üretici Fiyat Endeksi yıllık değişim',
    onem: 'orta',
    onceki: '%31.2',
  },
  {
    id: 'us-nfp-2026-04',
    tarih: '2026-04-03',
    saat: '16:30',
    ulke: 'US',
    kategori: 'istihdam',
    baslik: 'Tarım Dışı İstihdam (Mart)',
    aciklama: 'Non-Farm Payrolls aylık değişim',
    onem: 'yuksek',
    onceki: '151K',
    beklenti: '160K',
  },
  {
    id: 'us-cpi-2026-04',
    tarih: '2026-04-10',
    saat: '16:30',
    ulke: 'US',
    kategori: 'enflasyon',
    baslik: 'CPI (Mart)',
    aciklama: 'ABD Tüketici Fiyat Endeksi yıllık',
    onem: 'yuksek',
    onceki: '%2.8',
    beklenti: '%2.6',
  },
  {
    id: 'eu-ecb-2026-04',
    tarih: '2026-04-17',
    saat: '15:15',
    ulke: 'EU',
    kategori: 'faiz',
    baslik: 'ECB Faiz Kararı',
    aciklama: 'Avrupa Merkez Bankası Para Politikası Kararı',
    onem: 'yuksek',
    onceki: '%2.5',
    beklenti: '%2.25',
  },
  {
    id: 'tcmb-2026-04',
    tarih: '2026-04-17',
    saat: '14:00',
    ulke: 'TR',
    kategori: 'faiz',
    baslik: 'TCMB Faiz Kararı',
    aciklama: 'Para Politikası Kurulu faiz kararı',
    onem: 'yuksek',
    onceki: '%40.0',
    beklenti: '%37.5',
  },
  {
    id: 'us-gdp-q1-2026',
    tarih: '2026-04-29',
    saat: '16:30',
    ulke: 'US',
    kategori: 'buyume',
    baslik: 'ABD GSYİH Q1 2026 (İlk)',
    aciklama: 'ABD ilk çeyrek büyüme tahmin verisi',
    onem: 'yuksek',
    onceki: '%2.3',
    beklenti: '%2.0',
  },
  {
    id: 'us-pce-2026-04',
    tarih: '2026-04-30',
    saat: '16:30',
    ulke: 'US',
    kategori: 'enflasyon',
    baslik: 'ABD PCE Enflasyon (Mart)',
    aciklama: "Fed'in tercih ettiği enflasyon göstergesi",
    onem: 'yuksek',
    onceki: '%2.5',
    beklenti: '%2.4',
  },
  {
    id: 'tr-cari-2026-04',
    tarih: '2026-04-14',
    saat: '10:00',
    ulke: 'TR',
    kategori: 'ticaret',
    baslik: 'Cari İşlemler Dengesi (Şubat)',
    aciklama: 'Türkiye cari hesap dengesi',
    onem: 'orta',
    onceki: '-3.2B$',
  },
  {
    id: 'tr-sanayi-2026-04',
    tarih: '2026-04-14',
    saat: '10:00',
    ulke: 'TR',
    kategori: 'buyume',
    baslik: 'Sanayi Üretimi (Şubat)',
    aciklama: 'Aylık sanayi üretim endeksi',
    onem: 'orta',
    onceki: '%3.1',
  },
  {
    id: 'eu-pmi-2026-04',
    tarih: '2026-04-23',
    saat: '11:00',
    ulke: 'EU',
    kategori: 'pmi',
    baslik: 'Euro Bölgesi Bileşik PMI (Nisan)',
    aciklama: 'Purchasing Managers Index — bileşik',
    onem: 'orta',
    onceki: '50.2',
    beklenti: '50.5',
  },
  {
    id: 'us-pmi-2026-04',
    tarih: '2026-04-23',
    saat: '16:45',
    ulke: 'US',
    kategori: 'pmi',
    baslik: 'ABD Bileşik PMI (Nisan)',
    aciklama: 'S&P Global Bileşik PMI',
    onem: 'orta',
    onceki: '51.6',
    beklenti: '51.8',
  },
  // ── MAYIS 2026 ──────────────────────────────────────────────────────────────
  {
    id: 'us-fomc-2026-05',
    tarih: '2026-05-07',
    saat: '21:00',
    ulke: 'US',
    kategori: 'faiz',
    baslik: 'Fed Faiz Kararı (FOMC)',
    aciklama: 'Federal Open Market Committee toplantısı',
    onem: 'yuksek',
    onceki: '%4.25-%4.50',
    beklenti: '%4.00-%4.25',
  },
  {
    id: 'tr-tufe-2026-05',
    tarih: '2026-05-05',
    saat: '10:00',
    ulke: 'TR',
    kategori: 'enflasyon',
    baslik: 'TÜFE (Mayıs)',
    aciklama: 'Tüketici Fiyat Endeksi yıllık değişim',
    onem: 'yuksek',
    onceki: '%60.0',
    beklenti: '%57.0',
  },
  {
    id: 'us-nfp-2026-05',
    tarih: '2026-05-01',
    saat: '16:30',
    ulke: 'US',
    kategori: 'istihdam',
    baslik: 'Tarım Dışı İstihdam (Nisan)',
    aciklama: 'Non-Farm Payrolls aylık değişim',
    onem: 'yuksek',
    onceki: '160K',
    beklenti: '155K',
  },
  {
    id: 'tcmb-2026-05',
    tarih: '2026-05-22',
    saat: '14:00',
    ulke: 'TR',
    kategori: 'faiz',
    baslik: 'TCMB Faiz Kararı',
    aciklama: 'Para Politikası Kurulu faiz kararı',
    onem: 'yuksek',
    onceki: '%37.5',
    beklenti: '%35.0',
  },
  {
    id: 'us-cpi-2026-05',
    tarih: '2026-05-13',
    saat: '16:30',
    ulke: 'US',
    kategori: 'enflasyon',
    baslik: 'CPI (Nisan)',
    aciklama: 'ABD Tüketici Fiyat Endeksi yıllık',
    onem: 'yuksek',
    onceki: '%2.6',
    beklenti: '%2.5',
  },
  // ── HAZİRAN 2026 ────────────────────────────────────────────────────────────
  {
    id: 'tr-tufe-2026-06',
    tarih: '2026-06-03',
    saat: '10:00',
    ulke: 'TR',
    kategori: 'enflasyon',
    baslik: 'TÜFE (Haziran)',
    aciklama: 'Tüketici Fiyat Endeksi yıllık değişim',
    onem: 'yuksek',
    onceki: '%57.0',
    beklenti: '%53.0',
  },
  {
    id: 'eu-ecb-2026-06',
    tarih: '2026-06-05',
    saat: '15:15',
    ulke: 'EU',
    kategori: 'faiz',
    baslik: 'ECB Faiz Kararı',
    aciklama: 'Avrupa Merkez Bankası Para Politikası Kararı',
    onem: 'yuksek',
    onceki: '%2.25',
    beklenti: '%2.0',
  },
  {
    id: 'us-fomc-2026-06',
    tarih: '2026-06-18',
    saat: '21:00',
    ulke: 'US',
    kategori: 'faiz',
    baslik: 'Fed Faiz Kararı (FOMC)',
    aciklama: 'Federal Open Market Committee toplantısı',
    onem: 'yuksek',
    onceki: '%4.00-%4.25',
    beklenti: '%3.75-%4.00',
  },
  {
    id: 'tcmb-2026-06',
    tarih: '2026-06-19',
    saat: '14:00',
    ulke: 'TR',
    kategori: 'faiz',
    baslik: 'TCMB Faiz Kararı',
    aciklama: 'Para Politikası Kurulu faiz kararı',
    onem: 'yuksek',
    onceki: '%35.0',
    beklenti: '%32.5',
  },
  {
    id: 'us-nfp-2026-06',
    tarih: '2026-06-05',
    saat: '16:30',
    ulke: 'US',
    kategori: 'istihdam',
    baslik: 'Tarım Dışı İstihdam (Mayıs)',
    aciklama: 'Non-Farm Payrolls aylık değişim',
    onem: 'yuksek',
    onceki: '155K',
    beklenti: '158K',
  },
  {
    id: 'tr-gsyh-2026-q1',
    tarih: '2026-06-30',
    saat: '10:00',
    ulke: 'TR',
    kategori: 'buyume',
    baslik: 'GSYİH Q1 2026',
    aciklama: '2026 yılı ilk çeyrek büyüme verisi',
    onem: 'yuksek',
    onceki: '%2.4',
    beklenti: '%3.0',
  },
];

// ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

/** Bugünden itibaren yaklaşan olayları döndür */
export function getUpcomingEvents(events: EkonomiEvent[], limit?: number): EkonomiEvent[] {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events
    .filter((e) => e.tarih >= today)
    .sort((a, b) => a.tarih.localeCompare(b.tarih) || a.saat.localeCompare(b.saat));
  return limit ? upcoming.slice(0, limit) : upcoming;
}

/** Bir sonraki yüksek önemli olay */
export function getNextHighEvent(events: EkonomiEvent[]): EkonomiEvent | null {
  const today = new Date().toISOString().slice(0, 10);
  return (
    events
      .filter((e) => e.tarih >= today && e.onem === 'yuksek')
      .sort((a, b) => a.tarih.localeCompare(b.tarih))[0] ?? null
  );
}

/** Tarihe göre grupla */
export function groupByDate(events: EkonomiEvent[]): Record<string, EkonomiEvent[]> {
  return events.reduce<Record<string, EkonomiEvent[]>>((acc, e) => {
    (acc[e.tarih] ??= []).push(e);
    return acc;
  }, {});
}
