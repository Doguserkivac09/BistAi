# Investable Edge - Claude Code Proje Hafızası

> Bu dosya Claude Code tarafından otomatik okunur. Tüm ekip üyeleri aynı bağlamı paylaşır.

---

## 📌 BEKLEYEN MANUEL ADIM (2026-04-23)

### Fırsatlar v3 — Supabase Migration
Migration dosyası oluşturuldu ama Supabase'e uygulanmadı:
**`supabase/migrations/20260423_signal_performance_liquidity_mtf_risk.sql`**
→ Supabase SQL Editor'a yapıştırıp çalıştır (idempotent, `if not exists` ile korunmuş).

Eklenen kolonlar (signal_performance):
- `avg_daily_volume_tl` — P0-3 likidite filtresi (<10M TL elenir)
- `weekly_aligned` — P1-1 haftalık trend uyumu (skor ±8)
- `stop_loss`, `target_price`, `risk_reward_ratio`, `atr` — P2-1 R/R gösterimi + filtresi
- 3 yeni partial index (ADV, R/R, weekly_aligned)

Migration çalıştırılmadan önce: `firsatlar` API null tolere eder (backwards-compat), sadece dolu satırlar filtrelenir. Scan cron'u ertesi sabah çalışınca yeni kayıtlar dolu gelir.

---

## 🚀 SONRAKİ ADIMLAR — (2026-04-17 güncellendi)

> Phase 1-13 + Roadmap Step 1-13 + BT1-BT11 + B1-B10 + **Investment Score** = **Tümü tamamlandı.**
> Telegram entegrasyonu, 295 sembol, Investable Edge rebranding eklendi.
> **2026-04-17:** Investable Edge Investment Score sistemi (hibrit deterministik + AI yorum) eklendi.
> Aşağıdaki maddeler gerçek backlog'u yansıtır.

### 🔴 Öncelikli

| # | Görev | Açıklama |
|---|-------|----------|
| ~~N1~~ | ~~**Production backfill (BT-FIX)**~~ | ✅ Tamamlandı (2026-04-09): DELETE + 295 batch × 365g. ~125.000 kayıt. Doğru entry (ertesi açılış), doğru regime (XU100.IS), komisyon dahil, her mum örnekleniyor. |
| ~~N2~~ | ~~**Telegram kanal kurulum**~~ | ✅ Tamamlandı: Make.com üzerinden tam otomasyon kuruldu — günlük sinyal paylaşımı, yeni üye karşılama, hafta sonu pazartesi hazırlık, haftalık eğitim içeriği + özet. |
| ~~N3~~ | ~~**Sitemap 295 sembol**~~ | ✅ Otomatik çözüldü — `app/sitemap.ts` zaten `BIST_SYMBOLS` dinamik kullanıyor (295 sembol). |

### 🟠 Orta Vadeli

| # | Görev | Açıklama |
|---|-------|----------|
| N4 | **Stripe env key'leri** | Stripe hesabı açılınca `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price ID'leri Vercel'e girilmeli. |
| N5 | **BT5 Survivorship bias** | Delistinge giden şirketler backtest'e dahil değil — sonuçlar iyimser. Uzun vadeli fix. |

### 🟡 Sonra / Opsiyonel

| # | Görev | Açıklama |
|---|-------|----------|
| N6 | **2Y Backfill** | `stock 365g` ile tam 2 yıl DB doldurmak için büyük backfill. Mevcut veri 1 yıllık. |
| N7 | **Python ML Microservice** | FastAPI + XGBoost/RandomForest — Phase 13'te planlandı, opsiyonel. |

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

**Investable Edge** — BIST odaklı AI-destekli yatırım analiz platformu. Teknik sinyaller + makroekonomik bağlam + sektör momentum analizi ile aksiyon odaklı yatırım kararları üretir.

- **Stack**: Next.js 14 App Router, TypeScript, React 18, Tailwind CSS, Supabase (Postgres + Auth)
- **Hisse evreni**: 295 BIST sembolü (~%95 işlem hacmi kapsamı)
- **Veri Kaynakları**: Yahoo Finance (OHLCV + VIX/DXY/US10Y/USDTRY), FRED API (makro), TCMB (Türkiye makro), Anthropic Claude AI (açıklamalar)
- **Repo**: https://github.com/Doguserkivac09/BistAi.git
- **Vizyon**: Teknik sinyal × Makro rüzgar × Sektör uyumu → Kompozit BUY/HOLD/SELL kararı

## Git Workflow

```
# Aktif geliştirme main branch üzerinde yapılıyor (2026-04 itibarıyla).
# develop = main ile eşleştirildi (2026-04-09).

# Küçük fix/feature: doğrudan main
git checkout main && git pull origin main
git add <dosyalar> && git commit -m "fix(scope): ..." && git push

# Büyük özellik: feature branch
git checkout -b feat/<feature-name>
git push -u origin feat/<feature-name>
# → main'e merge

# ASLA --force ile main'e push yapma
```

**Commit stilleri**: `feat(scope):`, `fix(scope):`, `refactor(scope):`, `docs:`
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
15. ✅ Phase 13 tamamlandı (2026-03-28): Ek Veri & ML Temeli
16. ✅ Rebranding tamamlandı (2026-04): BistAI → **Investable Edge**, 164 → **295 BIST sembolü** (~%95 işlem hacmi), tarama DB cache sistemi (cron tarar, kullanıcı anında yükler)
17. ✅ Telegram entegrasyonu tamamlandı (2026-04, Doğuş): `/api/signals/latest` sinyal feed + `/api/chart-image/[sembol]` grafik görsel, bot mesaj formatı
18. ✅ Branch senkronizasyonu (2026-04-09): `develop` → `main`'e fast-forward edildi; artık aktif geliştirme `main` üzerinde
19. ⬜ **N1: Production backfill** — BT-FIX (maxDrawdown daily grouping) DB'ye yansıtılmalı
20. ✅ **N2: Telegram tam otomasyon** — Make.com: günlük sinyal, karşılama, haftalık özet/eğitim, pazartesi hazırlık (2026-04)
21. ✅ **Investable Edge Investment Score** (2026-04-17): Hibrit deterministik skor + AI yorum katmanı — hisse Temel tab ve Teknik tab'a entegre
22. ⬜ **v2 Enflasyon düzeltmesi** (R5): Türkiye F/K'ları yüksek enflasyondan çarpık (THYAO 335, EREGL 393) — reel F/K = F/K × (1 − enflasyon) düzeltmesi yapılmalı

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

## 💎 Investable Edge Investment Score (2026-04-17)

**Hibrit mimari:** Deterministik skor motoru + AI açıklama katmanı.
Kural: **AI asla skor hesaplamaz, sadece yorum üretir.**

### Mimari

```
Yahoo quoteSummary (24h cache)
    ↓
lib/investment-score.ts → 0-100 skor (saf TypeScript, null-tolerant)
    ↓ skor + ham veri →
Claude Haiku (24h ai_cache)
    ↓ Zod validate + 1 retry + fallback →
UI: InvestableScoreCard (ring + alt-skor barları + AI accordion)
```

### Formül

| Boyut | Ağırlık | Metrikler |
|-------|---------|-----------|
| Değerleme | %30 | F/K, PEG, F/DD, EV/FAVÖK (düşük = iyi) |
| Büyüme | %25 | Gelir büyümesi, Kâr büyümesi |
| Kârlılık | %20 | ROE, ROA, OpMargin, NetMargin |
| Risk | %25 | Borç/Özsermaye, Cari Oran, FCF, Beta |

**Rating:** 80+ Güçlü Al · 65-79 Al · 45-64 Tut · 30-44 Sat · <30 Güçlü Sat
**Confidence:** 12+ metrik = high · 7-11 = medium · <7 = low (UI sarı banner)

### Kritik Özellikler

- **Null-tolerance:** Bir boyut hiç metrik içermiyorsa ağırlığı kalan boyutlara orantılı dağıtılır (`appliedWeights` gerçek kullanılanı döner; UI'da `*` işareti şeffaflık sağlar)
- **D/E normalizasyonu:** Yahoo bazen yüzde (150), bazen oran (1.5) döndürüyor — `if (val > 10) val/=100` guard
- **Cache anahtarı:** `invscore:{sembol}:{YYYY-MM-DD}:{score}` — skor değişirse AI yorum otomatik yeniden üretilir
- **Fallback:** Claude JSON bozuk → 1 retry → FALLBACK_YORUM. Skor her zaman görünür, AI başarısız olsa bile
- **Budget guard:** `checkAndRecordAiBudget()` — günlük AI bütçesi dolunca skor + "bütçe doldu" fallback mesajı
- **Rate limit:** IP başına 30 req/dk
- **Prompt injection koruması:** `sanitizeTicker` + `sanitizeKapField` ile sektör/industry/name geçirilir; kullanıcıdan gelen tek alan `sembol` ve o da 1-10 büyük harf/rakamla sınırlı

### Dosyalar

| Dosya | Rol |
|-------|-----|
| `lib/yahoo-fundamentals.ts` | **Genişletildi** — 10 yeni metrik (PEG, EV/EBITDA, ROE, ROA, OpMargin, D/E, Beta, FCF, revenueGrowth, earningsGrowth) |
| `lib/investment-score.ts` | Deterministik 0-100 skor motoru (saf TS, null-tolerant weight redistribution) |
| `lib/investment-score-schema.ts` | Zod schema + FALLBACK_YORUM + safeExtractJson (```json fence soyma) |
| `lib/investment-score-prompt.ts` | Claude Haiku prompt — skoru değiştirme yasağı, JSON disiplini, sanitize |
| `app/api/investment-score/route.ts` | Auth + rate limit + fundamentals + skor + AI + cache + fallback |
| `components/InvestableScoreCard.tsx` | Full + compact varyantlar — ring gauge, alt-skor barları, AI accordion |
| `app/hisse/[sembol]/HisseDetailClient.tsx` | Temel tab (full kart) + Teknik tab sağ sütun (compact badge, tıkla→Temel) |
| `scripts/test-investment-score.mjs` | Smoke test — canlı Yahoo verisiyle 5 hissede skor hesaplar |

### Canlı Smoke Test Sonuçları (2026-04-17)

| Hisse | Skor | Rating | Güven | Not |
|-------|------|--------|-------|-----|
| THYAO | 44 | Sat | 14/14 | F/K 335 (enflasyon çarpıtması), beta 0.06 |
| EREGL | 53 | Tut | 13/14 | F/DD 0.64 ucuz, ROE %0.3 çok düşük |
| ASELS | 50 | Tut | 13/14 | Büyüme %54 harika, F/DD 7.47 pahalı |
| SASA | 23 | **Güçlü Sat** | 11/14 (medium) | Eksi ROE, eksi büyüme, zayıf likidite → doğru sinyal |
| BIMAS | 50 | Tut | 14/14 | Makul F/K 24, FCF pozitif 9B |

### Mevcut Sistemle İlişki

`lib/composite-signal.ts` (Teknik Sinyal, kısa vade) ile **ortogonal**:

| | Teknik Sinyal | Investment Score |
|---|---------------|------------------|
| Vade | Gün-hafta | Ay-yıl |
| Girdi | Fiyat/hacim (RSI, MACD) | Temeller (F/K, ROE, borç) |
| Soru | "Şu an AL mı?" | "Bu şirket yatırımlık mı?" |

### Açık Konular (v2)

- **Enflasyon düzeltmesi (R5):** BIST F/K'ları yüksek enflasyondan şişiyor — reel F/K = F/K × (1 − enflasyon oranı)
- **Cron pre-compute (Faz 5):** Top-50 hisse için günde bir kez pre-compute; ilk sürümde lazy yeterli
- **Global genişleme:** Kod exchange-agnostic, provider katmanında ticker format'ı ayrımı yapılacak (US/EU/JP)

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

### Step 3 — Ekonomi Takvimi ✅ TAMAMLANDI
- ✅ `lib/ekonomi-takvimi.ts`: TR/US/EU olayları, tipler, yardımcı fonksiyonlar
- ✅ `app/ekonomi-takvimi/page.tsx`: countdown, filtre, tarih gruplama, okunabilir UI
- ✅ `/api/ekonomi-takvimi` SSE streaming, takvim olayları → sektör etki + BIST yorumu (AI)

### Step 4 — Explainable AI Skor ✅ TAMAMLANDI
- ✅ `components/ScoreBreakdown.tsx`: STRONG_BUY/SELL ring + banner, kompozit karar paneli
- ✅ `lib/composite-signal.ts` `buildKeyFactors` genişletildi: sinyal tazeliği, haftalık hizalama, makro bileşen, sektör perf20d

### Step 5 — AI Sohbet ✅ TAMAMLANDI
- ✅ `app/api/chat/route.ts`: streaming, claude-opus-4-6, portföy bağlamı, günlük limit, tier gating
- ✅ `app/sohbet/page.tsx`: chat UI

### Step 6 — Fiyat Alert 🔵 ✅ TAMAMLANDI (2026-03-28)
- ✅ `supabase/migrations/20260328_price_alerts.sql`: price_alerts tablosu + RLS
- ✅ `app/api/price-alerts/route.ts`: CRUD (GET/POST/DELETE), max 5 alert/hisse
- ✅ `app/api/cron/price-alerts/route.ts`: günlük fiyat kontrol + Resend email
- ✅ `components/PriceAlertButton.tsx`: modal ile alarm kurma
- ✅ `app/fiyat-alertler/page.tsx`: alarm yönetim sayfası
- ✅ `vercel.json`: 10:00 TRT cron eklendi
- ✅ Entegrasyon: watchlist, hisse detay, navbar Portföy dropdown

### Step 7 — Portföy P&L ✅ TAMAMLANDI
- ✅ `app/portfolyo/page.tsx`: lot takibi, günlük değişim, sektör çeşitlilik, CSV export, GÜÇLÜ SAT badge
- ✅ `components/PortfolioPerformanceChart.tsx`: performans grafiği

### Step 8 — KAP + Sinyal ✅ TAMAMLANDI
- ✅ `lib/kap.ts`, `app/api/kap/route.ts`, `app/kap/page.tsx`: KAP duyuruları sayfası
- ✅ `/api/kap/summarize`: claude-opus-4-6 ile AI özetleme, HisseDetail'e "AI ile Özetle" butonu

### Step 9 — Gelişmiş Screener 🔵 ✅ TAMAMLANDI (2026-03-28)
- ✅ `app/tarama/page.tsx`: 15 sektör dropdown filtresi (selectedSector state + URL param)
- ✅ Q6 sektör momentum filtresi de eklendi (sektör düşerken bullish = zayıf)

### Step 10 — AI Bülten ✅ TAMAMLANDI
- ✅ `app/api/cron/bulten/route.ts`: haftalık AI bülten cron, kişisel piyasa yorumu (claude-opus-4-6)
- ✅ `app/profil/page.tsx`: bülten e-posta tercihi toggle

### Step 11 — Temel Analiz Veri 🔵 ✅ TAMAMLANDI (2026-03-28)
- ✅ `app/api/fundamentals/route.ts`: AlphaVantage F/K, EPS, piyasa değeri endpoint
- ✅ `components/TemelAnalizKarti.tsx`: F/K, EPS, piyasa değeri, 52 hafta bant UI
- ✅ `app/hisse/[sembol]/HisseDetailClient.tsx`: hisse detay sayfasına entegre

### Step 12 — Ters Portföy ✅ TAMAMLANDI
- ✅ `app/ters-portfolyo/page.tsx`: portföy dışı fırsatlar, sektör bazlı, momentum sıralı

### Step 13 — Makro Simülatör ✅ TAMAMLANDI
- ✅ `app/api/simulasyon/route.ts` + `app/simulasyon/page.tsx`: 12 senaryo (kur/faiz/global/emtia), sektör etki tablosu, tarihsel analiz, portföy yorumu

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

---

## 🔬 Backtesting Denetimi (2026-03-30) — Bulgular & Yol Haritası

### Mevcut Durum (Gerçek Veri ile Ölçüldü)
- **12.671 kayıt**, 164 BIST sembolü, 1 yıl geçmiş, sıfır mock veri ✅
- Win Rate: **~50.2-50.6%** → istatistiksel olarak jeton atışından farksız
- Avg Return (7g): **+0.10%** → BIST komisyonu (~%0.4 roundtrip) kesilince zarara döner
- Expectancy: **+0.01R** → anlamlı edge kanıtlanamıyor
- Profit Factor: **1.04** → 1.0 = başabaş, gürültü içinde

### Tespit Edilen Metodoloji Hataları

| # | Hata | Etki | Aciliyet |
|---|------|------|---------|
| BT1 | **Rejim verisi bozuk** — `backfill-real` 252g XU100 çekiyordu; tarihin başı için snapshot <200 mum → `getMarketRegime` hep 'sideways'. **Fix:** 700g XU100 fetch → tarihsel snapshot 448+ mum. DB temizlendi + yeniden backfill gerekli. | Signal×Regime matrisi anlamsız | ✅ TAMAMLANDI (2026-03-30) |
| BT2 | **Giriş fiyatı bias** — `lastCandle.close` kullanılıyordu; sinyal kapanışta tespit edilince o fiyattan alım yapılamaz. **Fix:** `candles[i+1]?.open ?? lastCandle.close` (ertesi açılış). DB temizlendi + yeniden backfill gerekli. | Gerçekçi olmayan sonuçlar | ✅ TAMAMLANDI (2026-03-30) |
| BT3 | **Komisyon simülasyonu yok** — BIST roundtrip maliyeti ~%0.4. **Fix:** `COMMISSION_ROUNDTRIP = 0.004` sabiti `lib/backtesting.ts`'e eklendi; winRate, avgReturn, expectancy, profitFactor komisyon düşülmüş net getiri üzerinden hesaplanıyor. | Tüm metrikler yanlış | ✅ TAMAMLANDI (2026-03-30) |
| BT4 | **5 günde bir örnekleme** — `backfill-real` her 5 mumda bir sinyal arıyor; aradaki sinyaller atlanıyor, bağımsız olmayan örneklem | Seçim bias'ı | 🟠 Orta |
| BT5 | **Survivorship bias** — delistinge giden şirketler dahil değil | Sonuçlar iyimser | 🟠 Orta |
| BT6 | **Drawdown metriği yok** — max drawdown olmadan risk ölçülemiyor | Eksik risk profili | 🟠 Orta |
| BT7 | **Equity curve yok** — strateji zaman içinde nasıl büyüdü görülemiyor | Kullanıcı güveni | 🟡 Sonra |
| BT8 | **Sharpe/Sortino yok** — risk-ağırlıklı temel metrik eksik | Profesyonellik | 🟡 Sonra |
| BT9 | **BIST100 benchmark yok** — "endeksten iyi mi?" sorusu cevaplanamıyor | Anlamlılık | 🟡 Sonra |
| BT10 | **İstatistiksel anlamlılık testi yok** — %50.6 win rate p-value olmadan anlamsız | Bilimsel doğruluk | 🟡 Sonra |
| BT11 | **Veri geçmişi 1 yıl** — sektör standardı 5+ yıl; Yahoo 10 yıla kadar destekliyor | Güvenilirlik | 🟡 Sonra |

### Rakip Karşılaştırması (Güncel Durum)

| Özellik | Investable Edge | TradingView | Matriks |
|---------|--------|-------------|---------|
| Komisyon modeli | ✅ (BT3) | ✅ | ✅ |
| Equity curve | ✅ (BT7) | ✅ | ✅ |
| Max Drawdown | ✅ (BT6) | ✅ | ✅ |
| Sharpe Ratio | ✅ (BT8) | ✅ | ✅ |
| Benchmark (BIST100) | ✅ (BT9) | ❌ | ✅ |
| p-value istatistik testi | ✅ (BT10) | ❌ | ❌ |
| Giriş zamanlaması doğru | ✅ (BT2) | ✅ | ✅ |
| Signal×Regime matrisi | ✅ | ❌ | ❌ |
| Makro bağlam + simülatör | ✅ | ❌ | ❌ |
| Türkçe/BIST odaklı | ✅ | ❌ | ✅ |
| Telegram sinyal botu | ✅ | ❌ | ❌ |

### Düzeltme Planı

**Acil (BT1-BT3): ✅ TAMAMLANDI (2026-03-30)**
- BT1: ✅ `backfill-real` → `fetchOHLCV('^XU100', 700)` — tarihin başındaki snapshot'ta da 200+ mum var
- BT2: ✅ `backfill-real` → `entryPrice = candles[i+1]?.open ?? lastCandle.close`; `entryDate = nextCandle?.date ?? lastCandle.date`
- BT3: ✅ `lib/backtesting.ts` → `COMMISSION_ROUNDTRIP = 0.004`; winRate/avgReturn/expectancy/profitFactor hepsi komisyon düşülmüş hesaplıyor
- **✅ Backfill tamamlandı (2026-03-30):** 164 sembol × ~400 sinyal ≈ ~63.000 kayıt. Ticker XU100.IS, ertesi açılış entry, komisyon dahil.

**Orta vadeli (BT4-BT6): ✅ TAMAMLANDI (2026-03-30)**
- BT4: ✅ `backfill-real` → `i += 1` (her mum), `BATCH_SIZE 3→1`, `maxBatch 54→163`. Örneklem ~5x büyüdü (~63.000 kayıt). Backfill yeniden çalıştırıldı.
- BT6: ✅ `calculateMaxDrawdown()` — kümülatif getiri serisi üzerinden tepe-dip analizi (komisyon dahil). `BacktestResult.maxDrawdown` alanı + turuncu UI kartı.

**Sonra (BT7-BT11): ✅ TAMAMLANDI (2026-03-30)**
- BT7: ✅ Equity Curve — SVG tabanlı, günlük ort. net getiri kümülatifi, yeşil/kırmızı, toplam % değişim.
- BT8: ✅ Sharpe Ratio — TCMB %45/yıl risksiz faiz, 7g bazlı. Renk kodu >1 yeşil / >0 sarı / <0 kırmızı.
- BT9: ✅ BIST100 Benchmark — XU100.IS buy-and-hold vs strateji karşılaştırma kartı (▲/▼).
- BT10: ✅ p-value — tek örneklem t-testi, normalCDF yaklaşımı. p<0.01/0.05/0.10 renk kodlu bilgi satırı.
- BT11: ✅ Veri derinliği — stock 252→365g, yahoo.ts 2y/5y range, API max 730g, UI'a 2Y butonu.
- ⚠️ Tam 2Y veri için yeniden backfill (DELETE + 164 batch × 365g) gerekli.
- BT-FIX (2026-04-02): ✅ maxDrawdown bug — daily grouping ile -100%→-18.1% düzeltildi. pValue precision 4→6 ondalık, UI'da "< 0.0001" gösterimi.
