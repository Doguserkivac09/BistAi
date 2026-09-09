/**
 * BES kategori çıkarımı — birim testleri.
 *
 * ⚠️ NEDEN VAR (canlıda ölçüldü, 2026-09-09): TEFAS'ın `sfonTurKod` filtresi EMK
 * (BES) evreninde ÇALIŞMIYOR — geçersiz filtreyi yok sayıp her kategori sorgusuna
 * TÜM evreni döndürüyor. Sonuç: 400 BES fonunun tamamı kategorisiz kaldı, emsal
 * grubu kurulamadı ve **skorların hepsi null** oldu. Kategori artık fon adından
 * çıkarılıyor; bu dosya çıkarımın ÖNCELİK SIRASINI kilitler.
 *
 * Öncelik yanlış olursa emsal grupları bozulur ve "risk-ayarlı sıralama"
 * elma-armut kıyasına döner — sessiz ve tehlikeli bir hata.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { guessBesCategory, categoryLabel } from '../fund-universe';

describe('guessBesCategory — öncelik sırası', () => {
  it('KATILIM varlık sınıfını YENER (TEFAS taksonomisi: ayrı şemsiye)', () => {
    // Gerçek ad deseni: katılım fonları hisse/değişken de olsa 114'te toplanır
    assert.equal(guessBesCategory('X EMEKLİLİK KATILIM HİSSE SENEDİ EYF'), 114);
    assert.equal(guessBesCategory('Y KATILIM STANDART EMEKLİLİK YATIRIM FONU'), 114);
    assert.equal(guessBesCategory('Z OKS KATILIM DEĞİŞKEN EYF'), 114);
  });

  it('açık varlık sınıfı Değişken/Karma önüne geçer', () => {
    assert.equal(guessBesCategory('A HİSSE SENEDİ EMEKLİLİK YATIRIM FONU'), 104);
    assert.equal(guessBesCategory('B KAMU BORÇLANMA ARAÇLARI EYF'), 100);
    assert.equal(guessBesCategory('C ALTIN EMEKLİLİK YATIRIM FONU'), 105);
    assert.equal(guessBesCategory('D PARA PİYASASI EYF'), 107);
    assert.equal(guessBesCategory('E FON SEPETİ EMEKLİLİK YATIRIM FONU'), 102);
  });

  it('KATKI fonları borçlanma sayılır (mevzuat gereği tahvil ağırlıklı)', () => {
    assert.equal(guessBesCategory('F KATKI EMEKLİLİK YATIRIM FONU'), 100);
  });

  it('çok varlıklı OKS türevleri Karma\'ya düşer', () => {
    assert.equal(guessBesCategory('G OKS AGRESİF EMEKLİLİK YATIRIM FONU'), 110);
    assert.equal(guessBesCategory('H OKS DENGELİ EYF'), 110);
    assert.equal(guessBesCategory('I OKS TEMKİNLİ EYF'), 110);
    assert.equal(guessBesCategory('J OKS STANDART EMEKLİLİK YATIRIM FONU'), 110);
    assert.equal(guessBesCategory('K BAŞLANGIÇ EMEKLİLİK YATIRIM FONU'), 110);
  });

  it('DEĞİŞKEN, Karma türevlerinden ÖNCE gelir', () => {
    assert.equal(guessBesCategory('L OKS AGRESİF DEĞİŞKEN EYF'), 101);
  });

  it('⚠️ eşleşme yoksa null — uydurma kategori ATANMAZ', () => {
    assert.equal(guessBesCategory('M TANIMSIZ ÖZEL FON'), null);
    assert.equal(guessBesCategory(''), null);
    assert.equal(guessBesCategory(null), null);
    assert.equal(guessBesCategory(undefined), null);
  });

  it('küçük harf/karışık yazım da eşleşir (tr-locale)', () => {
    assert.equal(guessBesCategory('n emeklilik katılım hisse senedi eyf'), 114);
    assert.equal(guessBesCategory('o Hisse Senedi Emeklilik Yatırım Fonu'), 104);
  });

  it('döndürülen her kod gerçek bir kategori etiketine karşılık gelir', () => {
    for (const ad of ['X KATILIM EYF', 'Y HİSSE SENEDİ EYF', 'Z ALTIN EYF',
                      'W PARA PİYASASI EYF', 'V FON SEPETİ EYF', 'U BORÇLANMA EYF',
                      'T DEĞİŞKEN EYF', 'S OKS DENGELİ EYF']) {
      const kod = guessBesCategory(ad);
      assert.ok(kod != null, `${ad} eşleşmeli`);
      assert.ok(categoryLabel(kod) != null, `${kod} için etiket olmalı`);
    }
  });
});
