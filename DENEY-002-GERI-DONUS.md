# DENEY-002 — Kısa vadeli geri dönüş (doğrulama) + basit fiyat özellikleri (keşif)

> **KİLİTLİ SPESİFİKASYON.** Kilit anı: bu dosyanın ilk commit'i (2026-09-11).
> Hiçbir A sonucu görülmeden kilitlendi. Aşağıdaki hiçbir tanım, eşik, dönem veya kural
> sonuç görüldükten sonra DEĞİŞTİRİLEMEZ.
>
> Önceki deney: [DENEY-001](DENEY-001-CONFLUENCE-IC.md) (confluence → KILL).
> Tasarım: Claude ↔ ChatGPT tartışması, kullanıcı onayı (2026-09-11).

---

## 0. Yapı

| Bölüm | Rol | Dönem | Karar verir mi |
|---|---|---|---|
| **A — Doğrulama** | Tek hipotez (H2) | 2001–2010 (veri kapısıyla) | **Evet** |
| **B — Keşif** | Hipotez üretme laboratuvarı | 2011-01 → 2021-08 | **Hayır** |
| Ayrılmış | DENEY-003 doğrulaması için dokunulmaz | 2021-09 → 2025-12 | — |
| İleriye dönük | Gerçek doğrulama | 2026-09 → | — |

### 0.1 A ↔ B duvarı (kırmızı çizgi)

1. **A'nın kararı yalnız A'nın ölçütlerinden çıkar.** B'de üretilen hiçbir sayı, eşik, özellik, ufuk
   veya gözlem A'nın tanımını, hedefini, evrenini, dönemini, maliyet modelini veya kararını etkileyemez.
2. **A tek hipotezdir.** A bölümünde REV5 dışında hiçbir özellik hesaplanmaz, raporlanmaz.
   Böylece 2001–2010 dönemi diğer özellikler için dokunulmamış kalır.
3. **A kodu, B kodundan önce çalıştırılır ve A sonucu ayrı commit'lenir.** B, A sonucu commit'lenmeden koşulmaz.
4. **H2 sonucu görüldükten sonra** REV5 tanımı (5 gün), hedef (10 günlük eşit ağırlıklı evren fazla getirisi),
   evren kapısı, veri kalitesi kapısı ve maliyet modeli **hiçbir gerekçeyle değiştirilmez**.
   Başka pencere (3/7/10 gün) veya ufuk denemek = yeni deney numarası + defter satırı.
5. **B hiçbir koşulda karar üretmez.** B'den çıkan her şey DENEY-003 için hipotez adayıdır ve yalnız
   ayrılmış dönemde (2021-09 → 2025-12) veya ileriye dönük veride doğrulanabilir.
6. **Ayrılmış dönem (2021-09 → 2025-12) bu deneyde hiçbir özellik için hesaplanmaz.**

---

## 1. Ortak altyapı (DENEY-001 ile birebir aynı — değiştirilmez)

- **Veri:** DENEY-001 önbelleği, sha256 `fea6a0fa4283aaf3d3acd5e188029bcb14a0a19d03dd88498351bd72b34743c6`
  (Yahoo, 2000-01 → 2026-09, ham OHLCV, 618 sembol).
- **Aday hisse-gün:** t ≥ 251 ve t+21 ≤ n−1; `[t−60, t+21]` içinde `|close/prevClose − 1| > 0,25` olan gün yok.
- **Evren:** her gün 20 günlük ortalama TL hacimde ilk %60. Evren < 20 hisse → gün atlanır.
- **Hedef:** `Y(10) = close_t+10 / open_t+1 − 1 − (aynı gün evren ortalaması)`.
- **Maliyet (tek yön):** likidite yüzdeliği ≥ 80 → %0,15 · 60–80 → %0,25 · 40–60 → %0,40; gidiş-dönüş = 2×.
- **Tavan kuralı:** `open_t+1 ≥ close_t × 1,095` → alınamaz.
- **Güven aralığı:** hareketli blok bootstrap, blok 20 gün, 2.000 tekrar.
- **MDE:** 500 plasebo (gün içi skor karıştırma), MDE = 2,8 × SE.

---

## 2. A — DOĞRULAMA

### 2.1 Hipotez

> **H2:** 5 günlük geri dönüş, aynı gün likit BIST evreninde 10 günlük evren fazla getirisini pozitif sıralar.

**Kirlilik beyanı:** H2, DENEY-001'in 2011–2021 karar döneminde bir kıyas olarak görüldü (ham IC +0,0078).
Bu yüzden 2011–2021 H2 için kanıt SAYILMAZ. 2001–2010'da REV5 hiç hesaplanmadı. Kısa vadeli geri dönüş
ayrıca literatürde bağımsız olarak belgelenmiş bir anomalidir (önsel olasılık sıfır değil).

### 2.2 Özellik (tek)
```
REV5_i,t = −(close_i,t / close_i,t−5 − 1)
```

### 2.3 Veri kalitesi kapısı → A döneminin başlangıcı

Kapı yalnız veri özelliklerine bakar; REV5 veya getiri hesaplanmadan uygulanır. Her takvim yılı Y ∈ 2001…2010:
- (a) günlük evren büyüklüğü medyanı **≥ 100**
- (b) temizlik filtresiyle elenen hisse-gün oranı **≤ %15**
- (c) verisi olan hisse-günlerde `volume = 0` oranı **≤ %10**

**Y₂\*** = Y..2010 yıllarının hepsinin geçtiği en erken Y. **A dönemi: Y₂\*-01-01 → 2010-12-31.**
- Y₂\* bulunamazsa veya **Y₂\* > 2007** (4 tam yıldan az) → **A = YETERSİZ VERİ**, karar yok, H2 yalnız ileriye dönük doğrulanır.

**Eşik 100'ün gerekçesi (DENEY-001'deki 150 yerine) — sonuca değil veri gereksinimine dayanır:**
1. **Neden farklı:** 2011–2021 H2 için kirli olduğundan doğrulama zorunlu olarak 2001–2010'da yapılmalı. Bu dönemin evren
   büyüklüğü DENEY-001 kapı çıktısında görüldü (2005–2010 medyanları 124–145). Bu bir **veri özelliğidir**;
   REV5'in o dönemdeki davranışı hiç görülmedi.
2. **Alt sınır neden 100:** Ekonomik bariyer evrenin %10'unu alır ve tavan elemesinden sonra **en az 5 hisse** ister.
   Evren 100 iken portföy ~10 hisse → tavan elemesine karşı ~2 kat pay. Evren 50'nin altında bariyer
   sistematik olarak nakde düşerdi.
3. **Kesitsel IC gürültüsü:** günlük IC standart hatası ≈ 1/√n. n=100 → 0,10; n=150 → 0,08.
   Fark küçük; dönem uzunluğu (≈ 2.000 gün) bu farkı fazlasıyla telafi eder. MDE plaseboyla ayrıca hesaplanıp raporlanır.
4. (b) ve (c) eşikleri DENEY-001 ile aynı tutuldu.

### 2.4 Birincil ölçüt
```
r_R = yüzdelik sıra(REV5), r_Y = yüzdelik sıra(Y(10))   (eşitlikte ortalama sıra)
IC_t = Pearson(r_R, r_Y)        (günlük Spearman)
PRIMARY_A = mean_t IC_t,  t ∈ A dönemi
```
Ayrıştırma YOK (momentum A döneminde hesaplanmaz — §0.1/2).

### 2.5 Bariyerler
- **Ekonomik:** A döneminin ilk gününden her 10 işlem gününde bir, evrenin **REV5'e göre ilk %10'u**
  (en çok düşenler; eşitlikte yüksek likidite önce), tavan elemesi, tavan sonrası < 5 hisse → nakit,
  eşit ağırlık, `Y(10) − maliyet`. Dönemlerin ortalama net fazla getirisi **> 0**.
- **Kararlılık:** A dönemindeki takvim yarıyıllarının (≥ 20 IC günü olanlar) **en az %60'ında** yarıyıl ortalama IC > 0.

### 2.6 Karar tablosu (A)
| PRIMARY_A | Ekonomik + kararlılık | Karar |
|---|---|---|
| > 0 ve GA 0'ı dışlıyor | ikisi de geçiyor | **DOĞRULANDI** (tarihsel) — ürüne girmez, ileriye dönük kayda alınır |
| > 0 ve GA 0'ı dışlıyor | biri geçmiyor | **FEATURE** — bilgi var, tek başına işlem yapılamaz |
| GA 0'ı içeriyor veya ≤ 0 | — | **REDDEDİLDİ** |
| Y₂\* yok / > 2007 | — | **YETERSİZ VERİ** |

**Önceden kayıtlı beklenti:** Kısa vadeli geri dönüşün önemli kısmı mikro yapı etkisidir ve devir hızı yüksektir.
En olası "başarısızlık" noktası ekonomik bariyerdir → FEATURE sonucu yüksek olasılıklıdır.

### 2.7 A zorunlu raporları (karar vermez, yalnız REV5)
1. Kapı tablosu + Y₂\*
2. Pozitif IC günü oranı, yarıyıl IC serisi
3. Rejim bazında IC (DENEY-001 rejim tanımı)
4. Bariyer: dönem sayısı, nakit dönem, brüt ve net fazla getiri, ortalama portföy büyüklüğü
5. KEŞİF: h=5 ve h=20 için REV5 IC (karar vermez; H2'nin ufku 10'dur)

---

## 3. B — KEŞİF (2011-01 → 2021-08, karar vermez)

### 3.1 Özellikler (her biri tek tanım, kilitli)
| Kod | Tanım | Yüksek sıra = |
|---|---|---|
| MOM63S | `close_t−5 / close_t−68 − 1` | güçlü 3 aylık momentum |
| MOM126S | `close_t−5 / close_t−131 − 1` | güçlü 6 aylık momentum |
| MOM20 | `close_t / close_t−20 − 1` | güçlü 20 günlük momentum |
| REV5 | `−(close_t / close_t−5 − 1)` | geçen haftanın kaybedeni |
| VOL20 | `−stdev(ln(close_k/close_k−1)), k = t−19..t` | düşük volatilite |
| HACIM_SURPRIZ | `ln( mean(volume, t−4..t) / mean(volume, t−64..t−5) )` (payda 0 → gözlem yok) | hacim artışı |
| SEKTOR_RS20 | `(close_t/close_t−20 − 1) − evren içi sektör eşit ağırlıklı 20g getirisi` | sektörünü geçen |
| SEKTOR_MOM20 | evren içi sektör eşit ağırlıklı 20g getirisi (sektör < 3 hisse → gözlem yok) | güçlü sektör (rotasyon) |

Sektör: `lib/sectors.ts` `getSectorId` (bugünkü eşleme — bilinen sınır).

**Bilinçli olarak çıkarılan:** "XU100'e göre göreli güç". Aynı gün tüm hisselerden aynı endeks getirisi
çıkarıldığı için kesitsel sıralaması MOM20 ile **matematiksel olarak özdeştir**; ayrı özellik değildir.

### 3.2 Birleşik skor (ağırlık öğrenilmez)
```
EW4 = ortalama( r(MOM63S), r(REV5), r(HACIM_SURPRIZ), r(SEKTOR_RS20) )
```
Eşit ağırlık önceden sabit. Bileşen seçimi ChatGPT önerisinden, sonuca bakılmadan.

### 3.3 B raporları (hepsi KEŞİF)
1. Her özelliğin tek başına günlük IC'si (h=10), GA
2. Özellikler arası ortalama günlük sıra korelasyonu matrisi
3. EW4 IC ve drop-one (4 varyant: bir bileşen çıkarılmış EW3)
4. EW4 ekonomik bariyer (A §2.5 ile aynı kural, EW4 sırasıyla)
5. Her özellik için MOM63S'ye göre ayrıştırılmış IC

### 3.4 B'den DENEY-003'e geçiş kuralı
Bir özellik veya birleşim DENEY-003 hipotezi olabilir **ancak** B'de tek başına IC GA'sı 0'ı dışlıyorsa.
DENEY-003 **ayrılmış dönemde** (2021-09 → 2025-12) ve önceden kilitli spesifikasyonla test edilir.
B'deki çoklu karşılaştırma (8 özellik + EW4 + 4 drop-one + 8 ayrıştırma ≈ 21 test) nedeniyle
B'deki tek bir "anlamlı" sonuç kanıt değildir.

---

## 4. Çıktılar

- `scripts/deney-002-a.ts` → `deney-sonuclari/DENEY-002A-sonuc.json` (ayrı commit)
- `scripts/deney-002-b.ts` → `deney-sonuclari/DENEY-002B-sonuc.json` (A commit'inden SONRA)
- Her çıktıda git hash, önbellek sha256, spesifikasyon sürümü.

## 5. Ürün beklentisi

A DOĞRULANDI çıksa bile: IC ~0,01 düzeyinde bir bulgu "al/sat sinyali" olarak paketlenmez.
Değerlendirme bağlamı **araştırma / tarama / risk**. Ürüne giriş ayrı karar ve ileriye dönük kayıt ister.

---

## 6. Sonuç

### 6.1 A
*(A tamamlanınca yazılır.)*

### 6.2 B
*(A commit'inden sonra yazılır.)*
