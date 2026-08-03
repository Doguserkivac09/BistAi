# Banka Analiz Motoru — BIST'in Kör Noktasını Kapatma

> Bu döküman **kodlama planıdır** — başka bir Claude Code penceresinde uygulanacak.
> Oluşturulma: 2026-08-02
>
> **Tez:** Bankalar "analiz edilemez" değil, **farklı metrik ister**. Mevcut sistem
> Piotroski/Altman/Beneish'i bankada "uygulanmaz" dönerek onları **denetimsiz** bırakıyor.
> BIST'in en ağır sektörü için bu kabul edilemez.

---

## ⏳ İLERLEME DURUMU (2026-08-02)

### ✅ K0 VERİ SPIKE — **GO** (gerçek veriyle ölçüldü)

İş Yatırım MaliTablo endpoint'i `financialGroup=UFRS_K` ile **tam BDDK banka şablonunu**
döndürüyor (mevcut `lib/isyatirim-financials.ts` istemcisi, ek maliyet YOK). Ölçüm:
GARAN/AKBNK/ISCTR/YKBNK/HALKB/VAKBN/SKBNK/TSKB → **192 satır, standardize itemCode,
7/8 birebir aynı şablon**. Gelir tablosu sanayideki gibi YTD kümülatif (P3/6/9/12) →
mevcut `toStandaloneQuarters` mantığı aynen uygulanabilir.

**Kademe 2 için ELDE OLAN kalemler (doğrulandı):**

| Metrik | itemCode | Not |
|---|---|---|
| Faiz geliri / gideri / **NII** | `3A` / `3B` / `3C` | NIM proxy hesaplanabilir |
| **Net ücret & komisyon** | `3CA` | çekirdek gelirin kaliteli ayağı |
| **Ticari kâr/zarar** (+kambiyo `3CCC`, türev `3CCB`) | `3CC` | "kâr ticari gelirden mi?" testi ✅ |
| **Karşılık gideri** | `3CF` | CoR = `3CF` / ort. krediler ✅ |
| Faaliyet gideri | `3CG` | Maliyet/Gelir ✅ |
| Toplam faaliyet geliri · net kâr | `3CE` · `3Z` | çekirdek oran paydası |
| Krediler · mevduat · aktif · özkaynak | `1AF` · `2A` · `1Z` · `2O` | NIM/LDR paydaları |

**ELDE OLMAYAN (K2'de İDDİA EDİLMEYECEK):** `1AFD` Takipteki Krediler ve `1AFE` özel
karşılıklar şablonda **0 geliyor** (IFRS-9 sonrası eski BDDK alanları doldurulmuyor) →
**NPL / coverage / Stage 2 YOK**. Dolayısıyla planın K2-3 "karşılık ertelemesi" üçlü
koşulu (coverage↓ + NPL↑ + kâr↑) **kurulamaz**; yerine yalnız CoR trendi + kâr trendi
proxy'si kullanılabilir, bu da farklı bir iddiadır ve öyle etiketlenmeli.
**SYR/CET1 ve TÜFEX portföy ağırlığı** mali tabloda ayrı kalem değil → yok.
BDDK ayrı kaynak olarak spike EDİLMEDİ (K2'ye kaldı; İş Yatırım tek başına K2-1/2 için yeterli).

**Katılım bankaları:** ALBRK **farklı şablon** (170 satır; `3A`=Kâr Payı Gelirleri,
`3AAR`=Net Kâr Payı, `2A`=Toplanan Fonlar). K2'de **ayrı kod haritası** gerektirir —
kapsam kararı K2'de verilmeli. K1'de sorun yok (peer + ROE şablondan bağımsız).

### ✅ K1 KADEME 1 — TAMAM (2026-08-02)

- **`lib/bank-health.ts` (YENİ):** saf/deterministik. `isBankSector` (yalnız `banka` —
  kullanıcı kararı: `sigorta_finans` KAPSAM DIŞI, mali tablosu farklı), `realRoePct`
  (growth-momentum `realize` ile aynı konvansiyon), `computeBankHealth` → `{applicable,
  tier:1, score, verdict, flags[], redFlag, dataQuality:'kısmi'}`. Eksik bileşende
  ağırlık yeniden normalize (long-term-runner deseni) — veri yoksa skor UYDURULMAZ.
- **`lib/fundamental-health.ts`:** `FundamentalHealth.route: 'industrial' | 'bank'` —
  `applicable:false` artık sessiz geçiş değil, açık yönlendirme (K1-1).
- **`lib/decision-engine.ts`:** `fundamental.bankRedFlag` → `fundamentalVeto` bankada da
  40 tavanı + 25 güven cezası uygular. **Banka artık veto katmanından geçiyor** (K1-3).
- **`lib/firsatlar-fundamentals-runner.ts` + cron:** banka sembolleri için precompute'a
  `bank` alanı eklendi (peer medyanı cron'dan besleniyor) — istek anında fan-out YOK.
- **`app/api/firsatlar/route.ts`:** `FirsatItem.bankHealth`; `computeDecision`'a
  `fundamental.bankRedFlag`; katman kuralı bankada Yatırım Skoru yerine banka verdict'ini
  kullanıyor (`redFlag`/zayıf → teknik; aksi halde "Banka değerlendirmesi — kısmi veri").
- **`lib/opportunity-reasons.ts`:** `bankFlags` kanalı — banka bayrakları S1 gerekçe
  sözlüğüne akıyor (3 ekranda otomatik görünür, ayrı UI kodu YOK).

**⚠️ KALİBRASYON KARARI (canlı ölçümle düzeltildi):** İlk kural "reel ROE < 0 → sert
bayrak"tı. Gerçek veride TÜFE %32,1 iken BIST bankalarının ROE'si %15-33 → **8 bankanın
7'si veto yiyordu**; bankaların tamamı 40 tavanına çarpıp üründen silinecekti (planın
"banka ya sessizce elenir ya denetimsiz geçer — ikisi de kabul edilemez" ilkesine aykırı).
Sektörün TAMAMINDA geçerli bir olgu ayrıştırıcı değildir. Düzeltme: uyarı **her zaman**
gösterilir (şeffaflık), **veto** yalnız banka emsalinden geri kaldığında (ROE < sektör
medyanı) veya reel kayıp ≤ −15 puan olduğunda. Sonuç: 8'de 4 veto (AKBNK/ISCTR/HALKB/
YKBNK), GARAN/VAKBN yalnız uyarı, ALBRK sağlıklı → **ayrıştırıcı**.

**Doğrulama:** 310/310 test (13 yeni), tsc + build temiz. Canlı (TÜFE %32,1 · banka
medyanı n=20): ALBRK 72/sağlıklı · GARAN 49 · VAKBN 50 · HALKB 18/zayıf(veto).
Sanayi (ASELS) rotaya **girmiyor**. Uçtan uca `/firsatlar`: VAKFN → bankHealth 50/nötr,
katman "Banka değerlendirmesi — kısmi veri", gerekçe rozetleri sade Türkçe render,
uyarı mobil+masaüstünde korunuyor.

### ✅ K2 + K3 — TAMAM (2026-08-03)

**BDDK NO-GO (denendi, ölçüldü):** `bddk.org.tr/BultenAylik` rapor endpoint'i JSON değil,
oturum + form parametresi isteyen ASP.NET uygulaması döndürüyor. Ayrı bir entegrasyon
işi → bu fazda kapsam dışı. Sonuç: **NPL / coverage / Stage 2 / SYR / TÜFEX yok**,
K2-3 kısmi ve K2-4 uygulanmadı. Panelde bu **açıkça yazılıyor** (tahmin edilmiyor).

| Bileşen | Dosya | Not |
|---|---|---|
| Banka mali tablo katmanı | `lib/isyatirim-bank.ts` (YENİ) | UFRS_K; **iki kod haritası** — geleneksel (8 bankada doğrulandı) + **katılım** (ALBRK; `3AAR`/`3AAS`/`3ABI`…). Şablon otomatik tespit. Standalone çeyrek + TTM sanayi ile aynı kural |
| Kademe 2 motoru | `lib/bank-health.ts` | `computeBankMetrics` (çekirdek oran · ticari pay · NIM proxy · CoR · maliyet/gelir + yıllık deltalar) + `tier2Flags`. Stok kalemlerde **dönem ortalaması** (TL enflasyonunda dönem-sonu bakiye akış kalemini küçük gösterir) |
| Precompute | `lib/bank-health-runner.ts` + `app/api/cron/bank-health` (Pzt 10:20 TRT) | **İKİ GEÇİŞLİ**: 1) veri çek + ölçüm, 2) sektör medyanlarını türet + verdict. `ai_cache: bank-health:BIST`, MIGRATION YOK |
| Okuma API | `app/api/bank-health` | tek satır okur, fan-out YOK; `?symbol=` tekil |
| Fırsatlar | `app/api/firsatlar/route.ts` | Kademe 2 store'u **Kademe 1'in yerine geçer**; K1 (günlük) yedek kalır → haftalık cron gecikse de banka denetimsiz kalmaz |
| UI | `components/new/BankaPaneli.tsx` (YENİ) + `HisseDetayScreen` | Temel sekmesinde banka için `KarKalitesi` yerine banka paneli. **Sanayi paneli değişmedi** |

**⚠️ İKİNCİ KALİBRASYON (K1'dekiyle aynı ders, yine canlı veride yakalandı):** İlk sürümde
NIM trend eşiği mutlaktı (+0,3 p) → faiz indirim döngüsünde **12 bankanın 12'sinde**
"Faiz marjı genişliyor" rozeti çıktı (deltalar +0,1…+3,5 p, medyan ≈1,6). Sektörün
tamamında olan hareket ayrıştırıcı değildir. Çözüm: runner iki geçişli yapıldı, **NIM ve
CoR trend bayrakları sektör medyanına GÖRECELİ** (±0,75 p / ±50 bp). Bağlam yoksa (n<3)
mutlak eşiğe düşülür ve rozet metni sektör iddiası **etmez**. Sonuç: NIM rozeti yalnız
ICBCT (+3,5) ve TSKB (geride, +0,1) için çıkıyor.

**Ek düzeltmeler (canlı veride görüldü):**
- `prev` TTM hiç dolmuyordu (pencere 10 dönem) → tüm trend bayrakları ölüydü. Pencere
  **14 döneme** çıkarıldı; artık CoR/NIM/net-kâr deltaları geliyor.
- Ticari **zarar** çekirdek oranı %100'ün üstüne çıkarıyor (YKBNK %121, ticari −%30).
  Aritmetik doğru ama "çekirdek güçlü" rozeti tek başına kaybı gizliyordu → ayrı
  **"Ticari işlemler geliri baskılıyor"** uyarısı eklendi (|pay| ≥ %15).
- `corBps` piyasanın "net CoR"u DEĞİL (tahsilat netleştirilmiyor, diğer alacaklar dahil)
  → panelde ve tipte "brüt karşılık oranı, seviyeden çok trendi anlamlı" diye etiketlendi.

**Doğrulama:** 323/323 test (14 yeni: ölçüm birimleri, dönem ortalaması, ticari-zarar,
göreli vs mutlak eşik, "NPL/SYR bayrağı asla üretilmez", Kademe 1 regresyonu),
tsc + build temiz. Canlı (12 banka): GARAN T2 58/nötr (çekirdek %90, NIM≈5,8 Δ+2,0,
CoR 385bp), YKBNK ticari-zarar uyarısı, ICBCT emsalden hızlı marj + hızlı CoR artışı,
ISATR/ISBTR 21/zayıf (veto). `/api/firsatlar`'da SKBNK T2 "geniş veri" ile görünüyor,
katman "Banka değerlendirmesi zayıf". **Veto aşağı yönde uygulanmaz** (tasarım gereği —
zayıf temel düşüş tezini teyit eder), SKBNK `asagi` olduğu için vetolanmadı: doğru.

**Doğrulanamayan:** `/hisse/*` auth korumalı → `BankaPaneli` görsel kontrolü Vercel
preview'de giriş yapılarak yapılmalı (API çıktısı doğrulandı).

### ✅ K4 — Beklenti boyutu (2026-08-03, kullanıcı itirazı üzerine)

**İtiraz:** "HALKB 30/100 doğru gelmiyor; bu bankalar hukuki süreçlerden iyi geçti, USD
bazlı düşükler, aracı kurum hedefleri yüksek."

**Denetim (gerçek veri):** HALKB'nin 30'u → reel ROE **0**/100 (ROE %15,4 − TÜFE %31,75 =
reel −%16,3) ×40 + emsal **17**/100 (F/K **8,86** vs medyan 5,49) ×30 + çekirdek gelir
**84**/100 ×30. İki düşük bileşen de aynı kökten: **kâr dipte** → F/K şişik, ROE emsal altı.
Model **toparlanma hikâyesini tam da toparlanacağı için cezalandırıyor** (trough-earnings
tuzağı) — itiraz bu yönüyle HAKLI.
**Ama** analist verisi HALKB için tezi desteklemiyor: hedef 39,59 vs fiyat 37,30 → **+%6**,
konsensüs **"tut"**, 7 kurum. Kıyas: ISCTR +%59 "al" (13), GARAN +%42 "güçlü al" (15),
VAKBN +%36 "al" (10). (Yahoo kapsamı = ağırlıkla yabancı kurumlar; yerli hedefler bizde YOK.)
Ayrıca motor HALKB'ye "risk maliyeti emsalinden hızlı artıyor" bayrağı takmıştı (+157 bp
vs medyan ~+49) — gerçek bir uyarı.

**Karar (kullanıcı seçimi): beklenti AYRI boyut, skora KARIŞMAZ.**
- `computeBankOutlook()` → `BankOutlook {available, targetPrice, upsidePct, consensusLabel,
  consensusMean, analystCount}`. Kapsam < 3 kurum → `available:false`, hiçbir şey iddia edilmez.
- Panelde skorun yanına **"gerçekleşmiş kalite & risk"** etiketi (artık "genel cazibe notu"
  gibi okunmuyor) + altında ayrı **Beklenti** kutusu; kutu metni skordan bağımsız olduğunu
  ve kaynağın yabancı kapsam olduğunu açıkça yazar.
- **Skora KATILMADI** çünkü analist verisi bankaların yarısında yok (YKBNK/AKBNK) → ağırlık
  yeniden normalize edilseydi skorlar birbiriyle karşılaştırılamaz hale gelirdi.
  Test bunu koruyor: analistli/analistsiz `score`/`verdict`/`redFlag`/`flags` AYNI.
- Canlı: HALKB 30 + beklenti %6/tut · ISCTR 44 + beklenti %59/al (aranan ayrışma görünür
  hale geldi) · YKBNK 51 + "kapsam yok". 330/330 test.

**Kapatılamayan boşluk:** motorda **hukuki süreç / tek-seferlik olay** verisi YOK
(ör. Halkbank ABD davası). Böyle bir risk çözülürse piyasa bizim görmediğimiz bir şeye
göre fiyatlanır — bu dürüstçe kabul edilmiştir, tahmin edilmez.

### ⏳ KALAN
- **BDDK entegrasyonu** (NPL/coverage/Stage 2/SYR) — ayrı iş; gelirse K2-3 tam kurulur
  ve "karşılık ertelemesi üçlüsü" gerçek kanıtla çalışır.
- **TÜFEX** portföy ağırlığı — mali tabloda ayrı kalem yok; kaynak bulunmadıkça yok.
- ~~`sectors.ts`'te `banka` grubunda gerçek banka olmayanlar~~ → **✅ ÇÖZÜLDÜ (2026-08-03)**
  cerrahi yolla: sektör eşlemesi DEĞİŞTİRİLMEDİ (peer/momentum/exposure katmanlarını da
  etkilerdi). Bunun yerine `BankHealth.institution` eklendi: banka mali tablosu (UFRS_K)
  beyan eden → `banka`, etmeyen (GEDIK/GARFA/QNBFK/VAKFN/GSDHO — aracı kurum/leasing/
  faktoring/holding) → `finans`. Değerlendirme (emsal + reel ROE) yine yapılır ama
  "banka değerlendirmesi" diye SUNULMAZ; panel bunu ayrıca açıklar.

---

## Context — kör nokta

`lib/financial-statements.ts:142` `isFinancialSector(years)` bankaları yakalıyor
(son yılda `currentLiabilities === null && grossProfit === null`) ve şu zincir devreye giriyor:

| Motor | Banka davranışı | Sonuç |
|---|---|---|
| `computePiotroski` | `applicable: false` | Kalite skoru YOK |
| `computeAltman` | `applicable: false` | Sıkıntı tespiti YOK |
| `computeBeneish` | `applicable: false` | Manipülasyon tespiti YOK |
| `computeGrowthMomentum` | uygulanmaz | Büyüme skoru YOK |
| `decision-engine` `fundamentalVeto` | red-flag hiç tetiklenmez | **Veto YOK** |

→ Banka **hiçbir temel kalite kapısından geçmiyor.** `FIRSATLAR-SUNUM-PLAN.md`'deki
"onaylı kurulum" katmanında banka ya sessizce elenir (BIST hacminin en büyük kısmı gider)
ya da denetimsiz geçer (tuzağa açık kapı). İkisi de kabul edilemez.

**Kök neden yanlış araç:** Piotroski/Altman sanayi şirketi için tasarlandı — işletme
sermayesi, stok, brüt marj üzerine kurulu. Bankada bunların hiçbiri yok.

---

## BÖLÜM A — Banka mali tablosu: profesyonel okuma

### A.1 Gelir tablosu yapısı (sanayiden tamamen farklı)

```
  Faiz Gelirleri            (krediler + menkul kıymetler + bankalararası)
− Faiz Giderleri            (mevduat + kullanılan krediler + ihraç edilen tahviller)
──────────────────────────────────────────────────
= NET FAİZ GELİRİ (NII)                  ← çekirdek motor
+ Net Ücret & Komisyon Gelirleri         ← en kaliteli gelir
+ Ticari Kâr/Zarar                       ← kambiyo, türev, SWAP — volatil
+ Diğer Faaliyet Gelirleri
──────────────────────────────────────────────────
= BRÜT FAALİYET KÂRI
− Beklenen Zarar Karşılıkları            ← KÂR YÖNETİMİNİN YAPILDIĞI YER
− Faaliyet Giderleri                     (personel + genel yönetim)
──────────────────────────────────────────────────
= VERGİ ÖNCESİ KÂR → NET KÂR
```

### A.2 Gelir kalitesi — "kâr gerçek mi?" sorusunun banka versiyonu

| Gelir kalemi | Kalite | Gerekçe |
|---|---|---|
| Net faiz geliri (NII) | 🟢 Yüksek | Çekirdek iş, tekrarlayan |
| Net komisyon geliri | 🟢 **En yüksek** | Sermaye tüketmez, faize duyarsız, istikrarlı |
| Ticari kâr (kambiyo/türev) | 🔴 Düşük | Volatil, tek seferlik, tersine dönebilir |
| Karşılık iptali | 🔴 **En düşük** | Nakit değil, muhasebe kalemi |

**Kural:** `çekirdek gelir = NII + net komisyon`. Kâr artışı ticari kârdan geliyorsa
**sürdürülebilir değildir** — bu, sanayideki "kur farkı kârı" tuzağının banka karşılığı.

### A.3 Türkiye'ye özgü üç faktör (jenerik model kör)

**1. TÜFEX — TÜFE endeksli tahviller** ⭐ *en büyük açıklayıcı*
Bankalar TÜFE'ye endeksli devlet tahvili tutar; getirileri enflasyona bağlı.
- Enflasyon yüksekken → devasa faiz geliri
- Enflasyon düşerken → **gelir uçurumu**
- Bankalar değerlemede **kullandıkları enflasyon varsayımını seçebiliyor** → kâr yönetimi kanalı
- TÜFEX portföyü büyük olan banka, dezenflasyon sürecinde **orantısız** vurulur

**2. Swap maliyeti — NIM'i yanıltır**
TL fonlama için yabancı para swap kullanılır. Swap maliyeti **ticari kâr/zarar** altında
görünür, faiz giderinde değil → ham NIM olduğundan iyi görünür.
→ **Swap-düzeltilmiş NIM** = (NII − swap maliyeti) / ortalama getirili aktif.

**3. Yükümlülük-duyarlılık (liability-sensitive)**
Türk bankalarında mevduat vadesi kısa, kredi vadesi uzun. TCMB sıkılaşırken mevduat
maliyeti krediden **hızlı** yükselir → NIM daralır; gevşerken açılır.
→ `lib/exposure-map.ts`'e doğrudan girer: **banka × faiz yönü** kesitte ayrıştırıcıdır.

### A.4 Sağlık metrikleri (Altman/Piotroski'nin yerine)

| Metrik | Formül / anlam | Sanayi karşılığı |
|---|---|---|
| **NIM** | Net faiz geliri / ort. getirili aktif | Brüt marj |
| **CoR** (risk maliyeti) | Karşılık gideri / ort. krediler (bp) | — (gerçek kredi zararı) |
| **NPL oranı** | Takipteki krediler / toplam kredi | Alacak kalitesi |
| **Stage 2** (yakın izleme) | ⭐ **ÖNCÜ** — NPL'e dönüşecek krediler | — |
| **Coverage** | Ayrılan karşılık / NPL | Karşılık yeterliliği |
| **SYR / CET1** | Sermaye yeterliliği | **Altman Z** |
| **LDR** | Krediler / mevduat | Fonlama kırılganlığı |
| **Maliyet/Gelir** | Faaliyet gideri / brüt gelir | Verimlilik |
| **Reel ROE** | ROE − enflasyon | Gerçek değer yaratımı |

**En kritik ikili:** NPL **geriye dönük**, Stage 2 **ileriye dönüktür**. Ve
**coverage düşerken kâr artıyorsa** → kâr karşılık ertelemesinden geliyordur,
gelecek çeyrekte patlar. Bankadaki en klasik tuzak budur.

### A.5 Banka tuzak desenleri

| # | Tuzak | Belirti | Sonuç |
|---|---|---|---|
| 1 | **Karşılık ertelemesi** | Coverage↓ + NPL↑ + kâr↑ | Gelecek çeyrek çöker |
| 2 | **Ticari kâr bağımlılığı** | Kâr artışı kambiyo/türevden | Sürdürülemez |
| 3 | **TÜFEX uçurumu** | Büyük TÜFEX + dezenflasyon | Gelir çöküşü |
| 4 | **Sermaye erimesi** | SYR düşüyor | Bedelli artırım = seyrelme |
| 5 | **Stage 2 balonu** | Yakın izleme şişiyor | NPL dalgası geliyor |
| 6 | **Nominal ROE tuzağı** | ROE %45, enflasyon %50 | **Reel negatif** — değer yok ediyor |

---

## BÖLÜM B — Veri gerçeği (dürüst)

Yukarıdaki analiz doğru ama **verisiz çalışmaz.**

| Metrik grubu | Kaynak | Durum |
|---|---|---|
| ROE, PD/DD, peer karşılaştırma | Mevcut (`yahoo-fundamentals`, `peer-valuation`, `sector-valuation` `BANK_PROFILE`) | ✅ **Çalışıyor** — banka emsal medyanı canlı doğrulanmış (n=17: ALBRK=100, HALKB=0, GARAN=63) |
| Faiz geliri/gideri → **NIM proxy**, gelir kırılımı | Yahoo `fundamentalsTimeSeries` (banka şablonu) | ⚠️ **Spike gerekli** — hangi kalemler geliyor bilinmiyor |
| NPL, Stage 2, Coverage, SYR, TÜFEX | Banka mali tabloları / **BDDK** | ❌ Yahoo'da yok · KAP bloklu · **spike gerekli** |

**Aday kaynaklar (spike edilecek, varsayılmayacak — KAP dersi):**
- **BDDK** — banka bazında ve sektör geneli düzenli veri yayımlıyor; ücretsiz/kamuya açık.
  Bankalar için İş Yatırım'ın muadili, **en güçlü aday**.
- **İş Yatırım** (`isyatirim.com.tr`) — `BILANCO-ONGORU-PLAN.md` B0-1'de zaten spike edilecek;
  banka şablonu da aynı koşuda ölçülür (**ek maliyet yok**).
- Yahoo banka kalemleri — mevcut yığında sıfır entegrasyon maliyeti.

> **Lisans/dürüstlük notu:** VIOP ve BILANCO planlarındaki aynı ilke — **türetilmiş
> analiz servis et, ham tabloyu yayınlama.** Erişilemeyen metrik **uydurulmaz**, "veri yok" denir.

---

## FAZ K0 — Veri spike (GO/NO-GO) 🔴

> `BILANCO-ONGORU-PLAN.md` B0-1 ile **BİRLİKTE** koşulmalı — aynı fetch, aynı örneklem.

- Örneklem: BIST'teki tüm bankalar + katılım bankaları (~17, `sectors.ts` `banka` + `sigorta_finans`).
- Ölçülecek:
  1. Yahoo banka şablonunda hangi kalemler dolu? (`interestIncome`, `interestExpense`,
     `netInterestIncome`, krediler, mevduat, karşılıklar)
  2. İş Yatırım banka mali tablosu erişilebilir mi, çeyreklik mi, standardize mi?
  3. BDDK verisi programatik erişilebilir mi? Banka bazında mı sektör geneli mi? Gecikme?
- Çıktı: **kapsam raporu + GO/NO-GO**.
  - NO-GO → yalnız **Kademe 1** (peer + reel ROE) uygulanır, banka "görünür" olur ama
    tuzak tespiti sınırlı kalır. Dürüstçe böyle etiketlenir.
  - GO → **Kademe 2** (gerçek banka motoru) açılır.

---

## FAZ K1 — Kademe 1: Banka paralel değerlendirme hattı (veri-bağımsız) ✅

> Spike sonucundan **bağımsız** çalışır. Mevcut parçaları bağlamak — hızlı kazanç.

### K1-1: `isFinancialSector` semantiğini değiştir
Şu an "**bunu yargılayamıyoruz**" demek → olacak: "**banka mantığına yönlendir**".
- `lib/fundamental-health.ts` çıktısına `route: 'industrial' | 'bank'` alanı.
- `applicable: false` **sessiz geçiş** üretmeyecek; banka rotası devreye girecek.

### K1-2: `lib/bank-health.ts` (YENİ) — Kademe 1 çekirdeği
Mevcut ve **doğrulanmış** girdilerle banka verdict'i:
- **Peer relativeScore** (`lib/peer-valuation.ts` — banka medyanı zaten çalışıyor)
- **Reel ROE** = ROE − enflasyon (`fetchTurkeyInflation`; Fisher — `BILANCO` B0-4 ile hizalı)
- **PD/DD** ve sektör medyanına göre konum (`sector-valuation.ts` `BANK_PROFILE`)
- Çıktı: `{ applicable: true, tier: 1, score, verdict, flags[], dataQuality: 'kısmi' }`

**Kademe 1 tuzak tespiti (sınırlı ama gerçek):**
- 🔴 **Reel ROE negatif** → nominal kâr yüksek olsa da değer yok ediyor
- 🟠 Peer'e göre pahalı **ve** ROE emsal altında → çifte olumsuz

### K1-3: Karar motoruna bağla
- `decision-engine.ts` `fundamental` girdisine banka rotası: `beneishSuspect`/`altmanDistress`
  yerine `bankFlags` okunur. **Banka artık veto katmanından geçiyor.**
- `FIRSATLAR-SUNUM-PLAN.md` "onaylı kurulum" katmanı: banka `tier: 1` ile onaylı katmanda
  kalır, rozet: *"Banka değerlendirmesi — kısmi veri"*.

### Doğrulama (K1)
Birim test (`lib/__tests__/bank-health.test.ts`): reel ROE negatif → bayrak; peer pahalı +
ROE düşük → çifte bayrak; sanayi şirketi bu rotaya **girmemeli**. Canlı: GARAN/AKBNK/HALKB/
ALBRK karşılaştırması elle doğrulanır (peer skorları biliniyor: ALBRK=100, HALKB=0, GARAN=63).

---

## FAZ K2 — Kademe 2: Gerçek banka motoru (K0 GO gerektirir)

**Genişletme:** `lib/bank-health.ts` → `tier: 2`.

### K2-1: Gelir kalitesi ayrıştırması (kullanıcının çekirdek sorusu)
```
Çekirdek gelir = NII + Net Komisyon
Volatil gelir  = Ticari kâr/zarar + karşılık iptali
Çekirdek oranı = Çekirdek / Toplam gelir
```
- 🔴 **"Kâr ticari gelirden"** — çekirdek oranı düşük veya kâr artışının kaynağı ticari
- 🟢 **"Çekirdek gelir güçlü"** — NII + komisyon büyüyor

### K2-2: NIM ve faiz duyarlılığı
- NIM = NII / ortalama getirili aktif; **swap-düzeltilmiş NIM** (veri varsa)
- NIM trendi + TCMB faiz yönüyle çapraz: sıkılaşmada daralma **beklenen** (ceza değil,
  bağlam); gevşemede açılmıyorsa **sorun**
- `lib/exposure-map.ts`: banka `rateSensitivity` bu ölçümden beslenir (kural-tabanlıdan
  veri-tabanlıya ilk gerçek terfi)

### K2-3: Aktif kalitesi (en kritik tuzak kapısı)
- NPL oranı + **Stage 2** trendi + **coverage** trendi + CoR
- 🔴 **Karşılık ertelemesi bayrağı:** `coverage↓` **VE** `NPL↑` **VE** `kâr↑` → aynı anda
  → *"Kâr karşılık ertelemesinden — gelecek çeyrek riskli"*
- 🟠 **Stage 2 balonu:** yakın izleme kredileri hızlı büyüyor → NPL dalgası öncüsü

### K2-4: Sermaye ve TÜFEX
- SYR/CET1 trendi → 🔴 **sermaye erimesi** bayrağı (bedelli artırım = seyrelme riski)
- TÜFEX portföy ağırlığı (veri varsa) × enflasyon yönü → 🔴 **TÜFEX uçurumu** bayrağı
- *Veri yoksa bu bayraklar üretilmez — tahmin edilmez, "ölçülemedi" denir.*

### K2-5: Banka verdict + rozetler
`FIRSATLAR-SUNUM-PLAN.md` `deriveReasons()` sözlüğüne banka dili eklenir:

| Durum | Rozet | Ton |
|---|---|---|
| Çekirdek oran yüksek + büyüyor | Çekirdek gelir güçlü | pos |
| Coverage sağlam | Karşılık oranı sağlam | pos |
| Reel ROE pozitif | Reel getiri pozitif | pos |
| NIM açılıyor | Faiz marjı genişliyor | pos |
| Kâr ticari gelirden | ⚠️ Kâr ticari gelirden — sürdürülemez | warn |
| Coverage↓ + NPL↑ + kâr↑ | ⚠️ Kâr karşılık ertelemesinden | warn |
| Stage 2 şişiyor | ⚠️ Yakın izleme kredileri artıyor | warn |
| SYR eriyor | ⚠️ Sermaye yeterliliği zayıflıyor | warn |
| Reel ROE negatif | ⚠️ Nominal kâr var, reel getiri negatif | warn |
| TÜFEX ağır + dezenflasyon | ⚠️ Enflasyon düşüşü gelirini vurabilir | warn |

### K2-6: Precompute (mevcut desen — migration YOK)
- `lib/bank-health-runner.ts` — `growth-momentum-runner.ts` deseni; evren küçük (~17 banka)
  → `?part` bölmeye gerek yok.
- `app/api/cron/bank-health/route.ts` — haftalık (temel-analiz zinciriyle aynı gün),
  `ai_cache` tek satır `bank-health:BIST`, TTL ~8g, `bistGuard`.
- `app/api/bank-health/route.ts` — tek satır okur, fan-out YOK.

### Doğrulama (K2)
Birim test: karşılık-ertelemesi üçlü koşulu, çekirdek oran, Stage 2, SYR erimesi, reel ROE.
Canlı: en az 3 banka için gelir kırılımı elle doğrulanır (çekirdek vs ticari).

---

## FAZ K3 — UI yüzeyleri

- **Hisse detay → Temel sekmesi:** banka için `FinansalSaglik` yerine **banka paneli**
  (gelir kırılımı köprüsü + NIM/CoR/NPL/Coverage/SYR + reel ROE + peer konumu).
  *Sanayi paneli değişmez.*
- **Fırsatlar kartı:** K2-5 rozetleri (`FIRSATLAR-SUNUM-PLAN.md` S1 sözlüğüne eklenir).
- **Veri kalitesi etiketi zorunlu:** `tier: 1` → *"kısmi veri"*, `tier: 2` → tam.

---

## Kapsam DIŞI

- ❌ Banka DCF / temettü indirgeme modeli
- ❌ Kredi portföyü segment analizi (veri yok)
- ❌ Sigorta şirketleri için ayrı motor (farklı yapı — ileride)
- ❌ Erişilemeyen metriğin tahmin edilmesi (SYR/NPL uydurulmaz)

---

## Riskler

| Risk | Azaltma |
|---|---|
| BDDK/İş Yatırım erişilemez | K0 GO/NO-GO; NO-GO → Kademe 1 ile yetin, dürüstçe etiketle |
| Yahoo banka kalemleri boş | Aynı — Kademe 1 bağımsız çalışır |
| TMS-29'un bankada etkisi karmaşık | Bankada net parasal pozisyon sanayiden farklı davranır → **tahmin edilmez**, ölçülemezse söylenmez |
| Kademe 1 fazla iyimser (sınırlı tespit) | "Kısmi veri" etiketi + K2 hedefi açık |
| Katılım bankaları farklı (faizsiz) | NIM yerine kâr payı marjı — ayrı ele alınır veya kapsam dışı bırakılır (K0'da karar) |

---

## Sıralama

```
K0 Veri spike (BILANCO B0-1 ile BİRLİKTE)     🔴 GO/NO-GO
   ├→ K1 Kademe 1: peer + reel ROE hattı       ✅ spike'tan BAĞIMSIZ — hemen yapılabilir
   └→ K2 Kademe 2: gerçek banka motoru          (K0 GO gerekir)
        └→ K3 UI yüzeyleri
```

**Not:** K1 spike'ı beklemez. Bankalar K1 ile **kör nokta olmaktan çıkar**; K2 ile
**tuzakları görünür** olur.

---

## Doğrulama (her faz)

1. `npx tsc --noEmit` + `npm run build` temiz; mevcut testler geçer.
2. Sanayi şirketleri banka rotasına **girmiyor** (regresyon testi).
3. Canlı: GARAN/AKBNK/ISCTR/HALKB/ALBRK karşılaştırması elle doğrulanır.
4. `tier` ve `dataQuality` etiketleri UI'da doğru görünüyor.
5. Erişilemeyen metrik için **"ölçülemedi"** gösteriliyor, sıfır/uydurma değil.
6. **Migration GEREKMEZ** — `ai_cache` tek-satır deseni.

---

## Açık kararlar

1. **Katılım bankaları** (ALBRK, kâr payı esaslı) Kademe 2'ye dahil mi, ayrı mı, kapsam dışı mı?
2. **Sigorta/finans** (`sigorta_finans` sektörü) bu motora mı girsin, ayrı mı kalsın?
3. K1 tek başına yayınlanıp K2 sonra mı gelsin, yoksa K2 GO'suna kadar banka onaylı
   katmanda mı bekletilsin? (Öneri: K1 hemen yayınlansın — kör nokta bugün kapansın.)
