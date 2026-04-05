/**
 * KAP (Kamuyu Aydınlatma Platformu) veri tipleri.
 */

export interface KapDuyuru {
  id: string;
  baslik: string;
  sirket: string;
  sembol: string;
  kategoriAdi: string;
  tarih: string;
  url: string;
}
