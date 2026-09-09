# FON FAZ 6 — Detay Sayfası + Erken Uyarı Katmanı

> Bu döküman **kodlama planıdır** — geliştirme oturumunda uygulanacak.
> Oluşturulma: 2026-09-09 · Ön koşul: `FON-BACKFILL-PLAN.md` FAZ 0-5 (✅ tamam)

---

## Context

Fon motoru canlı: **TEFAS 643 fon · BES 364 fon · 240 tam gün** (2025-09-25 → 2026-09-09),
Sharpe/skor %100. Ama motor **yalnız 1 yıllık, yavaş bir bakış** üretiyor.

Kullanıcı geri bildirimi (2026-09-09): fon kartlarına tıklanıp detay sayfası açılsın;
dönemsel getiri + yatırımcı değişimi görünsün; **ani çöküşleri ve olağandışı yatırımcı
çıkışlarını yakalayabilelim.**

### 🔴 PHE vakası — ölçüldü, motor bunu GÖREMİYOR

`PHE` (PUSULA PORTFÖY HİSSE SENEDİ FONU), gerçek veri:

| | 35g önce | 20g önce | 5g önce | Bugün |
|---|---|---|---|---|
| Fiyat | 3,89 | 3,93 | 3,65 | **1,46** |
| Yatırımcı | 161.211 | 129.852 | 112.384 | **65.650** |
| Pay adedi (mn) | 19.369 | 10.402 | 6.632 | **3.068** |

Fiyat 5 iş gününde **−%60**. Ama asıl bulgu:
**fiyat neredeyse sabitken (−%6) yatırımcı sayısı %30 erimiş.** Çöküşten haftalar
önce süren bir kaçış var ve **verimizde duruyor** — motor sadece bakmıyor.

Bu, FAZ 6'nın en yüksek değerli parçasının gerekçesi.

---

## Sıralama (değere göre)

```
6A Erken Uyarı katmanı      ← en yüksek değer; Telegram bildirimleriyle birebir örtüşür
6B Dönemsel tablo            ← en ucuz; hesap ZATEN var, yalnız store'a yazılmıyor
6C Fon detay sayfası         ← kullanıcının doğrudan istediği
6D Gerçek kategori           ← doğruluk artışı; ad-tahmininin yerine geçer
```

---

## FAZ 6A — Erken Uyarı katmanı ✅ 6A-0/6A-1/6A-3 TAMAM (2026-09-09)

**Yeni:** `lib/fund-alerts.ts` — saf/deterministik, `FlowPoint[]` alır.
**Ölçüm:** `scripts/fund-alert-backtest.ts` · **Test:** `lib/__tests__/fund-alerts.test.ts` (19)

### 🔬 6A-0 SONUCU — ayrışma hipotezi ÇÜRÜTÜLDÜ

TEFAS 288.923 fon-gün · BES 58.395 fon-gün · sonraki 20 işlem günü · kötü sonuç = ≤ −%10.
Epizot = ardışık tetikler tek olay (overlap düzeltmesi).

| sinyal | epizot | kötü sonuç | taban | tetiklenme | karar |
|---|---|---|---|---|---|
| `fon-sert-dusus` | 1.390 | **%21,5** | %3,5 | %1,87 | ✅ yayınlanır |
| `fon-yatirimci-kacisi` | 1.179 | %2,8 | %3,5 | %6,79 | ❌ yayınlanmaz |
| `fon-ayrisma` | 1.157 | **%2,2** | %3,5 | %6,65 | ❌ yayınlanmaz |

**PHE tek vakaydı.** 289 bin fon-günde desen tekrar etmiyor: ayrışma tetiklendikten
sonra kötü sonuç olasılığı **taban orandan DAHA DÜŞÜK**. Aynı sinyal PHE'nin kendi
geçmişinde Haziran'da da yandı ve sonraki 20 günde **+%29** geldi. BES teyit ediyor
(%0,4 vs taban %0,8).

**Karar (kullanıcı, 2026-09-09): rozet olarak HİÇ gösterilmez** — "nötr bağlam"
etiketiyle bile değil, çünkü kullanıcı ekranda gördüğü her rozeti sinyal sayar.
Ham veri kaybolmuyor: ayrışma 6C'deki fiyat/yatırımcı grafiğinde ve 6B dönemsel
tablosunda gözle görülür — **iddia yok, veri var.** Kod ve ölçüm betiği korunuyor;
daha derin geçmişle (3-5 yıl) yeniden ölçülebilir.

**✅ `fon-sert-dusus` doğrulandı** ama ortalama getirisi **pozitif** (+%7,3) →
bu bir YÖN tahmini değil, **dağılımın genişlediği** uyarısıdır. Metin buna göre
yazıldı ("düşüşün süreceği anlamına gelmez") ve teste kilitlendi.

### 🐛 Yol boyunca çıkan iki gerçek hata (düzeltildi)

1. **Ayrışmada mutlak yön kapısı yoktu** — hızlı büyüyen bir fonda yatırımcı sayısı
   **+%39 ARTMIŞKEN** "yatırımcı çıkışı var" deniyordu: fonun kendi dağılımında
   ortalama günlük artış yüksek olduğu için +%39 bile "beklenenin altında" kalıp
   z'yi −2'ye indiriyordu. *Göreli ölçüm yönü belirlemez.* Teste kilitlendi.
2. **`getFlowSeries` tüm evrende çöküyordu** — `rows.push(...480bin)` spread'i
   "Maximum call stack size exceeded" veriyordu. Kod-bazlı okumada dilimler küçük
   olduğu için fark edilmemişti. Döngüyle eklemeye çevrildi (`lib/fund-store.ts`).

### ⚠️ ÖNCE DOĞRULA, SONRA YAYINLA

PHE **tek bir vaka**. "Yatırımcı kaçışı fiyat çöküşünü önceden haber verir" bir
**alfa iddiasıdır** ve bu projede alfa iddiaları ölçülmeden yayınlanmaz.

**6A-0 (zorunlu ilk adım):** 240 günlük veriyle geriye dönük tara —
*ayrışma deseni gösteren tüm fon-tarih çiftlerini bul, sonraki 20 günde ne olduğuna bak.*
Rastgeleden anlamlı sapma yoksa bu sinyal **uyarı değil, yalnız bağlam** olarak gösterilir.
Çıktı: isabet oranı + ortalama sonraki-dönem getirisi + kaç vakada tetiklendi.

### 6A-1 — Üç sinyal

**1. Sert değer kaybı**
```
pencere: 5 ve 20 iş günü
sinyal : dönem getirisi, fonun KENDİ günlük getiri dağılımına göre z-skoru
kapı   : aynı KATEGORİ medyanının belirgin altında mı? (fon-özel mi, piyasa mı)
```
Ham yüzde kullanılmaz. PHE −%60 iken kategori medyanı −%3 ise fon-özeldir; hepsi
düşmüşse piyasadır ve uyarı değildir. *(Kalibrasyon kuralı — bu projede 3 kez yandı.)*

**2. Yatırımcı kaçışı**
```
sinyal : yatırımcı sayısı ve pay adedi değişiminin kendi 90 günlük dağılımına göre z-skoru
ayrım  : yatırımcı↓ + pay~sabit → küçük yatırımcı çıkıyor
         pay↓↓ + yatırımcı~sabit → tek büyük itfa
```

**3. ⭐ Ayrışma uyarısı — bu fazın çekirdeği**
```
koşul  : fiyat değişimi ~yatay/hafif negatif  VE  yatırımcı çıkışı z-skoru sert negatif
mesaj  : "Fiyat henüz tepki vermeden yatırımcı çıkışı var"
```
PHE'de 20 gün önce tetiklenirdi (fiyat −%6, yatırımcı −%30).
**6A-0 doğrulaması geçmezse bu bir UYARI değil, nötr bağlam rozeti olarak kalır.**

### 6A-2 — Rozet entegrasyonu
Çıktı mevcut `FundFlag` kanalına akar (`tone: 'warn'`) → `FonlarScreen` ve detay
sayfasında ek UI kodu gerekmeden görünür. Sade Türkçe, jargonsuz.

### 6A-3 — Testler
`lib/__tests__/fund-alerts.test.ts`:
- **PHE fixture'ı** (gerçek sayılarla): ayrışma sinyali tetiklenmeli
- Piyasa geneli düşüşte (tüm kategori düşmüş) → uyarı **üretilmez**
- Yeterli geçmiş yoksa (z-skor hesaplanamaz) → uyarı **üretilmez**, uydurulmaz
- Yatırımcı verisi eksik günler atlanır (0 sayılmaz)

---

## ✅ DURUM (2026-09-10) — 6A/6B/6C/6D kodlandı

| Faz | Durum | Dosya |
|---|---|---|
| 6A-0 ölçüm | ✅ | `scripts/fund-alert-backtest.ts` |
| 6A-1 sinyaller | ✅ | `lib/fund-alerts.ts` |
| 6A-2 rozet | ✅ | `lib/fund-runner.ts` (yalnız `fon-sert-dusus` yayınlanır) |
| 6A-3 testler | ✅ | `lib/__tests__/fund-alerts.test.ts` (19 test, PHE gerçek verisi) |
| 6B dönemsel tablo | ✅ | `investorChangeOverDays` + `FundEntry.periods` |
| 6C detay sayfası | ✅ | `app/api/fonlar/[kod]` · `FonDetayScreen` · `app/fonlar/[kod]` |
| 6D gerçek kategori | 🔵 kod hazır, **migration bekliyor** | `20260910_fund_real_category.sql` · `scripts/fund-categories.ts` |

**Doğrulama:** tsc + build temiz · **465 test** (446 → +19) · canlı veriyle uçtan uca
(PHE: 1 hafta getiri −%60,1 · yatırımcı −%41,6 yan yana; `fon-sert-dusus` rozeti çıktı,
çürütülen iki sinyal çıkmadı; 3y/5y "yeterli geçmiş yok"; 493 kart tıklanabilir; mobil +
karanlık tema + konsol temiz).

### 🔴 BEKLEYEN MANUEL ADIM
`supabase/migrations/20260910_fund_real_category.sql` Supabase SQL Editor'da çalıştırılmalı,
**sonra** `npx tsx scripts/fund-categories.ts TEFAS` ve `... BES` (~90 dk, kesilebilir).
Migration çalışmadan sistem BOZULMAZ — `getMeta` eski şemaya zarif düşer ve ad tahmini
yedeği devrede kalır (kolonsuz select cron'u komple öldürürdü, o yüzden guard eklendi).

### 📌 Plan düzeltmeleri (uygulama sırasında çıktı)
- **"Migration GEREKMEZ" yanlıştı** (6D): gerçek kategori bir METİN, mevcut `category`
  ise INT. Metni int'e sıkıştırmak granülerliği ve BES taksonomisini yok ederdi.
- **`fonBilgiGetir` payload alanı `fonKod` DEĞİL `fonKodu`** — yanlış adla uç HTTP 200 +
  **boş liste** döndürüyor (hata değil). Bu kaynağın tekrar eden sessiz-boş davranışı.
  `{fonKodu, dil:'TR'}` yeterli; başka alan gerekmiyor.

---

## FAZ 6B — Dönemsel tablo (ucuz kazanç)

`lib/fund-metrics.ts` **zaten** `periodReturns` hesaplıyor (1h/1a/3a/6a/YTD/1y) ama
`FundEntry`'ye yazılmıyor — yalnız bağlama işi.

**Yapılacak:**
- `FundEntry`'ye `periods: Array<{ key, returnPct, investorChangePct }>` ekle
- Yatırımcı değişimi aynı pencerelerle hesaplanır (veri elde)
- **Getiri ve yatırımcı değişimi YAN YANA** — ayrışma göze çarpsın

**Veri sınırı (dürüstçe etiketlenecek):** 240 gün ≈ 1 yıl.
1h/1a/3a/YTD/1y ✅ · **3y/5y YOK** → "yeterli geçmiş yok" der, 0 göstermez.
(`coversPeriod` disiplini zaten bunu yapıyor.)

---

## FAZ 6C — Fon detay sayfası

**Yeni:** `app/fonlar/[kod]/page.tsx` + `components/new/FonDetayScreen.tsx`
(`<AppShell>` sarmalı), `lib/new-design-routes.ts`'e ekle.
`FonlarScreen`'deki kartlar tıklanabilir olur.

**İçerik:**
1. **Üç katmanlı getiri** — Nominal → Risksize göre → Enflasyona göre
2. **Dönemsel tablo** (6B): 1h · 1a · 3a · YTD · 1y — her satırda getiri **+ yatırımcı değişimi**
3. **⭐ Çift eksenli grafik** — fiyat (sol) + yatırımcı sayısı (sağ), 1 yıl.
   *Ayrışma bu grafikte gözle görülür.* `lightweight-charts` zaten kurulu
   (`SignalChart.tsx` deseni; fon için mum değil çizgi).
4. **Risk**: volatilite · Sharpe · Sortino · maxDD · en kötü ay
5. **Erken uyarı rozetleri** (6A)
6. **Kategori içi konum** — çifte sıra (getiride N. · risk-ayarlıda M.)
7. **Erişilebilirlik uyarısı** — `ad-tabanlı-tahmin` etiketiyle
8. Büyüklük · yatırımcı sayısı · gözlem sayısı · veri tazeliği

**Veri:** tablodan (`getFlowSeries` tek fon için) — TEFAS'a istek YOK.
**Dil:** fon dili korunur — **AL/SAT, stop, R/R YOK.** Karşılaştırma ve uygunluk.

---

## FAZ 6D — Gerçek kategori (`fonBilgiGetir`)

**Ölçüldü (2026-09-09):** `POST /api/funds/fonBilgiGetir` şunları döndürüyor:
```
fonKategori     "Hisse Senedi Fonu"      ← GERÇEK kategori (BES'te de çalışıyor)
kategoriDerece  143                       ← TEFAS'ın kendi sıralaması
kategoriFonSay  200
pazarPayi       1.53
gunlukGetiri    -21.5966
```
BES örneği: `ACV → "Başlangıç Katılım Fonu"` — yani **BES'in kendi taksonomisi**.

**Bu, `guessBesCategory` ad-tahmininin yerine geçer** (daha doğru + daha granüler emsal
grubu → daha doğru skor). Ayrıca TEFAS'ın kendi kategori sıralaması bonus olarak gelir.

**Maliyet:** fon başına 1 istek → 2.441 fon ≈ 90 dk. Kategori nadiren değişir →
**haftada bir**, `scripts/fund-backfill.ts` yanına ayrı betik olarak (cron'a koyma).

**Dikkat:** granüler kategoride `n < MIN_PEER` olan gruplar çıkabilir → mevcut
`peerReliable` mekanizması zaten bunu doğru ele alıyor (emsal iddiası etmez).

---

## Kapsam DIŞI — ayrı keşif fazı

### ❌ Portföy içeriği ("hangi hisselerde?")
Kullanıcının istediği ama **API'de bulunamadı.** Denenen uç adları (F0 + 2026-09-09,
toplam 15): `fonPortfoyDagilimGetir` · `fonPortfoyDagilimiGetir` · `portfoyDagilimGetir`
· `varlikDagilimGetir` · `fonDagilimGetir` · `fonVarlikGetir` · `fonVarlikDagilimGetir`
· `portfoyGetir` · `fonPortfoyGetir` · `fonPortfoyDetayGetir` · `fonAllocationGetir`
· `fonIcerikGetir` … → hepsi **404**.

TEFAS'ın kendi sayfasında "Portföy Dağılımı" sekmesi var, yani bir uç olmalı — ama
site **F5/Shape bot koruması** arkasında (F0'da ölçüldü), frontend trafiği incelenemedi.

**Alternatifler (ayrı faz):** (a) TEFAS frontend ağ trafiğini tarayıcıdan yakalama,
(b) **KAP fon raporları** — aylık portföy dağılımı yayımlanır, (c) ücretli sağlayıcı.
**Uydurma veri YASAK** — bulunana kadar bu özellik yapılmaz.

### ❌ 3y/5y getiri — 240 gün var, daha derin backfill ister

---

## Riskler

| Risk | Azaltma |
|---|---|
| **Ayrışma sinyali kanıtlanmamış** (tek vaka: PHE) | **6A-0 geriye dönük doğrulama ZORUNLU.** Geçmezse uyarı değil bağlam |
| Uyarı evrenin çoğunda tetikler | Kalibrasyon kuralı: her bayrak için tetiklenme oranı ölç, %70 üstü → bağlam |
| Piyasa geneli düşüşü fon-özel sanma | Kategori medyanı kapısı zorunlu |
| `fonBilgiGetir` 2.441 istek → 429 | Sayfa boyutu dersi geçerli değil (fon başına tekil uç) → 2,2 sn aralık + 429 geri çekilme, haftalık koşu |
| Granüler kategoride emsal azalır | `peerReliable` zaten koruyor |
| Detay sayfası ağırlaşır | Tek fon serisi okunur (~240 satır), fan-out yok |

---

## Doğrulama

1. `npx tsc --noEmit` + `npm run build` temiz; **446 test** geçmeye devam eder.
2. **6A-0 raporu**: ayrışma deseninin geçmiş isabeti ölçüldü ve yazıldı.
3. **Kalibrasyon**: her yeni uyarı için evrende tetiklenme oranı < %70.
4. PHE detay sayfasında açılıyor: çift eksenli grafikte ayrışma **gözle görülüyor**,
   dönemsel tabloda 1h getirisi ve yatırımcı düşüşü yan yana.
5. 3y/5y ve diğer eksik dönemler **"yeterli geçmiş yok"** diyor, 0 göstermiyor.
6. Açık/karanlık tema · mobil/masaüstü · boş durum · geçersiz fon kodu (404).
7. **Migration GEREKMEZ.**

---

## Telegram bağlantısı (sonraki öncelik)

6A'nın çıktısı **doğrudan bildirim malzemesi**: *"PHE'de olağandışı yatırımcı çıkışı —
fiyat henüz tepki vermedi."* Kullanıcı kazandıran türden bir mesaj ve rakiplerde yok.
Telegram fazına geçilince 6A'nın uyarıları `changelog` deseniyle aynı şekilde
yayınlanabilir (uç → formatlı mesaj → yayınlanan işaretlenir).
