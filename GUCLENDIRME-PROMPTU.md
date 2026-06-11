# BISTAI Güçlendirme Promptu — Denetim Bulguları + İş Planı (2026-06-11)

> Bu dosya, kod tabanının motor/API/mimari düzeyinde denetiminden çıkan bulguları ve
> bunları kapatacak iş planını içerir. Her faz bağımsız çalıştırılabilir bir prompt
> olarak yazılmıştır — yeni bir Claude Code oturumuna "GUCLENDIRME-PROMPTU.md FAZ N'i
> uygula" demek yeterlidir. Fazlar öncelik sırasındadır.

---

## Çalışma Kuralları (her faz için geçerli)

1. Her değişiklik sonrası: `npx tsc --noEmit` + `npm run build` temiz olmalı.
2. **Yeni Supabase migration'dan kaçın** — mümkünse `ai_cache` tek-satır JSON deseni
   kullan (growth-momentum / news-catalyst / sector-medians örnekleri). Migration
   kaçınılmazsa idempotent yaz ve CLAUDE.md "Bekleyen Manuel Adımlar" tablosuna ekle.
3. **Vercel timeout dersi:** 619 sembollük evren taramaları tek istekte bitmez —
   `?part=1|2` bölme + batch fetch deseni kullan (`growth-momentum-bist` örneği).
   `maxDuration` 300'ü aşma (Fluid Compute kapalı).
4. Cron eklersen `vercel.json` + CLAUDE.md cron tablosunu güncelle.
5. Commit stili: `fix(scope):` / `feat(scope):`; push öncesi kullanıcıya sor.
6. Davranış değiştiren her hesaplama düzeltmesine birim testi ekle
   (`lib/__tests__/` deseni mevcut).

---

## FAZ 0 — Hesaplama Hataları (bug fix, en yüksek öncelik)

### BUG-A: `SIGNAL_MIN_DAYS` senkron kopukluğu → yeni sinyal tipleri öğrenme döngüsünden sessizce dışlanıyor ⛔

**Kanıt:**
- `lib/evaluate-engine.ts:37-47` — `SIGNAL_MIN_DAYS` yalnızca 9 eski sinyal tipini içeriyor;
  bilinmeyen tipler için varsayılan **7 gün** (`getMinDays`).
- `app/api/firsatlar/route.ts:44-66` — `SIGNAL_CANONICAL_FIELD` 21 tip içeriyor. Şu tipler
  `SIGNAL_MIN_DAYS`'ta YOK: `Altın Çapraz Yaklaşıyor`(30d), `Cup & Handle`(30d),
  `Ters Omuz-Baş-Omuz`(30d), `Trend Olgunlaşıyor`(14d), `Direnç Testi`(14d),
  `Higher Lows`(14d), `Çift Dip`(14d), `Çift Tepe`(14d), `Bull Flag`(14d),
  `Bear Flag`(14d), `Yükselen Üçgen`(14d), `MACD Daralıyor`(7d).

**Sonuç zinciri:** 14d/30d ufuklu bu tipler 7. günde değerlendirilir → `closeAfterDays(14|30)`
o anda `null` döner → `evaluated=true` yazılır ve kayıt bir daha açılmaz → kanonik ufuk
returnu **kalıcı null** → `computeWinRates` null'ları eler → bu sinyaller win-rate
istatistiğine, `winRateAdj` faktörüne ve geçmiş performans sayfalarına **hiç girmez**.

**Düzeltme:**
1. `SIGNAL_CANONICAL_FIELD` haritasını `lib/` altına taşı (örn. `lib/signal-horizons.ts`)
   — tek gerçek kaynak. `app/api/firsatlar/route.ts`, `app/api/firsatlar-us/route.ts`
   (kendi kopyası varsa) ve `signal-stats-summary` buradan import etsin.
2. `evaluate-engine.ts` `getMinDays`'ı bu haritadan türetsin
   (`return_3d→3, return_7d→7, return_14d→14, return_30d→30`).
3. **Geriye dönük onarım:** kanonik ufku dolu olmayan ama `entry_time`'ı ufuktan eski
   `evaluated=true` kayıtları tespit edip `evaluated=false`'a çeviren tek seferlik
   yönetim endpoint'i/script yaz (cron/evaluate sonraki koşularda doldurur).
   Dikkat: `MAX_BATCH=200`/gün — backlog büyükse birkaç gün sürer, loglara sayaç ekle.

### BUG-B: BIST win-rate istatistiği US kayıtlarıyla kirleniyor

**Kanıt:** `app/api/firsatlar/route.ts:268-272` — `signal_performance` win-rate sorgusu
`evaluated=true` + tarih filtresi var ama **`market` filtresi yok**. US taraması
(`cron/scan-us`, 3×/gün) aynı tabloya `market='US'` yazıyor. `firsatlar-us` kendi
sorgusunda `eq('market','US')` kullanıyor (route.ts:284) — asimetri bilinçli değil.

**Düzeltme:** BIST sorgusuna `.eq('market', 'BIST')` ekle (null eski kayıtlar için
`.or('market.eq.BIST,market.is.null')` — backfill migration çalıştıysa gerek yok, kontrol et).

### BUG-C: "Tek karar motoru" iki rotada farklı girdilerle çağrılıyor → aynı hisse iki sayfada farklı skor

**Kanıt:**
- `/api/firsatlar` (route.ts:532-541): `catalyst` + `kapRisk` VERİYOR; `riskScore` ve
  `sectorMomentum` VERMİYOR.
- `/api/hisse-analiz` (route.ts:324-333): `riskScore` + `sectorMomentum` VERİYOR;
  `catalyst` ve `kapRisk` VERMİYOR.
- `riskMultiplier` 0.70-1.05 arası çarpan, `catalystAdjustment` ±12 puan — fark görünür
  boyutta. decision-engine.ts başlığındaki "aynı girdi → aynı karar" vaadi pratikte bozuk.

**Düzeltme:**
1. `/api/hisse-analiz`: katalisti `ai_cache` `news-catalyst:BIST` satırından oku (tek
   sorgu, fan-out yok — firsatlar ile aynı desen) ve `computeDecision`'a ver.
2. `/api/firsatlar`: `riskScore`'u ver — `getMacroFull()` zaten çağrılıyor; risk skoru
   makro versinden türetilebiliyorsa ek maliyet yok (lib/risk-engine.ts'e bak).
3. KAP girdisi için BUG-D'deki karara uy (iki rota aynı kaynağı kullansın).
4. Girdi eşitliğini koruyan birim test: aynı mock girdiyle iki rotanın decision'ı
   birebir aynı olmalı.

### BUG-D: KAP risk faktörü production'da ölü

**Kanıt:** `lib/kap.ts` hâlâ `kap.org.tr` eski API'sini çağırıyor; CLAUDE.md (2026-06-05
tespiti) kap.org.tr'nin sunucu erişimini blokladığını söylüyor (eski API HTTP 666,
Vercel'den bloklanır). Dolayısıyla `/api/firsatlar`'daki `kapMap` prod'da hep boş →
`kapEvent` (−10 puan) faktörü hiç tetiklenmiyor; `/kap` sayfası da muhtemelen boş.

**Düzeltme (önerilen):** KAP-tipi event riskini Google News tabanlı altyapıdan türet —
`lib/symbol-news.ts` + `lib/news-impact.ts` materyalite sınıflandırması zaten
"finansal rapor / temettü / sermaye artırımı / genel kurul" kalıplarını yakalıyor.
`deriveCatalyst` çıktısına `isEventRisk` benzeri bayrak ekle ya da news-catalyst cron'unda
KAP-tipi başlıkları işaretle; `kapRisk` girdisini oradan besle. `lib/kap.ts`'e canlı
sağlık kontrolü ekle: fetch başarısızsa sayfada "kaynak erişilemiyor" durumu (sessiz boş
liste yerine). `/kap` sayfasının kaderi FAZ 3'te (Gündem hub) çözülür.

### BUG-E (atıl altyapı): sektör momentum + hacim teyidi skora bağlı değil

**Kanıt:** `lib/decision-engine.ts:264-267` — `sectorMomentum` parametre alınıp
`void _sectorMomentum` ile yutuluyor (P1-1). `scan_cache.rel_vol5` hesaplanıp yazılıyor
ama yalnızca tavan skoru kullanıyor; karar faktörü değil (P1-2).

**Düzeltme:**
1. `sectorAdjustment(direction, sectorMomentum)` ekle: sektör momentumu sinyal yönüyle
   hizalıysa +5, tersse −6 (macroAlign ölçeğinde, mütevazı). `DecisionFactors`'a
   `sectorAlign` alanı ekle, UI şeffaflık objesine yansıt.
2. Hacim teyidi: `rel_vol5 ≥ 1.5` + yön yukarı → +4; `rel_vol5 < 0.7` (ilgisiz/cansız
   hacim) → −4. `DecisionInput`'a opsiyonel `relVol5` ekle; `/api/firsatlar` scan_cache'ten
   zaten çekiyor (route.ts:281), sadece geçirmek kaldı.
3. İki faktörün ağırlıkları için: signal_performance verisi üstünde basit bir
   geriye-dönük doğrulama yap (hizalı vs hizasız grupların ortalama return farkı) —
   etki yoksa ekleme, raporla.

---

## FAZ 1 — Uzun Vade Fırsatlar yeniden inşası (en büyük ürün kazancı)

**Sorun (kanıtlı):** `app/api/uzun-vade-firsatlar/route.ts`:
- Satır 38-69: **~60 hisselik hardcoded `CORE_LIQUID_SYMBOLS`** — evren 619 sembol.
  Küçük/orta ölçekli gerçek değer fırsatları yapısal olarak görünmez.
- Satır 74-75: **In-memory cache (6h)** — Vercel serverless'ta cold start'ta uçar;
  ilk ziyaretçi ~60 sembollük Yahoo fan-out bedelini istek anında öder.
- Skor yalnızca `investment-score` + teknik confluence. 2026-06-05'te inşa edilen
  temel analiz yığınının **hiçbiri entegre değil**: `fundamental-health` (Piotroski/
  Altman/Beneish), `peer-valuation` (sektör-görece iskonto), `forward-outlook`
  (GARP verdict), `growth-momentum` (reel büyüme). Tüm lib'ler hazır — eksik olan
  yalnızca birleştirme + precompute katmanı.

**İş planı:**
1. `lib/long-term-runner.ts` (YENİ): tam BIST evreni için sembol başına birleşik
   uzun-vade kaydı üret:
   - `investment-score` (mevcut, enflasyon düzeltmeli)
   - `fundamental-health` → Piotroski F, Altman Z'', Beneish bayrağı, kazanç kalitesi
   - `peer-valuation` → relativeScore (sektör medyanları `ai_cache`'te hazır —
     `sector-medians` cron'u Pzt 07:00)
   - `forward-outlook` → GARP verdict (fırsat / pahalı-ama-haklı / değer tuzağı / pahalı)
   - `growth-momentum` skoru (ai_cache `growth-momentum:BIST`'ten oku, yeniden hesaplama)
   - Bileşik **Uzun Vade Skoru (0-100)**: öneri ağırlık — investmentScore 35 /
     finansal sağlık 25 / peer görece 20 / büyüme momentum 20; Beneish şüpheli veya
     Altman distress → çarpan kısması (growth-momentum kalite çarpanı deseni).
2. `app/api/cron/long-term/route.ts` (YENİ): `?part=1|2` bölmeli, `bistGuard`'lı,
   sonuç `ai_cache` `long-term:BIST` tek satır (migration YOK). Haftalık koşu yeterli
   (temel veri frekansı düşük) — Pzt 09:40 TRT önerilir (sector-medians 10:00 TRT'den
   SONRA olacaksa sıralamayı kontrol et; medyanlar bir hafta eski olabilir, kabul).
3. `/api/uzun-vade-firsatlar` yeniden yaz: ai_cache'ten oku, `CORE_LIQUID_SYMBOLS` ve
   in-memory cache'i sil. Mevcut response şemasını koru + yeni alanlar ekle
   (piotroski, altmanZ, beneishFlag, relativeScore, garpVerdict, growthScore,
   longTermScore). Kategoriler korunur; `deger_firsati` artık peer-iskonto +
   GARP "fırsat" verdict'iyle de tetiklenebilir.
4. Likidite eşiği: ADV ≥ 5M TL filtre (tam evrende çöp likidite elensin).
5. Birim test: bileşik skor senaryoları (sağlam+ucuz, büyüyen+pahalı, Beneish şüpheli,
   banka=Piotroski uygulanmaz fallback).

**Kabul kriteri:** `/uzun-vade-firsatlar` tam evrenden beslenir; ENKAI gibi devler VE
hardcoded listede olmayan sağlam mid-cap'ler birlikte sıralanır; sayfa istek anında
Yahoo'ya gitmez.

---

## FAZ 2 — Kısa Vade Fırsatlar güçlendirme

1. **Bilanço yakınlığı faktörü (ölen KAP faktörünün gerçek ikamesi):** Yahoo
   `calendarEvents`/`earningsTimestamp` BIST'te de dolu (`lib/news-priced-in.ts` US'te
   zaten kullanıyor). scan-cache cron'unda sembol başına sonraki bilanço tarihini al,
   `scan_cache`'e ya da `ai_cache` tek-satırına yaz; `computeDecision`'a
   `earningsProximity` girdisi ekle: bilanço ≤3 işlem günü → −8 puan + güven düşüşü
   ("binary event riski"). UI rozeti: "📅 Bilanço yaklaşıyor".
2. **Request-time Yahoo fan-out'u kaldır:** `/api/firsatlar` route.ts:467-482 her
   istek başına sembol×`fetchYahooFundamentals` çağırıyor (in-memory cache'e güvenerek).
   Investment score'ları günlük cron'la precompute et (`ai_cache`
   `investment-scores:BIST` tek satır; scan-cache cron'una eklemek timeout marjını yer —
   AYRI hafif cron yaz). Route yalnızca cache okusun.
3. FAZ 0/BUG-E faktörleri (sektör + hacim) bu sayfada görünür olsun
   (`adjustments` objesi + FirsatKarti şeffaflık satırı).
4. **`/gecmis-firsatlar` geri açma kontrolü:** FAZ 0/BUG-A onarımı sonrası
   `signal_performance`'ta `evaluated=true` + anlamlı return dağılımı oluştuysa
   NavbarClient.tsx:24 yorumunu kaldır (CLAUDE.md'deki koşul: +%10/%20 getiriler
   görünmeye başlayınca).

---

## FAZ 3 — Sayfa/motor konsolidasyonu

### 3A. Temel analiz üçlüsü → "Yatırım Radarı" hub
`/uzun-vade-firsatlar`, `/buyuyen-sirketler`, `/gelecek-sirketler` üçü de "temel veriyle
hisse sıralama" sayfası — kullanıcı için üç ayrı zihinsel adres. FAZ 1 sonrası üçü aynı
veri tabanından (ai_cache) beslenir. Birleştirme: tek `/yatirim-radari` hub'ı, üç sekme
(Uzun Vade Kompozit / Büyüme Momentumu / Gelecek Temaları) + eski URL'ler redirect.
Navbar'da üç link yerine bir link. (Alternatif minimum: üç sayfa kalır, ortak başlık
bileşeni + çapraz linkler — ama hedef tek hub.)

### 3B. AI portföyleri → tek parametrik motor + dinamik sayfa
Mevcut: 4 ayrı motor (`ai-portfolio-engine`, `apex-engine`, `apex-us-engine`,
`aegis-us-engine`) + 4 sayfa + 4 cron route; hiçbiri `decision-engine` kullanmıyor
(grep doğrulandı). İş:
1. `lib/portfolio-engine.ts`: tek motor, config-driven
   (`{ market, cadence, kellyFraction, stopPct, tpRules, universeSource }`);
   4 mevcut motor config olarak ifade edilir. Mevcut DB tabloları korunur
   (migration yok) — tablo adı config'te.
2. Sinyal üretiminde `computeDecision`'ı ortak giriş filtresi olarak kullan
   (motorların kendi ad-hoc skorlaması yerine) — kademeli geçiş, önce APEX-BIST.
3. Sayfalar: `/ai-portfoyler/[slug]` dinamik route; 4 eski URL redirect.
   Hub sayfası (`/ai-portfoyler`) zaten var, korunur.

### 3C. Performans/kanıt hub'ı
`/backtesting`, `/sinyal-takip`, `/gecmis-firsatlar` üçü de "sinyaller gerçekten
çalışıyor mu?" sorusuna cevap. Tek `/performans` hub'ı: Backtest (simülasyon) /
Canlı Takip (signal_tracker) / Geçmiş Fırsatlar (signal_performance gerçekleşen)
sekmeleri. Üç sayfanın üst metrikleri (win rate, ort. getiri, n) aynı tanımı kullansın —
şu an backtesting kendi komisyon/horizon mantığını, firsatlar başka bir win-rate
tanımını kullanıyor; ortak `lib/performance-metrics.ts`'e çıkar.

### 3D. Gündem hub'ı + haber motoru tekilleştirme
1. `/haberler` + `/kap` + `/ekonomi-takvimi` → tek `/gundem` (Piyasa Haberleri /
   Şirket Haberleri (KAP-tipi, Google News tabanlı) / Takvim sekmeleri). KAP sekmesi
   bloklu kaynaktan değil `symbol-news` + materyalite sınıflandırmasından beslenir.
2. **Haber motoru tekilleştirme:** `lib/news-priced-in.ts` (US, keyword tabanlı, 4-faktör
   matris) vs `lib/news-impact.ts` (BIST, event-study AR + hacim z-skoru) — iki paralel
   "haber fiyatlandı mı?" sistemi. Event-study yaklaşımı üstün; `news-impact`'i market
   parametresiyle US'e genelle (S&P500 benchmark zaten destekleniyor — route'ta US yolu
   var), `news-priced-in`'i APEX-US/AEGIS-US cron'larında bu API ile değiştir, sonra sil.

---

## FAZ 4 — Veri kalitesi + ölü kod temizliği

1. **Ekonomi takvimi canlıya geçir:** `lib/ekonomi-takvimi.ts` tamamen statik 2026 Q1-Q3
   listesi (`EKONOMI_EVENTS` hardcoded; beklenti/gerçekleşen elle). Çözüm yolu:
   TÜİK/TCMB veri yayın takvimi + FRED release calendar (ücretsiz API) + TradingEconomics
   calendar scrape (turkey-macro.ts'teki TE scrape deseni). Haftalık cron → ai_cache.
   Gerçekleşen değerleri TE scrape'ten doldur. (DATA-AUDIT.md'deki kırmızı bayrak.)
2. **Ölü kod:** `lib/confidence.ts` (import eden yok) sil; `/api/ml/*` + `lib/ml-features.ts`
   (UI çağıran yok, heuristik) — sil ya da `dev/` arkasına al; karar kullanıcıya sorulsun.
3. **evaluate backlog görünürlüğü:** `cron/evaluate` günde 1×, `MAX_BATCH=200`; scan-cache
   3×/gün sinyal yazıyor — birikme riskini ölç: evaluate response'una `remaining`
   (evaluated=false, yaşı dolmuş kayıt sayısı) ekle, loga yaz. Birikiyorsa batch'i artır
   ya da ikinci koşu ekle.
4. **`firsatlar-us` ile `firsatlar` kod ortaklığı:** canonical map + computeWinRates iki
   rotada kopya — `lib/signal-horizons.ts`'e (FAZ 0/BUG-A) taşındıktan sonra ikisi de
   oradan import etsin.
5. CDS proxy etiketi (mevcut karar) ve TR makro fallback zinciri korunur — dokunma.

---

## Yeni Sayfa Fikirleri (opsiyonel, fazlardan bağımsız)

| Fikir | Dayanak | Çaba |
|-------|---------|------|
| **Temettü Radarı** (`/temettu`) | `dividendYield`, payout, FCF verisi Yahoo'da hazır; hiçbir sayfa temettüye odaklanmıyor. Yield + sürdürülebilirlik (payout<%80, FCF+) + geçmiş düzenlilik skoru | Orta |
| **Bilanço Takvimi** (`/bilanco-takvimi`) | FAZ 2'de toplanan earnings tarihleri zaten elde; "bu hafta bilanço açıklayacak BIST şirketleri" listesi + fırsat sinyali olan hisselerde rozet | Düşük (FAZ 2 üstüne) |
| **Portföy Röntgeni** | `/portfolyo`'ya risk katmanı: sektör konsantrasyonu, beta-ağırlıklı makro duyarlılık, pozisyonların decision-engine skorlarıyla "portföyündeki zayıflayanlar" uyarısı | Orta |
| **Hisse Karnesi (meta-skor)** | Hisse detayda ~8 ayrı skor var (decision, 5-boyut teknik, investment, adil değer, 5-yöntem değerleme, finansal sağlık, peer, GARP). Tek `lib/master-score.ts` bileşeni: "Genel Karne A-/B+..." + alt skorlar. Skor enflasyonunu çözer | Orta-Yüksek |

---

## Önerilen Sıra (etki × çaba)

| Sıra | İş | Neden |
|------|----|-------|
| 1 | FAZ 0 (BUG-A→E) | Veri/öğrenme döngüsü sessizce bozuk; her gün veri kirliliği birikiyor |
| 2 | FAZ 1 | En büyük ürün açığı; tüm yapı taşları hazır, sadece birleştirme |
| 3 | FAZ 2 | Kısa vade sayfası ana ürün; bilanço riski gerçek kayıp önler |
| 4 | FAZ 3B + 3A | Bakım maliyetini kalıcı düşürür |
| 5 | FAZ 4.1 (takvim) + FAZ 3C/3D | Veri güveni + tutarlılık |
| 6 | Yeni sayfalar | Üst fazlar oturduktan sonra |
