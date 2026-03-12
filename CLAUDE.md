# BistAI - Claude Code Proje Hafızası

> Bu dosya Claude Code tarafından otomatik okunur. Tüm ekip üyeleri aynı bağlamı paylaşır.

## Ekip

- **Berk** - Frontend (UI, components, client-side features)
- **Doğuş** - Backend (API routes, database, server-side logic)
- **Claude (AI)** - Development assistant

Her session başında ekip üyesi kendini tanıtır. Claude, kişiye göre görev atar.

## Proje Özeti

Production-level BIST hisse sinyal analiz platformu. Teknik sinyaller tespit edilir, performansları izlenir, istatistiksel edge hesaplanır.

- **Stack**: Next.js 14 App Router, TypeScript, React 18, Tailwind CSS, Supabase (Postgres + Auth)
- **Veri**: Yahoo Finance OHLCV, Anthropic Claude AI açıklamalar
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

## Durum Özeti

| Phase | Berk (Frontend) | Doğuş (Backend) |
|-------|----------------|-----------------|
| **Phase 1** | ✅ 1.6 Mobil menü, ✅ 1.7 Progress bar, ✅ 1.8 Timeframe fix | ⬜ 1.1 Yahoo norm, ⬜ 1.2 Signal perf API, ⬜ 1.3 Stats filter, ⬜ 1.4 Schema, ⬜ 1.5 Error handling |
| **Phase 2** | ⬜ 2.4 Toast (sonner), ⬜ 2.5 Dashboard, ⬜ 2.6 Grafik | ⬜ 2.1 BIST100, ⬜ 2.2 Şifre sıfırlama, ⬜ 2.3 Batching |
| **Phase 3** | ⬜ Loading, SEO, A11y, Perf | ⬜ Rate limit, Cache, Cron, Env |

## Phase 1 — Doğuş Backend Görevleri (SIRADA)

### 1.1 Yahoo Sembol Normalizasyonu [S]
- **Dosya**: `lib/yahoo.ts`
- `toYahooSymbol()`: `^` ile başlayan index sembollerine `.IS` ekleme
- `fetchOHLCV` ve `fetchOHLCVByTimeframe`: 404 → `[]` döndür (throw yerine)
- `normalizeSymbol(raw)` export fonksiyonu ekle

### 1.2 saveSignalPerformance → Server API [M]
- **Yeni**: `app/api/signal-performance/route.ts` (POST, service role ile DB write)
- **Değişecek**: `lib/performance.ts`, `lib/api-client.ts`
- Regime tespitini server tarafına taşı
- `saveSignalPerformanceClient()` fonksiyonu ekle

### 1.3 signal-stats Tarih Filtresi [S]
- **Dosya**: `app/api/signal-stats/route.ts`
- `.gte('entry_time', cutoff.toISOString())` ekle

### 1.4 signal_performance Schema [S]
- **Dosya**: `supabase/schema.sql`
- Tablo tanımını migration'lardan schema.sql'e ekle

### 1.5 API Hata Yönetimi [M]
- `ohlcv`: Yahoo 404 → `{ candles: [] }` (200)
- `explain`: Claude API retry (1 kez, 1s delay)
- `evaluate-signals`: catch bloğunda `console.error`

## Phase 2 — Temel İyileştirmeler

### Doğuş
- **2.1** BIST100 sembol genişletme (1.1 sonrası)
- **2.2** Şifre sıfırlama akışı
- **2.3** Tarama batching / rate limiting (2.1 sonrası)

### Berk
- **2.4** Toast sistemi (`sonner` kütüphanesi)
- **2.5** Dashboard iyileştirmeleri (pagination, search, sort)
- **2.6** Grafik iyileştirmeleri (legend, RSI lines, responsive)

## Phase 3 — Production Hardening
- Doğuş: Rate limiting, Yahoo cache, Cron evaluation, Env validation
- Berk: Loading states, SEO/metadata, Accessibility, Performance

## Koordinasyon
1. 1.2 tamamlandığında Berk import güncellemesi yapar
2. 2.4 (Toast) Phase 2'de erken tamamlanmalı
3. Phase 2'ye geçmek için Doğuş'un Phase 1 backend görevleri bitmeli
