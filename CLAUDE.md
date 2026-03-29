# BistAI - Claude Code Proje Hafızası

> Bu dosya Claude Code tarafından otomatik okunur. Tüm ekip üyeleri aynı bağlamı paylaşır.

---

## 🚀 SONRAKİ ADIMLAR — Öncelik Sırasına Göre (2026-03-28 güncellendi)

### ~~🔴 SİNYAL KALİTESİ & DOĞRULUK~~ ✅ SPRINT TAMAMLANDI

| # | Görev | Açıklama | Durum |
|---|-------|----------|-------|
| Q1 | ~~**Confluence Skoru**~~ | ✅ `computeConfluence()` — 4 kategori, severity+hizalama+çeşitlilik → 0-100. StockCard badge | ✅ |
| Q2 | ~~**Sinyal Yaşı (Freshness)**~~ | ✅ `candlesAgo` field, "Xg önce" badge StockCard'da gösteriliyor | ✅ |
| Q3 | ~~**Backtest Başarı Oranı UI**~~ | ✅ `WinRateBadge` — "7g %XX" StockCard'da (sampleSize≥20) | ✅ |
| Q4 | ~~**Korelasyon Katsayısı**~~ | ✅ `karsilastir/KarsilastirClient.tsx` — korelasyon matrisi eklendi | ✅ |
| Q5 | ~~**Multi-timeframe Doğrulama**~~ | ✅ `computeWeeklyAlignment()` + `MTFBadge` (W✓/W✗) StockCard'da | ✅ |
| Q6 | ~~**Sektör Momentum Filtresi**~~ | ✅ `SectorConflictBadge` (⚠ Sektör Zayıf) + taramada "Güçlü Sektör" toggle | ✅ |

### 🔴 1. Sinyal Güçlendirmeleri (Kısa Vadeli — Hemen Yapılabilir)

| # | Görev | Neden Önemli |
|---|-------|--------------|
| S1 | ~~**Kırılım sinyali güçlendir**~~ | ✅ 50g lookback, %0.3 min kırılım, 0.8x vol, breakoutPct eklendi |
| S2 | ~~**Altın/Ölüm Çaprazı iyileştir**~~ | ✅ Tarama 252g veri, 10 mum lookback, separationPct eklendi |
| S3 | ~~**MACD Kesişimi iyileştir**~~ | ✅ 7 mum lookback, histExpanding, aboveZero kontrolü eklendi |
| S4 | ~~**RSI Seviyesi sinyali güçlendir**~~ | ✅ Bölgeden çıkış tespiti, 32/68 BIST eşiği, rsiMomentum eklendi |

### ~~🟠 2. Anlık Uyarı Sistemi — Phase 14.2~~ ✅ TAMAMLANDI
- **Test edildi ve çalışıyor** — Her iş günü 10:30 TRT'de gönderilir

### ~~🟠 3. Portföy Performans Grafiği — Phase 14.1 ek~~ ✅ TAMAMLANDI
- `components/PortfolioPerformanceChart.tsx` mevcut ve `app/portfolyo/page.tsx`'e entegre edildi

### ~~🟡 4. Backtest Veri Sorunu — Phase 14.3~~ ✅ TAMAMLANDI
- `app/api/dev/seed-backtest/route.ts` — 120 sentetik kayıt üretir, `POST /api/dev/seed-backtest` ile çalıştır

### ~~🟡 5. Mobil PWA — Phase 14.5~~ ✅ TAMAMLANDI
- `public/manifest.json` + `public/sw.js` + `public/icons/` → layout.tsx'de `manifest: '/manifest.json'`

### ~~🟡 6. Code Quality — Teknik Borç~~ ✅ TAMAMLANDI
- `components/VixChart.tsx` silindi (kullanılmıyordu)
- TypeScript `npx tsc --noEmit` — sıfır hata

---

## ✅ 2026-03-28 Oturumunda Tamamlananlar

| Özellik | Dosyalar |
|---------|---------|
| **Q6 Sektör Momentum Filtresi** — sektör düşerken bullish sinyal ⚠️ badge + taramada "Güçlü Sektör" toggle | `components/StockCard.tsx`, `app/tarama/page.tsx` |
| **Yol Haritası Step 1** — Makro Rüzgar Gauge (Berk) | `components/MacroWindGauge.tsx` |
| **Yol Haritası Step 2** — Hesap Makineleri sayfası (Berk) | `app/araclar/page.tsx` |
| **Yol Haritası Step 3** — Ekonomi Takvimi sayfası + lib (Berk) | `app/ekonomi-takvimi/page.tsx`, `lib/ekonomi-takvimi.ts` |
| **ScoreBreakdown** — Kompozit skor görselleştirmesi (Berk) | `components/ScoreBreakdown.tsx` |
| **Avatar sistemi** — profil avatar yükleme/seçme (Berk) | `app/api/profile/avatar/route.ts`, `public/avatars/` |
| **CLAUDE.md** — Q3-Q6 ✅, Phase 14.3/14.5 ✅, roadmap eklendi | `CLAUDE.md` |
| **Step 4** — Portfolyo CSV export + GÜÇLÜ SAT badge (ScoreBreakdown ring+banner) | `app/portfolyo/page.tsx`, `components/ScoreBreakdown.tsx` |
| **Step 8** — KAP Duyuruları sayfası + API + lib + Navbar + HisseDetail KAP bölümü | `lib/kap.ts`, `app/api/kap/route.ts`, `app/kap/page.tsx`, `components/NavbarClient.tsx`, `app/hisse/[sembol]/HisseDetailClient.tsx` |
| **Step 10** — Haftalık Piyasa Bülteni cron + profil toggle + Supabase migration | `app/api/cron/bulten/route.ts`, `app/profil/page.tsx`, `app/api/profile/route.ts`, `vercel.json` |
| **Step 12** — Ters Portföy (Portföy Dışı Fırsatlar) UI — sektör bazlı, momentum sıralı | `app/ters-portfolyo/page.tsx`, `components/NavbarClient.tsx` |
| **VixChart.tsx silindi** — hiçbir yerde kullanılmıyordu | `components/VixChart.tsx` |
| **Step 5 AI Sohbet** — streaming chat, claude-opus-4-6, portföy bağlamı, günlük limit, tier gating | `app/api/chat/route.ts`, `app/sohbet/page.tsx`, `supabase/migrations/20260328_ai_chat_usage.sql` |
| **Step 13 Makro Simülatör** — 12 senaryo (kur/faiz/global/emtia), sektör etki tablosu, tarihsel analiz, portföy yorumu | `app/api/simulasyon/route.ts`, `app/simulasyon/page.tsx` |
| **Step 4 Explainable AI** — `buildKeyFactors` yeniden yazıldı: sinyal tazeliği, haftalık hizalama, baskın makro bileşen, sektör perf20d, çelişki uyarıları | `lib/composite-signal.ts` |
| **Step 8 KAP AI özetleme** — `/api/kap/summarize` (claude-opus-4-6, 4s cache), HisseDetail'e "AI ile Özetle" butonu | `app/api/kap/summarize/route.ts`, `app/hisse/[sembol]/HisseDetailClient.tsx` |
| **Step 3 Ekonomi Takvimi AI** — `/api/ekonomi-takvimi` SSE streaming, takvim olayları → sektör etki + BIST yorumu | `app/api/ekonomi-takvimi/route.ts`, `app/ekonomi-takvimi/page.tsx` |
| **Step 10 AI Bülten** — haftalık email'e claude-opus-4-6 ile kişisel piyasa yorumu eklendi (mor panel) | `app/api/cron/bulten/route.ts` |

## ✅ 2026-03-22 Oturumunda Tamamlananlar

| Özellik | Dosyalar |
|---------|---------|
| Destek/Direnç seviyeleri (pivot + kümeleme) | `lib/support-resistance.ts`, `components/SRLevels.tsx` |
| Bollinger Bandı Sıkışması sinyali | `lib/signals.ts` |
| Grafik BB / EMA50/200 / D/R overlay toggle | `components/StockChart.tsx` |
| Toggle'da grafik sıfırlanmama (ayrı effect'ler) | `components/StockChart.tsx` |
| İndikatör araç çubuğu (grafik dışına taşındı) | `components/StockChart.tsx` |
| Hacim Anomalisi güçlendirmesi (ardışık gün, relVol5) | `lib/signals.ts` |
| RSI grafiği 0-100 sabit + mevcut değer çizgisi | `components/StockChart.tsx` |
| ohlcv rate limit 120→400/min (tarama 429 fix) | `app/api/ohlcv/route.ts` |
| signal-performance 5dk XU100 cache (500 fix) | `app/api/signal-performance/route.ts` |
| AnimatedGlobe SSR hydration fix | `components/LandingPage.tsx` |
| Anlık uyarı sistemi (Resend email, sinyal filtresi, profil UI) | `lib/email-service.ts`, `app/api/cron/alerts/route.ts`, `app/profil/page.tsx` |
| UI/UX erişilebilirlik (disabled, aria-pressed, validation hints) | `app/sifre-sifirla/`, `app/sifre-guncelle/`, `app/topluluk/`, `app/profil/` |
| **Performans optimizasyonu** — optimizePackageImports, dynamic imports, API cache headers | `next.config.mjs`, `app/page.tsx`, `components/StockCard.tsx`, `app/portfolyo/page.tsx` |
| **SEO & Meta** — metadataBase, Twitter card, JSON-LD, canonical URL, tüm sayfa metadata | `app/layout.tsx`, `app/sitemap.ts`, `app/*/layout.tsx`, `app/hisse/[sembol]/page.tsx` |

### Performans Detay
- `optimizePackageImports`: lucide-react, recharts, framer-motion tree-shaking
- Dynamic imports: LandingPage, MiniChart (lightweight-charts), PortfolioPerformanceChart
- Bundle düşüşü: `/tarama` 224→175kB (-49kB), `/portfolyo` 198→148kB (-50kB)
- API cache headers: `/api/macro`, `/api/sectors`, `/api/risk` (5dk cache + 10dk stale-while-revalidate)

### SEO Detay
- `metadataBase` + canonical URL'ler tüm sayfalarda
- Twitter card metadata (summary_large_image)
- JSON-LD WebApplication schema (layout.tsx)
- Sitemap: 15 featured → tüm BIST_SYMBOLS (164 hisse)
- Yeni metadata layout'ları: backtesting, haberler, fiyatlandirma, topluluk

---

## Ekip

- **Berk** - Frontend (UI, components, client-side features)
- **Doğuş** - Backend (API routes, database, server-side logic)
- **Claude (AI)** - Development assistant

Her session başında ekip üyesi kendini tanıtır. Claude, kişiye göre görev atar.

## Proje Özeti

BIST odaklı AI-destekli yatırım analiz platformu. Teknik sinyaller + makroekonomik bağlam + sektör momentum analizi ile aksiyon odaklı yatırım kararları üretir.

- **Stack**: Next.js 14 App Router, TypeScript, React 18, Tailwind CSS, Supabase (Postgres + Auth)
- **Veri Kaynakları**: Yahoo Finance (OHLCV + VIX/DXY/US10Y/USDTRY), FRED API (makro), TCMB (Türkiye makro), Anthropic Claude AI (açıklamalar)
- **Repo**: https://github.com/Doguserkivac09/BistAi.git
- **Vizyon**: Teknik sinyal × Makro rüzgar × Sektör uyumu → Kompozit BUY/HOLD/SELL kararı

## Git Workflow (ZORUNLU)

```
# 1. Her zaman develop'tan başla
git checkout develop
git pull origin develop

# 2. Feature branch aç
git checkout -b feat/<feature-name>

# 3. Değişiklikleri yap, sonra:
git add <specific files>
git commit -m "feat(scope): description"
git push -u origin feat/<feature-name>

# 4. Merge: feat/* → develop (PR veya local merge)
# 5. ASLA develop veya main'e direkt commit yapma
```

**Commit stilleri**: `feat(scope):`, `fix(scope):`, `refactor(scope):`
**Push öncesi**: Her zaman kullanıcıya "Push edelim mi?" diye sor.

## Kritik Dosyalar

| Dosya | Açıklama |
|-------|----------|
| `lib/signals.ts` | Sinyal tespiti (RSI divergence, volume anomaly, trend start, S/R break) |
| `lib/edge-engine.ts` | İstatistiksel edge hesaplama |
| `lib/yahoo.ts` | Yahoo Finance OHLCV fetch + cache |
| `lib/regime-engine.ts` | Piyasa rejimi (bull/bear/sideways) |
| `lib/performance.ts` | Signal performance server API client |
| `lib/rate-limit.ts` | IP-based rate limiting |
| `lib/confidence.ts` | Güven skoru hesaplama |
| `app/api/evaluate-signals/route.ts` | Batch sinyal değerlendirme |
| `app/api/signal-stats/route.ts` | Edge istatistik API |
| `app/api/signal-performance/route.ts` | Sinyal performans kayıt |
| `app/api/ohlcv/route.ts` | OHLCV veri API |
| `app/api/explain/route.ts` | AI açıklama API |
| `app/tarama/page.tsx` | Tarama sayfası |
| `app/hisse/[sembol]/HisseDetailClient.tsx` | Hisse detay sayfası |
| `app/dashboard/page.tsx` | Dashboard |

## Bilinen Sorunlar (Phase 1-3'te Çözülenler)

> Phase 1-3'te tüm kritik sorunlar giderildi. Güncel sorunlar varsa buraya eklenecek.

---

# Geliştirme Planı

## Durum Özeti

| Phase | Durum | Açıklama |
|-------|-------|----------|
| **Phase 1** | ✅ | Temel altyapı düzeltmeleri (Yahoo norm, Signal perf API, Schema, Error handling) |
| **Phase 2** | ✅ | Temel iyileştirmeler (BIST100, Şifre sıfırlama, Toast, Dashboard, Grafik) |
| **Phase 3** | ✅ | Production hardening (Rate limit, Cache, Cron, SEO, A11y) |
| **Phase 4** | ✅ | Makro Rüzgar Motoru (VIX, CDS, USD/TRY, FRED, TCMB) |
| **Phase 5** | ✅ | Sektör & Risk Motoru |
| **Phase 6** | ✅ | Kompozit Sinyal & Makro UI |
| **Phase 7** | ✅ (ML ⬜ Python opsiyonel) | İleri Seviye (Backtesting, Alert, ML) |
| **Phase 8** | ✅ | Teknik Borç & UI Temeli (macroService, time-align, AI cache, skeleton) |
| **Phase 9** | ✅ | Profil & Kişiselleştirme (profiles tablo, API, sayfa, navbar dropdown) |
| **Phase 10** | ✅ | Topluluk Platformu (posts, comments, likes, realtime, moderation) |
| **Phase 11** | ✅ | Ödeme & Abonelik (Stripe checkout, webhook, tier-gating, fiyatlandırma) |
| **Phase 12** | ✅ | AI Topluluk Botu (AI Analist badge, premium gate, rate limit) |
| **Phase 13** | ✅ | Ek Veri & ML Temeli (AlphaVantage, data-providers, ML features, FastAPI+XGBoost) |

---

## Phase 1-3 — ✅ TAMAMLANDI

> Temel platform tamamlandı: Teknik sinyal tespiti, performans takibi, istatistiksel edge, BIST100 tarama, dashboard, grafik, auth, rate limiting, caching, cron, SEO.

---

## Karar Motoru Mimarisi

```
Katman 1: MAKRO RÜZGAR → Makro Skor (-100 / +100)
├── USD/TRY trend & momentum
├── Türkiye 5Y CDS spread değişimi
├── VIX seviyesi
├── DXY (Dolar Endeksi) trend
├── US 10Y Yield
├── TCMB politika faizi
└── Fed Funds Rate, CPI, GDP (FRED)

Katman 2: SEKTÖR FİLTRE → Sektör Momentum Skoru
├── Sektör bazlı fiyat momentum
├── Makro-sektör uyum kuralları:
│   • Faiz düşüşü → Bankalar avantajlı
│   • TL zayıf → İhracatçılar avantajlı
│   • Risk-off → Defansif sektörler avantajlı
└── EEM (EM ETF) sentiment

Katman 3: TEKNİK SİNYAL (mevcut)
├── RSI Divergence, Volume Anomaly
├── Trend Start, S/R Break
└── Teknik Skor

Katman 4: KOMPOZİT KARAR
├── Makro Skor × Sektör Uyumu × Teknik Skor
└── → AL / TUT / SAT + Güven + AI Açıklama
```

---

## Phase 4 — Makro Rüzgar Motoru (SIRADA)

### 4.1 Yahoo Makro Veri Çekme [S]
- **Yeni dosya**: `lib/macro-data.ts`
- Yahoo Finance'den: `^VIX`, `DX-Y.NYB` (DXY), `^TNX` (US10Y), `USDTRY=X`
- Mevcut `yahoo.ts` fetch altyapısını kullan
- 15dk cache TTL

### 4.2 FRED API Entegrasyonu [M]
- **Yeni dosya**: `lib/fred.ts`
- FRED API (ücretsiz key): Fed Funds Rate, US CPI, GDP, PMI
- Günlük/aylık veri çekme + cache
- Env: `FRED_API_KEY`

### 4.3 Türkiye Makro Veri [M]
- **Yeni dosya**: `lib/turkey-macro.ts`
- TCMB politika faizi, Türkiye CDS (5Y), TÜFE
- Veri kaynağı: TCMB EVDS API veya scraping alternatifi
- Env: `TCMB_API_KEY` (varsa)

### 4.4 Makro Skor Motoru [L]
- **Yeni dosya**: `lib/macro-score.ts`
- Tüm makro verileri → tek bir skor: -100 (çok negatif) ↔ +100 (çok pozitif)
- Ağırlıklar: USD/TRY (%25), CDS (%20), VIX (%15), DXY (%15), US10Y (%10), TCMB (%15)
- Trend değişimi önemli (seviyeden çok, yön)

### 4.5 Makro DB & Cron [M]
- **Yeni tablo**: `macro_snapshots` (tarih, gösterge, değer, değişim)
- Cron endpoint: `/api/cron/macro` — günlük snapshot kaydet
- Tarihsel trend verisi için

### 4.6 Makro API Endpoint [S]
- **Yeni**: `app/api/macro/route.ts`
- GET → güncel makro skor + tüm göstergeler + trend
- Rate limited

---

## Phase 5 — Sektör & Risk Motoru

### 5.1 BIST Sektör Mapping [S]
- **Yeni dosya**: `lib/sectors.ts`
- BIST100 hisseleri → sektör gruplandırma (Banka, Sanayi, Enerji, Perakende, Teknoloji, İhracat, Defansif)

### 5.2 Sektör Momentum Engine [M]
- **Yeni dosya**: `lib/sector-engine.ts`
- Sektör bazlı fiyat momentum (20g/60g performans)
- Makro-sektör uyum kuralları (faiz↓→banka🟢, TL↓→ihracatçı🟢)

### 5.3 Risk Score Engine [M]
- **Yeni dosya**: `lib/risk-engine.ts`
- VIX + CDS + USD/TRY volatilite → 0-100 risk skoru
- Seviye: Düşük (0-30), Orta (30-60), Yüksek (60-80), Kritik (80-100)

### 5.4 Sektör & Risk API [S]
- `/api/sectors` — sektör momentum verileri
- `/api/risk` — güncel risk skoru

---

## Phase 6 — Kompozit Sinyal & Makro UI

### ✅ 6.1 Kompozit Sinyal Motoru (Doğuş)
- `lib/composite-signal.ts` — Teknik × Makro × Sektör → BUY/HOLD/SELL

### ✅ 6.2 AI Açıklama v2 (Doğuş)
- `lib/claude.ts` — `generateCompositeExplanation()` makro bağlamlı açıklama

### ✅ 6.3 Makro Dashboard Sayfası [L] (Berk)
- **Yeni sayfa**: `app/makro/page.tsx`
- **API**: `GET /api/macro` → makro skor + tüm göstergeler
- **İçerik**:
  - Büyük **Makro Skor Gauge** (-100 / +100, yeşil↔kırmızı daire/bar)
  - Gösterge tablosu: VIX, DXY, US10Y, USD/TRY, CDS, Brent — her biri fiyat + değişim + renk
  - **Risk Skoru** widget: `GET /api/risk` → 0-100 gauge + seviye etiketi + öneri
  - Türkiye bölümü: TCMB faizi, TÜFE, CDS
  - ABD bölümü: Fed faizi, GDP, İşsizlik (FRED verisi)
  - (Opsiyonel) Tarihsel makro trend grafiği: `GET /api/macro?history=true&days=30`
- **Navbar'a ekle**: `/makro` linki
- **Responsive**: Mobil'de kartlar tek sütun

### ✅ 6.4 Sektör Heatmap [M] (Berk)
- **Konum**: `/makro` sayfasının alt kısmı veya ayrı tab
- **API**: `GET /api/sectors` → tüm sektörlerin momentum skorları
- **İçerik**:
  - Grid yapısında sektör kutuları (her kutu = 1 sektör)
  - Renk kodu: compositeScore'a göre (yeşil → kırmızı)
  - Her kutuda: sektör adı, skor, 20g performans %
  - Tıklanabilir: `GET /api/sectors?id=banka` → detay modal/sayfa
  - Detayda: sektördeki hisseler, top/bottom performans, makro uyum açıklaması
- **Responsive**: Mobil'de 2 sütun grid

### ✅ 6.5 Sinyal Kartlarına Makro Badge [S] (Berk)
- **Değişecek dosyalar**: `components/SignalBadge.tsx`, `components/StockCard.tsx`, `app/tarama/page.tsx`
- **API**: `/api/macro` yanıtından `score.score` ve `score.wind` kullanılacak
- **Eklenenler**:
  - Her sinyal kartının üstüne küçük badge: "Makro: 🟢 +35" veya "Makro: 🔴 -42"
  - Kompozit karar badge'i: "Güçlü AL (%72)" — `lib/composite-signal.ts` kullanılarak
  - Tooltip: "Teknik sinyal + makro rüzgar + sektör uyumu birlikte değerlendirildi"

### ✅ 6.6 Alert / Bildirim Paneli [M] (Berk)
- **API**: `GET /api/alerts` → güncel uyarı listesi
- **Konum**: Dashboard sayfasında veya Navbar'da çan ikonu
- **İçerik**:
  - Alert kartları: severity'ye göre renk (kırmızı/turuncu/mavi)
  - Emoji + başlık + mesaj
  - Zaman damgası
- **Responsive**: Mobil'de slide-over panel

---

## Phase 7 — İleri Seviye

### ✅ 7.1 Backtesting Engine (Doğuş)
- `lib/backtesting.ts` — geçmiş sinyal performans analizi

### ⬜ 7.2 Python ML Microservice [XL] (→ Phase 13.5'e taşındı)
- FastAPI + XGBoost/RandomForest — Phase 13'te planlandı

### ✅ 7.3 Alert Sistemi (Doğuş)
- `lib/alerts.ts` + `app/api/alerts/route.ts`

### ✅ 7.4 Backtesting Sayfası [L] (Berk)
- **Yeni API**: `app/api/backtesting/route.ts` — Supabase'den evaluated sinyalleri çeker, `lib/backtesting.ts` fonksiyonlarını çağırır
- **Yeni sayfa**: `app/backtesting/page.tsx` — Performans matrisi (sinyal tipi × rejim heatmap), özet kartlar, karşılaştırma kartları
- **Filtreler**: Dönem (30g/90g/180g/1y) + Yön (Tümü/AL/SAT)
- **Navbar**: `/backtesting` "Backtest" linki eklendi

---

## Phase 8 — Teknik Borç & UI Temeli ✅

**Tema:** Yeni özellikler öncesi altyapıyı sağlamlaştır. Maliyet: $0

| # | Görev | Zorluk | Kim | Durum |
|---|-------|--------|-----|-------|
| 8.1 | macroService katmanı (`lib/macro-service.ts`) | M | Doğuş | ✅ |
| 8.2 | Time alignment (`lib/time-align.ts`) | M | Doğuş | ✅ |
| 8.3 | AI açıklama cache (`ai_cache` tablo + `lib/claude.ts` cache) | S | Doğuş | ✅ |
| 8.4 | Genel UI polish (skeleton loading, spacing) | M | Doğuş | ✅ |

---

## Phase 9 — Profil & Kişiselleştirilmiş Ana Sayfa ⬜ (9.4 kaldı)

**Tema:** Giriş yapan kullanıcıya özel deneyim. Maliyet: $0

| # | Görev | Zorluk | Kim | Durum |
|---|-------|--------|-----|-------|
| 9.1 | `profiles` tablosu + RLS + auto-create trigger | S | Doğuş | ✅ |
| 9.2 | Profil API (`/api/profile` GET + PATCH) | M | Doğuş | ✅ |
| 9.3 | Profil sayfası (`/profil`) — skeleton, form, tier badge | M | Doğuş | ✅ |
| 9.4 | Kişiselleştirilmiş ana sayfa (login → dashboard-home, logout → landing) | L | Berk | ✅ |
| 9.5 | Navbar profil dropdown (avatar + dropdown menü) | S | Doğuş | ✅ |
| 9.6 | Middleware `/profil` guard | S | Doğuş | ✅ |

---

## Phase 10 — Topluluk Platformu ✅

**Tema:** Kullanıcılar analiz paylaşır, yorum yapar, beğenir. Maliyet: $0

### Sprint 1: Backend + Okuma UI

| # | Görev | Zorluk | Kim | Durum |
|---|-------|--------|-----|-------|
| 10.1 | Topluluk DB şeması (posts, comments, likes tabloları + RLS) | L | Doğuş | ✅ |
| 10.2 | Topluluk API (CRUD + pagination + rate limit) | L | Doğuş | ✅ |
| 10.3 | Topluluk feed sayfası (`/topluluk`) | L | Doğuş | ✅ |
| 10.4 | Post detay sayfası (`/topluluk/[id]`) | M | Doğuş | ✅ |

### Sprint 2: Etkileşim + Realtime

| # | Görev | Zorluk | Kim | Durum |
|---|-------|--------|-----|-------|
| 10.5 | Post oluşturma (`/topluluk/yeni`) | M | Doğuş | ✅ |
| 10.6 | Beğeni/yorum etkileşimleri (optimistic update) | M | Doğuş | ✅ |
| 10.7 | Realtime yorumlar (Supabase Realtime) | M | Doğuş | ✅ |
| 10.8 | Navbar + middleware güncelleme | S | Doğuş | ✅ |
| 10.9 | İçerik moderasyonu (şikayet + admin kontrol) | S | Doğuş | ✅ |

---

## Phase 11 — Ödeme & Abonelik Sistemi ✅

**Tema:** Monetizasyon. Maliyet: Stripe işlem başı %2.9 + 30¢

| # | Görev | Zorluk | Kim | Durum |
|---|-------|--------|-----|-------|
| 11.1 | Stripe kurulumu (`lib/stripe.ts`) | M | Doğuş | ✅ |
| 11.2 | Abonelik DB (stripe_customer_id, tier_expires_at) | S | Doğuş | ✅ |
| 11.3 | Checkout API (`/api/stripe/checkout` + `/api/stripe/portal`) | M | Doğuş | ✅ |
| 11.4 | Webhook handler (`/api/stripe/webhook`) | L | Doğuş | ✅ |
| 11.5 | Fiyatlandırma sayfası (`/fiyatlandirma`) | M | Doğuş | ✅ |
| 11.6 | Tier-gating helper (`lib/tier-guard.ts`) | S | Doğuş | ✅ |
| 11.7 | Profil abonelik bölümü | S | Doğuş | ✅ |

**Paket Matrisi:**

| Özellik | Free | Pro | Premium |
|---------|------|-----|---------|
| Sinyal tarama | 5/gün | Sınırsız | Sınırsız |
| Makro Radar | Görüntüleme | Tam + tarihsel | Tam + tarihsel |
| Backtesting | 30 gün | Tam geçmiş | Tam geçmiş |
| Topluluk | Okuma | Okuma + Yazma | Okuma + Yazma + AI Bot |
| AI Açıklamalar | 5/gün | 50/gün | Sınırsız |

> **Not:** Fiyatlar Phase 11'e gelindiğinde rakip analizi + gelir/gider hesabı ile belirlenecek.

---

## Phase 12 — AI Topluluk Botu ✅

**Tema:** Premium kullanıcı paylaşımlarını analiz eden AI. Maliyet: ~$3-10/ay (Claude API)

| # | Görev | Zorluk | Durum |
|---|-------|--------|-------|
| 12.1 | AI bot system prompt (`lib/community-ai.ts`) | M | ✅ |
| 12.2 | AI bot trigger (post create → Claude → AI yorum) | L | ✅ |
| 12.3 | AI yorum UI ("AI Analist" badge, Bot ikonu, mor renk) | S | ✅ |
| 12.4 | Rate limiting (1 AI yorum/post via DB flag, 100/gün global) | S | ✅ |
| 12.5 | Premium gate (non-premium → blur + upgrade CTA) | S | ✅ |

> **DB Migration gerekli:** `supabase/migrations/20260320_community_ai.sql` — Supabase SQL Editor'da çalıştırılmalı

---

## Phase 13 — Ek Veri Kaynakları & ML Temeli ✅

**Tema:** Veri genişletme + ML hazırlığı. Maliyet: $0-57/ay

| # | Görev | Zorluk | Durum |
|---|-------|--------|-------|
| 13.1 | AlphaVantage entegrasyonu (`lib/alpha-vantage.ts`) | M | ✅ |
| 13.2 | TradingEconomics | M | ⏭️ Atlandı (free tier 2 call/ay — yetersiz) |
| 13.3 | Veri kaynak abstraksiyonu (`lib/data-providers.ts`) | L | ✅ |
| 13.4 | Feature engineering (`lib/ml-features.ts`) | L | ✅ |
| 13.5 | Python ML microservice (`python-ml/`) FastAPI + XGBoost | XL | ✅ |
| 13.6 | ML prediction API proxy (`/api/ml/predict`) | M | ✅ |

> **Deploy notu:** `python-ml/` klasörü Railway/Render'a ayrı servis olarak deploy edilmeli.
> ML_SERVICE_URL env değişkeni ayarlanana kadar heuristic fallback aktif.

---

## Bağımlılık Grafiği

```
Phase 8 (Teknik Borç) ← bağımsız, hemen başla
    ↓
Phase 9 (Profil + Ana Sayfa) ← 8.4 UI polish idealde önce
    ↓
Phase 10 (Topluluk) ← 9.1 profiles tablosu gerekli
    ↓
Phase 11 (Ödeme) ← 9.1 profiles.tier gerekli
    ↓
Phase 12 (AI Bot) ← 10.x topluluk + 11.x tier gating
    ↓
Phase 13 (Veri + ML) ← 8.1, 8.2; topluluktan bağımsız
```

---

## Maliyet Özeti

| Kaynak | Phase | Aylık | Not |
|--------|-------|-------|-----|
| Supabase | Tümü | $0 | Free tier |
| Claude API (mevcut) | — | ~$5-15 | Zaten kullanılıyor |
| Stripe | 11+ | İşlem başı | Sabit maliyet yok |
| Claude API (AI bot) | 12+ | ~$3-10 | Post hacmine bağlı |
| AlphaVantage | 13+ | $0-50 | Free tier olabilir |
| ML hosting | 13+ | $0-7 | Railway/Render |
| **Toplam yeni** | | **$3-72/ay** | |

---

## Koordinasyon
1. ✅ Phase 1-8 tamamlandı
2. ✅ Phase 9 backend tamamlandı (2026-03-15): profiles tablo, API, profil sayfası, navbar dropdown, middleware guard
3. ✅ Doğuş: `profiles` migration'ı Supabase'de çalıştırıldı
4. ✅ Berk: 9.4 Kişiselleştirilmiş ana sayfa — middleware.ts ile yapıldı (giris/kayit → dashboard, anonim → landing)
5. ✅ Phase 10 tamamlandı (2026-03-15): topluluk posts/comments/likes DB + API + feed/detay/oluşturma sayfaları + realtime + moderation
6. ✅ Doğuş: `community` migration'ı Supabase'de çalıştırıldı
7. ✅ Supabase Realtime etkinleştirildi: `comments` tablosu realtime yayınına eklendi
8. ✅ Phase 11 tamamlandı (2026-03-15): Stripe checkout/webhook/portal, fiyatlandırma sayfası, tier-gating, profil abonelik bölümü
9. ✅ Doğuş: `subscriptions` migration'ı Supabase'de çalıştırıldı
10. ⬜ **Stripe `.env.local` key'leri eklenecek** (hesap açılınca):
    - `STRIPE_SECRET_KEY=sk_test_...`
    - `STRIPE_WEBHOOK_SECRET=whsec_...`
    - `STRIPE_PRICE_PRO=price_...` (Pro plan price ID)
    - `STRIPE_PRICE_PREMIUM=price_...` (Premium plan price ID)
    - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...`
    - `SUPABASE_SERVICE_ROLE_KEY=...` (webhook handler için, Supabase → Settings → API → service_role key)
    - `NEXT_PUBLIC_SITE_URL=http://localhost:3000` (veya production URL)
11. ✅ Auth fix tamamlandı (2026-03-20): emailRedirectTo /auth/callback, email onay hatası Türkçe
12. ✅ Supabase email onayı development için kapatıldı (test hesabı oluşturulabilir)
13. ✅ Phase 12 tamamlandı (2026-03-20): AI Topluluk Botu — community-ai.ts, AI Analist badge, premium gate, rate limit
14. ⬜ **API Key'ler — Tüm phase'ler bitince eklenecek:**
    - `ANTHROPIC_API_KEY=sk-ant-...` → console.anthropic.com → API Keys
    - `STRIPE_SECRET_KEY=sk_test_...` → dashboard.stripe.com → Developers → API Keys
    - `STRIPE_WEBHOOK_SECRET=whsec_...` → Stripe → Webhooks → endpoint secret
    - `STRIPE_PRICE_PRO=price_...` → Stripe → Products → Pro plan price ID
    - `STRIPE_PRICE_PREMIUM=price_...` → Stripe → Products → Premium plan price ID
    - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...` → Stripe → API Keys
    - `NEXT_PUBLIC_SITE_URL=http://localhost:3000` (prod'da gerçek URL)
15. ⬜ **Sıradaki: Phase 13 — Ek Veri Kaynakları & ML Temeli (opsiyonel)**

## Test Kuralı (Her Değişiklik Sonrası)

1. **TypeScript**: `npx tsc --noEmit`
2. **Build**: `npm run build`
3. **Manuel test**: Etkilenen sayfa/bileşeni test et
4. **DevTools**: Console/Network hata kontrolü
5. **Responsive**: Mobil ve desktop (UI değişikliği varsa)

---

## Phase 14 — Kullanılabilirlik & Büyüme Roadmap'i

**Tema:** Platformu "bakıp geçilen araç"tan "her gün açılan asistana" dönüştür.
**Öncelik sırası:** Portföy → Uyarılar → Backtest → Haber Entegrasyonu → Mobil PWA

### 14.1 Portföy Takibi [L] 🔴 YÜKSEKÖNCELİK
- Kullanıcı hisselerini + lot miktarını girer
- Toplam değer, günlük değişim, sektör dağılımı
- Portföydeki hisseler için otomatik sinyal uyarısı
- DB: `portfolios(user_id, sembol, lot, avg_price, created_at)`
- Sayfa: `/portfoy`

### 14.2 Anlık Uyarı Sistemi [L] 🔴 YÜKSEKÖNCELİK
- Trigger: Cron her sabah tarama → sinyal bulunan hisseler → bildirim gönder
- **Email**: Resend veya Supabase Email (ücretsiz 3000/ay)
- **Web Push**: Browser bildirim API + Supabase `push_subscriptions` tablosu
- Kullanıcı: izleme listesi veya portföy hissesi için uyarı seçebilir
- DB: `alert_preferences(user_id, sembol, signal_types[], channels[])`
- Env: `RESEND_API_KEY`

### 14.3 Backtest — Test Edilebilir Hale Getir [M] 🟠 ORTA
- Sorun: `signal_performance` tablosunda `evaluated=true` kayıt yok
- Çözüm A (kısa vade): `/api/dev/seed-backtest` — geliştirme ortamında sentetik veri üretir
- Çözüm B (uzun vade): `evaluate-signals` cron'u gerçekten çalıştır ve sonuçları kaydet
- Backtest sayfası altyapısı tamam, sadece veri gerekiyor

### 14.4 Haber + Sinyal Entegrasyonu [M] 🟡 SONRA
- Hisse detay sayfasında teknik sinyal yanında o güne ait haberler
- Kaynak: Yahoo Finance news API veya NewsAPI (ücretsiz 1000/gün)
- UI: Sinyal kartında "Bugün 3 haber var" badge + modal
- Rakiplerin hiçbirinde yok — güçlü diferansiasyon

### 14.5 Mobil PWA [M] 🟡 SONRA
- `manifest.json` + service worker → "Ana Ekrana Ekle" butonu
- Push notification desteği (14.2 ile entegre)
- Next.js'de `next-pwa` paketi ile minimal iş

---

## Rakip Konumlandırma

| Platform | Fiyat | Güçlü Yön | BistAI Avantajı |
|----------|-------|-----------|-----------------|
| Matriks | 500-2000₺/ay | Gerçek zamanlı, profesyonel | Ücretsiz, modern UI, AI açıklama |
| Bigpara | Ücretsiz | Geniş kitle, haber | Sinyal tarama, makro bağlam |
| TradingView | $15-60/ay | Grafik araçları | Türkçe, BIST odaklı, AI |
| Midas/İş Yatırım | Ücretsiz | Aracı güvenilirliği | Analitik derinlik |

**Boş alan:** BIST odaklı + Türkçe + AI sinyal + Ücretsiz → BistAI bu kombinasyonu tek yapan platform.

---

## Sistem Zayıf Noktaları (Dürüst Değerlendirme)

| Alan | Sorun | Çözüm |
|------|-------|-------|
| Gerçek zamanlı veri | Yahoo Finance 15dk gecikmeli | Uzun vadede Borsa İstanbul API |
| Backtest verisi | `evaluated` kayıt birikmiyor | Cron job düzeltmesi + seed |
| Mobil | Responsive ama uygulama değil | PWA |
| Stripe | Key'ler girilmedi | Girince aktif |

---

## 🗺️ YOL HARİTASI — Profesyonel Geliştirme Planı (2026-03-29 güncellendi)

> Kapsamlı rakip analizi (Investing.com, Danelfin, TrendSpider, Kavout, Borsacoo, Fintables) sonrası oluşturuldu.
> **Kural:** Her step profesyonel olmadan sonrakine geçilmez.

| Step | Özellik | Etki | Model | Süre | Durum |
|------|---------|------|-------|------|-------|
| 1 | Makro Rüzgar Skoru | ★★★★★ | 🔵 Sonnet (tamamı — algoritma mevcut) | 3-5 gün | ✅ Tamamlandı |
| 2 | Hesap Makineleri | ★★★★ | 🔵 Sonnet (tamamı) | 3-5 gün | ✅ Tamamlandı |
| 3 | Ekonomi Takvimi | ★★★★ | 🔵 Sonnet (veri+UI) + 🔴 Opus (AI yorum) | 3-5 gün | ✅ Tamamlandı |
| 4 | Explainable AI Skor | ★★★★ | 🔴 Opus (algoritma) + 🔵 Sonnet (UI) | 1 hafta | ✅ Tamamlandı |
| 5 | AI Sohbet (Sidekick) | ★★★★★ | 🔴 Opus (tamamı) | 1-2 hafta | ✅ Tamamlandı |
| 6 | Fiyat Alert | ★★★★★ | 🔵 Sonnet (tamamı) | 1 hafta | ✅ Tamamlandı |
| 7 | Portföy P&L | ★★★★ | 🔵 Sonnet (tamamı) | 1-2 hafta | ✅ Tamamlandı (CSV export eklendi) |
| 8 | KAP + Sinyal | ★★★★ | 🔴 Opus (feed+AI) + 🔵 Sonnet (UI) | 2 hafta | ✅ Tamamlandı |
| 9 | Gelişmiş Screener | ★★★ | 🔵 Sonnet (tamamı) | 1 hafta | ✅ Tamamlandı |
| 10 | AI Bülten | ★★★★ | 🔴 Opus (prompt) + 🔵 Sonnet (cron+UI) | 1 hafta | ✅ Tamamlandı |
| 11 | Temel Analiz Veri | ★★★ | 🔵 Sonnet (tamamı) | 2 hafta | ✅ Tamamlandı |
| 12 | Ters Portföy | ★★★★ | 🔴 Opus (motor+AI) + 🔵 Sonnet (UI) | 1 hafta | ✅ Tamamlandı |
| 13 | Makro Simülatör | ★★★★★ | 🔴 Opus (tamamı) | 2-3 hafta | ✅ Tamamlandı |

> **Model Kuralı:** 🔴 Opus = algoritma tasarımı, AI prompt mühendisliği, karmaşık mantık, streaming API
> 🔵 Sonnet = UI component, CRUD API, SQL migration, styling, basit veri dönüşümü
> **Tahmini dağılım:** Sonnet ~%60, Opus ~%40 → **~%40-50 token tasarrufu**

**Detaylı plan + alt görev bazında model ataması:** `.claude/plans/vast-seeking-locket.md`

### Step 1 — Makro Rüzgar Skoru 🔵 ✅ TAMAMLANDI (2026-03-28)
- ✅ `components/MacroWindGauge.tsx`: SVG semicircle gauge, Framer Motion iğnesi, hava metaforu
- ✅ Dashboard compact widget + `/makro` sayfası full entegrasyon
- ✅ `app/dashboard/page.tsx` + `components/DashboardClient.tsx` güncellendi

### Step 2 — Hesap Makineleri 🔵 ✅ TAMAMLANDI (2026-03-28)
- ✅ `app/araclar/page.tsx`: 4 sekme — Pozisyon Büyüklüğü, Risk/Ödül, Hedef Fiyat, Portföy Risk
- ✅ Navbar'a `Araçlar` linki eklendi (Piyasa dropdown)

### Step 3 — Ekonomi Takvimi 🔵✅ 🔴⬜
- ✅ `lib/ekonomi-takvimi.ts`: TR/US/EU olayları, tipler, yardımcı fonksiyonlar
- ✅ `app/ekonomi-takvimi/page.tsx`: countdown, filtre, tarih gruplama, okunabilir UI
- ⬜ 🔴 AI makro yorum entegrasyonu (Claude prompt) — **Opus bekliyor**

### Step 4 — Explainable AI Skor 🔵✅ 🔴⬜
- ✅ `components/ScoreBreakdown.tsx`: STRONG_BUY/SELL ring + banner, kompozit karar paneli
- ✅ `app/hisse/[sembol]/HisseDetailClient.tsx`: toCompositeResult() adaptörü + sağ kolona entegre
- ⬜ 🔴 `lib/composite-signal.ts` faktör katkı algoritması genişletmesi — **Opus bekliyor**

### Step 5 — AI Sohbet 🔴⬜
- ⬜ Streaming API + context builder + prompt mühendisliği + chat UI — **Tamamı Opus bekliyor**

### Step 6 — Fiyat Alert 🔵 ✅ TAMAMLANDI (2026-03-28)
- ✅ `supabase/migrations/20260328_price_alerts.sql`: price_alerts tablosu + RLS
- ✅ `app/api/price-alerts/route.ts`: CRUD (GET/POST/DELETE), max 5 alert/hisse
- ✅ `app/api/cron/price-alerts/route.ts`: günlük fiyat kontrol + Resend email
- ✅ `components/PriceAlertButton.tsx`: modal ile alarm kurma
- ✅ `app/fiyat-alertler/page.tsx`: alarm yönetim sayfası
- ✅ `vercel.json`: 10:00 TRT cron eklendi
- ✅ Entegrasyon: watchlist, hisse detay, navbar Portföy dropdown

### Step 7 — Portföy P&L 🔵 ⬜ BEKLIYOR
- ⬜ DB şema + lot hesaplama + tab UI + grafik + CSV export — **Sonnet görevi**

### Step 8 — KAP + Sinyal 🔴🔵 ⬜ BEKLIYOR
- ⬜ 🔴 KAP feed parsing + AI özetleme/sinyal bağlantı prompt
- ⬜ 🔵 DB + cron + bildirim UI

### Step 9 — Gelişmiş Screener 🔵 ✅ TAMAMLANDI (2026-03-28)
- ✅ `app/tarama/page.tsx`: 15 sektör dropdown filtresi (selectedSector state + URL param)
- ✅ Q6 sektör momentum filtresi de eklendi (sektör düşerken bullish = zayıf)

### Step 10 — AI Bülten 🔴🔵 ⬜ BEKLIYOR
- ⬜ 🔴 Kişiselleştirilmiş bülten prompt
- ⬜ 🔵 Cron + email template + profil toggle

### Step 11 — Temel Analiz Veri 🔵 ✅ TAMAMLANDI (2026-03-28)
- ✅ `app/api/fundamentals/route.ts`: AlphaVantage F/K, EPS, piyasa değeri endpoint
- ✅ `components/TemelAnalizKarti.tsx`: F/K, EPS, piyasa değeri, 52 hafta bant UI
- ✅ `app/hisse/[sembol]/HisseDetailClient.tsx`: hisse detay sayfasına entegre

### Step 12 — Ters Portföy 🔴🔵 ⬜ BEKLIYOR
- ⬜ 🔴 Analiz motoru + AI öneri prompt
- ⬜ 🔵 "Kaçırdıklarınız" UI component

### Step 13 — Makro Simülatör 🔴 ⬜ BEKLIYOR
- ⬜ Senaryo prompt + tarihsel analiz + karmaşık UI state — **Tamamı Opus bekliyor**

---

## ✅ Görev Tamamlama Kuralı (ZORUNLU)

Her görev tamamlandığında bu dosyadaki ilgili satırın yanına durum yazılmalıdır:
- ✅ TAMAMLANDI (tarih) — tam bitişte
- 🔵 KISMI (ne yapıldı) — kısmen bitişte
- ❌ İPTAL (neden) — iptal edildiyse

**Bu kural her iki takım üyesi ve Claude için geçerlidir. Görev kaydı güncellenmeden PR merge edilmez.**

---

## 🐛 Bug Fix Sprint (2026-03-29)

> Senior seviye denetim sonrası tespit edilen bulgular. 🔴 Opus = karmaşık algoritma/güvenlik tasarımı, 🔵 Sonnet = pattern uygulama/CSS/null guard.

| ID | Sorun | Etkilenen Dosyalar | Model | Şiddet | Durum |
|----|-------|--------------------|-------|--------|-------|
| B1 | Cron auth standardizasyonu | `cron/bulten`, `cron/alerts`, `cron/macro`, `cron/price-alerts` | 🔵 Sonnet | 🔴 Kritik | ✅ TAMAMLANDI (2026-03-29) |
| B2 | AI Budget race condition (atomik counter) | `lib/ai-budget.ts` | 🔴 Opus | 🔴 Kritik | ✅ TAMAMLANDI (2026-03-29) |
| B3 | Error mesaj sanitizasyonu (info disclosure) | `api/simulasyon`, `api/kap/summarize`, `api/ekonomi-takvimi` | 🔵 Sonnet | 🟠 Yüksek | ✅ TAMAMLANDI (2026-03-29) |
| B4 | Prompt injection koruması | `api/chat`, `api/simulasyon` | 🔴 Opus | 🟠 Yüksek | ✅ TAMAMLANDI (2026-03-29) |
| B5 | IP spoofing rate limit bypass | `lib/rate-limit.ts` | 🔵 Sonnet | 🟠 Yüksek | ✅ TAMAMLANDI (2026-03-29) |
| B6 | Math safety — boş array Infinity/NaN | `lib/signals.ts` | 🔵 Sonnet | 🟠 Yüksek | ✅ TAMAMLANDI (2026-03-29) |
| B7 | Null safety (optional chaining, non-null assertion) | `sector-engine`, `macro-score`, `edge-engine`, `tarama` | 🔵 Sonnet | 🟠 Yüksek | ✅ TAMAMLANDI (2026-03-29) |
| B8 | Timezone fix — UTC vs TRT gece kayması | `lib/ekonomi-takvimi.ts` | 🔵 Sonnet | 🟠 Yüksek | ✅ TAMAMLANDI (2026-03-29) |
| B9 | Frontend UX (mobile modal, chat overflow, grid, delete feedback) | `PriceAlertButton`, `sohbet`, `DashboardClient`, `fiyat-alertler` | 🔵 Sonnet | 🟡 Orta | ✅ TAMAMLANDI (2026-03-29) |
| B10 | Accessibility (aria-label, role, alt) | `PriceAlertButton`, `NavbarClient` | 🔵 Sonnet | 🟡 Orta | ✅ TAMAMLANDI (2026-03-29) |
