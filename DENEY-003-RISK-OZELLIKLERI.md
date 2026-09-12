# DENEY-003 — B adaylarının ayrılmış dönemde doğrulanması

> **KİLİTLİ SPESİFİKASYON.** Kilit anı: bu dosyanın ilk commit'i (2026-09-12).
> Ayrılmış dönem (2021-09 → 2025-12) bu deneye kadar HİÇBİR özellik için hesaplanmadı.
> Hiçbir sonuç görülmeden kilitlendi; sonuç görüldükten sonra hiçbir tanım/eşik/dönem değişmez.
>
> Önceki: [DENEY-001](DENEY-001-CONFLUENCE-IC.md) (confluence KILL) ·
> [DENEY-002](DENEY-002-GERI-DONUS.md) (A: geri dönüş REDDEDİLDİ · B: keşif).

---

## 0. Soru

DENEY-002 B'de (2011–2021, KEŞİF) üç aday çıktı. Ayrılmış dönemde tekrar ediyorlar mı,
ve düşük volatilite bulgusu üç alternatif açıklamadan hangisiyle uyumlu?

| Hipotez | Aday | B'deki IC (keşif) | Beklenen işaret |
|---|---|---|---|
| **H3a (birincil)** | VOL20 — düşük volatilite | +0,0657 | pozitif |
| H3b | HACIM_SURPRIZ — 5g/60g hacim oranı | −0,0253 | negatif |
| H3c | SEKTOR_MOM20 — sektör 20g momentumu | +0,0126 | pozitif |

## 1. Ortak altyapı (DENEY-001/002 ile birebir — değiştirilmez)

- Veri: aynı önbellek, sha256 `fea6a0fa4283aaf3d3acd5e188029bcb14a0a19d03dd88498351bd72b34743c6`
- Aday hisse-gün: t ≥ 251, t+21 ≤ n−1, `[t−60, t+21]` içinde `|close/prevClose−1| > 0,25` yok
- Evren: günlük 20g ortalama TL hacimde ilk %60; evren < 20 → gün atlanır
- Hedef: `Y(10) = close_t+10 / open_t+1 − 1 − (aynı gün evren ortalaması)`
- Maliyet (tek yön): likidite yüzdeliği ≥80 → %0,15 · 60–80 → %0,25 · 40–60 → %0,40; gidiş-dönüş 2×
- Tavan kuralı: `open_t+1 ≥ close_t × 1,095` → alınamaz
- GA: hareketli blok bootstrap, blok 20 gün, 2.000 tekrar
- **Dönem: 2021-09-01 → 2025-12-31** (ayrılmış). 2026 yalnız KEŞİF olarak raporlanır.

## 2. Özellik tanımları (DENEY-002 B ile birebir aynı)

```
VOL20         = −stdev( ln(close_k / close_k−1) ), k = t−19..t
HACIM_SURPRIZ = ln( mean(volume, t−4..t) / mean(volume, t−64..t−5) )   (pay veya payda 0 → gözlem yok)
SEKTOR_MOM20  = evren içi sektör eşit ağırlıklı 20g getirisi (sektörde < 3 hisse → gözlem yok)
```

## 3. Birincil ölçüt ve çoklu test

Her aday için: günlük kesitsel Spearman IC (h=10), ortalaması ve blok bootstrap GA'sı.

- **Üç hipotez test edildiği için Bonferroni:** α = 0,05/3 → **%98,33 GA** karar için kullanılır.
  %95 GA da raporlanır ama karar %98,33'e göre verilir.
- H3a birincil, H3b ve H3c ikincil; hepsi aynı düzeltmeye tabidir.

## 4. Sağlamlık varyantları (önceden kayıtlı — üç alternatif açıklamayı ayırt eder)

| Varyant | Değişiklik | Neyi test eder |
|---|---|---|
| **V1 — sıkı temizlik** | Temizlik eşiği %25 → **%15** | Bozuk mumlar yapay volatilite üretip sonra "düzeliyor" mu? |
| **V2 — kuruşluk/sığ eleme** | `close_t ≥ 2 TL` **ve** likidite ilk **%40** | Etki yalnız manipüle/düşük fiyatlı hisselerden mi geliyor? |
| **V3 — desil profili** | Özellik desillerinin (D1…D10) ortalama `Y(10)`'u | Bilgi tüm sıralamada mı, yalnız en uç desilde mi? |

**V3 yorumu (önceden yazılı):** Bilgi yalnız en kötü desilde toplanmışsa (ör. yalnız en oynak
%10 evrenin belirgin altında, diğer desiller düz), bu **kaçınma bilgisidir**; açığa satış
olmadan getiriye çevrilemez → karar en fazla FEATURE olur.

**Kaçınma değeri ölçüsü:** `mean(Y(10) | en kötü desil hariç evren) − 0`, yani en kötü desili
dışlamanın evren ortalamasına katkısı (eşit ağırlıklı, maliyetsiz — bir filtre olarak değeri).

## 5. Ekonomik bariyer (her aday için ayrı)

Her 10 işlem gününde bir (çakışmayan), evrenin özelliğe göre **ilk %10'u** (VOL20 → en düşük
volatilite; HACIM_SURPRIZ → en düşük hacim sürprizi; SEKTOR_MOM20 → en güçlü sektör),
eşit ağırlık, tavan elemesi, maliyet sonrası ortalama net fazla getiri **> 0**.
Tavan elemesinden sonra < 5 hisse → o dönem nakit.

## 6. Kararlılık

Dönemdeki takvim yarıyıllarının (≥ 20 IC günü olan) **en az %60'ında** IC işareti beklenen yönde.

## 7. Karar tablosu (her aday için ayrı)

| %98,33 GA | Ekonomik bariyer | V1 ve V2'de işaret korunuyor | Karar |
|---|---|---|---|
| 0'ı dışlıyor, işaret beklenen yönde | geçiyor | evet | **DOĞRULANDI** |
| 0'ı dışlıyor, işaret beklenen yönde | geçmiyor **veya** V3 yalnız uç desil | evet | **FEATURE** (yalnız kaçınma/filtre değeri) |
| 0'ı dışlıyor ama V1 veya V2'de işaret kayboluyor | — | hayır | **AÇIKLANDI** (veri hatası / kuruşluk hisse etkisi) |
| 0'ı içeriyor veya işaret ters | — | — | **REDDEDİLDİ** |

## 8. Yasaklar

- Sonuca bakıp eşik, ufuk, dönem, evren, maliyet veya özellik tanımı değiştirmek.
- Yeni özellik eklemek (yeni deney numarası gerekir).
- 2026 sonuçlarını karar gerekçesi yapmak (KEŞİF).
- DOĞRULANDI çıkan bir özelliği, ürün kararı ayrıca verilmeden yüzeye çıkarmak.

## 9. Ürün sonucu (önceden yazılı)

- **DOĞRULANDI + ekonomik bariyer geçti:** sıralama motoruna aday; ürüne girişi ayrı karar,
  ileriye dönük kayıt şart.
- **FEATURE (kaçınma değeri):** "AL listesi" değil, **risk uyarısı / filtre** olarak değerlendirilir
  (fonlardaki `fon-sert-dusus` uyarısıyla aynı çerçeve). Mevzuat açısından da güvenli taraf.
- **AÇIKLANDI / REDDEDİLDİ:** kullanılmaz, defterde kalır.

## 10. Çıktılar

`scripts/deney-003.ts` → `deney-sonuclari/DENEY-003-sonuc.json` (git hash + önbellek sha256 ile).

## 11. Sonuç

**Koşu:** 2026-09-12, kod kilidi `f7036f6` (gerçek veriden ÖNCE commit'lendi),
çıktı `deney-sonuclari/DENEY-003-sonuc.json`. Karar dönemi 1.089 işlem günü,
evren medyanı 284 hisse. Ayrılmış dönem bu koşuyla **tüketildi**.

| Aday | IC (h=10) | %98,33 GA | V1 / V2 | Kararlılık | Bariyer (net/10g) | **Karar** |
|---|---|---|---|---|---|---|
| VOL20 | **+0,0770** | [+0,0528, +0,0985] | +0,082 / +0,085 | **9/9 yarıyıl** | −%0,25 (brüt +%0,29) | **FEATURE** |
| HACIM_SURPRIZ | **−0,0628** | [−0,0814, −0,0445] | −0,065 / −0,062 | **9/9 yarıyıl** | +%0,38 (GA %95 0'ı içeriyor) | **FEATURE** |
| SEKTOR_MOM20 | −0,0008 | [−0,0173, +0,0141] | +0,002 / −0,002 | 4/9 | −%0,35 | **REDDEDİLDİ** |

### 11.1 Ne oldu

- **İki aday ayrılmış dönemde tekrar etti.** VOL20 keşifteki +0,066'dan +0,077'ye,
  HACIM_SURPRIZ −0,025'ten −0,063'e çıktı; ikisi de Bonferroni düzeltmesinden sonra da
  0'ı dışlıyor ve **dokuz yarıyılın dokuzunda** beklenen yönde. Bu, DENEY-001 ve
  DENEY-002 A'dan sonra çalışmanın ilk doğrulanmış kesitsel bulgusu.
- **Ama hiçbiri para kazandırmıyor.** VOL20'nin ilk %10'u brüt +%0,29/10g üretiyor,
  maliyet sonrası **−%0,25**. Sıralama gerçek, ama farkın tamamı komisyonun altında.
  HACIM_SURPRIZ'in net +%0,38'i ise GA'sı 0'ı içerdiği için tesadüften ayrışmıyor.
- **HACIM_SURPRIZ'in bilgisi uçlarda.** Desil profili D1 +%0,92 … D10 −%1,25, aradaki
  sekiz desil ±%0,25 bandında düz. §4'te önceden yazıldığı gibi bu **kaçınma bilgisidir**:
  hacmi 5 günde patlamış hisselerden uzak durmanın değeri var, en sakin hisseleri almanın yok.
  **Kaçınma değeri: en kötü desili dışlamak +%0,141/10g [+%0,098, +%0,180]** — maliyetsiz
  bir filtre olarak 0'dan anlamlı biçimde büyük tek sonuç.
- **SEKTOR_MOM20 keşif gürültüsüymüş.** +0,0126 → −0,0008; işaret V1/V2 arasında bile
  dönüyor, yarıyılların yalnız %44'ünde pozitif.
- **Üç alternatif açıklamanın hiçbiri gerekmedi:** V1 (sıkı temizlik %15) ve V2 (≥2 TL +
  ilk %40 likidite) etkiyi zayıflatmadı, **güçlendirdi**. Yani bulgu ne veri hatasından ne de
  kuruşluk / manipüle hisselerden geliyor — likit, normal fiyatlı hisselerde de var.

### 11.2 Ürün sonucu (§9'a göre — yeni karar değil, önceden yazılmış kuralın uygulanması)

Her iki bulgu da **FEATURE**: AL listesi üretemez, **risk uyarısı / filtre** olarak
değerlendirilebilir (fonlardaki `fon-sert-dusus` ile aynı çerçeve). Somut aday:
*"bu hissenin hacmi son 5 günde 60 günlük ortalamasının çok üstüne çıkmış — tarihsel
olarak bu grup sonraki 10 günde evrenin %1,25 gerisinde kalmış"* biçiminde bir uyarı.
Yüzeye çıkarma ayrı karardır ve ileriye dönük kayıt şarttır.

### 11.3 KEŞİF (karara giremez, §8)

2026 (155 gün): VOL20 +0,050 · HACIM_SURPRIZ −0,077 · SEKTOR_MOM20 +0,014.
İlk ikisinin yönü sürüyor; bu bir doğrulama değil, yalnız not.

### 11.4 Bundan sonrası

Ayrılmış dönem tüketildi. VOL20 / HACIM_SURPRIZ üzerine kurulacak herhangi bir iddia artık
**yalnız ileriye dönük kayıtla** (swing sicili deseni) veya yeni bir veri kaynağıyla
sınanabilir. Bu deney, saf fiyat/hacim özelliklerinin BIST'te ulaştığı tavanı da gösteriyor:
**istatistiksel olarak sağlam, ekonomik olarak komisyonun altında.**
