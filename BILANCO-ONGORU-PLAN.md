# Bilanço Öngörü & Kâr Kalitesi Motoru — Uygulama Planı

> ⚠️ Bu dosya daha önce "Yetim sayfalar → Hub & Sekme" planını içeriyordu. Plan modunda
> yalnızca bu dosya düzenlenebildiği için üzerine yazıldı. Hub planının içeriği sohbet
> geçmişinde duruyor; istenirse repo köküne ayrı `.md` olarak geri yazılabilir.

---

## Context

Amaç: **bilanço açıklanmadan önce hangi şirketin iyi/kötü rapor edeceğini öngörüp
konumlanmak**, ve rapor geldiğinde **kârın gerçek mi kâğıt üstü mü olduğunu** ayırt etmek.

Kullanıcının koyduğu iki çekirdek soru (planın omurgası):
1. **"Bu şirket faaliyet kârı yapıyor mu, gerçekten kâr edebiliyor mu?"**
2. **"Bu zaten fiyatlanmış mı?"** — ve *"bu dönem gelen bilançolar baya kötü"* gözlemi.

### Tasarım tezi (en kritik profesyonel nokta)

**"İyi bilanço" ≠ "hisse yükselir".** Piyasa mutlak rakamı değil, **beklentiye göre sapmayı**
ve **zaten fiyatlanmış olup olmadığını** işler. %50 kâr artışı açıklayan şirket, beklenti %80
ise düşer. Bu yüzden bu özellik "kâr rakamını tahmin etme" üzerine değil, üç eksen üzerine kurulur:

| # | Soru | Yöntem |
|---|---|---|
| 1 | Bilanço **ne zaman**? | Mevcut `nextEarningsTimestamp` (var) |
| 2 | **Faaliyet kârı gerçekten iyi mi?** | Kâr köprüsü + TMS-29 ayrıştırması + **dönem-göreli** normalizasyon |
| 3 | **Zaten fiyatlandı mı?** | `lib/news-impact.ts` event-study motoru **yeniden kullanılır** |

### BIST'e özgü #1 gerçek: TMS-29 enflasyon muhasebesi

2023'ten beri BIST tabloları TMS-29 ile yeniden düzenleniyor. Raporlanan "net kâr"
**net parasal pozisyon kazancını/kaybını** içeriyor:
- Net parasal **yükümlülüğü** yüksek şirket (borçlu) → devasa "kâr" yazar, nakit girişi yok.
- Nakit/alacak zengini şirket → parasal **kayıp** yazar, operasyonu iyi olsa bile.

Sonuç: **net kâr şu an operasyonu ölçmüyor; faaliyet kârı dürüst sayı.** Kullanıcının sezgisi
birebir doğru ve mevcut yığında bu ayrıştırma **hiç yok**.

### Mevcut durum — envanter bulguları

| Bulgu | Etki |
|---|---|
| `lib/financial-statements.ts` yalnız `type: 'annual'` | ❌ Çeyreklik veri YOK → öngörü matematiksel olarak imkânsız. **#1 ön koşul** |
| `module: 'all'` tüm kalemleri indiriyor, kod yalnız **20 alanı** okuyor | ✅ FAVÖK/capex/stok/ticari borç/faiz gideri **bedava** eklenebilir |
| `earningsHistory`, `earningsTrend`, `epsTrend`, `epsRevisions`, `upgradeDowngradeHistory` hiç çağrılmıyor | ✅ Aynı quoteSummary çağrısına eklenir → sürpriz geçmişi + revizyon momentumu |
| `recommendationMean` statik snapshot, zaman serisi yok | ⚠️ "Analist momentumu" aslında momentum değil, seviye |
| KAP bloklu (`kap.org.tr` sunucu erişimini engelliyor) | ❌ Dipnot/segment/FX detayı erişilemez → TMS-29 **tahmin edilecek**, okunmayacak |
| `growth-momentum.ts` enflasyon-düzeltilmiş rakamdan bir kez daha TÜFE çıkarıyor | 🐛 **Çifte sayım bug'ı** — düzeltilmeli |
| `lib/news-impact.ts` event-study (anormal getiri + hacim z-skoru + anticipation) | ✅ **Fiyatlanma analizi için hazır altyapı** |

---

## Veri kaynağı stratejisi

**Karar:** Yıllık + türetilmiş çeyrek ile başla (ücretsiz), ama çeyreklik için **iki adayı
paralel spike'la** ve ücretli yolları da değerlendir.

| Aday | Tip | Not |
|---|---|---|
| **İş Yatırım** (`isyatirim.com.tr`) | Ücretsiz | Açık kaynak TR kütüphanelerinin (borsapy) KAP bloklu olduğu için kullandığı **standardize çeyreklik** mali tablo kaynağı. **En güçlü aday** — önce bu denenmeli |
| Yahoo `fundamentalsTimeSeries type:'quarterly'` | Ücretsiz | Mevcut yığınla sıfır entegrasyon maliyeti; BIST kapsamı ölçülmeli |
| Fintables | Ücretli | Çeyreklik standardize tablo + Excel; dokümante public API yok |
| Finnet "Analiz Expert" | Ücretli | Programatik erişim vaat ediyor; fiyat/lisans sorulmalı |
| EODHD Fundamental API | Ücretli | 70+ borsa; BIST kapsamı ve derinliği doğrulanmalı |

> **Lisans notu:** Ücretsiz kaynaklarda ham tablo **redistribüsyonu** riskli olabilir.
> VIOP planındaki aynı ilke: **türetilmiş analiz/skor servis et, ham tabloyu yayınlama.**

---

## FAZ B0 — Veri temeli (BLOKLAYICI, önce bu) 🔴

### B0-1: Çeyreklik veri spike — GO/NO-GO kapısı
- Örneklem: 50 sembol (büyük/orta/küçük ölçek karışık, +2 banka).
- İki adayı **paralel** ölç: İş Yatırım endpoint'i + Yahoo `type:'quarterly'`.
- Ölçülecek: kaç sembolde son 8 çeyrek dolu, hangi kalemler geliyor, gecikme (rapor sonrası
  kaç günde yansıyor), tutarlılık (yıllık toplam ≈ 4 çeyrek toplamı mı).
- Çıktı: kapsam raporu + **GO/NO-GO**. NO-GO → B2 (nowcast) yıllık+TTM ile sınırlı moda düşer,
  B1/B3 tam çalışmaya devam eder.

### B0-2: Alan haritasını genişlet (bedava — ekstra API çağrısı YOK)
`lib/financial-statements.ts` `FinancialYear` tipine ekle (Yahoo yanıtında zaten var, kod okumuyor):
`EBITDA` · `capitalExpenditure` · `inventory` · `accountsPayable` · `interestExpense` ·
`interestIncome` · `cashAndCashEquivalents` · `taxProvision` · `totalRevenue` alt kırılımları.
→ Bunlar olmadan **faiz karşılama oranı**, **nakit dönüşüm döngüsü**, **net borç**, **capex/amortisman**
hesaplanamıyor. Tek dosya değişikliği, en yüksek getirili iş.

### B0-3: Eksik Yahoo modüllerini ekle
`lib/yahoo-fundamentals.ts` quoteSummary modül listesine:
`earningsHistory` (gerçekleşen vs beklenti → **sürpriz geçmişi**) · `earningsTrend` ·
`epsTrend` + `epsRevisions` (30/60/90g tahmin revizyonu → **öncü sinyal**) ·
`recommendationTrend` · `upgradeDowngradeHistory`.
→ BIST'te kapsanan hisselerde dolu gelir (GARAN/ASELS doğrulanmış); kapsanmayanda null →
zarif düşüş (mevcut `n()` null-safe deseni).

### B0-4: Enflasyon çifte-sayım bug'ı
`lib/growth-momentum.ts:63-67` basit çıkarma (`reel = nominal − TÜFE`) kullanıyor;
`future-score.ts` ve `forward-outlook.ts` Fisher `(1+n)/(1+i)−1` kullanıyor. **İki yöntem paralel.**
→ Tek yardımcıda birleştir (Fisher). **Ayrıca:** tablo TMS-29 ile zaten düzeltilmişse ikinci kez
TÜFE düşmek yanlış — B1'in `inflationAdjusted` bayrağıyla koşullandır.

**Doğrulama (B0):** spike kapsam raporu üretildi; yeni alanlar gerçek Yahoo yanıtında dolu
geliyor (en az 5 sembolde manuel teyit); mevcut testler geçiyor.

---

## FAZ B1 — Kâr Kalitesi Motoru ("gerçekten kâr ediyor mu?") 🎯

**Yeni:** `lib/earnings-quality-engine.ts` — saf/deterministik, `FinancialYear[]` alır.

### B1-1: Kâr köprüsü (profit bridge)
```
Hasılat → Brüt Kâr → FAVÖK → FAALİYET KÂRI (EBIT)
        → (−) Finansman Gideri → (±) Kur Farkı → (±) Net Parasal Pozisyon → NET KÂR
```
Her adımın tutarı + net kâra katkı yüzdesi. **Kullanıcıya "bu kâr nereden geldi" tek bakışta.**

### B1-2: TMS-29 net parasal pozisyon TAHMİNİ
KAP dipnotu yok → bilançodan tahmin:
`net parasal pozisyon ≈ (nakit + alacaklar) − (finansal borçlar + ticari borçlar)`
→ negatifse (borçlu) enflasyon ortamında **parasal kazanç** beklenir.
Tahmini kazanç ≈ `|net parasal pozisyon| × TÜFE`. Net kârla karşılaştır.
> **Dürüstlük:** Bu bir **tahmin**, dipnottan okunan gerçek değer değil — UI'da açıkça
> "tahmini" etiketiyle gösterilir (mevcut `dataQuality` deseni).

### B1-3: Bayraklar (verdict)
- 🔴 **Kâğıt üstü kâr** — net kâr pozitif ama **faaliyet kârı negatif**, veya net kârın
  >%50'si parasal kazanç/kur farkı.
- 🟠 **Finansman yükü** — faaliyet kârı pozitif ama faiz gideri onu yiyor
  (faiz karşılama oranı < 1.5). *TR'de %37 faizle çok yaygın.*
- 🟢 **Gerçek faaliyet kârı** — faaliyet kârı pozitif, büyüyor, nakde dönüyor (FCF/NI sağlıklı).
- **Faaliyet kaldıracı** — hasılat %X büyürken EBIT %Y büyüyor → Y/X oranı.

### B1-4: DÖNEM-GÖRELİ normalizasyon ⭐
> Kullanıcının *"bu dönem gelen bilançolar baya kötü"* gözleminin karşılığı.

Mutlak yargı yanıltır: herkes kötüyken "az kötü" olmak **pozitif** sinyaldir. Bu yüzden her
metrik, **aynı dönemde rapor açıklayan BIST kesitine göre** yüzdelik dilime çevrilir
(`sector-medians` cron deseniyle aynı: dönem medyanı `ai_cache`'te saklanır).
→ Çıktı: hem **mutlak** hem **dönem-göreli** skor.

**Doğrulama (B1):** Birim test (`lib/__tests__/earnings-quality-engine.test.ts`) — kâğıt-üstü-kâr,
finansman yükü, faaliyet kaldıracı, banka (uygulanmaz) senaryoları. Canlı: borçlu bir sanayi
şirketi (parasal kazanç yüksek) vs nakit zengini şirket karşılaştırması elle doğrulanır.

---

## FAZ B2 — Bilanço Nowcast (öngörü)

**Yeni:** `lib/earnings-nowcast.ts` — gelecek raporun **yönünü** tahmin eder, **rakamını değil.**

Girdiler (öncelik sırası — en güçlüden zayıfa):
1. **Analist tahmin revizyonu** (B0-3 `epsRevisions`) — en güçlü dokümante öncü gösterge.
2. **Ardışık (QoQ) trend + mevsimsellik** — çeyreklik veri varsa (B0-1 GO).
3. **İşletme sermayesi diverjansı** — alacaklar/stoklar hasılattan hızlı büyüyorsa →
   gelecek marj baskısı / tahsilat sorunu. (B0-2 ile mümkün oldu.)
4. **Capex → kapasite** — kullanıcının örneği: *"yeni yatırım yaptı, kârı sonraki döneme yansıyacak"*.
   `capex/amortisman > 1.5` ve `ΔnetPPE` yüksek → kapasite devreye giriyor, gecikmeli gelir etkisi.
5. **Faaliyet kaldıracı projeksiyonu** (B1-3'ten).
6. **Kur/faiz duyarlılığı** — `SKOR-MIMARISI-PLAN.md` FAZ 2'deki `lib/exposure-map.ts`
   **yeniden kullanılır** (ihracatçı/borçlu/ithalatçı). İki plan burada kesişir.

**Çıktı:** `{ direction: 'iyi'|'kötü'|'nötr', confidence, drivers[], horizon }` — **sayı yok.**

**Doğrulama (B2):** Geçmiş dönemlerde geriye dönük test — nowcast yönü ile gerçekleşen
faaliyet kârı yönü örtüşme oranı. Rastgeleden (%50) anlamlı sapma yoksa **kanal kapatılır.**

---

## FAZ B3 — Sürpriz & Fiyatlanma ("zaten fiyatlandı mı?") 🎯

**Yeni:** `lib/earnings-surprise.ts`

### B3-1: Geçmiş sürpriz profili
`earningsHistory`'den (B0-3): son 4-8 dönem gerçekleşen vs beklenti sapması,
**sürpriz tutarlılığı** (sürekli beat eden şirketler gerçek bir olgudur).

### B3-2: Fiyatlanma analizi — **mevcut motor yeniden kullanılır** ♻️
`lib/news-impact.ts` zaten şunu yapıyor: anormal getiri (hisse − BIST100, β=1) +
hacim z-skoru + anticipation tespiti + verdict matrisi
(*fiyatlandı / fiyatlanıyor / henüz fiyatlanmadı / tepkisiz*).
→ Aynı event-study **bilanço olayına** uygulanır. Yeni motor yazılmaz.

Ek bilanço-özel girdiler (OHLCV'den, hepsi mevcut veriyle):
- **Rapor öncesi koşu (run-up)** — hisse bilançoya %X yükselerek giriyorsa iyi haber fiyatlanmış.
- **Sektöre göreli güç** — kesitte ayrışıyor mu.
- **Hacim paterni** — sessiz mi, birikim mi.

### B3-3: PEAD (rapor sonrası sürüklenme)
Gerçek pozitif sürpriz sonrası drift ölçümü — akademik olarak **öngörüden daha güvenilir**
ve kendi OHLCV'mizle **ölçülebilir/backtest edilebilir**. Bu kanal, B2'nin doğruluğunu da sınar.

**Doğrulama (B3):** Fiyatlanma verdict'i gerçek bir bilanço olayında elle doğrulanır
(anticipation → "zaten fiyatlanmış" çıkmalı). PEAD drift'i `lib/backtesting.ts` ile ölçülür.

---

## FAZ B4 — Bilanço Takvimi ekranı + entegrasyon

### B4-1: Precompute (mevcut desen — migration YOK)
- **Yeni:** `lib/earnings-runner.ts` — `growth-momentum-runner.ts` deseni birebir:
  batch 6-8, `ai_cache` tek satır `earnings-outlook:BIST`, TTL ~7g, `merge` destekli.
- **Yeni:** `app/api/cron/earnings-outlook/route.ts` — `?part=1|2`, `maxDuration=300`,
  `bistGuard`, likidite ön filtresi (ADV ≥ 5M TL — `long-term` cron'undaki aynı filtre;
  illikit mikro-cap'te bilanço analizi gürültüdür).
- **Yeni:** `app/api/earnings-outlook/route.ts` — tek satır okur, fan-out YOK.
- `vercel.json`: bilanço sezonu yoğun → günlük sabah koşusu (Pzt-Cum).

### B4-2: Bilanço Takvimi ekranı (kullanıcı seçimi)
- **Yeni:** `components/new/BilancoTakvimiScreen.tsx` + `app/bilanco-takvimi/page.tsx`
  (`<AppShell>` sarmalı) → `lib/new-design-routes.ts` `NEW_DESIGN_ROUTES` + AppShell sidebar.
- İçerik: **yaklaşan bilançolar tarih sıralı**; her satırda → şirket, tarih/gün sayacı,
  **nowcast yönü + güven**, **kâr kalitesi bayrağı**, **fiyatlanma durumu**, sürpriz geçmişi.
- Filtreler: *Bu hafta / Bu ay* · *Sadece yüksek güven* · *Henüz fiyatlanmamış*.
- **Açıklanan bilançolar** ayrı sekme: kâr köprüsü + dönem-göreli skor + PEAD durumu.

### B4-3: decision-engine entegrasyonu (dikkatli)
Mevcut davranış: `earningsRisk` bilanço öncesi **−8 ceza** (binary event → doğru varsayılan).
Yeni kural — **yalnızca yüksek güvende** bu ceza yumuşatılır/tersine çevrilir:
`nowcast.confidence ≥ eşik && fiyatlanma === 'henüz fiyatlanmadı'` → ceza azaltılır.
Aksi halde ceza aynen kalır. **Pozisyon boyutu önerisi düşürülür** (binary risk).
→ `SCORING_V2` benzeri flag arkasında; kapalıyken davranış birebir aynı.

---

## Kapsam DIŞI (bilinçli — "gereksiz bilgiyle uğraşmayalım")

- ❌ Kesin EPS/kâr **rakamı** tahmini — güvenilir değil, yanlış güven verir
- ❌ Tam 3-tablo finansal model / DCF
- ❌ Segment kırılımı, dipnot analizi (KAP bloklu — veri yok)
- ❌ Yönetim guidance / telekonferans metni analizi
- ❌ İllikit mikro-cap'ler (ADV filtresiyle elenir)

---

## Riskler

| Risk | Azaltma |
|---|---|
| **Çeyreklik veri bulunamaz** | B0-1 GO/NO-GO kapısı; NO-GO → B2 yıllık+TTM moduna düşer, B1/B3 tam çalışır |
| **TMS-29 tahmini yanlış olabilir** | Dipnot yok → "tahmini" etiketi zorunlu; kesin değer iddia edilmez |
| **Bilanço öncesi konumlanma = binary bahis** | Yalnız yüksek güven + fiyatlanmamış durumda; pozisyon boyutu düşürülür; ceza varsayılanı korunur |
| **Aşırı uydurma (overfit)** | B2 geriye dönük örtüşme testi; rastgeleden ayrışmıyorsa kanal kapatılır |
| **BIST analist kapsamı zayıf** | Kapsanmayan hissede revizyon null → ağırlık yeniden normalize (mevcut `forward-outlook` deseni) |
| **SPK / çerçeve** | "Bu bilanço iyi gelecek, al" DEĞİL → **olasılıksal analiz** + "yatırım tavsiyesi değildir" (mevcut proje dili) |

---

## Sıralama

```
B0 Veri temeli (spike + alan genişletme + modüller + enflasyon fix)   🔴 BLOKLAYICI
   └→ B1 Kâr kalitesi motoru        ← kullanıcının 1. sorusu, B0-1'den bağımsız çalışır
   └→ B3 Sürpriz & fiyatlanma       ← kullanıcının 2. sorusu, news-impact yeniden kullanır
   └→ B2 Nowcast (öngörü)           ← B0-1 GO gerektirir
        └→ B4 Bilanço Takvimi ekranı + decision-engine entegrasyonu
```

**Not:** B1 ve B3 çeyreklik veriye bağlı DEĞİL — spike başarısız olsa bile bu iki faz
kullanıcının iki çekirdek sorusunu tam olarak cevaplar. Öngörü (B2) riskli olan kısım.

---

## Doğrulama (her faz)

1. `npx tsc --noEmit` + `npm run build` temiz; mevcut 182 test geçmeye devam eder.
2. Yeni motorlar için birim test (kâr köprüsü, TMS-29 tahmini, kaldıraç, banka "uygulanmaz").
3. **Canlı veri e2e:** bilinen bir borçlu sanayi şirketi (yüksek parasal kazanç) ile nakit
   zengini şirket karşılaştırılır — kâr köprüsü farkı elle doğrulanır.
4. B2 geriye dönük örtüşme oranı raporlanır; %50'ye yakınsa kanal kapatılır (dürüst çıkış).
5. B3 fiyatlanma verdict'i gerçek bir bilanço olayında doğrulanır.
6. Ekran: açık/karanlık tema + mobil/masaüstü + boş durum ("bu hafta bilanço yok").
7. **Migration GEREKMEZ** — `ai_cache` tek-satır deseni (PEAD forward-tracking istenirse
   ayrı fazda tek tablo).

---

## Açık kararlar (kodlamadan önce)

1. **Ücretli kaynak:** B0-1 spike'ı ücretsiz adaylarda başarısız olursa Finnet/EODHD/Fintables
   için fiyat teklifi alınsın mı, yoksa yıllık+TTM moduyla mı devam edilsin?
2. **Bilanço Takvimi erişimi:** public mi, premium (tier-gated) mi? (VIOP premium yapılmıştı.)
3. **decision-engine entegrasyonu** ilk sürümde olsun mu, yoksa önce ekran tek başına
   yayınlanıp güven ölçüldükten sonra mı bağlansın? (Öneri: önce ekran, sonra motor.)
