# Fon Analiz Motoru — TEFAS + BES (Ayrı Dünya)

> Bu döküman **kodlama planıdır** — başka bir Claude Code penceresinde faz faz uygulanacak.
> Oluşturulma: 2026-09-08
>
> **Tez:** Fon sektörünün en büyük yanılgısı **nominal getiridir**. %37 politika faizi ve
> %32,6 enflasyon ortamında "%45 getiri" reklamı hiçbir şey ifade etmez. Bu ürün
> **"bu fon aldığı riski ve aldığı ücreti hak etti mi?"** sorusunu cevaplar.
>
> **Kullanıcı kararları (2026-09-08):** TEFAS ve BES **ayrı bölümler** · Fonlar **ayrı bir
> dünya** (kendi ekranı, kendi motoru — fon yatırımcısı hisse yatırımcısından farklı
> karakter) · Varsayılan sıralama **risk-ayarlı**, ama **getiri sıralaması da birinci sınıf**.

---

## ⏳ İLERLEME DURUMU

### ✅ FAZ F0 — VERİ SPIKE: **GO** (2026-09-08, gerçek istekle ölçüldü)

**TEFAS tamamen yenilenmiş.** Eski `.aspx` sayfaları ve `/api/DB/BindHistoryInfo` uçları
**kapatılmış** (`ERR-006 "Method not found or disabled"`); site Next.js'e taşınmış ve
HTML sayfaları **F5/Shape bot koruması** arkasında (`bobcmn`, `/TSPD/`). Ama **yeni JSON
API sunucudan sorunsuz erişiliyor** — WAF yalnız HTML'i sınıyor, `/api/funds/*`'ı değil.
(KAP/BDDK'nın aksine: burada NO-GO yok.)

**Uç:** `POST https://www.tefas.gov.tr/api/funds/fonGnlBlgSiraliGetir`
`Authorization: Bearer ST-tefaswebwse3irfmSBj4iRAzGPbAlS94Se` + `x-request-id: <uuid>`

| F0-1 gereksinimi | Durum | Ölçüm |
|---|---|---|
| Birim pay değeri geçmişi | ✅ | Tarih tarih `fiyat`; **pencere ≤ ~31 gün** (45g+ boş döner) → parçalı çekim şart |
| **Tedavüldeki pay adedi** ⭐ | ✅ | `tedPaySayisi` — akımın tek doğru kaynağı **var** |
| **Yatırımcı sayısı** | ✅ | `kisiSayisi` |
| Fon büyüklüğü | ✅ | `portfoyBuyukluk` |
| **Fon kategorisi** ⭐ | ✅ | `fonTurGetir` → **12 şemsiye fon türü**; `sfonTurKod` ile filtre çalışıyor (Borçlanma 85, Değişken 171, Fon Sepeti 93 fon) → **kalibrasyon kuralı uygulanabilir** |
| Kurucu | ✅ | `fonKurucuGetir` — 62 portföy yönetim şirketi |
| **Sunucudan erişilebilirlik** | ✅ | Node'dan 200; WAF yok |
| Toplam Gider Oranı / ücret | ❌ | Bu spike'ta uç **bulunamadı** |
| Portföy dağılımı | ❌ | Bulunamadı |
| Karşılaştırma ölçütü | ❌ | Bulunamadı |
| Nitelikli yatırımcı / erişilebilirlik | ❌ | Alan yok → **ad-tabanlı sezgisel** (aşağıya bak) |

**F0-2 (BES):** `fonTipi: 'EMK'` **aynı uç, aynı şema** → **400 BES fonu**. Ayrı adaptör
gerekmiyor, tek arayüz iki evreni de taşıyor. (Bonus: `BYF` = borsa yatırım fonları da var.)

**Evren:** TEFAS **2.043** fon · BES **400** fon.

#### Operasyonel sınırlar (runner tasarımını bunlar belirledi)
- **Sayfa boyutu `bitSira: 500` çalışıyor** → tüm evren tek tarih için ~5 istekte.
- **Hız sınırı GERÇEK:** arka arkaya hızlı istekte **HTTP 429**. Ölçüm: **2 sn aralıkla
  8/8 başarılı**. İş Yatırım dersi birebir geçerli — runner nazik olmak zorunda.
- Backfill maliyeti: tüm fonlar × 30 günlük pencere = **42.729 satır** (500'lük sayfalarla
  ~86 istek/ay-penceresi). Günlük artımlı güncelleme ise yalnız **~5 istek**.

#### ⚠️ Plandaki bir varsayım DÜZELTİLDİ
Plan *"Sharpe · maxDD · equity curve `lib/backtesting.ts`'te zaten yazılı → yeniden
kullanılır"* diyordu. **Doğru değil:** `calculateSharpeRatio`/`calculateMaxDrawdown`
**dışa aktarılmamış** ve `SignalPerformanceRecord[]` (işlem kayıtları) üzerinde çalışıyor —
fonun ihtiyacı olan **NAV serisi** (günlük birim pay değeri) sürümü değil. Zorlama bir
yeniden kullanım yerine `fund-metrics.ts`'te seri-tabanlı sürümleri yazıldı.
**Gerçekten yeniden kullanılanlar:** `fetchPolicyRate()` (risksiz getiri) ·
`fetchTurkeyInflation()` (reel getiri) · `opportunity-reasons` rozet deseni ·
precompute/`ai_cache` deseni · `realize()` enflasyon konvansiyonu.

#### Kademe kararı
- **Kademe 1 (risk/getiri) → GO** — fiyat serisi + kategori var.
- **Kademe 2 (akım) → GO** — `tedPaySayisi` + `kisiSayisi` var. *(Bu, planın en
  ayırt edici parçasıydı; rakiplerin hiçbirinde yok.)*
- **Kademe 3 (ücret/dağılım) → BEKLEMEDE** — uç bulunamadı, **uydurulmayacak**. Ayrı bir
  keşif işi (izahname/KAP veya TEFAS'ın başka bir ucu). F4 bu yüzden ertelendi.

### ✅ FAZ F1 — Veri katmanı (2026-09-08)

- **`lib/fund-universe.ts` (YENİ):** 12 şemsiye fon türü (TEFAS kodlarıyla, canlı
  doğrulandı) · `FundUniverse` = TEFAS/BES → `fonTipi` eşlemesi ·
  **`guessAccessibility()`** — TEFAS'ta erişilebilirlik ALANI YOK, ad-tabanlı sezgisel
  çıkarım yapılır ve sonuç `source: 'ad-tabanlı-tahmin'` ile **etiketlenir** (kesin bilgi
  gibi sunulmaz; şüphede "herkes" denmez).
- **`lib/fund-data.ts` (YENİ):** kaynak-agnostik arayüz (`viop-data.ts` deseni).
  F0'da ölçülen sınırlar burada kapsüllendi: **28 günlük pencere ile parçalı çekim**
  (kaynak aşımda hata değil sessiz BOŞ döndürüyor — bu tehlike koda yorum olarak yazıldı),
  **2,2 sn nazik aralık**, 429'da üstel geri çekilme, 500'lük sayfalama.
  Her yanıtta `asOf` + `dataQuality` (`tam`/`kısmi`/`yok`) + gerekirse `note`.
  Fiyatsız satır 0 sayılmaz, **düşürülür**.

### ✅ FAZ F2 — Risk & Getiri motoru (2026-09-08) — **ürünün kalbi çalışıyor**

**`lib/fund-metrics.ts` (YENİ)** — saf/deterministik. F2-1…F2-4'ün tamamı:
dönemsel getiriler (1h→5y, kümülatif + yıllıklandırılmış) · **üç katmanlı getiri**
(nominal → fazla → reel) · risk (volatilite/Sharpe/Sortino/maxDD/Calmar/en kötü ay) ·
beceri (alfa/beta/**Information Ratio**/rolling tutarlılık/tek-yıl bağımlılığı).

**Bilinçli kararlar:**
- **Fisher reel getiri** — `growth-momentum.realize()` ve banka motoru basit çıkarma
  kullanıyor; fonda Fisher tercih edildi çünkü fark bu enflasyonda MATERYAL
  (%45 getiri / %32 enflasyon: çıkarma %13, Fisher %9,8 → sıralamayı değiştirir).
  *Birleştirme kararı ürün sahibinde — bilinçli sapma, kod yorumunda işaretli.*
- **1 yıldan kısa dönem yıllıklandırılmaz** (3 aylık %10'u "yıllık %46" diye sunmak yanıltıcı).
- **Bileşik dönem oranı** — yıllık %37 faiz 6 ayda %18,5 değil %17,0.
- Risksiz getiri yoksa Sharpe `null` (0 varsayılmaz); varyans sıfırsa beta `null`
  (sıfıra bölme uydurulmaz); aşağı gün yoksa Sortino `null`.

**🐛 Testin yakaladığı GERÇEK kusur:** dönem dilimleyici, 10 günlük geçmişi olan yeni
bir fonun getirisini **"5 yıllık getiri" diye raporluyordu** (dilim tüm seriyi döndürüyor,
kapsama kontrolü yoktu). Yeni fonlar uzun geçmişli fonlarla aynı kolonda yarışacaktı.
→ `coversPeriod()` eklendi: dönemin en az %90'ı veriyle kapanmalı, yoksa metrik üretilmez.

**Doğrulama:** **387/387 test** (28 yeni), `tsc` + `npm run build` temiz.

**Canlı e2e (12 fon, 6 kategori, ~190 gün, gerçek makro: faiz %37 · TÜFE %31,5):**

| kod | kategori | nominal | fazla | reel | vol | Sharpe | maxDD |
|---|---|---|---|---|---|---|---|
| THF | Hisse Senedi | %49,5 | %34,5 | %32,4 | %25,4 | 2,58 | −%11,6 |
| TP2 | Para Piyasası | %23,1 | %8,2 | %9,1 | %1,9 | **9,01** | %0,0 |
| GRO | Serbest | %10,7 | **−%4,2** | −%1,9 | %1,3 | −5,80 | −%0,1 |
| YKT | Kıymetli Madenler | %2,6 | −%12,3 | **−%9,1** | %20,7 | −1,13 | −%13,6 |

**⭐ Çifte sıralama ayrışması KANITLANDI** (F5-2'nin gerekçesi, gerçek veriyle):
`THF → getiride 1. · risk-ayarlıda 7.` · `TP2 → getiride 3. · risk-ayarlıda 1.`
Ham getiri sıralaması kullanıcıyı 25 volatiliteli fona, risk-ayarlı sıralama 1,9
volatiliteli fona götürüyor. **Ürünün tezi canlı veride doğrulandı.**

### ✅ FAZ F5 + F6-1 + F7 — Skor, ekran, precompute (2026-09-09)

| Bileşen | Dosya |
|---|---|
| İki geçişli runner (ölçüm → kategori medyanı → göreli skor + bayrak) | `lib/fund-runner.ts` |
| Precompute cron (`?universe=TEFAS\|BES&days=N`) | `app/api/cron/fund-scan/route.ts` |
| Okuma API'si (ham pencere KASITLI dışarı verilmez) | `app/api/fonlar/route.ts` |
| `/fonlar` ekranı (TEFAS↔BES ayrı, çifte sıra her satırda) | `components/new/FonlarScreen.tsx` + `app/fonlar/page.tsx` |
| Kabuk bağlantısı | `lib/new-design-routes.ts`, `components/new/AppShell.tsx` (sidebar 8. link) |
| Cron takvimi (21:30 / 21:50 TRT — fon fiyatı akşam yayımlanır) | `vercel.json` |

**Evren kararı (kullanıcı, 2026-09-09): `kisiSayisi ≥ 1000`.** Ölçüldü: TEFAS 2.034 → **639 fon**,
varlığın **%76,8'i** korunuyor ve **hiçbir kategori n<5'e düşmüyor** (en küçüğü Karma 8→7).
Eşik **dinamik** — sabit liste değil, her koşuda yeniden değerlendirilir.

**Migration kararı (planın "ai_cache yeter" varsayımı DÜZELTİLDİ):** ham NAV serisini
tam saklamak `ai_cache` tek satırına sığmaz (1 yıl ≈ **33 MB**, 5 yıl ≈ 165 MB). Çözüm:
`ai_cache`'te yalnız **75 günlük kayan ham pencere + türetilmiş metrikler** (~1,5 MB) tutulur;
uzun geçmiş gerektiren metrikler (5y, rolling tutarlılık) ayrı tablo işi olarak ERTELENDİ.
**Migration hâlâ YOK.**

**Backfill mimarisi (ölçülerek seçildi):** tarih-bazlı çekim fon-bazlıdan **~15 kat ucuz**
(1 yıl için 1.250 istek vs 18.400). Bir gün = tüm evren (~5 sayfa istek).

**⚠️ `days` sınırı gerçek:** her koşu ayrıca kategori haritası için 12 kategori × ≤4 sayfa
çeker ve TEFAS 2,2 sn aralık ister. `days=20` tek çağrıda 300 sn'yi AŞAR — ilk doldurma
`days=5` ile birkaç kez tekrarlanmalı (pencere merge'lenir, tekrar zararsız).

### ⏳ KALAN
F3 (akım — veri GO, kodlanmadı) · F4 (maliyet — **Kademe 3 verisi yok, bloklu**) ·
F6-2 fon detayı · F6-3 karşılaştırma · uzun geçmiş için tablo kararı.

---

## Context

### Neden bu özellik

Türkiye'de bireysel yatırımcının parasının çok büyük kısmı fonlarda ve BES'te. Rakip
tablosuna (CLAUDE.md) bakınca: Matriks · Bigpara · TradingView · Fintables — hiçbiri
**risk-ayarlı + ücret-düzeltilmiş + akım analizli** fon karşılaştırması sunmuyor.
TEFAS'ın kendisi bile ham getiri sıralaması gösteriyor.

Ve ürün-kitle uyumu hisseden **daha iyi**: fon, "borsa bilmeyen kullanıcı" hedefiyle tek
hisse sinyalinden daha uyumlu; SPK açısından da fon karşılaştırması al-sat sinyalinden
**çok daha savunulabilir** bir alan.

### Zaten elimizde olan (yeniden kullanılacak)

| Varlık | Dosya | Fon tarafında kullanımı |
|---|---|---|
| **Politika faizi (%37, canlı)** | `lib/turkey-macro.ts` `policyRate` | **Risksiz getiri** — Sharpe paydası + "fazla getiri" testi |
| **TÜFE (%32,6, canlı)** | `fetchTurkeyInflation()` | **Reel getiri** (Fisher) |
| **Sharpe · Max Drawdown · Equity curve · BIST100 benchmark · t-test** | `lib/backtesting.ts` | Fon metriklerinin çoğu **zaten yazılı** (BT6-BT10) |
| Enflasyon reelleştirme konvansiyonu | `growth-momentum.ts` `realize` / Fisher | Aynı konvansiyon (banka motorunda da kullanıldı) |
| **Gerekçe rozeti deseni** | `lib/opportunity-reasons.ts` (`{id,priority,tone,text,evidence}`) | Fon gerekçeleri aynı desende — sade Türkçe, jargonsuz |
| Precompute deseni | `growth-momentum-runner` + cron + `ai_cache` | Fon evreni için birebir |
| Yeni ekran deseni (4 adım) | `AppShell` + `NEW_DESIGN_ROUTES` | `/fonlar` |
| Flag deseni | `lib/scoring-config.ts` | `FUND_ENGINE` tek anahtar |

**Repoda fon kodu YOK** (doğrulandı) — temiz sayfa, ama zemin hazır.

---

## ⚠️ ÜÇÜNCÜ KEZ ÖĞRENMEYELİM: kalibrasyon kuralı

> Bu projede **iki kez** aynı ders canlı veride yakalandı:
> - Banka K1: "reel ROE < 0 → veto" kuralı **8 bankanın 7'sini** siliyordu (TÜFE %32 iken
>   tüm sektörün ROE'si altında kalıyor).
> - Banka K2: NIM trend eşiği mutlaktı → faiz indirim döngüsünde **12 bankanın 12'sinde**
>   "marj genişliyor" rozeti çıktı.
>
> **Kural: evrenin çoğunda tetiklenen bayrak bilgi taşımaz — o bağlamdır, ayrıştırıcı değil.**

**Fonda bu tuzak KESİN çıkacak:** %37 faiz ortamında hisse fonlarının muhtemelen büyük
çoğunluğu risksiz getiriyi geçemiyor. Eğer "risksiz faizi geçemedi" sert bayrak yapılırsa
neredeyse tüm hisse fonları elenir → ürün çöker.

**Tasarım kararı (baştan):**
- **Mutlak testler = BAĞLAM.** Her zaman gösterilir (şeffaflık), asla veto etmez.
  *"Bu fon %41 getirdi; risksiz getiri %37 idi."*
- **Bayrak/veto = KATEGORİ EMSALİNE GÖRE.** Fon yalnız **kendi kategorisindeki** akranlarından
  geri kaldığında ayrıştırıcı bayrak alır (hisse fonu hisse fonlarıyla, para piyasası para
  piyasasıyla).
- Kategoride örneklem yetersizse (n < 5) → **mutlak eşiğe düşülür ve rozet sektör iddiası
  ETMEZ** (banka K2'deki aynı çözüm).

---

## Ürün dili — fon yatırımcısı ayrı karakter

Kullanıcı kararı: *"fon yatırımcısıyla hisse yatırımcısı çok ayrı karakterlere sahip."*
Bu, sadece ayrı ekran değil **ayrı dil** demek:

| Hisse dünyası | Fon dünyası |
|---|---|
| "Sinyal", "kurulum", "giriş/stop/hedef" | **"Karşılaştırma", "uygunluk", "maliyet"** |
| Gün-hafta ufku | **Ay-yıl ufku** |
| "Şimdi al" enerjisi | **"Hangisi daha mantıklı"** |
| Tek hisse riski | **Portföy uyumu, çeşitlendirme** |

→ Fon ekranlarında "AL/SAT", stop-loss, R/R **kullanılmaz**. Çıktı dili karşılaştırma ve
uygunluk üzerine kurulur. **"Yatırım tavsiyesi değildir"** ibaresi korunur.

---

## FAZ F0 — Veri spike (BLOKLAYICI, GO/NO-GO) 🔴

> **KAP bloklandı. BDDK NO-GO çıktı.** Bu projede "erişilebilir varsayma" iki kez yandı.
> Hiçbir şey kodlanmadan önce ölçülür.

### F0-1: TEFAS spike
Örneklem: 30 fon (hisse / serbest / para piyasası / borçlanma / katılım / kıymetli maden karışık).
**Ölçülecek ve raporlanacak:**

| Veri | Neden kritik | Yoksa ne olur |
|---|---|---|
| Birim pay değeri geçmişi (ne kadar geriye?) | Tüm metriklerin temeli | **NO-GO** — özellik yok |
| **Tedavüldeki pay adedi** | ⭐ Akım analizinin TEK doğru kaynağı | Kademe 2 (akım) düşer |
| **Yatırımcı sayısı** | Perakende/kurumsal ayrımı | Akım yorumu zayıflar |
| Portföy dağılımı (varlık sınıfı) | Tembel para / stil kayması tespiti | Kademe 3 düşer |
| **Toplam Gider Oranı / yönetim ücreti** | Ücret analizi | Kademe 3 düşer (izahname ayrı iş) |
| Karşılaştırma ölçütü tanımı | Alfa / Information Ratio | Alfa hesaplanmaz, yalnız mutlak metrikler |
| Fon kategorisi | Emsal karşılaştırması (kalibrasyon kuralı!) | **Kritik** — emsal yoksa bayraklar mutlak kalır |
| Nitelikli yatırımcı / erişilebilirlik | "Sen bunu alabilir misin?" | Erişilemez fon sıralamada görünür → yanıltıcı |
| **Vercel/sunucu tarafından erişilebilirlik** | KAP dersi | **NO-GO** |

### F0-2: BES/Emeklilik spike (AYRI)
BES fonları farklı platform/şema. Ayrı ölçülür; TEFAS'la **aynı arayüze** oturup oturmadığı
raporlanır. Oturmuyorsa iki ayrı adaptör (kullanıcı kararı zaten "ayrı bölüm").

### F0-3: Çıktı
Kapsam raporu + **kademe bazlı GO/NO-GO**:
- **Kademe 1** (fiyat serisi yeter) → risk/getiri motoru
- **Kademe 2** (pay adedi + yatırımcı sayısı) → akım motoru
- **Kademe 3** (ücret + dağılım) → maliyet & tuzak motoru

> **Lisans/dürüstlük:** VIOP ve BILANCO planlarındaki aynı ilke — **türetilmiş analiz
> servis et, ham veri setini yayınlama.** Erişilemeyen metrik **uydurulmaz**, "veri yok" denir.

---

## FAZ F1 — Veri katmanı (kaynak-agnostik)

- **Yeni:** `lib/fund-data.ts` — TEK arayüz (`viop-data.ts` deseni):
  `getFundHistory(code)` · `getFundSnapshot(code)` · `listFunds(universe)`.
  `universe: 'TEFAS' | 'BES'`. Her yanıtta `dataQuality` + `asOf`.
  Kaynak değişirse **yalnız bu dosya** değişir.
- **Yeni:** `lib/fund-universe.ts` — fon kayıt defteri: kod, ad, kurucu, **kategori**,
  `universe`, **`accessibility: 'herkes' | 'nitelikli' | 'kurucuya-özel'`**, kuruluş tarihi.
- Normalizasyon: TL, tarih hizalama (fon tatil günlerinde fiyat üretmez → BIST100/faiz
  serisiyle **inner-join**; `deriveGramTryFromOns` ve `isyatirim-financials` derslerindeki
  aynı hizalama disiplini).

**Doğrulama:** Birim test — tarih hizalama, eksik gün, kategori eşleme, erişilebilirlik bayrağı.

---

## FAZ F2 — Risk & Getiri motoru (Kademe 1 — çekirdek)

**Yeni:** `lib/fund-metrics.ts` — saf/deterministik. **`lib/backtesting.ts` yeniden kullanılır**
(Sharpe · max drawdown · equity curve · benchmark · t-test zaten var).

### F2-1: Getiri katmanı (kullanıcı "getiri sıralaması da önemli" dedi — birinci sınıf)
Dönemsel getiriler: **1 hafta · 1 ay · 3 ay · 6 ay · YTD · 1 yıl · 3 yıl · 5 yıl**
(yıllıklandırılmış + kümülatif ayrı ayrı).

### F2-2: Üç katmanlı gerçek getiri (ürünün kalbi)
```
Nominal getiri
  − Risksiz getiri (TCMB politika faizi, dönem-eşleşmeli)  → FAZLA GETİRİ
  − Enflasyon (TÜFE, Fisher)                                → REEL GETİRİ
```
Her fon kartında bu üçü **birlikte** görünür. *(Kalibrasyon kuralı: bunlar **bağlam**,
tek başına veto değil.)*

### F2-3: Risk metrikleri
Volatilite (yıllık) · **Sharpe** (risksiz = politika faizi) · **Sortino** (yalnız aşağı
yönlü sapma) · **Max drawdown** · **Calmar** (getiri / maxDD) · en kötü ay / en kötü çeyrek.

### F2-4: Beceri metrikleri (şans ayrımı)
- **Alfa** ve **Beta** — fonun kendi karşılaştırma ölçütüne göre (yoksa kategori medyanına)
- **Information Ratio** = alfa / izleme hatası ⭐ *asıl beceri ölçüsü*
- **Rolling tutarlılık** — kayan 12 aylık pencerelerde kategori medyanını geçme oranı
  (nokta-nokta getiri DEĞİL)
- **Tek-yıl bağımlılığı** — 5 yıl getirisinin ne kadarı tek bir yıldan geliyor

**Doğrulama:** Birim test (`lib/__tests__/fund-metrics.test.ts`) — Sharpe/Sortino/Calmar
bilinen girdilerle, Fisher reel getiri, rolling pencere, tek-yıl bağımlılığı, kısa geçmişli
fon (yeterli veri yok → metrik üretilmez, **uydurulmaz**).

---

## FAZ F3 — Para akım motoru (Kademe 2 — F0-1 GO gerekir)

**Yeni:** `lib/fund-flows.ts`

### F3-1: Doğru akım ölçümü ⭐
```
❌ YANLIŞ:  Δ(fon büyüklüğü)        — fiyat artınca büyüklük de artar, para girmese bile
✅ DOĞRU:   Δ(tedavüldeki pay adedi) × ortalama birim pay değeri
```
Pay adedi **yalnız** yatırımcı alıp sattığında değişir; fiyat hareketinden etkilenmez.
Bu ayrımın koda **yorum olarak** yazılması şart (gelecekte "basitleştirme" cazibesine karşı).

### F3-2: Akımın yorumu (ters okuma)
Akım tek başına "iyi" değildir:

| Desen | Yorum |
|---|---|
| Pay adedi ↑ + yatırımcı sayısı ~sabit | **Kurumsal para** girişi |
| Pay adedi ↑ + yatırımcı sayısı ↑↑ | **Perakende akını** — genelde geçmiş getiriyi kovalayan geç para |
| Küçük fona hızlı giriş | ⚠️ **Kapasite sorunu** — yönetici artık aynı stratejiyi uygulayamaz |
| Sürekli çıkış + küçülen büyüklük | ⚠️ **Zorunlu satış + kapanma riski** |

### F3-3: Akım-getiri çaprazı
Akım ile sonraki dönem getirisi arasındaki ilişki fon bazında izlenir — **iddia edilmeden**
gösterilir (bu bir gözlem, alfa iddiası değil).

**Doğrulama:** Pay adedi sabitken fiyat değişince akım **sıfır** çıkmalı (regresyon testi —
yanlış formüle karşı koruma). Kapasite ve çıkış senaryoları.

---

## FAZ F4 — Maliyet & Tuzak motoru (Kademe 3 — F0-1 GO gerekir)

**Yeni:** `lib/fund-cost.ts` + `lib/fund-traps.ts`

### F4-1: Ücretin doğru çerçevelenmesi
"Yönetim ücreti %2,5" kullanıcıya hiçbir şey anlatmaz. Anlatan çerçeve:

> **"Ücret, fonun ürettiği fazla getirinin yüzde kaçını yedi?"**

```
ücretPayı = TGO / (nominal getiri − risksiz getiri)
```
Fazla getiri negatifse → *"Fon risksiz getiriyi geçemedi; ücret doğrudan kayıp."*
**TGO** (yönetim + saklama + denetim + aracılık) esas alınır; serbest fonda **performans
ücreti** ayrıca gösterilir.

### F4-2: Tuzak desenleri (hisse tarafındaki felsefenin fon karşılığı)

| # | Tuzak | Belirti | Bayrak tipi |
|---|---|---|---|
| 1 | **Kapalı endeksleme** | Portföy ≈ endeks, ücret aktif (düşük izleme hatası + yüksek TGO) | emsal-göreli |
| 2 | **Tembel para** | Hisse fonu ama portföyün büyük kısmı repo/mevduat | emsal-göreli |
| 3 | **Tek yıl parlaması** | 5 yıl getirisinin çoğu tek yıldan | mutlak |
| 4 | **Stil kayması** | Dağılım ilan edilen kategoriyle uyumsuz | mutlak |
| 5 | **Kapasite sorunu** | Küçük fona hızlı akım | mutlak |
| 6 | **Eriyen fon** | Sürekli çıkış + küçülen büyüklük | mutlak |
| 7 | **Erişilemez fon** | Nitelikli yatırımcı / kurucuya özel | **filtre** (bayrak değil) |
| 8 | **Reel kayıp** | Enflasyon sonrası negatif | **BAĞLAM** (kalibrasyon kuralı!) |

**7. madde kritik:** Getiri sıralamasının tepesindeki fonların önemli kısmı serbest fon ve
nitelikli yatırımcı şartlı. Filtresiz göstermek kullanıcıyı yanıltır →
**"Sen bunu alabilir misin?"** filtresi varsayılan olarak açık.

### F4-3: Vergi notu (opsiyonel, dikkatli)
Fon türüne göre stopaj farkı net getiriyi materyal olarak değiştirir. **Ama:** mevzuat
değişir ve bu kişiye özel vergi tavsiyesi değildir. → Yalnızca **bilgilendirici not**
olarak, "genel bilgi, mevzuat değişebilir" ibaresiyle. Skora **girmez**.

---

## FAZ F5 — Skor + çifte sıralama

**Yeni:** `lib/fund-score.ts`

### F5-1: Risk-ayarlı bileşik skor (varsayılan sıralama)
Kategori-göreli bileşenler: risk-ayarlı getiri (Sharpe/Sortino) · beceri (IR + rolling
tutarlılık) · maliyet verimliliği (ücret/fazla getiri) · istikrar (maxDD/Calmar) ·
akım sağlığı (varsa). Eksik bileşende **ağırlık yeniden normalize** (`long-term-runner`
deseni — veri yoksa skor uydurulmaz).

### F5-2: Çifte sıralama görünürlüğü ⭐ (kullanıcı kararının çözümü)
Kullanıcı: *"senin önerine göre olsun ama getiri sıralaması da önemli."*

**Çözüm — seçtirme değil, ikisini birden göster:**
- **Varsayılan sıra = risk-ayarlı skor.**
- **"Getiriye göre sırala"** birinci sınıf bir seçenek (gizlenmiş değil).
- **Her satırda İKİ sıra birden görünür:** *"Getiride 3. · Risk-ayarlıda 47."*
  Kullanıcı ayrışmayı **kendi gözüyle** görür — bu tek başına eğitici.
- Getiri sıralaması aktifken **risk bağlamı satır içinde kalır** (volatilite/maxDD),
  gizlenmez.

Bu, "getiriyi saklamadan doğru olanı öne çıkarma" dengesidir.

### F5-3: Gerekçe rozetleri (mevcut desen yeniden kullanılır)
`lib/opportunity-reasons.ts`'in `{id, priority, tone, text, evidence}` deseni fon diline
uyarlanır — **maks 4 rozet, warn mutlaka görünür, jargon yasak, motor içi sayı sızmaz**
(FIRSATLAR-SUNUM-PLAN ilkeleri birebir geçerli).

Örnek rozetler: *Emsallerine göre daha az dalgalandı* · *Ücret fazla getirinin yarısını
yiyor* · *Son 3 ayda para çıkışı var* · *⚠️ Yalnız nitelikli yatırımcı* ·
*⚠️ Getirinin çoğu tek yıldan* · *Kategori medyanını 5 yılın 4'ünde geçti*.

---

## FAZ F6 — Ekranlar (ayrı dünya)

### F6-1: `/fonlar` — TEFAS ve BES **ayrı bölümler** (kullanıcı kararı)
- **Yeni:** `components/new/FonlarScreen.tsx` + `app/fonlar/page.tsx` (`<AppShell>`)
  → `lib/new-design-routes.ts` + AppShell sidebar (**8. link**).
- Üst seviye ayrım: **TEFAS Fonları** ↔ **BES / Emeklilik**. Karışmaz — farklı evren,
  farklı vergi/erişim rejimi, farklı yatırımcı ufku.
- Her bölümde: kategori filtresi · sıralama anahtarı (risk-ayarlı / getiri) · dönem seçici
  (1a/3a/1y/3y/5y) · erişilebilirlik filtresi (varsayılan: **alabileceklerim**).

### F6-2: Fon detayı
Üç katmanlı getiri (nominal/fazla/reel) · risk metrikleri · beceri metrikleri ·
**akım grafiği** · ücret analizi · portföy dağılımı · tuzak bayrakları · kategori
emsalleri içindeki konumu.

### F6-3: Fon karşılaştırma
2-4 fonu yan yana — aynı metrik seti. Fon yatırımcısının en çok ihtiyaç duyduğu ekran.

> **Tasarım not:** Görsel dil `design` ile ayrıca tasarlanacak. Plan **ne gösterileceğini**
> tanımlar; yerleşim/tipografi/etkileşim tasarıma bırakılır (HUB-EKRANLARI-PLAN deseni).

---

## FAZ F7 — Precompute (mevcut desen — MIGRATION YOK)

- **Yeni:** `lib/fund-runner.ts` — `growth-momentum-runner.ts` deseni; evren büyükse
  `?part=1|2` bölme. **İKİ GEÇİŞLİ** (banka K2 dersi): 1) ölçüm, 2) **kategori medyanlarını
  türet + emsal-göreli bayrak/verdict**.
- **Yeni:** `app/api/cron/fund-scan/route.ts` — günlük (fon fiyatları günlük açıklanır),
  `maxDuration=300`, `ai_cache: fund-metrics:TEFAS` ve `fund-metrics:BES` (ayrı satır).
- **Yeni:** `app/api/fonlar/route.ts` — tek satır okur, **fan-out YOK**.
- `vercel.json`: fon fiyatları akşam yayımlanır → gece/sabah koşusu.

---

## Kapsam DIŞI (bilinçli)

- ❌ Fon **al-sat sinyali** — fon dünyasında "AL/SAT/stop/hedef" dili kullanılmaz
- ❌ Fon içi **tek tek hisse holdings** analizi (TEFAS varlık sınıfı bazında veriyor;
  gerçek "active share" hesaplanamaz → iddia edilmez)
- ❌ Kişiye özel vergi hesabı / portföy tavsiyesi
- ❌ Yabancı (offshore) fonlar
- ❌ Getiri **tahmini** — geçmiş performansın devamlılığı zayıftır, tahmin edilmez

---

## Riskler

| Risk | Azaltma |
|---|---|
| **TEFAS sunucudan bloklu** (KAP gibi) | F0 GO/NO-GO; NO-GO → özellik durur, uydurma veri YOK |
| **Pay adedi verisi yok** | Akım motoru (F3) düşer; F2/F4 tam çalışır, dürüstçe etiketlenir |
| **Ücret (TGO) verisi yok** | F4-1 düşer; izahname/KAP ayrı iş olarak işaretlenir |
| ⚠️ **Bayrak evrenin çoğunda tetikleniyor** | **Kalibrasyon kuralı** baştan uygulanır: mutlak = bağlam, emsal-göreli = bayrak. Runner iki geçişli |
| Karşılaştırma ölçütü yok → alfa yok | Kategori medyanı yedek benchmark; "fonun kendi ölçütü değil" diye etiketlenir |
| Kısa geçmişli yeni fon | Metrik üretilmez ("yeterli geçmiş yok"), 0 veya uydurma DEĞİL |
| Geçmiş getiriye dayalı seçim yanılgısı | Rolling tutarlılık + tek-yıl bağımlılığı + "geçmiş performans gelecek getiriyi garanti etmez" ibaresi |
| SPK / çerçeve | Karşılaştırma & analiz dili; "bu fonu al" YOK; "yatırım tavsiyesi değildir" kalıcı |

---

## Sıralama

```
F0 Veri spike (TEFAS + BES ayrı)                     🔴 BLOKLAYICI
   └→ F1 Veri katmanı (kaynak-agnostik arayüz)
        └→ F2 Risk & Getiri motoru (Kademe 1)        ← ürünün kalbi, yalnız fiyat serisi ister
             ├→ F3 Akım motoru        (Kademe 2 GO)
             ├→ F4 Maliyet & Tuzak    (Kademe 3 GO)
             └→ F5 Skor + çifte sıralama
                  └→ F6 Ekranlar → F7 Precompute
```

**Not:** F2 tek başına bile üründür — üç katmanlı getiri + risk-ayarlı sıralama, hiçbir
rakibin sunmadığı şey. F3/F4 spike sonucuna bağlı; olmazsa ürün küçülür ama **çökmez**.

---

## Doğrulama (her faz)

1. `npx tsc --noEmit` + `npm run build` temiz; mevcut 325+ test geçmeye devam eder.
2. Birim testler: metrik doğruluğu (bilinen girdi), **akım formülü regresyonu** (fiyat
   değişince akım sıfır), Fisher reel getiri, kategori-göreli vs mutlak eşik.
3. **Kalibrasyon doğrulaması (ZORUNLU):** her bayrak için "evrenin yüzde kaçında tetikleniyor"
   ölçülür. **%70'in üstündeyse bayrak değil bağlamdır** → emsal-göreliye çevrilir.
4. Canlı veri e2e: en az 10 fon (farklı kategori) elle doğrulanır; getiri ve risk-ayarlı
   sıralamaların **ayrıştığı** en az bir örnek gösterilir (çifte sıralamanın değeri).
5. Erişilemez fonlar varsayılan görünümde **yok**; filtre açılınca etiketli görünüyor.
6. Ekran: açık/karanlık tema + mobil/masaüstü + boş durum + "yeterli geçmiş yok" durumu.
7. **Migration GEREKMEZ** — `ai_cache` tek-satır deseni.

---

## Açık kararlar (kodlamadan önce)

1. **BES kapsamı:** Tüm emeklilik fonları mı, yoksa yalnız kullanıcının seçebileceği
   (katkı payı yönlendirmeli) fonlar mı?
2. **Erişim:** `/fonlar` public mi, premium (tier-gated) mi? *(VIOP premium yapılmıştı;
   `PREMIUM_PREVIEW` açık olduğu için şu an fark etmez.)*
3. **Portföy entegrasyonu:** Kullanıcı fonlarını Portföyüm'e ekleyebilsin mi? *(Ayrı dünya
   kararı verildi ama portföy takibi ayrı bir soru — öneri: F6'dan SONRA ayrı faz.)*
4. Ücret verisi TEFAS'ta yoksa izahname/KAP'tan çekme ayrı bir faz olarak açılsın mı?
