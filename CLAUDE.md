# BistAI - Claude Code Proje Hafızası

> Bu dosya Claude Code tarafından otomatik okunur. Tüm ekip üyeleri aynı bağlamı paylaşır.

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
| **Phase 9** | ⬜ (9.4 Berk) | Profil & Kişiselleştirme (profiles tablo, API, sayfa, navbar dropdown) |
| **Phase 10** | ✅ | Topluluk Platformu (posts, comments, likes, realtime, moderation) |

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
| 9.4 | Kişiselleştirilmiş ana sayfa (login → dashboard-home, logout → landing) | L | Berk | ⬜ |
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

## Phase 11 — Ödeme & Abonelik Sistemi (~1-2 hafta) ⬜

**Tema:** Monetizasyon. Maliyet: Stripe işlem başı %2.9 + 30¢

| # | Görev | Zorluk | Kim | Durum |
|---|-------|--------|-----|-------|
| 11.1 | Stripe kurulumu (`lib/stripe.ts`) | M | Doğuş | ⬜ |
| 11.2 | Abonelik DB (stripe_customer_id, tier_expires_at) | S | Doğuş | ⬜ |
| 11.3 | Checkout API (`/api/stripe/checkout`) | M | Doğuş | ⬜ |
| 11.4 | Webhook handler (`/api/stripe/webhook`) | L | Doğuş | ⬜ |
| 11.5 | Fiyatlandırma sayfası (`/fiyatlandirma`) | M | Berk | ⬜ |
| 11.6 | Tier-gating helper (`lib/tier-guard.ts`) | S | Doğuş | ⬜ |
| 11.7 | Profil abonelik bölümü | S | Berk | ⬜ |

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

## Phase 12 — AI Topluluk Botu (~1 hafta) ⬜

**Tema:** Premium kullanıcı paylaşımlarını analiz eden AI. Maliyet: ~$3-10/ay (Claude API)

| # | Görev | Zorluk | Kim | Durum |
|---|-------|--------|-----|-------|
| 12.1 | AI bot system prompt (`lib/community-ai.ts`) | M | Doğuş | ⬜ |
| 12.2 | AI bot trigger (post create → Claude → AI yorum) | L | Doğuş | ⬜ |
| 12.3 | AI yorum UI ("AI Analist" badge) | S | Berk | ⬜ |
| 12.4 | Rate limiting (1 AI yorum/post, 100/gün global) | S | Doğuş | ⬜ |
| 12.5 | Premium gate (non-premium → bulanık + upgrade CTA) | S | Berk | ⬜ |

---

## Phase 13 — Ek Veri Kaynakları & ML Temeli (~2 hafta, opsiyonel) ⬜

**Tema:** Veri genişletme + ML hazırlığı. Maliyet: $0-57/ay

| # | Görev | Zorluk | Kim | Durum |
|---|-------|--------|-----|-------|
| 13.1 | AlphaVantage entegrasyonu | M | Doğuş | ⬜ |
| 13.2 | TradingEconomics (maliyet değerlendirilecek) | M | Doğuş | ⬜ |
| 13.3 | Veri kaynak abstraksiyonu (`lib/data-providers.ts`) | L | Doğuş | ⬜ |
| 13.4 | Feature engineering (`lib/ml-features.ts`) | L | Doğuş | ⬜ |
| 13.5 | Python ML microservice (FastAPI + XGBoost) | XL | İkisi | ⬜ |
| 13.6 | ML prediction API proxy | M | Doğuş | ⬜ |

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
3. ⬜ Doğuş: `profiles` migration'ı Supabase'de çalıştır (`supabase/migrations/20260315_profiles.sql`)
4. ⬜ Berk: 9.4 Kişiselleştirilmiş ana sayfa (login → dashboard, logout → landing)
5. ✅ Phase 10 tamamlandı (2026-03-15): topluluk posts/comments/likes DB + API + feed/detay/oluşturma sayfaları + realtime + moderation
6. ⬜ Doğuş: `community` migration'ı Supabase'de çalıştır (`supabase/migrations/20260315_community.sql`)
7. ⬜ Supabase Realtime'ı etkinleştir: Dashboard → Database → Replication → `comments` tablosuna realtime ekle
8. Sıradaki: Phase 11 — Ödeme & Abonelik Sistemi

## Test Kuralı (Her Değişiklik Sonrası)

1. **TypeScript**: `npx tsc --noEmit`
2. **Build**: `npm run build`
3. **Manuel test**: Etkilenen sayfa/bileşeni test et
4. **DevTools**: Console/Network hata kontrolü
5. **Responsive**: Mobil ve desktop (UI değişikliği varsa)
