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
| **Phase 6** | 🔄 Backend ✅, UI ⬜ (Berk) | Kompozit Sinyal & Makro UI |
| **Phase 7** | ⬜ | İleri Seviye (Backtesting, ML, Alert) |

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

### 6.1 Kompozit Sinyal Motoru [L]
- **Yeni dosya**: `lib/composite-signal.ts`
- Teknik Skor × Makro Rüzgar × Sektör Uyumu → BUY / HOLD / SELL
- Makro negatifken teknik AL sinyalinin güveni düşer
- Sektör uyumsuzken sinyal zayıflar

### 6.2 AI Açıklama v2 [S]
- `lib/claude.ts` güncelleme — makro bağlam ekleme
- "RSI divergence tespit edildi + makro rüzgar pozitif + sektör momentum güçlü → AL"

### 6.3 Makro Dashboard Sayfası [L] (Berk)
- `/makro` sayfası: gösterge tablosu + trend grafikleri + risk gauge
- Makro skor büyük gösterge + yeşil/kırmızı renk kodu

### 6.4 Sektör Heatmap [M] (Berk)
- Sektör performans ısı haritası (grid, renk kodlu)
- Tıklanabilir → sektör detayı

### 6.5 Sinyal Kartlarına Makro Badge [S] (Berk)
- Mevcut sinyal kartlarına: "Makro Rüzgar: 🟢 Pozitif" / "🔴 Negatif" etiketi
- Güven skoru makro ile ayarlanmış hali

---

## Phase 7 — İleri Seviye (Opsiyonel)

### 7.1 Backtesting Sayfası [L]
- Geçmiş sinyallerin makro koşullara göre performans analizi

### 7.2 Python ML Microservice [XL]
- FastAPI + XGBoost/RandomForest
- Feature: teknik + makro + sektör → BUY/SELL tahmin

### 7.3 Alert Sistemi [M]
- Makro skor kritik eşik geçince bildirim
- Yeni sinyal + güçlü makro uyum → push notification

---

## Koordinasyon
1. Phase 4 backend (Doğuş) tamamlanınca Phase 5'e geçilir
2. Phase 6'da Berk makro UI sayfalarını yapar, Doğuş kompozit motoru yapar
3. Phase 7 tüm ekip kararıyla başlar

## Test Kuralı (Her Değişiklik Sonrası)

1. **TypeScript**: `npx tsc --noEmit`
2. **Build**: `npm run build`
3. **Manuel test**: Etkilenen sayfa/bileşeni test et
4. **DevTools**: Console/Network hata kontrolü
5. **Responsive**: Mobil ve desktop (UI değişikliği varsa)
