/**
 * Fon evreni kayıt defteri (FON-ANALIZ-PLAN FAZ F1).
 *
 * Kategori, kalibrasyon kuralının TEMELİDİR: bayraklar mutlak eşikle değil, fonun
 * KENDİ kategorisindeki akranlarıyla karşılaştırılarak üretilir (hisse fonu hisse
 * fonlarıyla, para piyasası para piyasasıyla). Bu proje aynı dersi iki kez canlı
 * veride öğrendi (banka K1 reel-ROE, banka K2 NIM trendi) — üçüncüsü olmasın.
 *
 * SAF/deterministik — fetch YOK.
 */

/** TEFAS `fonTipi` kodları. BES aynı uçtan, yalnız tip farkıyla gelir (F0-2 doğrulandı). */
export type FundUniverse = 'TEFAS' | 'BES';

export const UNIVERSE_TO_FONTIPI: Record<FundUniverse, string> = {
  TEFAS: 'YAT', // menkul kıymet yatırım fonları
  BES: 'EMK',   // emeklilik yatırım fonları
};

/**
 * Şemsiye fon türleri — TEFAS `fonTurGetir` ucundan CANLI doğrulandı (12 tür).
 * `sfonTuru` kodları TEFAS'ın kendi kodlarıdır; ad değişse de kod sabit kalır.
 */
export const FUND_CATEGORIES = [
  { code: 100, label: 'Borçlanma Araçları', risk: 'düşük' },
  { code: 101, label: 'Değişken', risk: 'orta' },
  { code: 102, label: 'Fon Sepeti', risk: 'orta' },
  { code: 103, label: 'Garantili', risk: 'düşük' },
  { code: 173, label: 'Gayrimenkul', risk: 'yüksek' },
  { code: 172, label: 'Girişim Sermayesi', risk: 'yüksek' },
  { code: 104, label: 'Hisse Senedi', risk: 'yüksek' },
  { code: 110, label: 'Karma', risk: 'orta' },
  { code: 114, label: 'Katılım', risk: 'orta' },
  { code: 105, label: 'Kıymetli Madenler', risk: 'yüksek' },
  { code: 107, label: 'Para Piyasası', risk: 'düşük' },
  { code: 108, label: 'Serbest', risk: 'yüksek' },
] as const;

export type FundCategoryCode = (typeof FUND_CATEGORIES)[number]['code'];

export function categoryLabel(code: number | null | undefined): string | null {
  return FUND_CATEGORIES.find((c) => c.code === code)?.label ?? null;
}

/**
 * BES fon adından KATEGORİ çıkarımı.
 *
 * ⚠️ NEDEN GEREKLİ (canlıda ölçüldü, 2026-09-09): TEFAS'ın `sfonTurKod` filtresi
 * **EMK (BES) evreninde ÇALIŞMIYOR** — geçersiz filtreyi yok sayıp her kategori
 * sorgusuna TÜM evreni döndürüyor (12 sorgu × 400 fon = 4.800 çakışan kayıt →
 * 400 fonun tamamı kategorisiz kaldı, dolayısıyla emsal grubu ve SKOR üretilemedi).
 * Günlük satırda da kategori alanı YOK (ham yanıt dökümüyle doğrulandı).
 *
 * Bu yüzden ad-tabanlı çıkarım — `guessAccessibility` ile aynı desen ve aynı
 * dürüstlük kuralı: sonuç bir TAHMİNDİR. Eşleşme yoksa `null` döner ve fon
 * kategorisiz kalır (uydurma kategori ATANMAZ; skorsuz görünür, bu dürüsttür).
 *
 * Öncelik sırası TEFAS'ın kendi taksonomisini izler: **Katılım ayrı bir şemsiyedir**
 * (varlık sınıfından önce gelir), sonra açık varlık sınıfı, en son çok-varlıklı
 * OKS/dengeli türevleri Karma'ya düşer.
 */
export function guessBesCategory(name: string | null | undefined): number | null {
  if (!name) return null;
  const u = name.toLocaleUpperCase('tr');

  // 1) Katılım — TEFAS'ta ayrı şemsiye (114); varlık sınıfından ÖNCE gelir
  if (u.includes('KATILIM')) return 114;

  // 2) Açık varlık sınıfları
  if (u.includes('KIYMETLİ MADEN') || u.includes('ALTIN') || u.includes('GÜMÜŞ')) return 105;
  if (u.includes('FON SEPETİ')) return 102;
  if (u.includes('PARA PİYASASI') || u.includes('LİKİT')) return 107;
  if (u.includes('HİSSE SENEDİ') || u.includes('ENDEKS')) return 104;
  if (u.includes('BORÇLANMA') || u.includes('KAMU') || u.includes('ÖZEL SEKTÖR') ||
      u.includes('TAHVİL') || u.includes('BONO') || u.includes('KATKI')) return 100;

  // 3) Değişken
  if (u.includes('DEĞİŞKEN')) return 101;

  // 4) Çok varlıklı OKS/BES türevleri → Karma
  if (u.includes('KARMA') || u.includes('DENGELİ') || u.includes('AGRESİF') ||
      u.includes('TEMKİNLİ') || u.includes('ATAK') || u.includes('STANDART') ||
      u.includes('BAŞLANGIÇ')) return 110;

  return null; // eşleşme yok → kategorisiz (uydurma YOK)
}

/**
 * Erişilebilirlik — "sen bunu alabilir misin?" (plan F4-2 madde 7).
 *
 * ⚠️ TEFAS'ta bunu veren bir ALAN YOK (F0 spike'ında arandı, bulunamadı). Bu yüzden
 * fon ADINDAN sezgisel çıkarım yapılır ve sonuç `tahmin` olarak ETİKETLENİR — kesin
 * bilgi gibi sunulmaz. Yanlış tarafta hata yapmamak için kural muhafazakârdır:
 * şüphede kalınırsa "herkes" denmez, "bilinmiyor" denir.
 *
 * Neden önemli: getiri sıralamasının tepesi serbest/özel fonlarla dolu; filtresiz
 * göstermek kullanıcıyı alamayacağı ürüne yönlendirir.
 */
export type FundAccessibility = 'herkes' | 'nitelikli' | 'kurucuya-özel' | 'bilinmiyor';

export interface AccessibilityGuess {
  value: FundAccessibility;
  /** Kaynak her zaman açıkça taşınır — UI "tahmin" olduğunu göstermek zorunda */
  source: 'ad-tabanlı-tahmin';
  reason: string | null;
}

export function guessAccessibility(fonUnvan: string): AccessibilityGuess {
  const ad = (fonUnvan ?? '').toLocaleUpperCase('tr-TR');

  // "ÖZEL FON" = belirli bir kurucuya/gruba tahsisli
  if (ad.includes('ÖZEL FON') || ad.includes('ÖZEL (')) {
    return { value: 'kurucuya-özel', source: 'ad-tabanlı-tahmin', reason: 'Adında "özel fon" geçiyor' };
  }
  // Serbest fonlar Türkiye'de tipik olarak nitelikli yatırımcıya satılır.
  // "tipik olarak" → kesin değil; bu yüzden 'nitelikli' deyip kaynağı etiketliyoruz.
  if (ad.includes('SERBEST')) {
    return { value: 'nitelikli', source: 'ad-tabanlı-tahmin', reason: 'Serbest fon — genelde nitelikli yatırımcı şartı' };
  }
  if (ad.includes('NİTELİKLİ')) {
    return { value: 'nitelikli', source: 'ad-tabanlı-tahmin', reason: 'Adında "nitelikli" geçiyor' };
  }
  return { value: 'herkes', source: 'ad-tabanlı-tahmin', reason: null };
}

/** Kategori kodunu fon adından TAHMİN etmez — kod TEFAS'tan gelir. Bu yalnız görüntü içindir. */
export function isEquityHeavy(fonUnvan: string): boolean {
  return (fonUnvan ?? '').toLocaleUpperCase('tr-TR').includes('HİSSE SENEDİ YOĞUN');
}
