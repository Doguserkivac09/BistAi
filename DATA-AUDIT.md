# 🔍 BistAI — Veri Doğruluğu (Authenticity) Denetimi

> Tarih: 2026-06-04 · Denetim türü: read-only veri soyağacı + canlı API testi
> Kapsam: tüm harici veri kaynakları + türev (skor/sinyal) katmanları.
> Yöntem: kod izleme (catch/fallback dalları dahil) + prod (`bistai.vercel.app`) canlı probe.
> ⚠️ Kanıtlar `dosya:satır` + canlı çağrı çıktısıdır. Emin olunmayanlar "DOĞRULANAMADI".

---

## A. Özet Skorboard

| Kategori | Veri kaynağı sayısı |
|----------|--------------------|
| ✅ Gerçek / canlı (güvenilir) | 10 |
| 🟥 Sahte / fallback / proxy (KRİTİK) | 4 |
| 🟧 Hardcoded / heuristik | 4 |
| 🟧 Bozuk / boş dönüyor | 2 (EVDS, KAP) |
| 🟨 Backfill / var-ismi bug | 2 |

### 🚨 KIRMIZI BAYRAK — kullanıcının "gerçek" sandığı ama OLMAYAN KRİTİK veriler

| # | Veri | Gerçekte ne | Kanıt |
|---|------|-------------|-------|
| 🟥1 | **TR Politika Faizi = %7** | Hardcoded fallback. Gerçek TCMB faizi 2026'da **çok daha yüksek (~%40+)**. EVDS çalışmadığı için sürekli bu sahte değer dönüyor. | prod `/api/macro` → `policyRate.source = "hardcoded-fallback"`; `turkey-macro.ts:181` |
| 🟥2 | **TR Enflasyon (TÜFE) = %30.87** | Hardcoded fallback (EVDS HTTP 302 → boş). Canlı TÜİK verisi DEĞİL. **BIST reel büyüme düzeltmesi + makro skor bunu kullanıyor.** | prod `/api/macro` → `inflation.source = "tuik-hardcoded-fallback"`; `turkey-macro.ts:205` |
| 🟥3 | **TR 5Y CDS** | Hiç gerçek CDS değil — **USD/TRY volatilitesi × 1500** ile uydurulmuş proxy (taban 280 bps). | `turkey-macro.ts:290-327` (`source: 'USD/TRY volatility proxy'`) |
| 🟥4 | **"ML/AI Tahmini"** | `ML_SERVICE_URL` tanımsız → gerçek XGBoost modeli yok; basit kural-tabanlı `heuristicFallback`. | `app/api/ml/predict/route.ts:43-80,156` (`model_type: 'composite_fallback'`) |

> ✅ **GÜNCELLEME (2026-06-04):** 🟥1 (politika faizi) ve 🟥2 (enflasyon) **ÇÖZÜLDÜ** — TradingEconomics canlı scrape entegre edildi (ücretsiz, key gerekmez). Prod doğrulandı: faiz **%37**, enflasyon **%32.61**, `source="TradingEconomics (scrape)"` → makro sayfasında 🟢 yeşil rozet. EVDS `evds2`→`evds3`'e taşınmış (eski endpoint 302); scrape birincil, EVDS yedek, hardcoded son çare.
>
> 🟥3 **CDS — KARAR (2026-06-04):** Gerçek ücretsiz CDS kaynağı yok (worldgovernmentbonds/investing/TradingView JS-render; TE/Bloomberg ücretli). Uydurmak yerine mevcut **"proxy ⓘ" etiketiyle** (amber 🟡 rozet + tooltip) bırakıldı — kullanıcıya gerçek gibi sunulmuyor. Açık kalan: KAP (boş), ekonomi takvimi (hardcoded), ML (heuristik — UI'da etiketlenebilir).

**Kök neden:** TCMB **EVDS API çalışmıyor** — canlı test HTTP **302** (yönlendirme, JSON yok), key uzunluğu 10. Bu yüzden TR makro göstergelerinin tamamı (faiz, enflasyon) fallback'e düşüyor. Kod yorumu bile bunu kabul ediyor: `turkey-macro.ts:271` "EVDS yedek — şu an çalışmıyor".

---

## B. Detay Tablo

### ✅ GERÇEK / CANLI (güvenilir)

| Veri | Kullanıldığı yer | Soyağacı → Kaynak | Sınıf | Kanıt (dosya:satır) | Canlı test | Kritiklik |
|------|------------------|-------------------|-------|---------------------|-----------|-----------|
| Hisse OHLCV / fiyat | tüm grafikler, sinyaller, skorlar | `lib/yahoo.ts` → Yahoo v8 chart | REAL_CACHED (5dk) | `yahoo.ts:100-117` | — | 🔴 KRİTİK |
| VIX, DXY, US10Y, USDTRY, EEM, Brent, Altın, Gümüş, Bakır, BIST100 | `/makro`, risk/makro skor | `lib/macro-data.ts` → Yahoo v8 | REAL_CACHED (5dk) | `macro-data.ts:103-162` | ✅ VIX=16.06, USDTRY=45.96 | 🔴 KRİTİK |
| ABD makro: Fed faizi, CPI, GDP, işsizlik, PMI | `/makro`, ABD ekonomi sağlığı | `lib/fred.ts` → FRED API | REAL_CACHED (30dk) | `fred.ts:172-254` | ✅ prod fedFunds=3.62 (2026-06-02) | 🔴 KRİTİK |
| Hisse temel veri (F/K, EPS, gelir büyümesi, analist…) | `/hisse`, future-score, uzun-vade | `lib/yahoo-fundamentals.ts` → Yahoo quoteSummary | REAL | `yahoo-fundamentals.ts:107,~230` | ✅ NVDA, GARAN gerçek | 🔴 KRİTİK |
| Teknik sinyaller (RSI, MACD, formasyon, S/R) | `/tarama`, `/hisse` | `lib/signals.ts` → OHLCV türevi | DERIVED (gerçek girdi) | `signals.ts` | — | 🔴 KRİTİK |
| Future Brightness Score | `/gelecek-sirketler` | `lib/future-score*.ts` → Yahoo fundamentals | DERIVED (+NEUTRAL_FILL) | `future-score-runner.ts` | ✅ NVDA=83, ISCTR=73 | 🟠 ORTA |
| Investment Score / değerleme | `/hisse`, `/uzun-vade` | `lib/investment-score.ts` → Yahoo fundamentals | DERIVED (gerçek girdi) | `investment-score.ts` | — | 🔴 KRİTİK |
| Haberler (TR + US) | `/haberler`, `/hisse` | `app/api/haber/route.ts` → canlı RSS (NTV, Sabah, CNBC…) | REAL_LIVE (15-30dk) | `haber/route.ts:100-194` | ✅ THYAO 5 haber | 🟠 ORTA |
| TR 10Y tahvil faizi | `/makro` | `lib/turkey-macro.ts` → **doviz.com scrape** | REAL_SCRAPED | `turkey-macro.ts:253-269` | — (kırılgan) | 🟠 ORTA |
| AI açıklama / özet | `/hisse`, `/sohbet`, KAP özet | `lib/claude.ts` → Anthropic API | REAL | `claude.ts:84` (key SET) | — | 🟠 ORTA |

### 🟥 SAHTE / FALLBACK / PROXY (KRİTİK)

| Veri | Soyağacı → Kaynak | Sınıf | Kanıt | Prod testi |
|------|-------------------|-------|-------|-----------|
| TR Politika Faizi | EVDS `TP.PF.PF01` başarısız → **sabit %7** | FALLBACK_STATIC | `turkey-macro.ts:167-182` | ✅ `source:"hardcoded-fallback"` |
| TR Enflasyon (TÜFE) | EVDS `TP.FG.J0` başarısız → **sabit %30.87** | FALLBACK_STATIC | `turkey-macro.ts:192-206` | ✅ `source:"tuik-hardcoded-fallback"` |
| TR 5Y CDS | USD/TRY vol × 1500 (taban 280) | HEURISTIC_PROXY | `turkey-macro.ts:290-327` | — |
| TR 10Y fallback | doviz scrape başarısızsa **sabit %33.5** | FALLBACK_STATIC | `turkey-macro.ts:282` | — |

### 🟧 HARDCODED / HEURİSTİK

| Veri | Sınıf | Kanıt | Kritiklik |
|------|-------|-------|-----------|
| **Ekonomi Takvimi** (tüm olaylar + "gerçekleşen" değerler) | HARDCODED (statik 2026 dizisi) | `ekonomi-takvimi.ts:19-21` ("Statik takvim verisi") | 🟠 ORTA |
| ML tahmini (XGBoost yok → kural-tabanlı) | HEURISTIC_ESTIMATE | `ml/predict/route.ts:43-80` | 🟠 ORTA |
| BIST `EXPORT_BONUS` (FROTO +20 vb.) | HARDCODED tahmin | `bist-future-themes.ts:48-58` | 🟢 DÜŞÜK |
| `runway` (nakit yakım = piyasa değeri × %2.5) | HEURISTIC_ESTIMATE | `yahoo-fundamentals.ts` (`quarterlyBurn`) | 🟢 DÜŞÜK |
| future-score eksik alan → 50 (özellikle **BIST insider 54/54 null**) | NEUTRAL_FILL | `future-score-runner.ts:24-32` | 🟠 ORTA |

### 🟧 BOZUK / BOŞ DÖNÜYOR

| Veri | Durum | Kanıt |
|------|-------|-------|
| **TCMB EVDS** (tüm TR makro kaynağı) | HTTP **302**, JSON dönmüyor → tüm TR göstergeleri fallback | canlı curl testi: `HTTP 302`, boş gövde; `turkey-macro.ts:99-160` |
| **KAP duyuruları** | prod'da **boş** (`{"duyurular":[]}`) — kap.org.tr API'si veri döndürmüyor | ✅ prod `/api/kap` → `count=0` |

### 🟨 BACKFILL / BUG

| Veri | Durum | Kanıt |
|------|-------|-------|
| `signal_performance` / Geçmiş Fırsatlar | BACKFILL — tüm sinyaller aynı tarih, navbar'dan gizli | `CLAUDE.md` ("Geçmiş Fırsatlar — Navbar'dan Gizlendi") |
| AlphaVantage env var **ismi tutarsız** | `data-providers.ts` `ALPHAVANTAGE_API_KEY` okuyor; `.env.local`'de `ALPHA_VANTAGE_API_KEY` var → data-providers AV yolu devre dışı (Yahoo'ya düşer) | `data-providers.ts:117,217` vs `alpha-vantage.ts:46` |

> **Env notu (prod ≠ yerel):** Yerelde `FRED_API_KEY`, `ALPHAVANTAGE_API_KEY`, `ML_SERVICE_URL`, `RESEND_API_KEY` YOK. Prod'da FRED ÇALIŞIYOR (key var). `RESEND_API_KEY` yoksa e-posta uyarıları/bülten gönderilmez — DOĞRULANAMADI (prod env görülmedi).

---

## C. Remediation Yol Haritası (önceliklendirilmiş)

### 🔴 P0 — Hemen (yanlış finansal veri, para kaybettirir)

1. **TR Politika Faizi %7 → gerçek değer.** En acil: %7 grossly yanlış.
   - Kısa vade (S): fallback sabitini güncel TCMB faiziyle değiştir + UI'da "tahmini/güncel olmayabilir" rozeti.
   - Kalıcı (M): **EVDS'yi onar** — geçerli EVDS key al (mevcut key 302 veriyor), endpoint formatını doğrula (`evds2.tcmb.gov.tr` artık farklı auth isteyebilir). Alternatif: TCMB PPK sayfası scrape veya ücretli makro API (Trading Economics).
   - Dosya: `lib/turkey-macro.ts:167-187`.

2. **TR Enflasyon (TÜFE) %30.87 → canlı.** BIST reel-büyüme skoru + makro skoru besliyor.
   - EVDS onarımı (yukarıdaki ile aynı kök neden) veya TÜİK bülten scrape.
   - Geçici: fallback'i her ay manuel güncelle + "manuel/tahmini" etiketi.
   - Dosya: `lib/turkey-macro.ts:192-211`.

3. **Şeffaflık katmanı (S, hızlı kazanç):** `TurkeyIndicator.source` alanı zaten "fallback/proxy/scrape" diyor — **bunu UI'da göster**. Makro sayfasında her göstergenin yanına kaynak rozeti (🟢 canlı / 🟡 tahmini / 🔴 fallback). Kullanıcı neye güveneceğini görür. Dosya: `app/makro/page.tsx`.

### 🟠 P1 — Kısa vade (yanıltıcı ama daha az kritik)

4. **TR 5Y CDS proxy → gerçek CDS.** worldgovernmentbonds.com / investing.com scrape veya ücretli API. Olmazsa UI'da net "proxy (USD/TRY volatilitesinden tahmin)" etiketi. `turkey-macro.ts:290`.

5. **KAP entegrasyonunu onar.** kap.org.tr API'si boş dönüyor — yeni disclosure endpoint'ini bul (KAP API'sini değiştirdi) veya resmi KAP RSS/JSON'a geç. `lib/kap.ts:65+`.

6. **ML servisi:** repo'da `python-ml/main.py` var. Railway/Render'a deploy et + `ML_SERVICE_URL` ekle → gerçek XGBoost. Olmazsa UI'da "kural-tabanlı tahmin" etiketle. `app/api/ml/predict/route.ts`.

7. **Ekonomi Takvimi → canlı feed.** Finnhub/Trading Economics economic calendar API veya Investing.com scrape. Olmazsa sayfada "statik/manuel güncellenen takvim" uyarısı. `lib/ekonomi-takvimi.ts`.

### 🟡 P2 — İyileştirme / hijyen

8. **AlphaVantage env ismini birleştir** (`ALPHAVANTAGE_API_KEY` ↔ `ALPHA_VANTAGE_API_KEY`). `data-providers.ts:117,138,197,217`.
9. **TR 10Y fallback %33.5** — doviz scrape kırılırsa eski değer donar; tazelik kontrolü + "scrape" rozeti ekle.
10. **future-score NEUTRAL_FILL şeffaflığı:** BIST insider 54/54 null → 50. Kartlarda "veri yok → nötr" rozeti (bu skoru gerçek veriden ayırır).
11. **Geçmiş Fırsatlar:** günlük tarama cron'u düzenli birikince backfill verisini gerçek geçmişle değiştir (CLAUDE.md'de planlı).

---

## D. Tek Cümlelik Sonuç

**Fiyat, OHLCV, ABD makrosu (FRED), hisse temel verisi, haberler ve bunlardan türeyen sinyal/skorlar GERÇEK ve canlıdır.** En ciddi sorun **Türkiye makro bloğu**: EVDS çalışmadığı için **politika faizi (%7) ve enflasyon (%30.87) sahte/sabit**, **CDS proxy**, ve **KAP boş** — bunlar kullanıcıya gerçek gibi sunuluyor ve hem makro skoru hem BIST reel-büyüme düzeltmesini yanlış besliyor. Önce EVDS onarımı + UI'da kaynak/tazelik rozetleri.
