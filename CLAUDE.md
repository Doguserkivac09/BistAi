# BistAI - Claude Code Proje Hafızası

> Bu dosya Claude Code tarafından otomatik okunur. Tüm ekip üyeleri aynı bağlamı paylaşır.

## Ekip

- **Berk** - Karma (frontend + backend)
- **Doğuş** - Karma (frontend + backend)
- **Claude (AI)** - Development assistant

Her session başında ekip üyesi kendini tanıtır. Her iki geliştirici de tüm görevlerde çalışabilir.

## Proje Özeti

**Global Macro AI Yatırım Platformu.** Teknik sinyaller + global makro veriler + piyasa risk göstergeleri + sektör momentumu ile AI destekli yatırım sinyalleri üretir.

- **Stack**: Next.js 14 App Router, TypeScript, React 18, Tailwind CSS, Supabase (Postgres + Auth)
- **Veri**: Yahoo Finance OHLCV, FRED API (makro), Anthropic Claude AI (açıklama + tahmin)
- **Repo**: https://github.com/Doguserkivac09/BistAi.git

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
| `lib/yahoo.ts` | Yahoo Finance OHLCV fetch |
| `lib/performance.ts` | Signal performance DB writes (client-side → server'a taşınacak) |
| `app/api/evaluate-signals/route.ts` | Batch sinyal değerlendirme |
| `app/api/signal-stats/route.ts` | Edge istatistik API |
| `app/tarama/page.tsx` | Client-side tarama sayfası |
| `app/hisse/[sembol]/HisseDetailClient.tsx` | Hisse detay sayfası |
| `components/Navbar.tsx` | Server component (auth) |
| `components/NavbarClient.tsx` | Client component (mobil menü) |

## Bilinen Sorunlar

1. Yahoo sembol normalizasyonu - `.IS` suffix sorunları, 404 hataları
2. `saveSignalPerformance()` client-side → RLS 403 hataları → server API'ye taşınmalı
3. Sembol listesi küçük (~20) → BIST100'e genişletilmeli
4. `signal-stats` tarih filtrelemesi çalışmıyor (cutoff hesaplanıyor ama query'de kullanılmıyor)
5. `signal_performance` tablosu `schema.sql`'de yok
6. Production'da console.log'lar var
7. AI açıklamaları cache'lenmiyor

---

# Geliştirme Planı

## Tamamlanan Görevler (v1)

| Görev | Durum |
|-------|-------|
| Yahoo sembol normalizasyonu | ✅ |
| Signal performance server API | ✅ |
| Signal-stats tarih filtresi | ✅ |
| Schema docs | ✅ |
| API hata yönetimi | ✅ |
| BIST100 sembol genişletme | ✅ |
| Şifre sıfırlama | ✅ |
| Rate limiting + batching | ✅ |
| Mobil menü + progress bar + timeframe fix | ✅ |
| Toast (sonner) + Dashboard + Grafik | ✅ |
| Loading, SEO, A11y, Performance | ✅ |

---

## Global Macro AI Platform (v2)

### Durum Özeti

| Phase | Görevler | Durum |
|-------|----------|-------|
| **Phase 1** | Macro Data Engine (FRED API, macro_data DB, /api/macro) | ✅ Tamamlandı |
| **Phase 2** | Risk Engine (VIX, yield curve, risk score 0-100) | ⬜ Bekliyor |
| **Phase 3** | Sector Momentum (8 sektör, heatmap) | ⬜ Bekliyor |
| **Phase 4** | AI Prediction (Claude → BUY/HOLD/SELL) | ⬜ Bekliyor |
| **Phase 5** | Dashboard Entegrasyonu (Makro Radar sayfası) | ⬜ Bekliyor |

### Phase 1 — Macro Data Engine

| # | Görev | Dosya | Durum |
|---|-------|-------|-------|
| 1.1 | FRED API Client | `lib/fred.ts` | ✅ |
| 1.2 | Macro Types | `types/macro.ts` | ✅ |
| 1.3 | macro_data DB tablosu | `supabase/schema.sql` | ✅ |
| 1.4 | Macro Refresh Cron | `app/api/cron/macro-refresh/route.ts` | ✅ |
| 1.5 | Macro API | `app/api/macro/route.ts` | ✅ |
| 1.6 | Env güncelleme (FRED_API_KEY) | `lib/env.ts` | ✅ |
| 1.7 | Macro API Client | `lib/api-client.ts` | ✅ |

### Phase 2 — Risk Engine

| # | Görev | Dosya | Durum |
|---|-------|-------|-------|
| 2.1 | Risk Score hesaplama | `lib/risk-engine.ts` | ⬜ |
| 2.2 | Risk API | `app/api/risk/route.ts` | ⬜ |
| 2.3 | risk_snapshots DB | `supabase/schema.sql` | ⬜ |
| 2.4 | RiskGauge bileşeni | `components/RiskGauge.tsx` | ⬜ |
| 2.5 | VIX Chart | `components/VixChart.tsx` | ⬜ |
| 2.6 | Risk API Client | `lib/api-client.ts` | ⬜ |

### Phase 3 — Sector Momentum Engine

| # | Görev | Dosya | Durum |
|---|-------|-------|-------|
| 3.1 | Sektör tanımları | `lib/sectors.ts` | ⬜ |
| 3.2 | Sektör momentum hesaplama | `lib/sector-engine.ts` | ⬜ |
| 3.3 | Sektör API | `app/api/sectors/route.ts` | ⬜ |
| 3.4 | Sektör Heatmap | `components/SectorHeatmap.tsx` | ⬜ |
| 3.5 | Sektör Kartı | `components/SectorCard.tsx` | ⬜ |
| 3.6 | Sektör API Client | `lib/api-client.ts` | ⬜ |

### Phase 4 — AI Prediction Engine

| # | Görev | Dosya | Durum |
|---|-------|-------|-------|
| 4.1 | Tahmin motoru (Claude API) | `lib/prediction-engine.ts` | ⬜ |
| 4.2 | Tahmin API | `app/api/predict/route.ts` | ⬜ |
| 4.3 | predictions DB | `supabase/schema.sql` | ⬜ |
| 4.4 | Tahmin Kartı | `components/PredictionCard.tsx` | ⬜ |
| 4.5 | Hisse detayda tahmin | `HisseDetailClient.tsx` | ⬜ |
| 4.6 | Tahmin API Client | `lib/api-client.ts` | ⬜ |

### Phase 5 — Dashboard Entegrasyonu

| # | Görev | Dosya | Durum |
|---|-------|-------|-------|
| 5.1 | Gelişmiş AI açıklamaları | `lib/claude.ts` | ⬜ |
| 5.2 | Açıklama cache | `explanation_cache` DB + explain route | ⬜ |
| 5.3 | Cron güncellemeleri | `app/api/cron/evaluate/route.ts` | ⬜ |
| 5.4 | Makro Radar sayfası | `app/makro/page.tsx` | ⬜ |
| 5.5 | Dashboard genişletme | `app/dashboard/page.tsx` | ⬜ |
| 5.6 | Navbar güncelleme | `NavbarClient.tsx` | ⬜ |
| 5.7 | StockCard zenginleştirme | `StockCard.tsx` | ⬜ |

### Koordinasyon
- Berk ve Doğuş karma çalışıyor (frontend + backend)
- Her phase sıralı ilerler (Phase 2, Phase 1'e bağımlı)
- FRED_API_KEY gerekli (fred.stlouisfed.org'dan ücretsiz alınır)

## Test Kuralı (Her Değişiklik Sonrası)

Her değişiklik tamamlandıktan sonra, test edilebilir ise şu adımlar uygulanır:

1. **TypeScript**: `npx tsc --noEmit` — yeni hata eklenmediğinden emin ol
2. **Build**: `npm run build` — production build başarılı mı?
3. **Manuel test** (değişikliğe özel):
   - Etkilenen sayfa/bileşeni tarayıcıda ziyaret et
   - Eklenen özelliği test et (hover, click, responsive, vb.)
   - Edge case'leri kontrol et (boş veri, hata durumları)
4. **DevTools**: Console/Network'te yeni hata var mı?
5. **Responsive**: Mobil ve desktop görünüm (UI değişikliği varsa)
