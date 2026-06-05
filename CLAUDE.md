# Investable Edge — Claude Code Proje Hafızası

> Bu dosya Claude Code tarafından otomatik okunur. Tüm ekip üyeleri aynı bağlamı paylaşır.
> Son güncelleme: 2026-06-03

---

## 📌 BEKLEYEN MANUEL ADIMLAR

### Supabase Migrations — Çalıştırılması Gerekenler
Aşağıdaki migration'lar Supabase SQL Editor'a yapıştırılıp çalıştırılmalıdır (hepsi idempotent):

| Migration | İçerik | Durum |
|-----------|--------|-------|
| `20260423_signal_performance_liquidity_mtf_risk.sql` | ADV likidite, weekly_aligned, stop/target/rr/atr kolonları | ✅ Çalıştırıldı (2026-05-17) |
| `20260425_macro_snapshots_extended.sql` | eem, brent, gold, silver, copper, bist100, inflation kolonları | ✅ Çalıştırıldı (2026-05-17) |
| `20260426_macro_snapshots_tr10y.sql` | tr_10y kolon | ✅ Çalıştırıldı (2026-05-17) |
| `20260504_alert_history_stage.sql` | alert_history stage kolonu | ✅ Çalıştırıldı (2026-05-17) |
| `20260504_signal_performance_stage.sql` | signal_performance stage kolonu | ✅ Çalıştırıldı (2026-05-17) |
| `20260506_weekly_picks.sql` | weekly_picks tablosu (Haftanın Seçimleri) | ✅ Çalıştırıldı (2026-05-17) |
| `20260507_ai_portfolio.sql` | ai_portfolio_positions/history/decisions tabloları | ✅ Çalıştırıldı (2026-05-17) |
| `20260517_signal_tracker.sql` | signal_tracker tablosu (Sinyal Takipçisi) | ✅ Çalıştırıldı (2026-05-24) |
| `20260518_apex_portfolio.sql` | apex_portfolio_positions/history/decisions | ✅ Çalıştırıldı (2026-05-24) |
| `20260521_apex_signal_type.sql` | apex decisions: signal_type kolonu | ✅ Çalıştırıldı (2026-05-24) |
| `20260521_apex_tp_atr.sql` | apex positions: tp1_hit + PARTIAL_SELL action | ✅ Çalıştırıldı (2026-05-24) |
| `20260522_aegis_us.sql` | aegis_us_positions/history/decisions | ✅ Çalıştırıldı (2026-05-24) |
| `20260522_apex_us.sql` | apex_us_positions/history/decisions | ✅ Çalıştırıldı (2026-05-24) |
| `20260522_scan_cache_market.sql` | scan_cache: market kolonu + composite PK | ✅ Çalıştırıldı (2026-05-24) |
| `20260523_future_scores.sql` | future_scores tablosu (Future Brightness Score) | ✅ Çalıştırıldı (2026-05-24) |
| `20260602_signal_performance_market.sql` | signal_performance: market kolonu + unique constraint (sembol,signal_type,entry_time,market) | ✅ Çalıştırıldı (2026-06-03) |
| `20260603_signal_performance_market.sql` | signal_performance.market kolonu + backfill (BUG-1 fix) | ✅ Çalıştırıldı (2026-06-03) |

### AI Portföyü Doğrulama (2026-05-17 sonrası)
- `/yapay-zeka-portfoyu` sayfası açılıyor mu?
- Cron Pazartesi 05:50 UTC çalışıyor mu? (Vercel cron jobs log)
- Haftalık seçimler Pazartesi 05:30 UTC tetikleniyor mu?
- Cuma 18:30 UTC kapanış fiyatları güncelleniyor mu?

### ⚠️ Geçmiş Fırsatlar Sayfası — Navbar'dan Gizlendi (2026-05-17)
**Sayfa:** `app/gecmis-firsatlar/page.tsx` → **KOD DURUYOR, sadece navbar'dan kaldırıldı.**

**Neden gizlendi:** signal_performance tablosundaki veriler backfill kaynaklı.
Tüm sinyaller aynı tarihe (10 Nis) ait ve returnlar ~0% (-0.4% komisyon).
YEOTK gibi büyük hareketler görünmüyor çünkü gerçek günlük tarama verisi henüz birikmedi.

**Ne zaman geri eklenecek:** Günlük tarama cron'u (17:50 TRT) düzenli çalışmaya başladıktan
1-2 ay sonra. `signal_performance`'da evaluated=true kayıtlarda anlamlı +%10/+%20 getiriler
görünmeye başlayınca `NavbarClient.tsx`'teki yorum satırını kaldır ve sayfayı aktif et.

**Nasıl geri eklenir:**
```tsx
// components/NavbarClient.tsx — Portföy dropdown içinde:
{ href: '/gecmis-firsatlar', label: 'Geçmiş Fırsatlar', icon: History },
```

---

## 🚀 MEVCUT DURUM (2026-06-03)

### Bu Session'da Tamamlananlar (Bug Fix Sprint — 2026-06-03)

| Bug | Kök Neden | Değiştirilen Dosyalar |
|-----|-----------|----------------------|
| **BUG-1** BIST sayfasında US hisseleri | scan_cache sorgusunda market='BIST' filtresi eksikti | `api/firsatlar/route.ts`, `api/uzun-vade-firsatlar/route.ts` |
| **BUG-1** signal_performance market kolonu | Migration çalıştırılmamıştı, yeni satırlar market=null giriyordu | `cron/scan-cache`, `cron/scan`, migration `20260603_...` |
| **BUG-2** Son güncelleme 19:00 görünüyor | Cron 14:50 UTC = 17:50 TRT; UI metni "19:00" yazıyordu | `app/firsatlar/page.tsx` |
| **BUG-3+4** Yatırım skoru 0 / uzun vade boş | commit 45afafd `fetchYahooFundamentals`'ı US-odaklı overwrite etti; .IS suffix ve BIST metrikleri kayboldu | `lib/yahoo-fundamentals.ts` (yahoo-finance2 + .IS geri yüklendi) |
| **Denetim** future-scores cron çalışmıyor | Route POST export ediyordu, Vercel cron GET gönderiyor | `api/cron/future-scores/route.ts` |
| **Denetim** maxDuration eksik | scan-cache (295 sembol) Vercel 25s limitini aşabilir | `cron/scan-cache` (300s), `cron/scan` (120s) |
| **Denetim** gelecek-sirketler emoji bozuk | Unicode literal (U1F916) yerine gerçek emoji yazılmadı | `app/gelecek-sirketler/page.tsx` |

### ⚠️ Supabase'de Çalıştırılması Gereken Migration

```sql
-- supabase/migrations/20260603_signal_performance_market.sql
-- Supabase SQL Editor'da çalıştır (idempotent)
```

---

## 🚀 Geleceği Parlak Şirketler — Profesyonel Güçlendirme (2026-06-03) ✅ TAMAMLANDI

Branch: `feat/future-scores-pro` — **yeni Supabase migration GEREKMEZ** (mevcut 7 kolon yeniden amaçlandırıldı).

| Değişiklik | Dosya |
|-----------|-------|
| US fetch ham v10 → **yahoo-finance2** quoteSummary (crumb/401 fix). Yeni alanlar: recommendationMean, epsForward, pegRatio, returnOnEquity, freeCashFlow, revenuePerShare. `fetchFundamentalsBist` + batch eklendi. | `lib/yahoo-fundamentals.ts` |
| **Atıl ağırlıklar değişti**: newsScore(50) → Analyst Consensus, partnershipScore(50) → EPS Growth Trend. **PEG/Valuation** bileşeni eklendi. Ağırlıklar: rev22/upside18/consensus15/eps15/insider15/peg10/inst5. BIST enflasyon + export opsiyonları. | `lib/future-score.ts` |
| Ortak skorlama + **coverage** + upsert + veri kalitesi eşiği (>%60 kritik null → skorlama) | `lib/future-score-runner.ts` (yeni) |
| US cron: **13 tema** (ALL_THEMES), coverage yanıtı. (Timeout endişesi yersizdi: ~130 benzersiz sembol) | `app/api/cron/future-scores/route.ts` |
| **BIST tema haritası** (5 tema) + EXPORT_BONUS | `lib/bist-future-themes.ts` (yeni) |
| **BIST cron**: bistGuard + fetchTurkeyInflation (reel büyüme) + export bonus, market='BIST' | `app/api/cron/future-scores-bist/route.ts` (yeni) |
| API `?market=US\|BIST` param (varsayılan US) | `app/api/future-scores/route.ts` |
| UI: 🇺🇸/🇹🇷 toggle, 13 US + 5 BIST sekme, 7-bileşen breakdown, stale-veri uyarısı, BIST enflasyon notu | `app/gelecek-sirketler/page.tsx` |
| `vercel.json`: BIST cron Pzt 08:00 UTC (11:00 TRT) | `vercel.json` |

**Kritik bug (doğrulamada yakalandı):** yahoo-finance2 v3 per-call `validateResult` opsiyonunu reddediyor → tüm fetch'ler fırlıyor, skorlar sabit 50 kalıyordu (eski prod davranışı buydu). Instance seviyesinde `validation.logErrors/logOptionsErrors=false` ile çözüldü.

**Canlı doğrulama (Yahoo'dan gerçek veri):** NVDA=83, IONQ=59, RGTI=67; BIST enflasyon düzeltmesi FROTO nom −8.6%→reel −30.2%, GARAN nom %49.7→reel %14.4.

**Durum (2026-06-04):** Her iki cron prod'da çalıştırıldı — US 128/132, BIST 47/54 sembol gerçek skorlarla yazıldı (NVDA=84, ISCTR=75, ASELS=49).

### Model v2 düzeltmesi (2026-06-04) ✅
ASELS gibi net kârı güçlü artan ama nominal geliri enflasyon altında kalan şirketler haksız "karanlık" skor alıyordu (ASELS=32). Düzeltmeler (`lib/future-score.ts`, `lib/yahoo-fundamentals.ts`, `lib/bist-future-themes.ts`):
- EPS bileşeni artık **earningsGrowth (YoY net kâr)** önceliğini kullanır (forwardEps yedek). Yahoo'da hazır olan net kâr büyümesi artık skora giriyor; BIST'te enflasyona göre reel.
- Reel gelir düzeltme bandı BIST'te genişletildi (−30..40) — sağlam şirket 0'a ezilmiyor.
- EXPORT_BONUS'a ASELS(18)+KATMR(8) eklendi.
- Sonuç: ASELS 32→49, FROTO 58→43 (net kâr −%35 artık cezalı — model iki yönlü doğru).

### 🔴 Veri doğruluğu denetimi (2026-06-04) — `DATA-AUDIT.md`
Kırmızı bayraklar: TR politika faizi (%7 fallback), enflasyon (%30.87 fallback), CDS (USD/TRY proxy), KAP (boş), ekonomi takvimi (hardcoded), ML (heuristik). **Kök neden: TCMB EVDS API çalışmıyor (HTTP 302).** Fiyat/OHLCV/FRED/temel/haber GERÇEK.

### ✅ TR makro canlı veri (2026-06-04) — `lib/turkey-macro.ts`
EVDS `evds2→evds3`'e taşınmış (dokümante REST API emekli, key'le bile 302; evds3 yalnızca dahili `/igmevdsms-dis` mikroservisi). **TradingEconomics canlı scrape** entegre edildi (ücretsiz): politika faizi **%37**, enflasyon **%32.61** (TÜİK ile birebir doğrulandı). Sıra: TE scrape → EVDS yedek → hardcoded son çare. Makro sayfasına 🟢/🟡/🔴 kaynak rozeti + legend. CDS: ücretsiz gerçek kaynak yok → "proxy ⓘ" etiketli bırakıldı (karar).

### ✅ Temel Analiz Faz 1 (2026-06-05) — Piotroski + Altman + trend
`lib/financial-statements.ts` (Yahoo `fundamentalsTimeSeries`, 5 yıl, BIST+US) + `lib/fundamental-health.ts` (Piotroski F-Score 0-9, Altman Z'' gelişmekte-olan-piyasa varyantı, kazanç kalitesi=accruals+FCF dönüşümü, CAGR+marj trendi). Bankalar/finansal → Piotroski/Altman "uygulanmaz". `/api/fundamental-health` + `components/FinansalSaglik.tsx` → hisse detay "Temel" sekmesi. Doğrulandı: ASELS 6/9 Z''=6.99, TUPRS 7/9, AAPL 8/9, GARAN N/A. **Sıradaki (Faz 2): sektör-bazlı + peer değerleme.** Açık: KAP, ekonomi takvimi.

---

## 🚀 ÖNCEKİ DURUM (2026-05-23)

### Bu Session'da Tamamlananlar (Phase B — Tema Landing Sayfaları)

| Özellik | Sayfa/Dosya | Commit |
|---------|-------|--------|
| **Tema Açıklamaları** | `lib/theme-descriptions.ts` | `3add611` |
| **Tema Performans API** | `/api/tema-performans` | `3add611` |
| **Tema Haberleri API** | `/api/tema-haberleri` | `3add611` |
| **Tema Heatmap** | `/temalar` | `3add611` |
| **Dinamik Tema Landing** | `/tema/[id]` | `3add611` |
| **Navbar Temalar Linki** | `components/NavbarClient.tsx` | `3add611` |
| **FirsatKarti Tema Pills** | `components/FirsatKarti.tsx` | `3add611` |
| **Hisse Detail Tema Pills** | `app/hisse/[sembol]` | `3add611` |

### Önceki Session'da Tamamlananlar (Phase A — May 17)

| Özellik | Sayfa | Commit |
|---------|-------|--------|
| **Haftanın Seçimleri** | `/haftalik-secimler` | `054f2f7` |
| **4 Aşama Sistemi** (Market Phase) | `lib/market-phase.ts` | `2f2fc29` |
| **Uzun Vade Fırsatlar** | `/uzun-vade` | `f976dc1` |
| **5 Yöntemli Değerleme Modeli** | `app/hisse/[sembol]` | `14487e8` |
| **Yapay Zeka Portföyü** | `/yapay-zeka-portfoyu` | `6b3dff5` |
| **Cron timing fix** (kapanış öncesi) | `vercel.json` | `ed66556` |

### Özellik Özetleri

**Phase B — Tema Landing Sayfaları (2026-05-23)**

13 tematik yatırım alanı için modern heatmap, performans API'leri ve dinamik landing page'leri:

| Tema | Emoji | Açıklama |
|------|-------|----------|
| AI | 🤖 | Yapay zeka, LLM, machine learning |
| Quantum | ⚛️ | Kuantum bilgisayarlar |
| Space | 🚀 | Uzay teknolojisi |
| Cybersecurity | 🔒 | Siber güvenlik |
| Defense | 🛡️ | Savunma ve aerospace |
| Semis | 🔌 | Yarı iletkenler |
| Datacenter | 🏢 | Veri merkezleri ve cloud |
| EV | 🔋 | Elektrikli araçlar |
| Biotech | 🧬 | Biyoteknoloji |
| Crypto | ₿ | Kripto ve blockchain |
| Networking | 📡 | 5G ve ağ altyapısı |
| PowerInfra | ⚡ | Enerji altyapısı |
| CleanEnergy | ♻️ | Yenilenebilir enerji |

**API'ler:**
- `GET /api/tema-performans?tema=AI` → tema performansı (1d/1h/1m), top gainers/losers, hisse sayısı
- `GET /api/tema-haberleri?tema=AI` → tema sembollerine ait son haberler (1 saat cache)

**Sayfalar:**
- `/temalar` → 13 temanın kart grid'i (emoji, 1d perf, top gainer, son haber)
- `/tema/[id]` → dinamik landing (hero, top 5 yükselen/düşen, tüm hisseler tablosu, haberler, tema açıklama)
- `/hisse/[sembol]` → US hisseleri için tema pill'leri (başlık altında, max 3 tema)
- `NavbarClient.tsx` → "Temalar" linki (Sparkles ikonu, Piyasa dropdown)

**Hattın Seçimleri (`/haftalik-secimler`)**
- Her Pazartesi 08:30 TRT'de algoritma en güçlü 5-7 hisseyi seçer
- confluence_score ≥ 50, ADV ≥ 10M₺, direction = 'yukari', max 72s taze
- Cuma kapanışta return_pct + bist_return_pct hesaplanır
- "BIST'i Geçti ✓ / BIST Geride ✗" badge, son 8 hafta özet tablo
- DB: `weekly_picks` tablosu (migration: 20260506)

**Yapay Zeka Portföyü (`/yapay-zeka-portfoyu`)**
- 100.000₺ başlangıç, Kelly Criterion pozisyon boyutu (Half-Kelly)
- Risk kuralları: max %12 tek hisse, %25 sektör, %20 nakit
- Stop-Loss -%8, Kâr Alma +%15 (yarı) / +%25 (tam), Trailing Stop +%5'te
- Karar tipleri: AL / SAT / TUT / KISMI SAT + gerekçe + faktörler
- DB: `ai_portfolio_positions`, `ai_portfolio_history`, `ai_portfolio_decisions`
- Cron: Cuma 17:50 TRT (kapanış öncesi pozisyon kararları)
- `lib/ai-portfolio-engine.ts`

**4 Aşama Sistemi (`lib/market-phase.ts`)**
- Faz 1: Dip (RSI<40, hacim spike, güçlü alım)
- Faz 2: Yükseliş (momentum, trend takibi)
- Faz 3: Tepe (RSI>70, hacim düşüşü, dikkat)
- Faz 4: Düşüş (trend kırılımı, çıkış)
- Dip Katılım Algoritması: Faz 1'de extra skor

**5 Yöntemli Değerleme Modeli (`app/hisse/[sembol]`)**
- DCF, Gordon Growth, P/E Çarpan, EV/EBITDA, Net Aktif Değer
- Enflasyon düzeltmesi (TCMB TÜFE + Fisher denklemi)
- Kurumsal sahiplik + uzun vade hedef fiyat

---

## SONRAKİ ADIMLAR — Öncelik Sırası

### 🔴 Yüksek Öncelik

| # | Görev | Açıklama |
|---|-------|----------|
| X1 | **Migration'ları doğrula** | Yukarıdaki tablodaki ❓ migration'ları Supabase'de çalıştır |
| X2 | **AI Portföy canlı test** | Vercel'de cron çalışıyor mu? Pozisyon açıldı mı? |
| X3 | **Haftalık seçimler canlı test** | weekly_picks tablosunda veri var mı? |

### 🟠 Orta Vadeli

| # | Görev | Açıklama |
|---|-------|----------|
| X4 | **Stripe env key'leri** | Stripe hesabı açılınca Vercel'e ekle |
| X5 | **AI Portföy vs BIST benchmark** | `/yapay-zeka-portfoyu` sayfasına XU100 karşılaştırma kartı |
| X6 | **Haftanın Seçimleri bildirim** | Pazartesi seçimler açıklandığında email/push bildirim |

### 🟡 Sonra

| # | Görev | Açıklama |
|---|-------|----------|
| X7 | **2Y Backfill** | 365g → 730g geçmiş veri (Yahoo 10Y destekliyor) |
| X8 | **BT5 Survivorship bias** | Delisted hisseler backtest'e dahil değil |
| X9 | **Python ML Microservice** | FastAPI + XGBoost (Phase 13'te planlandı, opsiyonel) |

---

## Proje Özeti

**Investable Edge** — BIST odaklı AI-destekli yatırım analiz platformu.

- **Stack**: Next.js 14 App Router, TypeScript, React 18, Tailwind CSS, Supabase (Postgres + Auth)
- **Hisse Evreni**: 295 BIST sembolü (~%95 işlem hacmi kapsamı)
- **Veri Kaynakları**: Yahoo Finance (OHLCV + VIX/DXY/US10Y/USDTRY), FRED API, TCMB, AlphaVantage, Anthropic Claude AI
- **Repo**: https://github.com/Doguserkivac09/BistAi.git
- **Vizyon**: Teknik sinyal × Makro rüzgar × Sektör uyumu × Temel analiz → Kompozit BUY/HOLD/SELL

---

## Ekip

- **Berk** — Frontend (UI, components, client-side features)
- **Doğuş** — Backend (API routes, database, server-side logic)
- **Claude (AI)** — Development assistant

---

## Git Workflow (GÜNCEL)

```
# Aktif geliştirme main branch üzerinde yapılıyor (2026-04 itibarıyla)
# develop = main ile eşleştirildi

# Küçük fix/feature: doğrudan main
git checkout main && git pull origin main
git add <dosyalar>
git commit -m "feat(scope): açıklama"
git push

# Büyük özellik: feature branch
git checkout -b feat/<feature-name>
# ... değişiklikler ...
git push -u origin feat/<feature-name>
# → main'e merge
```

**Commit stilleri**: `feat(scope):`, `fix(scope):`, `refactor(scope):`, `docs:`
**Push öncesi**: Her zaman kullanıcıya "Push edelim mi?" diye sor.
**ASLA** `--force` ile main'e push yapma.

---

## Kritik Dosyalar

| Dosya | Açıklama |
|-------|----------|
| `lib/signals.ts` | Sinyal tespiti — RSI Div, Volume, Trend, S/R, Formasyonlar |
| `lib/composite-signal.ts` | Teknik × Makro × Sektör → BUY/HOLD/SELL |
| `lib/market-phase.ts` | 4 Aşama Sistemi + Dip Katılım Algoritması |
| `lib/ai-portfolio-engine.ts` | AI Portföy — Kelly, Stop/TP, Trailing Stop kuralları |
| `lib/edge-engine.ts` | İstatistiksel edge hesaplama |
| `lib/yahoo.ts` | Yahoo Finance OHLCV fetch + cache |
| `lib/regime-engine.ts` | Piyasa rejimi (bull/bear/sideways) |
| `lib/macro-service.ts` | Makro veri servis katmanı |
| `lib/sector-engine.ts` | Sektör momentum motoru |
| `lib/backtesting.ts` | Geçmiş sinyal performans analizi |
| `lib/rate-limit.ts` | IP-based rate limiting |
| `lib/tier-guard.ts` | Abonelik tier kontrolü |
| `app/api/ohlcv/route.ts` | OHLCV veri API (400/min rate limit) |
| `app/api/signal-performance/route.ts` | Sinyal performans kayıt |
| `app/api/cron/ai-portfolio/route.ts` | AI Portföy haftalık karar cron |
| `app/api/cron/weekly-picks/route.ts` | Haftalık hisse seçimi cron |
| `app/api/cron/weekly-picks-close/route.ts` | Cuma kapanış fiyatı güncelleme cron |
| `app/hisse/[sembol]/HisseDetailClient.tsx` | Hisse detay sayfası |
| `app/tarama/page.tsx` | Tarama / Screener sayfası |
| `app/yapay-zeka-portfoyu/page.tsx` | AI Portföy sayfası |
| `app/haftalik-secimler/page.tsx` | Haftanın Seçimleri sayfası |
| `vercel.json` | Cron job tanımları |

---

## Tüm Sayfalar (app/)

| Sayfa | URL | Açıklama |
|-------|-----|----------|
| Landing | `/` | Giriş sayfası (anonim) |
| Dashboard | `/dashboard` | Kişisel dashboard (giriş gerekli) |
| Tarama | `/tarama` | Sinyal taraması + screener |
| Hisse Detay | `/hisse/[sembol]` | Grafik, sinyaller, AI analiz, değerleme |
| Makro | `/makro` | Makroekonomik göstergeler + risk skoru |
| Sektörler | `/sektorler` | Sektör momentum heatmap + drill-down |
| Portföy | `/portfolyo` | Lot takibi, P&L, sektör dağılımı |
| Watchlist | `/watchlist` | İzleme listesi |
| Karşılaştır | `/karsilastir` | Hisseler arası karşılaştırma |
| Haftanın Seçimleri | `/haftalik-secimler` | Algoritmik haftalık hisse portföyü |
| Yapay Zeka Portföyü | `/yapay-zeka-portfoyu` | 100.000₺ sanal AI fon simülasyonu |
| Uzun Vade | `/uzun-vade` | Temel veri odaklı uzun vade fırsatlar |
| Backtesting | `/backtesting` | Geçmiş sinyal performans analizi |
| AI Sohbet | `/sohbet` | Claude ile portföy bağlamlı sohbet |
| Haberler | `/haberler` | Gündem, KAP duyuruları, ekonomi takvimi |
| KAP | `/kap` | KAP duyuruları + AI özetleme |
| Ekonomi Takvimi | `/ekonomi-takvimi` | TR/US/EU ekonomi olayları |
| Araçlar | `/araclar` | Hesap makineleri (Pozisyon, R/R, Hedef) |
| Simülasyon | `/simulasyon` | Makro senaryo simülatörü |
| Ters Portföy | `/ters-portfolyo` | Portföy dışı çeşitlendirme fırsatları |
| Fiyat Alertler | `/fiyat-alertler` | Fiyat alarm yönetimi |
| Topluluk | `/topluluk` | Post paylaşım + yorumlar + AI Analist |
| Profil | `/profil` | Kullanıcı ayarları, abonelik, bildirim tercihleri |
| Fiyatlandırma | `/fiyatlandirma` | Paket karşılaştırması |

---

## Tamamlanan Fazlar & Özellikler

### Phase 1-13 — ✅ TAMAMLANDI

| Phase | Açıklama |
|-------|----------|
| Phase 1 | Temel altyapı (Yahoo normalize, Signal perf API, Schema, Error handling) |
| Phase 2 | Temel iyileştirmeler (BIST100, Auth, Toast, Dashboard, Grafik) |
| Phase 3 | Production hardening (Rate limit, Cache, Cron, SEO, A11y) |
| Phase 4 | Makro Rüzgar Motoru (VIX, CDS, USD/TRY, FRED, TCMB) |
| Phase 5 | Sektör & Risk Motoru |
| Phase 6 | Kompozit Sinyal & Makro UI |
| Phase 7 | İleri Seviye (Backtesting, Alert, ML) |
| Phase 8 | Teknik Borç & UI Temeli (macroService, time-align, AI cache, skeleton) |
| Phase 9 | Profil & Kişiselleştirme |
| Phase 10 | Topluluk Platformu (posts, comments, likes, realtime, moderation) |
| Phase 11 | Ödeme & Abonelik (Stripe checkout, webhook, tier-gating) |
| Phase 12 | AI Topluluk Botu (AI Analist badge, premium gate) |
| Phase 13 | Ek Veri & ML Temeli (AlphaVantage, data-providers, ML features) |

### Yol Haritası Step 1-13 — ✅ TAMAMLANDI

| Step | Özellik |
|------|---------|
| 1 | Makro Rüzgar Skoru — SVG gauge widget |
| 2 | Hesap Makineleri — 4 sekme (Pozisyon, R/R, Hedef, Portföy Risk) |
| 3 | Ekonomi Takvimi — AI SSE streaming yorum |
| 4 | Explainable AI Skor — ScoreBreakdown, buildKeyFactors |
| 5 | AI Sohbet — streaming, claude-opus-4-6, portföy bağlamı |
| 6 | Fiyat Alert — price_alerts tablo, cron, email |
| 7 | Portföy P&L — lot takibi, CSV export, GÜÇLÜ SAT badge |
| 8 | KAP + AI özetleme — claude-opus-4-6, HisseDetail entegrasyon |
| 9 | Gelişmiş Screener — 15 sektör filtresi, URL persist, CSV, confluence |
| 10 | AI Bülten — haftalık email, claude-opus-4-6 kişisel piyasa yorumu |
| 11 | Temel Analiz Veri — AlphaVantage F/K, EPS, piyasa değeri |
| 12 | Ters Portföy — portföy dışı fırsatlar, sektör bazlı |
| 13 | Makro Simülatör — 12 senaryo, sektör etki tablosu |

### Bug Fix Sprint — ✅ TAMAMLANDI (2026-03-29)

B1 Cron auth standart, B2 AI Budget atomik, B3 Error sanitizasyon, B4 Prompt injection, B5 IP spoofing, B6 Math safety, B7 Null safety, B8 Timezone fix, B9 Frontend UX, B10 Accessibility

### Backtesting Denetimi — ✅ TAMAMLANDI (2026-03-30)

BT1 Rejim verisi fix, BT2 Giriş fiyatı bias fix, BT3 Komisyon modeli, BT4 Her-mum örnekleme, BT6 Max Drawdown, BT7 Equity Curve (SVG), BT8 Sharpe Ratio, BT9 BIST100 Benchmark, BT10 p-value t-test, BT11 2Y veri desteği

### Ekstra Özellikler (2026-04+)

| Özellik | Dosya | Tarih |
|---------|-------|-------|
| Sinyal Formasyonları (7 adet) | `lib/signals.ts` | 2026-04 |
| Pre-Signal — kesişim öncesi erken uyarı | `lib/signals.ts` | 2026-04 |
| Eğitim Merkezi (/yardim) | `app/yardim/` | 2026-04 |
| Telegram otomasyon | Make.com | 2026-04 |
| BIST_SYMBOLS 295 sembol | `lib/bist-symbols.ts` | 2026-04 |
| Investment Score (hibrit) | `lib/stock-score.ts` | 2026-04-17 |
| Enflasyon düzeltmesi (TÜFE + Fisher) | `lib/stock-score.ts` | 2026-04-24 |
| TR 10Y tahvil faizi | `lib/turkey-macro.ts` | 2026-04-26 |
| Scan cache optimizasyon | `app/api/cron/scan/route.ts` | 2026-04 |
| 4 Aşama Sistemi | `lib/market-phase.ts` | 2026-05 |
| Uzun Vade Fırsatlar | `app/uzun-vade/page.tsx` | 2026-05 |
| 5 Yöntemli Değerleme | `app/hisse/[sembol]/` | 2026-05 |
| Haftanın Seçimleri | `app/haftalik-secimler/page.tsx` | 2026-05-13 |
| Yapay Zeka Portföyü | `app/yapay-zeka-portfoyu/page.tsx` | 2026-05-17 |

---

## Cron Job Tablosu (vercel.json)

| Schedule (UTC) | TRT | Endpoint | Açıklama |
|----------------|-----|----------|----------|
| `0 6 * * 1-5` | 09:00 Pzt-Cum | `/api/cron/macro` | Makro snapshot |
| `30 5 * * 1` | 08:30 Pzt | `/api/cron/weekly-picks` | Haftanın seçimleri al |
| `50 14 * * 1-5` | 17:50 Pzt-Cum | `/api/cron/scan` | Sinyal taraması |
| `50 14 * * 5` | 17:50 Cum | `/api/cron/ai-portfolio` | AI portföy kararları |
| `30 18 * * 5` | 21:30 Cum | `/api/cron/weekly-picks-close` | Kapanış fiyatları güncelle |
| `30 7 * * 1-5` | 10:30 Pzt-Cum | `/api/cron/alerts` | Email uyarıları |
| `30 7 * * 1-5` | 10:30 Pzt-Cum | `/api/cron/price-alerts` | Fiyat alarmları |
| `0 6 * * 1` | 09:00 Pzt | `/api/cron/bulten` | Haftalık AI bülten |
| `0 8 * * *` | 11:00 hergün | `/api/cron/future-scores` | Future Score (US, 13 tema) |
| `0 8 * * 1` | 11:00 Pzt | `/api/cron/future-scores-bist` | Future Score (BIST, 5 tema) |

---

## Supabase Tabloları

| Tablo | Açıklama |
|-------|----------|
| `signal_performance` | Sinyal geçmişi ve performans |
| `macro_snapshots` | Günlük makro gösterge snapshots |
| `ai_cache` | Claude AI açıklama cache |
| `community_posts` + `comments` + `likes` | Topluluk |
| `profiles` | Kullanıcı profilleri + tier |
| `subscriptions` | Stripe abonelik |
| `watchlist` | İzleme listesi |
| `portfolyo` | Portföy holdingleri |
| `alert_subscriptions` | Email/push bildirim tercihleri |
| `price_alerts` | Fiyat alarm kuralları |
| `push_subscriptions` | Web push token |
| `ai_chat_usage` | AI sohbet günlük kullanım |
| `newsletter` | Bülten abonelik |
| `weekly_picks` | Haftanın seçimleri |
| `ai_portfolio_positions` | AI portföy açık pozisyonlar |
| `ai_portfolio_history` | Haftalık portföy değer geçmişi |
| `ai_portfolio_decisions` | Karar audit trail |

---

## Test Kuralı (Her Değişiklik Sonrası)

1. **TypeScript**: `npx tsc --noEmit`
2. **Build**: `npm run build`
3. **Manuel test**: Etkilenen sayfa/bileşeni test et
4. **DevTools**: Console/Network hata kontrolü
5. **Responsive**: Mobil ve desktop (UI değişikliği varsa)

---

## Görev Tamamlama Kuralı (ZORUNLU)

Her görev tamamlandığında bu dosyadaki ilgili satırın yanına durum yazılmalıdır:
- ✅ TAMAMLANDI (tarih)
- 🔵 KISMI (ne yapıldı)
- ❌ İPTAL (neden)

Bu kural her iki takım üyesi ve Claude için geçerlidir.

---

## Ortam Değişkenleri (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...         # cron/webhook handler için
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...                  # email bildirimleri
FRED_API_KEY=...                       # ABD makro verisi
ALPHA_VANTAGE_API_KEY=...             # temel analiz verisi
CRON_SECRET=...                        # cron auth token
NEXT_PUBLIC_SITE_URL=https://...      # production URL
ML_SERVICE_URL=...                     # Python ML servisi (opsiyonel)
# Stripe (hesap açılınca eklenecek):
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_PREMIUM=price_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

---

## Rakip Konumlandırma

| Platform | Fiyat | BistAI Avantajı |
|----------|-------|-----------------|
| Matriks | 500-2000₺/ay | Ücretsiz, modern UI, AI açıklama, AI portföy |
| Bigpara | Ücretsiz | Sinyal tarama, makro bağlam, backtest |
| TradingView | $15-60/ay | Türkçe, BIST odaklı, AI |
| Fintables | ₺ | Teknik + temel entegrasyon, AI karar |

**Boş alan:** BIST odaklı + Türkçe + AI sinyal + Gerçek backtest + Sanal AI portföy → hiçbir rakip bu kombinasyonu sunmuyor.
