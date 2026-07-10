# VIOP + TradingView Entegrasyonu — Uygulama Planı

> Bu döküman **kodlama planıdır** — başka bir Claude Code penceresinde faz faz uygulanacak.
> Mevcut FAZ 0/1/2 deseni + "yeni tasarım" (AppShell) mimarisiyle birebir uyumlu yazıldı.
> Oluşturulma: 2026-07-11
>
> **Altın kural:** Spot `decision-engine`'i kaldıraca DOĞRUDAN bağlama. VIOP ayrı motor ister.
> **Çerçeve:** "Sinyal servisi" değil → **"Analiz & Yorum"** + zorunlu risk/kaldıraç ibaresi (SPK koruması).

---

## 0. Kapsam & Karar Özeti

| Karar | Seçim | Gerekçe |
|-------|-------|---------|
| Başlangıç enstrümanı | **XU030 Endeks Vadeli** (Faz A) | En likit, veri en temiz, makro/rejim motoru en güçlü |
| Sonraki | Likit tek hisse vadelileri (~10-15 kontrat) | Spot motorla sinerji; sığ kontratlar hariç |
| En son | USD/TRY + Ons Altın vadelileri | Makro motoru zaten bu değişkenleri besliyor |
| MVP veri | **Spot proxy + gecikmeli** (XU030 spot + baz) | Bedava, hemen; ürün tutarsa broker/veri lisansı |
| Grafik | TradingView **Advanced Chart widget** (hemen) → **Lightweight Charts** (kendi overlay) | Bedava, profesyonel, sıfır veri maliyeti |
| Framing | Genel analiz + "yatırım tavsiyesi değildir" + kaldıraç uyarısı | Kişiye özel "al" push'u YOK |

**Migration:** Muhtemelen GEREKMEZ (spot proxy + ai_cache tek-satır deseni). Forward-tracking
istatistiği istenirse tek yeni tablo (`viop_signal_performance`) — ayrı fazda.

---

## FAZ TV — TradingView Grafik Entegrasyonu (bağımsız, ilk yapılabilir) — ✅ TAMAMLANDI (2026-07-11)

> `lib/tradingview-symbols.ts` (iç→TV sembol + VIOP proxy düşürme), `components/new/TradingViewChart.tsx`
> (lazy tv.js embed, tema-farkındalıklı + themeOverride, cleanup/SSR guard). Hisse detayına
> "Sinyalli / TradingView" grafik toggle'ı olarak gömüldü (eski paneller KORUNDU). tsc+build temiz.
> Doğrulama notu: /hisse/* auth-gated + tv.js sandbox'ta bloklu → Vercel preview deploy'da doğrulanır.


> VIOP'tan bağımsız; hemen değer üretir. Hisse detay + (sonra) VIOP ekranında kullanılır.

### TV-1: Advanced Chart Widget bileşeni
- **Yeni:** `components/new/TradingViewChart.tsx` — `'use client'`
  - TradingView `tv.js` embed widget'ını `useEffect` ile mount eder (external script;
    `<script src="https://s3.tradingview.com/tv.js">` runtime yüklenir).
  - Props: `symbol` (örn. `BIST:XU030`, `BIST:GARAN`), `interval`, `theme` (ThemeProvider'dan
    açık/karanlık — `theme="light"|"dark"` widget opsiyonuna bağla), `height`.
  - Cleanup: unmount'ta widget container'ı temizle (memory leak / çift-mount FOUC önle).
  - SSR guard: `typeof window` kontrolü + script tek sefer yükleme (global flag).
- **Sembol haritası:** `lib/tradingview-symbols.ts` (YENİ) — iç sembol → TV sembolü
  (`GARAN` → `BIST:GARAN`; endeks → `BIST:XU030`; VIOP kontratı → varsa TV karşılığı, yoksa
  spot endekse düş + "gecikmeli/proxy" rozeti).

### TV-2: Hisse detayına gömme
- `app/hisse/[sembol]/HisseDetailClient.tsx` — mevcut grafik alanının yanına/yerine
  `<TradingViewChart symbol=... />` sekmesi ekle. **Eski değerleme/sinyal panellerini KORU**
  (CLAUDE.md kuralı: fonksiyon kaybetme). Grafik bir sekme/toggle olarak gelsin.

### TV-3: Theme senkronu + CSP/perf
- ThemeProvider `ie-theme` değişince widget tema prop'u güncellensin (remount ya da widget API).
- Script'i lazy (görünürlükte/sekme açılınca) yükle — sayfa ilk boyanışını yavaşlatma.
- **Not:** Widget kendi verisini gösterir; SİZİN sinyaliniz üstüne çizilemez (widget kapalı kutu).
  Kendi AL/SAT/formasyon overlay'i gerekince → FAZ LC.

### Doğrulama (FAZ TV)
`npx tsc --noEmit` + `npm run build` temiz. Preview'de hisse detayda widget açık/karanlık
temada render oluyor mu, sembol değişince grafik değişiyor mu (preview_snapshot + screenshot).

---

## FAZ LC — Lightweight Charts (kendi sinyal overlay'i) — TV'den SONRA — ✅ TAMAMLANDI (2026-07-11)

> `components/new/SignalChart.tsx` — lightweight-charts (zaten kurulu v4.2.0), yeni-tasarım
> token renkleri (up/down/ai) + açık/karanlık tema (ThemeProvider), candlestick+hacim+AL/SAT
> marker + stop/target çizgileri; `candles` prop'undan veya `symbol` ile /api/ohlcv'den çeker.
> LC-2 tüketici: ViopScreen kontrat kartlarında (V2). tsc+build temiz.


> Kendi OHLCV'niz + AL/SAT/formasyon işaretlerinizi ÇİZEBİLDİĞİNİZ katman. Sizi "yorumcu"dan
> "araç"a çıkarır. Açık kaynak (MIT), veri sizin.

### LC-1: Kütüphane + bileşen
- `npm i lightweight-charts` (MIT, hafif, ~45KB).
- **Yeni:** `components/new/SignalChart.tsx` — mevcut `/api/ohlcv`'den mum verisi çeker,
  candlestick serisi + hacim; üstüne markers (AL/SAT), çizgiler (stop/target), formasyon
  bölgeleri. Tasarım token'larıyla (up/down/ai renkleri), açık/karanlık tema.

### LC-2: Kullanım
- Fırsatlar/Bugün/VIOP ekranlarındaki SVG sparkline'ların yerine (veya detay modalında) opsiyonel
  yükseltme. Mevcut sparkline'lar KALSIN (liste için hafif); SignalChart detay görünüm için.

### Doğrulama (FAZ LC)
tsc+build temiz. Preview'de gerçek OHLCV ile mum + marker render (preview_screenshot).

---

## FAZ V0 — VIOP Veri Katmanı + Kontrat Evreni (temel) — ✅ TAMAMLANDI (2026-07-11)

> `lib/viop-symbols.ts` (XU030 çift-ay çevrimi yakın+sonraki kontrat, meta: çarpan/teminat/tick —
> ⚠️ resmi VIOP spec'ten doğrulanacak sabitler), `lib/viop-basis.ts` (cost-of-carry baz +
> proxy vadeli türetme, tarihsel convergence), `lib/viop-data.ts` (kaynak-agnostik arayüz:
> getViopQuote/getViopOhlcv, MVP=spot proxy, dataQuality+asOf, redistribüsyon uyarısı yorumu).
> Test: `lib/__tests__/viop-basis.test.ts` (14 senaryo). tsc+build temiz.


> Motor/UI'dan ÖNCE veri soyutlaması. Kaynak değişse de arayüz sabit kalsın.

### V0-1: Kontrat evreni + meta
- **Yeni:** `lib/viop-symbols.ts`
  - Faz A: XU030 vadeli kontrat(lar) (yakın + bir sonraki vade).
  - Her kontrat: `code`, `underlying` (XU030), `multiplier` (endeks çarpanı), `expiry` (vade),
    `initialMargin` (teminat ~%10, güncellenebilir sabit), `tickSize`.
- **Yeni:** `lib/viop-basis.ts` — spot-vadeli baz hesabı (F = S + taşıma maliyeti); proxy modda
  vadeli fiyatı spot XU030 + tahmini baz ile türet, "proxy" flag'i döndür.

### V0-2: Veri adaptörü (kaynak-agnostik arayüz)
- **Yeni:** `lib/viop-data.ts` — TEK arayüz: `getViopQuote(code)`, `getViopOhlcv(code)`.
  - **MVP implementasyon:** spot proxy — XU030 endeks OHLCV (mevcut kaynaktan) + baz → vadeli seri.
  - **İleride:** broker API (AlgoLab/Midas/Matriks) adaptörü aynı arayüzü implemente eder;
    sadece bu dosya değişir, üst katman değişmez.
  - Her yanıtta `dataQuality: 'proxy' | 'delayed' | 'realtime'` + `asOf` timestamp.
- **Redistribüsyon uyarısı (koda yorum olarak):** ham broker verisi kullanıcıya AKTARILAMAZ
  (lisans). Yalnız TÜRETİLMİŞ analiz/skor servis edilir. MVP proxy bu sorunu doğal çözer.

### Doğrulama (FAZ V0)
Birim test: baz hesabı + proxy türetme (`lib/__tests__/viop-basis.test.ts`). tsc+build temiz.

---

## FAZ V1 — VIOP Analiz Motoru (kaldıraç-farkındalıklı) — ✅ TAMAMLANDI (2026-07-11)

> `lib/viop-engine.ts` — saf/deterministik motor: teknik katman signals.ts'ten YENİDEN KULLANILDI
> (detectAllSignals+computeConfluence); kaldıraç katmanı: positionSize (teminat+risk%),
> likidasyon mesafesi, baz/vade ayarlı stop/target, vade roll uyarısı; çıktı yön+skor+güven+
> risk bloğu+senaryo gerekçe+zorunlu disclaimer. Cron `app/api/cron/viop-scan` (makro/rejim
> getMacroFull'dan, ai_cache `viop-scan:BIST` tek satır, TTL 60dk, maxDuration 60, bistGuard).
> Okuma API `app/api/viop` (premium tier-gated, ai_cache oku, fan-out YOK). vercel.json:
> 12:05 + 17:55 TRT. Test: `lib/__tests__/viop-engine.test.ts` (14 senaryo).
> **Canlı proxy e2e:** XU030 16356 spot → 16770 proxy (+414 baz contango, 20g), yön long
> skor 70, R/R 1.5, 10x kaldıraç, 500k@%2 → 2 kontrat, likidasyon güvenliği doğru. tsc+build temiz.


> Spot `decision-engine`'i KLONLAMA. Kaldıraç gerçeğini içeren ayrı motor.

### V1-1: Motor
- **Yeni:** `lib/viop-engine.ts`
  - **Girdi:** vadeli OHLCV (proxy), makro/rejim (mevcut `macro-service` / `regime-engine`),
    sektör momentumu (endeks için genel piyasa), baz/contango durumu, vadeye kalan gün.
  - **Teknik katman:** spot sinyal kütüphanesini (`lib/signals.ts`) OHLCV üzerinde YENİDEN
    KULLAN (RSI/trend/formasyon hesabı enstrümandan bağımsız) — ama karar/skor ayrı.
  - **Kaldıraç katmanı (YENİ, kritik):**
    - `positionSize` önerisi (teminat + risk %'sine göre lot).
    - `liquidationDistance` — stop mesafesi teminata göre; "sinyal doğru ama %X ters →
      likidasyon" uyarısı.
    - Stop/target **baz ve vade** ayarlı (spot stop'u aynen kullanma).
    - Vade sayacı: vadeye < N gün → belirsizlik/roll uyarısı (FAZ 2 earningsRisk mantığına benzer).
  - **Çıktı:** yön (long/short/nötr) + skor + güven + **kaldıraç-farkındalıklı risk bloğu**
    + insan-okur gerekçe (AL/SAT değil, "senaryo/olasılık" dili).

### V1-2: Precompute cron (istek anı fan-out YOK — scan-cache dersi)
- **Yeni:** `app/api/cron/viop-scan/route.ts` — aktif VIOP kontratlarını tarar, `viop-engine`
  çıktısını `ai_cache` `viop-scan:BIST` tek satıra yazar (TTL kısa, örn. 30-60dk; gün-içi taze).
- `vercel.json`: scan-cache'ten SONRA tetikle (örn. 12:05 + 17:55 TRT). `maxDuration` uygun.

### V1-3: Okuma API
- **Yeni:** `app/api/viop/route.ts` — `ai_cache`'ten tek satır okur + fiyat/güncellik meta.
  İstek anında Yahoo/broker fan-out YOK.

### Doğrulama (FAZ V1)
Birim test: kaldıraç/likidasyon/vade senaryoları (`lib/__tests__/viop-engine.test.ts`).
Canlı proxy ile e2e: XU030 vadeli skor + risk bloğu mantıklı mı. tsc+build temiz.

---

## FAZ V2 — VIOP Ekranı (yeni tasarım / AppShell) — ✅ TAMAMLANDI (2026-07-11)

> `components/new/ViopScreen.tsx` (özet+kalıcı risk ibaresi+proxy rozeti+kontrat kartı:
> yön/skor + bg-surface-dark kaldıraç/teminat/likidasyon feature bloğu + SignalChart +
> gerekçe; 403→premium upsell). `app/viop/page.tsx` (AppShell wrapper, metadata).
> `lib/new-design-routes.ts`+AppShell sidebar'a `/viop` (mobil tab bar 5-slot dolu → sidebar-only,
> bilinçli sapma). `middleware.ts` auth-korumasına `/viop` (premium gate API'de: /api/viop 403).
> Auth kararı: **premium (tier-gated)**, veri kaynağı **MVP proxy**, SPK **genel ibare** (kullanıcı onayı).
> tsc+build temiz; ekran auth+premium-gated → veri görseli Vercel preview deploy'da doğrulanır.


> CLAUDE.md "yeni ekran ekleme deseni"ni birebir izle (4 adım).

### V2-1: Bileşen
- **Yeni:** `components/new/ViopScreen.tsx` — `'use client'`, tasarım token'larıyla:
  - Özet şerit (aktif kontratlar, genel piyasa yönü, baz durumu).
  - Kontrat kartı: yön + skor + **kaldıraç/teminat/likidasyon bloğu** (görsel olarak öne çıkan
    risk uyarısı — `bg-surface-dark` feature kart olabilir) + TradingView/Lightweight grafik.
  - "Analiz — yatırım tavsiyesi değildir" + kaldıraç risk ibaresi (kalıcı, görünür).
  - Gecikmeli/proxy veri rozeti (dataQuality'den).

### V2-2: Rota + kabuk (4-adım desen)
1. `components/new/ViopScreen.tsx` (üstte).
2. **Yeni:** `app/viop/page.tsx` → `<AppShell><ViopScreen/></AppShell>` (metadata + thin wrapper).
3. `lib/new-design-routes.ts` → `NEW_DESIGN_ROUTES`'a `/viop` ekle → `ChromeGate` eski chrome'u gizler.
4. `components/new/AppShell.tsx` sidebar + mobil tab bar'a `/viop` ekle (uygun ikon).

### V2-3: Auth kararı
- Public mi premium mi? Öneri: **premium/tier-gated** (VIOP aktif kitle + gelir). `middleware.ts`
  + `lib/tier-guard.ts` ile koru. Public yaparsan chat API deseni gibi API auth iste.

### Doğrulama (FAZ V2)
tsc+build temiz. Preview'de ekran açık/karanlık temada render, risk ibaresi görünür,
grafik gömülü. Auth-gated ise Vercel preview'de giriş yapıp veriyle doğrula.

---

## FAZ V3 (OPSİYONEL, sonra) — Genişleme

- Likit tek hisse vadelileri (F_GARAN...) — `viop-symbols` evrenini genişlet, sığ kontratları ele.
- USD/TRY + Ons Altın vadelileri (makro motoru zaten besliyor).
- **Forward-tracking istatistiği:** VIOP sinyal performansı (spot `signal_performance` deseni gibi)
  → tek yeni tablo `viop_signal_performance` + evaluate cron. **Bu fazda migration GEREKİR.**
- Broker/veri lisansı: proxy → gerçek realtime feed (redistribüsyon kısıtına dikkat).

---

## Sıralama & Bağımlılıklar

```
FAZ TV  (bağımsız) ─────────────┐
FAZ LC  (TV'den sonra) ─────────┤
                                 ├─→ FAZ V2 grafikleri bunları kullanır
FAZ V0 (veri) → V1 (motor) → V2 (ekran) → V3 (genişleme, opsiyonel)
```

- **Önce FAZ TV** yapılabilir (hemen değer, VIOP'tan bağımsız).
- VIOP tarafı V0→V1→V2 sırayla; V2 grafikleri için TV/LC hazır olması iyi ama şart değil.

## Her fazda ortak doğrulama kuralı (CLAUDE.md)
`npx tsc --noEmit` + `npm run build` temiz olmalı. Public ekranlar gerçek/proxy veriyle
preview'de doğrulanır. UI değişikliğinde mobil + masaüstü + açık/karanlık tema kontrol.

## Açık uçlar — ✅ NETLEŞTİRİLDİ (2026-07-11, kullanıcı kararı)
1. **Veri kaynağı:** ✅ MVP spot proxy (ürün tutarsa broker API'ye geçiş — viop-data.ts tek nokta).
2. **VIOP ekranı:** ✅ Premium (tier-gated) — /api/viop 403 + middleware auth.
3. **SPK ibaresi:** ✅ Genel "yatırım tavsiyesi değildir" + kaldıraç risk dili yeterli
   (kişiye özel al/sat YOK). ⏳ Kullanıcı sonra danışmana onaylatacak (metin placeholder değil, canlı).
4. **TradingView vs Lightweight:** ✅ İkisi de — FAZ TV (widget) + FAZ LC (SignalChart) yapıldı.

## Deploy sonrası yapılacaklar
- Bugün Cumartesi → bistGuard cron'u atladı. Hafta içi ilk iş günü cron otomatik çalışır
  (12:05 + 17:55 TRT). İstenirse manuel tetikle:
  `curl -H "Authorization: Bearer $CRON_SECRET" https://bistai.vercel.app/api/cron/viop-scan`
- Vercel preview deploy'da giriş yapıp **premium** hesapla `/viop` veri görselini + `/hisse/*`
  TradingView toggle'ını doğrula (auth+tv.js sandbox'ta doğrulanamadı).
- ⚠️ `lib/viop-symbols.ts` çarpan/teminat/tick sabitlerini resmi VIOP XU030 kontrat spec'iyle teyit et.

## FAZ V3 (OPSİYONEL) — henüz yapılmadı
Tek hisse vadelileri, USD/TRY+Altın, forward-tracking (`viop_signal_performance` — migration GEREKİR).
