# Bebek Hisseler — "Henüz Yükselmemiş Yüksek Potansiyel" Avcısı (Prompt + Model Spec)

> Bu dosya, GUNDG / KTLEV / ODINE / HEDEF tipi "1 yılda patlayan" hisselerin **patlamadan
> ÖNCEKİ** kurulumunu (setup) sistematik olarak yakalayacak yeni bir sayfanın tam spec'idir.
> `GUCLENDIRME-PROMPTU.md` formatıyla yazılmıştır — yeni bir Claude Code oturumuna
> "BEBEK-HISSELER-PROMPTU.md FAZ N'i uygula" demek yeterlidir.
>
> **Amaç:** Yükselişin *sonucunu* değil, *kurulumunu* skorlamak. Momentum kovalamıyoruz —
> sıkışmış yayı (coiled spring) gevşemeden önce buluyoruz.
>
> Oluşturulma: 2026-06-17

---

## 0. Felsefe — Neden "bebek" hisseler patlar? (10 yıllık saha bilgisi)

GUNDG/KTLEV/ODINE/HEDEF gibi hisselerin ortak paydası **tek bir faktör değil, bir
kombinasyon**. Önem sırasıyla:

1. **Yapısal kıtlık (en güçlü):** düşük halka açıklık (free float) + küçük piyasa değeri.
   Az arz → küçük para girişi fiyatı uçurur. "Kurumsal topluyor" hissinin asıl kaynağı
   genelde *foreign institution* değil, **dolaşımdaki payın azlığı + yoğun ortaklık**.
2. **Sessiz birikim (smart money izi):** fiyat yatayken hacmin sinsice artması, OBV'nin
   yukarı kayması, volatilitenin daralması (VCP). Yay bu fazda kurulur.
3. **Temel ateşleme:** reel (enflasyon-düzeltmeli) kâr/gelir **ivmelenmesi** veya
   zarardan kâra dönüş (turnaround). Düşük bazdan büyük yüzde kolay gelir.
4. **Katalist & hikâye:** yeni sözleşme/ihale, tema rüzgârı (savunma/teknoloji/enerji),
   yeni halka arz fiyat keşfi, bedelsiz/sermaye artırımı beklentisi, endekse dahil olma.
5. **"Henüz yükselmemiş" konumu:** zirvenin uzağında, 52H aralığının alt-orta bandında,
   RSI aşırı alımda değil, son 1 yılda zaten 2-3x yapmamış. **Bu sayfanın çekirdek kısıtı.**

> **Gölge taraf — dürüstlük zorunlu:** Düşük float + küçük cap = manipülasyona (pump &
> dump) en açık zemin. Model bu yüzden **kalite kapısı + tuzak filtresi**ni ÇARPAN olarak
> içerir ve her kart **risk rozeti** taşır. Bu sayfa "garantili kazanç" değil, "yüksek
> potansiyel + yüksek risk" listesidir; UI bunu net söyler.

---

## 1. Çalışma Kuralları (GUCLENDIRME-PROMPTU.md ile aynı)

1. Her değişiklik sonrası `npx tsc --noEmit` + `npm run build` temiz olmalı.
2. **Yeni migration'dan kaçın** — `ai_cache` tek-satır JSON deseni (`long-term:BIST`,
   `growth-momentum:BIST`, `news-catalyst:BIST` örnekleri). Açık: forward-tracking
   tablosu (bkz. FAZ 4) — gerekirse idempotent migration + CLAUDE.md "Bekleyen Manuel
   Adımlar" tablosu.
3. **Vercel timeout:** 619 sembol tek istekte bitmez → `?part=1|2` bölme + batch fetch
   (`long-term`/`growth-momentum-bist` deseni). `maxDuration` 300'ü aşma.
4. İstek-anı Yahoo fan-out YOK: ağır temel veri cron'da precompute → `ai_cache` tek satır;
   API yalnızca okur + scan_cache'ten taze teknik ekler (`long-term-runner` dersi).
5. Cron eklersen `vercel.json` + CLAUDE.md cron tablosu güncellenir.
6. Saf skor mantığı deterministik + test edilebilir (`lib/__tests__/` deseni).
7. Push öncesi kullanıcıya sor.

---

## 2. Veri Envanteri — neyimiz var, açık ne?

| İhtiyaç | Kaynak | Durum |
|---------|--------|-------|
| Reel büyüme / kâr ivmesi | `growth-momentum:BIST` (ai_cache) | ✅ Hazır (`getStoredGrowthMomentum`) |
| Bilanço kalitesi / tuzak elemesi | `lib/fundamental-health.ts` (Piotroski/Altman/**Beneish**) | ✅ Hazır |
| Katalist / haber | `news-catalyst:BIST` (ai_cache) | ✅ Hazır |
| Tema rüzgârı | `lib/bist-future-themes.ts` | ✅ Hazır |
| Teknik mikro-yapı (OHLCV 60 mum) | scan_cache `candles_json` | ✅ Hazır |
| Hacim ivmesi | scan_cache `rel_vol5` | ✅ Hazır |
| Likidite (20g ADV TL) | scan_cache mumlarından (`long-term-runner` hesaplıyor) | ✅ Hazır |
| Piyasa değeri | `fetchYahooFundamentals().marketCap` | ✅ Hazır |
| **Free float oranı** | Yahoo `defaultKeyStatistics.floatShares` + `sharesOutstanding` | 🔧 **Map'le** (modül zaten çekiliyor) |
| **IPO yaşı** | Yahoo `price.firstTradeDateMilliseconds` (veya `quote`) | 🔧 **Map'le** (1 alan) |
| Sahiplik yoğunluğu | `insidersPercentHeld` / `institutionsPercentHeld` | ✅ Hazır |

> **Kritik:** Veri açığı sadece 3 alanın map'lenmesi (`floatShares`, `sharesOutstanding`,
> `firstTradeDateMilliseconds`). `fetchYahooFundamentals` zaten `defaultKeyStatistics` ve
> `price` modüllerini çekiyor → **ekstra Yahoo isteği YOK.** KAP'tan tam halka açıklık
> oranı v2'ye bırakılır (Yahoo `floatShares` BIST'te yeterince iyi proxy).

---

## 3. Skor Modeli — `babyScore` (0-100)

5 ek katman (additive) × 2 çarpan (kalite + aşırı-uzama kapısı). Tüm bileşenler mevcut
veriden deterministik hesaplanır.

```
babyScore =
    ( scarcity      × 0.22     // Yapısal Kıtlık
    + accumulation  × 0.20     // Sessiz Birikim İzi
    + ignition      × 0.18     // Temel Ateşleme
    + catalyst      × 0.15     // Katalist & Hikâye
    + timing        × 0.25 )   // "Henüz Yükselmemiş" Konumu  ← en yüksek ağırlık
  × qualityGate                // 0.40–1.00 (tuzak/manipülasyon kısması)
  × extendedGate               // 0.50–1.00 (treni kaçırma cezası)
```

### 3.1 Yapısal Kıtlık — `scarcity` (w=0.22) 🔑
Hareketin yakıtı. Üç alt bileşen:
- **Float kıtlığı** (0.40): `freeFloat = floatShares / sharesOutstanding`.
  `≤%15 → 100`, `%15–60 lineer azalan`, `≥%60 → ~20`. (Çok düşük <%5 → likidite tuzağı
  riski, kalite kapısında cezalanır — burada değil.)
- **Küçük piyasa değeri** (0.30): log ölçek. BIST'te `<2 mlr TL → ~100`,
  `>50 mlr TL → ~10`. Büyük şirket yüzde olarak patlayamaz.
- **Float-adjusted değer** (0.30): `marketCap × freeFloat` = gerçek dolaşan değer.
  En küçük = en patlayıcı; tek başına en iyi "yakıt" metriği.

### 3.2 Sessiz Birikim İzi — `accumulation` (w=0.20)
scan_cache `candles_json` (60 günlük OHLCV) üzerinden — "para giriyor ama fiyat
patlamadı":
- **OBV eğimi** (yukarı) fiyat yatayken → birikim. (On-Balance Volume.)
- **Yukarı/aşağı hacim oranı** (son ~20-30 gün): yükselen günlerin hacmi > düşen günler.
- **Volatilite daralması (VCP):** son ATR/fiyat geçmişe göre büzülüyor → yay kuruluyor.
- **Yatay taban + yükselen dipler:** fiyat eğimi ~0 ama dip yapısı yükseliyor.
> Not: bazıları `lib/signals.ts` / `lib/market-phase.ts` içinde olabilir — varsa
> yeniden kullan, yoksa `lib/candle-microstructure.ts` (YENİ) içinde saf fonksiyon yaz.

### 3.3 Temel Ateşleme — `ignition` (w=0.18)
`growth-momentum:BIST` store'undan + `fetchYahooFundamentals`'tan:
- **Reel büyüme skoru** (mevcut `GrowthMomentumBreakdown.score`) tabanı.
- **İvmelenme bonusu:** son YoY (`earningsGrowth`) > çok-yıllı CAGR → hızlanıyor (+).
- **Turnaround bonusu:** zarardan kâra / negatif→pozitif marj dönüşü (+).
- **Marj genişlemesi** (`marginDeltaPP`).
- Banka/finansal → `applicable=false`: bu bileşen düşer, ağırlık yeniden normalize
  (`computeLongTermComposite` deseni — banka cezalandırılmaz, sadece bu pillar dışlanır).

### 3.4 Katalist & Hikâye — `catalyst` (w=0.15)
- **Haber katalisti** (`news-catalyst:BIST`): taze + fiyatlanmamış material haber (+).
- **Tema üyeliği** (`bist-future-themes`): savunma/teknoloji/enerji/ihracat (+).
- **IPO tazeliği:** `firstTradeDate < 18 ay` → fiyat-keşfi fazı bonusu.
- **Bedelsiz/sermaye artırımı proxy'si:** tespit edilebilirse (haber başlıklarından) (+).

### 3.5 "Henüz Yükselmemiş" Konumu — `timing` (w=0.25) ← çekirdek kısıt
Kullanıcının asıl talebi: **treni kaçırmamış** hisseler. candles_json + 52H'tan:
- **52H aralığındaki konum:** `pos = (fiyat − 52L) / (52H − 52L)`.
  `0.20–0.55 → en yüksek puan` (alt-orta bantta tabanlanıyor); `>0.85 → ağır ceza`
  (zirveye yapışık, geç).
- **1 yıllık getiri:** zaten `>%150` koşmuşsa → ağır ceza (amaç tam tersi).
- **RSI:** `<60 iyi`, `>75 ceza` (aşırı alım).
- **Düşen bıçak değil:** MA50 yakını/üstü veya düşük volatiliteyle tabanlanıyor olmalı;
  serbest düşüşteki hisse "ucuz" diye ödüllenmez (risk rozetiyle işaretlenir).

### 3.6 Kalite Kapısı — `qualityGate` (ÇARPAN 0.40–1.00) — tuzak filtresi
> **DİSİPLİNLİ profil** çarpanları (sert — bkz. Kilitlenen Kararlar #1):
- Beneish **şüpheli** → ×0.65 (kâr manipülasyonu).
- Piotroski `<3` → ×0.80.
- Altman **sıkıntı** → ×0.85.
- **Likidite:** 20g ADV `< ~1M TL` → **tamamen dışla** (skorlanmaz); `~1–2M TL` → ×0.60.
- **Anti-pump:** son ~5 günde temelsiz dikey sıçrama (`+%40` + ardışık tavan) → ×0.55
  ("operasyon" / zaten pompalanmış).
> Çarpanlar çarpışır (en kötü senaryo ~0.40 tabanına clamp).

### 3.7 Aşırı-Uzama Kapısı — `extendedGate` (ÇARPAN 0.50–1.00)
`timing` ile çift güvence: `pos > 0.90` VE `6 aylık getiri > %100` ise → ×0.50.
"Setup bitmiş, hareket olmuş" durumunu skorun tepesinden indirir.

### 3.8 Risk Rozetleri (UI — ZORUNLU)
Her kart şu rozetlerden uygun olanları taşır:
`🚩 düşük likidite` · `⚡ yüksek volatilite` · `🎭 olası operasyon (anti-pump)` ·
`🆕 yeni halka arz` · `📉 düşen bıçak riski` · `🔒 çok düşük float`.

---

## 4. Mimari & Fazlar

### FAZ 0 — Veri açığını kapat + saf skor motoru ✅ TAMAMLANDI (2026-06-17)
- ✅ `lib/yahoo-fundamentals.ts`: `floatShares`, `sharesOutstanding`, `firstTradeMs`
  eklendi (zaten çekilen `ks`/`pr` modüllerinden map — ekstra istek YOK). Geriye uyumlu.
- ✅ `lib/candle-microstructure.ts` (YENİ): `wilderRSI`, `computeObvTrend`, `upDownVolRatio`,
  `vcpRatio`, `priceSlopePct`, `higherLowsCount`, `detectVerticalSpike`, `computeMicrostructure`.
  Saf, bağımlılıksız. Sentetik veriyle doğrulandı (birikim tabanı vs pompa ayrışıyor).
- ✅ `lib/baby-score.ts` (YENİ): `computeBabyScore(inputs): BabyScoreBreakdown` — §7 birebir.
- ✅ `lib/__tests__/baby-score.test.ts`: 18 senaryo (kıtlık/birikim/timing/kalite-kapısı/
  anti-pump/banka-normalize/aşırı-uzama/turnaround/düşen-bıçak).
- **Doğrulama:** 85/85 test (67→85), `tsc --noEmit` temiz, `npm run build` başarılı.

### FAZ 1 — Çalıştırıcı + cron (precompute) ✅ TAMAMLANDI (2026-06-17)
- ✅ `lib/baby-runner.ts` (YENİ): paylaşılan bağlamı TEK sorguda oku (`growth-momentum:BIST`,
  `news-catalyst:BIST`, tema seti), sembol başına TEK `fetchYahooFundamentals` çağrısı,
  `computeMicrostructure` (scan_cache mumlarından — teknik için Yahoo YOK) + `computeBabyScore`,
  sonuç `ai_cache baby-candidates:BIST` (TTL 8g, MAX 300, merge'li). `buildBabyInputs`
  saf/export edildi (runner + doğrulama drift olmasın).
- ✅ `app/api/cron/baby-candidates/route.ts` (YENİ): `?part=1|2`, GET, `maxDuration=300`,
  CRON_SECRET, bistGuard, `fetchTurkeyInflation`, scan_cache TEK sorgu → ADV ön filtre
  (<1M TL ele) + candlesMap.
- ✅ `vercel.json`: Pzt 08:30/08:35 UTC (11:30 TRT) — diğer store'lardan SONRA.
- **Doğrulama (canlı, prod DB):** 605 likit → 494 skor / 57s (300s'e geniş marj). Patlamış
  GUNDG/KTLEV/ODINE/HEDEF **17-21'e bastırıldı** (pos52~0.99, rangeWidth 23-27x, extendedGate
  ×0.5). Top adaylar gerçek bebek profili: FMIZP 78, GOODY/SANKO/KIMMR/TSGYO 75 (pos52 0.2-0.5,
  rangeWidth 1.4-2.3, düşük float, küçük cap). **Prod store 300 satırla dolu → deploy sonrası
  sayfa hemen çalışır.**
- **Bilinen sınır:** `growth-momentum:BIST` MAX_STORED=250 → ~yarı evrende ignition pillar
  düşer (renormalize zarif). v2: growth cap artır veya on-demand fetch.

### FAZ 2 — Okuma API + sayfa ✅ TAMAMLANDI (2026-06-17)
- ✅ `app/api/yukselis-adaylari/route.ts` (YENİ): `baby-candidates:BIST` oku +
  scan_cache'ten taze fiyat/confluence/sparkline ekle (istek-anı Yahoo YOK). MIN 50, MAX 120.
- ✅ `app/yukselis-adaylari/page.tsx` (server, metadata) + `components/YukselisAdaylari.tsx`
  (YENİ): skora sıralı liste, 5-bileşen kırılım barı, risk rozetleri (kırmızı=tehlike),
  52H konumu/yıl-içi-salınım/float/cap/ADV/IPO şeffaflık çipleri, verdict filtreleri +
  "Düşük riskli" toggle + kıtlık/birikim/zamanlama sıralaması, **kalın spekülasyon uyarısı**.
- ✅ `components/NavbarClient.tsx`: Piyasa dropdown'a "Yükseliş Adayları" (Rocket).
- **Doğrulama (preview, canlı store):** sayfa render oldu (120 aday, 5 güçlü kurulum),
  desktop + mobil responsive, "Düşük riskli" toggle 120→116 (riskli kalan 0), konsol hatası
  yok, tsc + build temiz.

### FAZ 3 — Birim test + canlı doğrulama ✅ TAMAMLANDI (FAZ 0-2 boyunca)
- ✅ 19 birim test (baby-score) — 86/86 toplam.
- ✅ Canlı sanity: düşük-float küçükler scarcity yüksek (MARBL 92, SAYAS 90); zaten koşmuş
  GUNDG/KTLEV/ODINE/HEDEF timing+extendedGate ile 17-21'e bastırıldı; bankalar ignition düşer.

### FAZ 4 — Forward-tracking (model gerçekten işe yarıyor mu?) ⏳
- Geçmişe bakıp "GUNDG'yi yükselmeden önce yakalar mıydık" testi zor (scan_cache geçmişi
  sınırlı). Bu yüzden **ileriye dönük takip**: her hafta top-N adayı fiyat snapshot'ıyla
  sakla → 1/3/6 ay sonra getiriyi ölç (mevcut `evaluate` altyapısı mantığı).
- Karar: yeni `baby_picks` tablosu (idempotent migration) vs `ai_cache` snapshot serisi.
  Hit-rate + ortalama getiri sayfada gösterilir (Haftanın Seçimleri/winRate deseni).

---

## 5. Kilitlenen Kararlar (2026-06-17) ✅

1. **Risk profili: DİSİPLİNLİ.** Kalite kapısı sert — daha az ama temiz aday.
   Uygulama: Beneish şüpheli ×0.65 (×0.70 yerine), anti-pump ×0.55, Piotroski<3 ×0.80.
   "Operasyon" hisselerini agresifçe eler; kullanıcıyı tepeye sokma riski minimize.
2. **Likidite tabanı: ~2M TL (yumuşak) + ~1M TL (sert kesim).**
   - 20g ADV `< ~1M TL` → tamamen **dışla** (ölü tahta, çıkış imkânsız).
   - 20g ADV `~1–2M TL` → ×0.60 ceza (dahil ama bastırılmış).
   - Düşük taban erken bebekleri yakalar; **disiplinli kalite kapısı** bu tabanın
     getirdiği tuzak riskini dengeler (bilinçli ikili tasarım).
3. **Free float kaynağı: Yahoo proxy (v1).** `floatShares / sharesOutstanding`.
   KAP tam halka açıklık oranı → v2 (KAP erişimi bloklu, ekstra altyapı gerekir).

### Hâlâ açık (FAZ ilerledikçe netleşir)
4. **"Henüz yükselmemiş" sertliği:** `pos`/1y-getiri eşik ince ayarı FAZ 0'da canlı
   veriyle kalibre edilir (disiplinli profil → daha temkinli eşikler).
5. **Forward-tracking deposu:** yeni `baby_picks` tablosu mu, ai_cache snapshot mı —
   FAZ 4'te karara bağlanır.

---

## 6. Doğrulama Felsefesi (kredibilite)

- **Look-back sanity:** bilinen kazananların *bugünkü* profili modeli kalibre etmeye
  yardım eder ama survivorship bias'a dikkat (kaybedenler de aynı profili taşıyordu).
- **Asıl kanıt ileriye dönük:** FAZ 4 hit-rate. Model "%X aday 3 ayda BIST100'ü geçti"
  diyebilmeli; diyemiyorsa ağırlıklar revize edilir.
- **Şeffaflık = güven:** her skor bileşenine ve risk rozetine tıklanabilir kırılım;
  kullanıcı "neden bu hisse?" sorusunu görebilmeli.

---

## 7. Model v2 — Somut Formüller (kod-hazır) 🔧

> Bölüm 3'ün sayısal karşılığı. Tüm fonksiyonlar saf, deterministik. `clamp(x,lo,hi)`,
> `lerp` standart. Her alt-skor 0-100. Eksik girdide alt-skor ya `null` (pillar'dan
> dışlanır, ağırlık renormalize) ya da belirtilen nötr değeri alır.

### 7.0 Türetilen primitifler (60 mum `candles_json` + Yahoo)
```
ADV_TL      = mean_{son 20}(close·volume)                    // long-term-runner ile aynı
r60         = close[-1]/close[0] − 1                          // ~3 aylık getiri
RSI14       = Wilder(close, 14)
OBV serisi  = Σ sign(Δclose)·volume
pos52       = clamp( (price − week52Low)/(week52High − week52Low), 0, 1 )
rangeWidth  = week52High / week52Low                          // yıl içi hareket genişliği
ipoAyı      = (now − firstTradeMs)/30.44g
freeFloat   = floatShares / sharesOutstanding                // null → 50 nötr + ❓
floatAdjCap = marketCap · freeFloat
recentATR%  = mean_{son 10}(TR)/price ;  olderATR% = mean_{30..60}(TR)/price
vcpRatio    = olderATR% / recentATR%                          // >1 = daralma
udvr        = Σvol(up gün)_{son 30} / Σvol(tüm)_{son 30}
obvTrend    = (OBV[-1] − OBV[0]) / Σ|volume|   ∈ ~[−1,1]
priceSlope60= lineer fit eğimi (% / pencere)
```
> 52H/52L yoksa 60-mum min/max ile türet (≈3 ay — yaklaşık, `pos52approx` flag'le).
> Mum yoksa `accumulation`+`timing` hesaplanamaz → **sembol skorlanmaz** (çekirdek).

### 7.1 scarcity (0.22) = 0.40·float + 0.35·cap + 0.25·floatAdj
```
floatScore(ff):  ff≤.05→80 | .05<ff≤.15→100 | .15<ff<.60→lerp(100→20) | ff≥.60→20 | null→50
capScore(mc):    clamp(100 − (log10(mc)−9.176)/1.523·85, 15, 100)   // 1.5B→100, 50B→15
floatAdjScore(fac): clamp(100 − (log10(fac)−8.477)/1.699·85, 15, 100) // 300M→100, 15B→15
// freeFloat null → floatAdj düşer, ağırlık float+cap üzerine renormalize
```

### 7.2 accumulation (0.20) = 0.35·obv + 0.30·udvr + 0.20·vcp + 0.15·base
```
obvScore   = clamp(50 + obvTrend·50, 0, 100)
             × (priceSlope60∈[−5%,+20%] ? 1.10 : priceSlope60>50% ? 0.70 : 1.0)   // stealth bonus / koşmuş cezası, sonra clamp 0-100
udvrScore  = clamp( (udvr − .40)/.25 · 100, 0, 100 )                    // .40→0, .65→100
vcpScore   = clamp( 50 + (vcpRatio − 1.0)·62.5, 0, 100 )                // 1.0→50, 1.8→100
baseScore  = higherLows(l1,l2,l3) → {0:30, 1:65, 2:100}                 // 20'lik 3 pencere min'i artıyor mu
             (close<SMA50 & priceSlope60<−15% ise ×0.6)
```

### 7.3 ignition (0.18) = 0.55·growth + 0.45·accel   (banka → null, pillar düşer)
```
growthSub = growthStore.score                                          // reel, kaliteli (mevcut)
accelReal = (earningsGrowth·100 − enflasyon) − (growthStore.netIncomeCagrReal ?? 0)
accelSub  = clamp(50 + accelReal·1.2, 0, 100)                           // ivmelenme = 2. türev
// earningsGrowth null → accelSub = growthStore.verdict'ten türet (büyüyor→65, yatay→45, küçülüyor→25)
// turnaround (epsSeries[0]<0 & epsSeries[-1]>0, store'da varsa) → accelSub = max(accelSub, 90)
// growthStore yoksa → ignition = Yahoo earningsGrowth/revenueGrowth ile düşük-güven tek-sub
```

### 7.4 catalyst (0.15) = 0.45·haber + 0.25·tema + 0.30·ipo
```
haberSub = news-catalyst:BIST → taze+pozitif+unpriced material:100 | destekli:75 | yok:40 | çelişen(neg):15
temaSub  = bist-future-themes üyesi (savunma/teknoloji/enerji/ihracat):100 | değil:40
ipoSub   = ipoAy≤6→100 | 6<≤18→lerp(100→60) | 18<≤36→lerp(60→40) | >36→30 | null→40
```

### 7.5 timing (0.25) = 0.40·konum + 0.30·kostuMu + 0.15·rsi + 0.15·sicrama
```
konumSub(pos52): <.15→60 | .15≤≤.45→100 | .45<≤.70→lerp(100→55) | .70<≤.85→lerp(55→25) | >.85→15
kostuMuSub:  rangeWidth<1.8→90 | 1.8≤≤3.0→lerp(90→55)
             | >3.0 → (pos52<.40 ? 60 : 20)        // 3x+ yıllık salınım: dipte=re-akümülasyon, tepede=geç
rsiSub(RSI14): <30→50 | 30≤<40→75 | 40≤≤58→100 | 58<≤70→lerp(100→50) | >70→30
sicramaSub(r60): <25%→100 | 25-60%→lerp(100→50) | 60-120%→lerp(50→20) | >120%→10 | <−30%→50
```

### 7.6 qualityGate (ÇARPAN, DİSİPLİNLİ) — başlangıç 1.0, çarpışır, clamp[0.40,1.0]
```
ADV_TL < ~1M TL        → SEMBOL DIŞLA (skorlanmaz, store'a yazılmaz)
ADV_TL 1M–2M TL        → ×0.60
Beneish şüpheli         → ×0.65   ;  Beneish gri → ×0.90
Piotroski < 3           → ×0.80
Altman sıkıntı          → ×0.85
freeFloat < .03         → ×0.80   (+🔒)
anti-pump tetikli       → ×0.55   (son 15g içinde herhangi 5g pencerede ≥+40% VEYA ≥3 ardışık
                                    ~tavan günü  VE  ignition<50 = temelsiz pompalama)
```

### 7.7 extendedGate (ÇARPAN) — timing'e ikinci sert güvence
```
pos52>.90 & rangeWidth>2.5 → ×0.50      // net koşmuş + tepede
pos52>.85                  → ×0.75
aksi                       → 1.0
```

### 7.8 Nihai birleştirme
```
add5 = Σ(present pillar · ağırlık) / Σ(present ağırlık)      // banka: ignition düşer, renormalize
babyScore = round( clamp( add5 · qualityGate · extendedGate, 0, 100 ) )

verdict: ≥75 "güçlü kurulum" | 60-75 "umut vadeden" | 45-60 "izlemede" | <45 "zayıf"
MIN_STORE_SCORE = 40  (çöpü ele; sayfa filtresi API'de)
```

### 7.9 Risk rozetleri (deterministik, UI zorunlu)
```
🚩 düşük likidite   : ADV_TL < 3M TL
⚡ yüksek volatilite : recentATR% > 6%  VEYA  beta > 1.5
🎭 olası operasyon  : anti-pump tetikli
🆕 yeni halka arz   : ipoAy < 12
📉 düşen bıçak      : pos52 < .20  VE  priceSlope60 < −20%
🔒 çok düşük float  : freeFloat < .05
❓ float verisi yok : freeFloat null   (growthScore null flag TETİKLEMEZ — ignition=null UI'da görünür)
```

### 7.10 BabyScoreBreakdown (çıktı şekli)
```ts
{
  score: number; verdict: string;
  components: { scarcity:number; accumulation:number; ignition:number|null; catalyst:number; timing:number };
  qualityMultiplier:number; extendedMultiplier:number; componentsUsed:number;
  riskFlags: string[];
  // şeffaflık (UI rozetleri + "neden bu hisse")
  freeFloat:number|null; marketCap:number|null; floatAdjCap:number|null; advTL:number|null;
  ipoAyı:number|null; pos52:number; rangeWidth:number; rsi14:number;
  obvTrend:number; udvr:number; vcpRatio:number; r60:number;
  growthScore:number|null; catalystState:string|null;
}
```

> **Tasarım gerekçeleri (saha):** (1) timing en yüksek ağırlık + ÇİFT kapı (timing puanı
> *ve* extendedGate çarpanı) → yüksek kıtlık/birikim skoru bile "zaten koşmuş" hisseyi
> tepeye taşıyamaz; kullanıcının "henüz yükselmemiş" kısıtı garanti. (2) `rangeWidth`
> 1y-getiri proxy'si → 60 mumla mümkün, manipüle edilemez. (3) `obvTrend × stealth bonus`
> = "fiyat yatay ama para giriyor" → asıl erken sinyal. (4) DİSİPLİNLİ çarpanlar
> birikim/kıtlık cazibesini manipülasyon şüphesinde agresifçe kısar (×0.55–0.65). 
