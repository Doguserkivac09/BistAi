# DENEY-001 — Confluence skoru kesitsel bilgi taşıyor mu?

> **KİLİTLİ SPESİFİKASYON.** Kilit anı: bu dosyanın ilk commit'i (2026-09-11).
> Kilit, sonuçlara bakılmadan yapıldı. Aşağıdaki hiçbir eşik, ufuk, dönem veya tanım
> sonuç görüldükten sonra DEĞİŞTİRİLEMEZ. Değişiklik gerekirse yeni deney numarası
> açılır ve [DENEY-DEFTERI.md](DENEY-DEFTERI.md)'ye işlenir.
>
> Tasarım: Claude ↔ ChatGPT tartışması (2026-09-11), kullanıcı onayı.

---

## 0. Soru

Kısa Vade Fırsatlar'ın teknik çekirdeği (`detectAllSignals` + `computeConfluence`),
aynı gün likit BIST evrenindeki hisseleri gelecekteki evrene göre fazla getiriye göre
sıralayabiliyor mu — ve bunu 3 aylık momentumun **üstüne** yapıyor mu?

Haber, KAP, temel veri, makro, karar motoru ayarları **bu deneyde yok**. Yalnız teknik çekirdek.

---

## 1. Veri

| Alan | Değer |
|---|---|
| Kaynak | Yahoo Finance v8 chart, `period1=946684800` (2000-01-01) → çekim anı, `interval=1d`, ham OHLCV (adjclose değil). Not: `range=10y` 2016-09'da başlıyor, `range=max` aylık muma düşüyor — yalnız açık tarih aralığı günlük tam geçmiş veriyor (kilit öncesi veri yoklaması, getiriye bakılmadı) |
| Semboller | `types/index.ts` `BIST_SYMBOLS` (bugünkü liste) + `XU100.IS` |
| Sinyal penceresi | Her t günü için yalnız `candles[t-251..t]` (252 mum) — canlı taramayla aynı. t < 251 → gözlem yok |
| Dedektörler | Canlı kod, değiştirilmeden: `lib/signals.ts` `detectAllSignals`, `computeConfluence` |
| Temizlik | `[t−60, t+21]` aralığında herhangi bir gün `|close/prevClose − 1| > 0,25` → o hisse-gün hariç |

**Bilinen sınır:** survivorship. Bugün işlem görmeyen hisseler yok. Fazla getiri aynı
hayatta-kalan evrenden hesaplandığı için kısmen sönümlenir; raporda yıl bazında sembol
kapsamı gösterilir.

### 1.1 Veri kalitesi kapısı → karar döneminin BAŞLANGICINI belirler

Kapı yalnız veri özelliklerine bakar; hiçbir getiri/hedef/IC hesaplanmadan uygulanır.
Her takvim yılı Y ∈ 2005…2020 için:
- (a) günlük likit evren büyüklüğünün medyanı **≥ 150** hisse,
- (b) temizlik filtresiyle elenen hisse-gün oranı **≤ %15**,
- (c) verisi olan hisse-günlerde `volume = 0` oranı **≤ %10**.

**Karar dönemi başlangıcı Y\*** = Y..2020 yıllarının **hepsinin** kapıyı geçtiği en erken Y (1 Ocak).
- Y\* bulunamazsa veya Y\* > 2017 ise: karar dönemi `2021-09-01 → 2025-12-31` olur,
  §7.3 bariyeri düşer, erken yıllar yalnız KEŞİF olarak raporlanır.
- Y\* öncesi yıllar: **DERİN TARİHSEL — yalnız KEŞİF**, karar vermez.

Kapı sonucu ve Y\* raporun ilk bölümüdür.

**Ek bilinen sınırlar:** 2000'li yıllarda survivorship daha ağır (işlemden kalkan hisse çok);
2005 YTL geçişi fiyatlarda düzeltilmemişse temizlik filtresi (|gün| > %25) o pencereleri eler.

---

## 2. Evren (her gün t)

Temiz, hedefi hesaplanabilen hisseler içinde **20 günlük ortalama TL hacmine**
(`mean(close × volume)`, t−19..t) göre **ilk %60** (yüzdelik ≥ 40).
Nominal TL eşiği kullanılmaz (10 yılda enflasyon evreni değiştirir).

---

## 3. Hedef

h ∈ {5, 10, 20} işlem günü:

```
R_i,t(h)    = close_i,t+h / open_i,t+1 − 1
Y_i,t(h)    = R_i,t(h) − mean_j∈evren_t R_j,t(h)          (eşit ağırlıklı evren fazla getirisi)
YX_i,t(h)   = R_i,t(h) − (XU100 close_t+h / XU100 open_t+1 − 1)   (rapor; XU100 open yoksa close_t)
```

**Birincil ufuk: h = 10.**

---

## 4. Skorlar

### 4.1 İşaretli confluence (test edilen)
`computeConfluence(detectAllSignals(sembol, pencere))`:
- baskın yön `yukari` → `+score`
- baskın yön `asagi` → `−score`
- sinyal yok / `nötr` → `0`

### 4.2 Kıyaslar (6)
| Ad | Tanım |
|---|---|
| MOM3A (ayrıştırma değişkeni) | `close_t−5 / close_t−68 − 1` |
| MOM20 | `close_t / close_t−20 − 1` |
| REV1H | `−(close_t / close_t−5 − 1)` |
| RSI | `−RSI_Wilder14(close)_t` (düşük RSI = yüksek sıra) |
| RASTGELE | her gün bağımsız uniform |
| EVREN | eşit ağırlıklı evren (fazla getiri tanımı gereği 0) |

### 4.3 Drop-one varyantları (formül yeniden hesaplanır, regresyon değil)
`computeConfluence` birebir kopyası + tek bileşen kapalı:

| Varyant | Değişiklik |
|---|---|
| −SAYI | baskın yön puanı = toplam yerine **en yüksek tek sinyal** puanı |
| −ŞİDDET | tüm şiddet puanları 22 |
| −TİP AĞIRLIĞI | tüm güvenilirlik ağırlıkları 1,0 |
| −UYUM | +18 / +8 bonusu yok |
| −ÇELİŞKİ | çelişki cezası yok |
| −KATEGORİ | kategori çeşitliliği bonusu yok |
| KABA-1 | `(baskın yön sinyal sayısı) × yön işareti` |
| KABA-2 | `yön işareti` (sinyal var/yok) |

Kopya formül, tam konfigürasyonda `computeConfluence` ile **her hisse-günde birebir** eşleşmek
zorundadır (parite). Eşleşmezse deney durur.

---

## 5. Birincil ölçüt

Her gün t, evren_t üzerinde:

```
r_C = yüzdelik sıra(işaretli confluence)   ∈ [0,1], eşitlikte ortalama sıra
r_M = yüzdelik sıra(MOM3A)
r_Y = yüzdelik sıra(Y(10))
ê   = r_C − (â + b̂ · r_M)                  (günlük kesitsel OLS)
IC_t = Pearson(ê, r_Y)
```

**PRIMARY = mean_t IC_t**, karar dönemi: **Y\*-01-01 → 2021-08-31** (sinyal tarihi t; Y\* §1.1 kapısından).

- **Güven aralığı:** hareketli blok bootstrap, blok = 20 gün, 2.000 tekrar, %2,5–%97,5.
- **Ölçülebilir en küçük etki (MDE):** 500 plasebo (her gün skorlar hisseler arasında karıştırılır)
  → plasebo ortalama IC dağılımının standart sapması = SE. **MDE = 2,8 × SE**
  (α = 0,05 iki yönlü, güç %80). Sonuçtan önce hesaplanıp raporlanır.

---

## 6. Karar tablosu

| Kısmi IC | Ekonomik bariyer (§7.1) | Karar |
|---|---|---|
| > 0 ve GA 0'ı dışlıyor | geçiyor | **KEEP** — drop-one'da GA'sı 0'ı içeren bileşen varsa **SIMPLIFY** |
| > 0 ve GA 0'ı dışlıyor | geçmiyor | **FEATURE** — bilgi var, tek başına işlem yapılamaz; ürün listesi olamaz |
| GA 0'ı içeriyor veya ≤ 0 | — | **KILL** |

KEEP ek bariyerleri (§7) sağlanmazsa karar en fazla **FEATURE**.

**Drop-one bileşen "katkısız" tanımı:** `PRIMARY(tam) − PRIMARY(−bileşen)` farkının blok
bootstrap GA'sı 0'ı içeriyor.

**SIMPLIFY kuralı:** yalnız katkısız bileşenler çıkarılır. Yeni ağırlık, yeni eşik, yeni bileşen önermek YASAK.
**KILL / FEATURE:** confluence için yeni ağırlık önermek YASAK.

---

## 7. KEEP bariyerleri

### 7.1 Ekonomik bariyer
- Karar döneminin ilk gününden başlayarak **her 10 işlem gününde bir** (çakışmayan) yeniden dengeleme.
- Portföy: evren_t içinde işaretli confluence **> 0** olanlar arasından **ilk %10** (evren büyüklüğünün %10'u kadar hisse; > 0 olan daha azsa hepsi). 5'ten az hisse → o dönem nakit (fazla getiri 0).
- Eşit ağırlık, hedef `Y(10)`.
- **Tavan kuralı:** `open_t+1 ≥ close_t × 1,095` → alınamaz, o hisse o dönem portföyden çıkar.
- **Maliyet (gidiş-dönüş = 2 × tek yön),** hissenin t günündeki likidite yüzdeliğine göre:
  - ≥ 80: tek yön %0,15
  - 60–80: tek yön %0,25
  - 40–60: tek yön %0,40
- **Geçme:** dönemlerin ortalama net fazla getirisi > 0 (GA şartı yok).

### 7.2 Kararlılık
Karar dönemindeki kesişmeyen takvim yarıyıllarının (Oca–Haz / Tem–Ara) **en az %60'ında** yarıyıl ortalama kısmi IC > 0.

### 7.3 İkincil dönem
`2021-09-01 → 2025-12-31` ortalama kısmi IC > 0 (yalnız işaret).

---

## 8. Zorunlu raporlar (karar vermez)

1. Veri kalitesi kapısı + yıl bazında sembol kapsamı
2. Ham IC (confluence tek başına, ayrıştırmasız Spearman)
3. Sinyali olan alt evrende (skor ≠ 0) kısmi IC
4. Çoklu ayrıştırılmış IC: MOM3A + MOM20 + REV1H birlikte
5. Pozitif IC günlerinin oranı
6. 6 kıyasın tek başına ham IC'leri
7. Drop-one: 6 bileşen + KABA-1 + KABA-2 (birincil ölçüt ve fark GA'sı)
8. Rejim bazında kısmi IC — rejim (XU100): `close > SMA200` ve `60g getiri > 0` → boğa; `close < SMA200` ve `60g getiri < 0` → ayı; diğerleri → yatay
9. Aileler arası birlikte tetiklenme (Jaccard) — aileler `SIGNAL_CATEGORY` (momentum/trend/hacim/yapı/formasyon)
10. h = 5 ve h = 20 için birincil ölçüt
11. XU100'e göre fazla getiri ile birincil ölçüt
12. 2026 (kirli dönem) sonuçları
13. Derin tarihsel dönem (Y\* öncesi) sonuçları — KEŞİF

**Yorum kilidi:** Birincil > 0 iken rapor 4 (çoklu ayrıştırma) GA'sı 0'ı içerirse rapora aynen
şu yazılır: *"Confluence'ın momentum dışı bilgisi büyük ölçüde kısa vadeli geri dönüş/momentum
bileşenlerinden geliyor."*

**KILL cümlesi:** *"Confluence'ın 3 aylık momentum dışı bilgisi, ölçülebilir en küçük etkinin (MDE) altında."*

---

## 9. Dönem terminolojisi

| Dönem | Ad | Rol |
|---|---|---|
| 2001 → Y\* öncesi | Derin tarihsel | Yalnız KEŞİF |
| Y\*-01 → 2021-08 | Tarihsel sağlamlık | **Karar** |
| 2021-09 → 2025-12 | İkincil sağlamlık | Bariyer 7.3 |
| 2026-01 → 2026-08 | Kirli / geliştirme | Yalnız rapor (tip ağırlıkları bu dönemde tahmin edildi) |
| 2026-09 → | Gerçek ileriye dönük | `firsat_picks` defteri |

---

## 10. Yasaklar

- Sonuca bakıp eşik, ufuk, dönem, evren, maliyet, rejim tanımı değiştirmek.
- Keşif bulgusunu (başka ufuk / yüzdelik / dönem / alt grup) karar gerekçesi yapmak — hepsi **KEŞİF** etiketlidir.
- KILL veya FEATURE durumunda confluence'a yeni ağırlık önermek.
- Bu deney sonuçlanmadan confluence'a, dedektörlere veya karar motoruna değişiklik yapmak.

---

## 11. Çıktılar ve tekrarlanabilirlik

- Çıktılar dosya olarak: panel (hisse-gün sinyalleri), günlük IC serileri, özet JSON, rapor.
- Her çıktıya: git commit hash'i · veri önbelleği hash'i · spesifikasyon sürümü (`DENEY-001 v1.1`).
- Betikler: `scripts/deney-001-*.ts`. Veritabanı kullanılmaz.

---

## 12. Sonuç (2026-09-11)

> **"Bu deneyden sonra mevcut confluence'ı ÖLDÜRMELİYİZ."**
> Confluence'ın 3 aylık momentum dışı bilgisi, ölçülebilir en küçük etkinin (MDE = 0,0039) altında.

**Tekrarlanabilirlik:** analiz kodu `fafcd9d` · veri önbelleği sha256 `fea6a0fa…43c6` (618 sembol,
2000-01 → 2026-09) · ham çıktı [deney-sonuclari/DENEY-001-sonuc.json](deney-sonuclari/DENEY-001-sonuc.json).

### 12.1 Veri kalitesi
- **Parite:** 2.036.586 hisse-günde formül kopyası = canlı `computeConfluence`, **0 hata**.
- **Kapı:** 2005–2010 evren medyanı < 150 (124–145) → geçemedi. 2011–2020 hepsi geçti → **Y\* = 2011**.
- Karar dönemi **2011-01 → 2021-08** (2.760 IC günü). Temizlikle elenen ≤ %4,3, sıfır hacim ≤ %5,8.

### 12.2 Birincil ölçüt ve karar
| | Değer |
|---|---|
| **Kısmi IC (h=10)** | **−0,0001** |
| 95% GA (blok bootstrap) | [−0,0055, +0,0060] |
| MDE (plasebo, 2,8×SE) | 0,0039 |
| Pozitif IC günü | %50,3 |

**KARAR: KILL** (GA 0'ı içeriyor). Bariyerler de başarısız:
- 7.1 ekonomik: 10 günlük dönem başına net fazla getiri **−%0,51** (276 dönem, 0 nakit)
- 7.2 kararlılık: yarıyılların **%36'sı** pozitif (eşik %60)
- 7.3 ikincil dönem (2021-09 → 2025-12): **−0,0106**

### 12.3 Zorunlu raporlar (karar vermez)
| Rapor | Sonuç |
|---|---|
| Ham IC (ayrıştırmasız) | +0,0011 |
| Sinyalli alt evren kısmi IC | −0,0001 |
| Çoklu ayrıştırma (MOM3A+MOM20+REV1H) | +0,0003 [−0,0044, +0,0055] |
| h=5 / h=20 | −0,0040 / +0,0030 |
| XU100'e göre hedef | −0,0003 |
| Rejim: boğa / yatay / ayı | +0,0048 (n=1311) / −0,0016 (545) / −0,0073 (817) |
| 2026 kirli dönem | −0,0130 [−0,0313, −0,0005] |
| Derin tarihsel 2001–2010 (KEŞİF) | +0,0072 [−0,0010, +0,0153] |

**Kıyasların tek başına ham IC'si:** REV1H +0,0078 · RASTGELE +0,0012 · MOM3A +0,0008 · MOM20 −0,0026 · RSI −0,0033.

**Drop-one (tam − varyant; negatif fark = bileşeni çıkarmak skoru İYİLEŞTİRİYOR):**
| Varyant | Kısmi IC | Fark | 95% GA |
|---|---|---|---|
| −SAYI | −0,0019 | +0,0018 | [+0,0001, +0,0036] |
| −ŞİDDET | +0,0037 | −0,0038 | [−0,0053, −0,0023] |
| −TİP AĞIRLIĞI | −0,0014 | +0,0013 | [+0,0007, +0,0019] |
| −UYUM | −0,0001 | −0,0000 | [−0,0007, +0,0006] |
| −ÇELİŞKİ | −0,0006 | +0,0005 | [−0,0000, +0,0011] |
| −KATEGORİ | +0,0006 | −0,0008 | [−0,0013, −0,0003] |
| KABA-1 (sayı × yön) | +0,0026 | −0,0028 | [−0,0047, −0,0007] |
| KABA-2 (yalnız yön) | +0,0038 | −0,0039 | [−0,0066, −0,0008] |

**Aileler arası birlikte tetiklenme (Jaccard):** trend–yapı 0,61 · trend–formasyon 0,45 ·
yapı–formasyon 0,42 · momentum–yapı 0,41 · hacim ile diğerleri 0,21–0,24.

### 12.4 Gözlemler (KEŞİF — karar vermez, yeni ağırlık önerisi DEĞİLDİR)
1. **Formülün kendisi zarar veriyor:** yalnız "sinyal var ve yönü şu" (KABA-2), tüm confluence
   formülünden anlamlı biçimde iyi. Şiddet puanları ve kategori bonusu sıralamayı bozuyor.
   Yine de en iyi varyant bile MDE civarında (0,004) — ekonomik değil.
2. **Tek dikkat çeken kıyas kısa vadeli geri dönüş** (REV1H, ham IC +0,008). Literatürde bağımsız
   olarak belgelenmiş bir anomali; ama bu değer bu veride görüldüğü için bir sonraki deneyin
   önceden kayıtlı hipotezi yapılırsa bu kirlilik açıkça belirtilmeli.
3. **Rejime bağımlılık:** boğada hafif pozitif, ayıda negatif — tutarlı bilgi değil, piyasa yönüne
   duyarlılık. 2026 kirli dönemde (düşüş) anlamlı negatif.
4. Trend ve yapı sinyalleri %61 birlikte tetikleniyor — "5 bağımsız kanıt" varsayımı veriyle çürüdü.

### 12.5 Sınırlar
Survivorship (bugünkü semboller) · Yahoo verisi · yalnız teknik çekirdek (haber/KAP/temel/karar
motoru ayarları test edilmedi) · günlük kapanış tabanlı sinyal (canlıdaki 07:30/12:00 zamanlaması yok).
