# Investable Edge — Claude Code Proje Hafızası

> Bu dosya Claude Code tarafından otomatik okunur. Tüm ekip üyeleri aynı bağlamı paylaşır.
> Son güncelleme: 2026-07-01

---

## 🎨 YENİ TASARIM — Frontend Redesign (Modern-Minimalist Açık Tema) — DEVAM EDİYOR

> **Bu, AKTİF frontend iş akışıdır. Tasarım işine yeni pencerede devam ederken BURAYI oku.**
> Ekran-ekran ilerliyor; aşağıdaki 6 ekran CANLI (main'de), kalanlar revize aşamasında.

### Bağlam & kaynak paket
- **`design_handoff_bistai/`** (repo kökü): tasarım teslim paketi. **`README.md` = tam spec**
  (renk/tipografi token'ları, her ekranın layout'u, etkileşimler, auth kuralı, veri modeli).
  `*.dc.html` = yalnız **görsel referans** (porting ETME; `support.js` runtime'ı TAŞIMA).
- Hedef: borsa bilmeyen kullanıcıya basit "Bugün ne yapmalıyım?" deneyimi; açık tema,
  minimalist, kendi kabuğu (AppShell). Mevcut veri katmanları/API'ler aynen kullanılır.

### Mimari / DESEN (yeni ekran eklerken birebir izle)
1. `components/new/<Ekran>Screen.tsx` — `'use client'`, tasarım token'larıyla, **mevcut API'leri** tüketir.
2. `app/<route>/page.tsx` — eski dev sayfayı `<AppShell><Ekran/></AppShell>` ile **DEĞİŞTİR**
   (metadata + thin wrapper; eski kod git geçmişinde — fonksiyon kaybetme, koru/taşı, gerekirse kullanıcıya sor).
3. `lib/new-design-routes.ts` → `NEW_DESIGN_ROUTES`'a route ekle → `components/ChromeGate.tsx`
   eski global `Navbar`/`Footer`'ı o rotada gizler (yeni ekran kendi kabuğunu getirir).
4. Auth gerekiyorsa `middleware.ts` matcher + koruma listesine ekle.
- **Kabuk:** `components/new/AppShell.tsx` — masaüstü sol sidebar + üst topbar, mobil alt tab bar.
  Sidebar/tab route'ları: /bugun /firsatlar /portfolyo /makro /ai-portfoyler /sohbet /profil.

### Tasarım token'ları (`tailwind.config.js`'te TANIMLI — bunları kullan)
`ink #16181d` · `up #16a35b` · `up-on-dark #3fce8a` · `down #e5484d` · `ai #6b6ff5` ·
`ai-on-dark #8b8fff` · `t2 #7b818c` · `t3 #9aa0ad` · `t4 #b4b8bf` · `page #fcfcfd` ·
`panel #fff` · `fill #f4f5f6` · `hairline #eef0f2` · `ai-panel #faf9ff` ·
`ai-panel-border #ece9fb` · `up-badge #eaf7ef`. Font: `font-manrope` (gövde), `font-mono`
(JetBrains Mono — **TÜM fiyat/yüzde/sayı**). Fontlar `app/layout.tsx`'te yüklü.

### Tamamlanan ekranlar (6 — CANLI, main'de)
| Ekran | Route | Component | Veri kaynağı | Korunan / sadeleştirilen |
|-------|-------|-----------|--------------|--------------------------|
| Bugün | `/bugun` | `BugunScreen` | /api/smart-signal + /api/watchlist + /api/macro(+history) | verdict listesi (watchlist→top8 fallback), Makro/Rejim/Risk metrikleri, BIST100 kartı, değişim% |
| Portföyüm | `/portfolyo` | `PortfoyumScreen` | /api/portfolyo + /api/ohlcv | **ekle/düzenle/sil** + CSV + hedef-fiyat; e-posta bildirim → Profil'e taşındı |
| Fırsatlar | `/firsatlar` | `FirsatlarScreen` | /api/firsatlar | filtre çipleri (Tümü/Momentum/Akıllı Para/Katalist) + skor barı + verdict + etiket; en yüksek 50 |
| Piyasa | `/makro` | `PiyasaScreen` | /api/macro + /api/sectors | makro kartları + sektör diverging barları + kompakt göstergeler; skor/risk → Bugün'de |
| AI Asistan | `/sohbet` | `AiAsistanScreen` | /api/chat (SSE) | **streaming sohbet** + öneri çipleri; oturum geçmişi sidebar'ı sadeleştirildi |
| Profil | `/profil` | `ProfilScreen` | /api/profile + portfolyo/watchlist | tier + istatistik + **çalışan bildirim toggle** (newsletter_enabled, PATCH) + çıkış |

### Giriş / Kayıt + Onboarding (✅ TAMAMLANDI 2026-07-02) — yeni handoff `design_handoff_kalan_ekranlar/`
| Ekran | Route | Component | Not |
|-------|-------|-----------|-----|
| Karşılama / Giriş | `/giris` | `GirisScreen` | koyu hero + beyaz form; email/şifre (signInWithPassword) + Google/Apple (signInWithOAuth) + şifremi-unuttum + redirect param (open-redirect koruması). Giriş sonrası onboarded değilse → `/karsilama` |
| Kayıt | `/kayit` | `KayitScreen` | aynı dil; Ad/Soyad/E-posta/Şifre (signUp + user_metadata) + e-posta doğrulama success. Oturum açıldıysa → `/karsilama` |
| Onboarding | `/karsilama` | `KarsilamaScreen` | Risk Profili (2/3) + İlgi Alanları (3/3). Seçimler **user_metadata**'ya (`risk_profile`, `interests`, `onboarded:true` — MIGRATION YOK). Bitince → `/bugun`. Auth korumalı |
- `/giris`,`/kayit`,`/karsilama` → `NEW_DESIGN_ROUTES` (eski chrome gizli). `middleware.ts` `/karsilama` auth-korumalı.
- `app/auth/callback/route.ts`: e-posta onay/OAuth sonrası onboarded'a göre `/karsilama` veya `/bugun` (eski `/dashboard` kaldırıldı).
- **BEKLEYEN MANUEL ADIM:** Supabase panelinde Google/Apple OAuth provider'ları açılmalı (açılana dek sosyal butonlar zarif hata verir). Migration gibi manuel dashboard adımı.

### Auth yönlendirme (`middleware.ts`)
Oturum varsa → `/bugun` (giriş/kayıt/kök yönlenir); yoksa → `/giris`. Korumalı: `/bugun`, `/karsilama`,
`/portfolyo`, `/profil` (+ eski liste). Public: `/firsatlar`, `/makro`, `/sohbet` (chat API auth ister).

### Bu redesign için yapılan BACKEND eklemeleri
- `lib/macro-service.ts` `formatMacroResponse` → yanıta **`risk`** alanı (Bugün metrikleri).
- `lib/smart-signal` → `SmartSignalResult`'a **`changePercent`** (engine + types + cron `scan_cache.change_percent` select).

### KALAN İŞ (revize aşaması — kullanıcı talimat verecek)
- ✅ TAMAMLANDI (2026-07-02): **Tarama** (`TaramaScreen` — basit filtre kurucu, /api/screener; eski
  gelişmiş screener git geçmişinde), **Sektör detay** (`SektorDetayScreen` — /api/sectors?id + OHLCV
  fan-out; `/sektorler` listesi ESKİ temada), **AI Portföyleri** (`AiPortfoyleriScreen` — 5 gerçek
  portföy API'si + risk filtreleri; apex/aegis detay sayfaları eski temada), **Yardım** (`YardimScreen`
  — SSS + arama; formasyon/sinyal rehber içeriği KORUNDU, `/yardim/*` alt sayfaları eski temada).
  `lib/new-design-routes.ts` artık 3 liste: prefix + `NEW_DESIGN_EXACT` (/yardim) +
  `NEW_DESIGN_CHILD_ONLY` (/sektorler).
- **Henüz ESKİ koyu tema** (redesign bekliyor — handoff: `design_handoff_kalan_ekranlar/bistAI Kalan Ekranlar.dc.html`):
  **Hisse detay** (`/hisse/[sembol]`) — eski sayfa çok zengin (Temel/Haberler/KAP sekmeleri, 5 yöntemli
  değerleme); fonksiyon envanteri çıkarılıp korunarak taşınmalı. (Giriş/Kayıt+Onboarding ✅ bitti.)
- Ekran-ekran geçişte yeni→eski sayfa link karışımı NORMAL (eski navbar eski sayfalarda görünür;
  tüm ekranlar geçince eski kabuk tamamen kaldırılacak).
- **Bilinen:** preview `screenshot` aracı bu oturumda uzun yeni-tasarım sayfalarında zaman aşımına
  uğradı (sayfa sağlam — `preview_eval` + konsol ile doğrulandı). Auth-gated ekranların VERİ görseli
  oturum gerektirir → Vercel preview deploy'da giriş yapıp doğrula.
- Revize işi (renk/spacing/etkileşim ince ayarı, eksik ekranların redesign'ı) için kullanıcı
  ayrı pencerede talimat verecek.

### Doğrulama kuralı (her yeni ekran)
`npx tsc --noEmit` + `npm run build` temiz olmalı. Public ekranlar gerçek veriyle preview'de doğrulanır.
Migration GEREKMEZ (saf UI + mevcut API'ler).

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
| `20260617_baby_picks.sql` | baby_picks tablosu (Bebek Hisseler forward-tracking, 4/12/26h + BIST benchmark) | ✅ Çalıştırıldı (2026-06-24) |

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

## ⚡ FAZ 2 — Kısa Vade Fırsatlar Güçlendirme (2026-06-13) ✅ TAMAMLANDI

> Plan: `GUCLENDIRME-PROMPTU.md` FAZ 2. **Migration YOK** (ai_cache tek satır deseni).

| Bileşen | Dosya |
|---------|-------|
| **Bilanço yakınlığı faktörü** — yaklaşan bilanço binary event; ≤5 takvim günü (~3 işlem günü) → −8 + güven düşüşü; geçmiş bilanço (gün<0) cezasız. `daysUntilEarnings` decision girdisi, `earningsRisk` DecisionFactors | `lib/decision-engine.ts` (v1.2.0) |
| Bilanço tarihi Yahoo `calendarEvents` modülünden — `fetchYahooFundamentals`'a eklendi (mevcut quoteSummary çağrısına tek modül, ekstra istek yok); `nextEarningsTimestamp` + `daysUntilEarnings()` helper | `lib/yahoo-fundamentals.ts` |
| **İstek-anı Yahoo fan-out KALDIRILDI** — `/api/firsatlar` her açılışta ~140 paralel `fetchYahooFundamentals` çağırıyordu (cold start'ta Yahoo'ya yük). Artık cron precompute eder → route tek satır okur | `lib/firsatlar-fundamentals-runner.ts` (YENİ), `app/api/firsatlar/route.ts` |
| Precompute cron: aktif fırsat sembolleri (firsatlar ile aynı filtre) → Yatırım Skoru + bilanço tarihi → ai_cache `firsatlar-fundamentals:BIST` (36h TTL) | `app/api/cron/firsatlar-fundamentals/route.ts` (YENİ), `vercel.json` (08:15 TRT) |
| hisse-analiz girdi eşitliği: bilanço tarihi de besleniyor (tek hisse, tek çağrı, 24h cache) — firsatlar ile aynı `earningsRisk` | `app/api/hisse-analiz/route.ts` |
| UI: FirsatKarti'na **sektör + hacim + 📅 bilanço** şeffaflık rozetleri (FAZ 0/BUG-E sectorAlign+volumeConfirm artık görünür) | `components/FirsatKarti.tsx` |
| Birim testler (4 yeni earningsRisk senaryosu) | `lib/__tests__/decision-engine.test.ts` |

**Önemli kararlar:**
- earningsRisk yön-bağımsız (bilanço hem long hem short için belirsizlik). Eşik ≤5 takvim
  günü; geçmiş bilanço cezalandırılmaz (etki haberle zaten fiyatlandı → BUG-D katalist/event
  riski yakalar, çifte sayım yok).
- Investment score precompute, firsatlar'ı Yahoo'ya bağımlı olmaktan çıkardı — store yoksa
  rozet gösterilmez ama skor yine decision'dan üretilir (zarif düşüş).

**Doğrulama (canlı veri, dev+prod DB):** 67/67 test, tsc+build temiz. Gerçek Yahoo bilanço
tarihleri doğru (ASELS/GARAN Nisan→geçmiş cezasız; THYAO/TUPRS Ağustos→uzak). Yapay enjeksiyon:
THYAO bilanço 3 gün → earningsRisk −8, skor 66→58, güven sıfırlandı (uçtan uca zincir).
Precompute prod store'u 159 fırsat sembolüyle doldurdu (deploy sonrası sayfa hemen çalışır).
FirsatKarti rozetleri render edildi (hacim 21 kart, sektör 1).

**✅ Geçmiş Fırsatlar `stats.winRate` BUG düzeltildi:** Eski hesap `return_7d - COMMISSION*100`
yapıyordu — decimal getiriden (0.05) %40 sahte komisyon çıkarıyordu → winRate %3.3'e çöküyordu.
Artık kanonik ufuk (`getCanonicalField`) + yön-düzeltmeli (`asagi` → işaret çevir) + doğru
komisyon (decimal 0.004). Canlı: %3.3 → **%55.3** (83/150 kazanan, avgReturn %14 ile tutarlı).
`app/api/gecmis-firsatlar/route.ts`.

**⏸️ Geçmiş Fırsatlar SAYFA geri açma hâlâ ERTELENDİ:** Veri kalitesi + winRate artık doğru
AMA entry tarihleri hâlâ 10-24 Nisan'da takılı — Mayıs/Haziran sinyalleri evaluate
backlog'unda (62.893 pending). FAZ 0 evaluate fix'i prod'a yeni gitti, backlog erimedi.
Backlog erip güncel fırsatlar görününce NavbarClient yorumunu kaldır ("1-2 ay" notu geçerli).

**Deploy sonrası:** firsatlar-fundamentals cron'u Pzt sabah otomatik çalışır; hafta sonu
deploy edildiyse prod store zaten manuel dolduruldu (159 sembol).

---

## 🔭 FAZ 1 — Uzun Vade Fırsatlar Yeniden İnşası (2026-06-12) ✅ TAMAMLANDI

> Plan: `GUCLENDIRME-PROMPTU.md` FAZ 1. **Migration YOK** (ai_cache tek satır deseni).

**Sorun:** `/uzun-vade-firsatlar` ~60 hisselik HARDCODED listeyle çalışıyordu (evren 619);
in-memory cache cold start'ta uçuyor, istek anında ~60 sembol Yahoo fan-out; temel analiz
yığını (Piotroski/Altman/Beneish, peer, GARP, growth-momentum) sayfaya hiç bağlı değildi.

| Bileşen | Dosya |
|---------|-------|
| Bileşik skor motoru: inv(35)+sağlık(25)+peer(20)+büyüme(20), null bileşende ağırlık yeniden normalize (banka cezasız); Beneish şüpheli ×0.80 / gri ×0.93, Altman sıkıntı ×0.85 çarpan kısması | `lib/long-term-runner.ts` (YENİ) |
| Haftalık cron: `?part=1\|2\|3`, ADV≥5M TL ön filtresi (scan_cache mumlarından — Yahoo'ya gitmeden eler), sonuç ai_cache `long-term:BIST` (8g TTL, max 400 satır) | `app/api/cron/long-term/route.ts` (YENİ) |
| API v3: hardcoded liste + in-memory cache SİLİNDİ; temel katman ai_cache'ten + teknik katman (fiyat/confluence/sparkline) scan_cache'ten taze — istek anında Yahoo YOK | `app/api/uzun-vade-firsatlar/route.ts` (yeniden yazıldı) |
| UI: başlık skoru = longTermScore; rozetler: GARP verdict + Piotroski n/9 + Beneish uyarı + peer etiketi + büyüme skoru | `app/uzun-vade-firsatlar/page.tsx` |
| Cron schedule: Pzt 10:30/10:40/10:50 TRT (sector-medians 10:00'dan SONRA); haftanin-secimi-uzun 09:45→11:10 TRT (yeni store'u okusun) | `vercel.json` |
| Birim testleri (11 senaryo: bileşik, kısma, banka normalize, sağlık türetme) | `lib/__tests__/long-term-runner.test.ts` (YENİ) |

**Önemli tasarım kararları:**
- Güvenilmez peer (sektörde <5 emsal) bileşiğe KATILMAZ — küçük sektörde medyan sapması
  relativeScore'u 100'e clamp'leyip skoru haksız şişiriyordu (canlıda görülüp düzeltildi).
- `deger_firsati` kategorisi artık peer-ucuz + GARP "fırsat" ile de tetiklenir.
- haftanin-secimi-uzun cron'u API şemasını aynen tüketmeye devam eder (geriye uyumlu).

**Doğrulama (canlı veri, dev+prod DB):** Tam evren koşusu 212s (570 likit, 495 skor, 0 veri
hatası → part başına ~70s, 300s limite geniş marj). API 150 sonuç döndü, **128'i eski
hardcoded listede yoktu** (AYDEM, SANKO, LKMNH, DESA...). Bankalar doğru: GARAN LV=70,
sağlık "uygulanmaz", ceza yok. Kategoriler: 39 çift onay / 54 değer fırsatı / 57 güçlü temel.
63/63 test, tsc + build temiz. **ai_cache `long-term:BIST` dev koşusuyla DOLU** — deploy
sonrası sayfa hemen çalışır; bir sonraki Pzt cron otomatik tazeler.

---

## 🛠️ FAZ 0 — Hesaplama Hataları Sprint'i (2026-06-12) ✅ TAMAMLANDI

> Denetim + tam plan: `GUCLENDIRME-PROMPTU.md`. Bu sprint FAZ 0 + 2 canlı şikâyeti kapattı.
> **Migration YOK** — tüm değişiklikler kod seviyesinde.

| Fix | Kök Neden | Dosyalar |
|-----|-----------|----------|
| **US sızıntısı** — BIST fırsatlarında ABD hisseleri (canlıda RSG/MDLZ/CVS doğrulandı) | `/api/firsatlar` ana sinyal + persistence sorgusunda market filtresi yoktu; Supabase 1000-satır tavanında US satırları BIST'i itiyordu | `api/firsatlar/route.ts` (`market.eq.BIST,market.is.null` + `.limit(1000)`) |
| **scan-cache 17:50 güvencesi** — koşu ?part=1\|2 ile İKİ PARALEL YARI (her biri ~310 sembol, BATCH_SIZE 12, ~150s, 300s limite geniş marj). part'sız = tüm evren (manuel) | Tek koşu ~215s + Vercel cron gecikmesi → sinyal yazımı (koşunun SONUNDA) timeout'ta tamamen kayboluyordu | `cron/scan-cache/route.ts`, `vercel.json` (3 koşu × 2 part = 6 entry, hepsi aynı dakika: 07:30/12:00/17:50 TRT) |
| **BUG-A** — SIGNAL_MIN_DAYS senkron kopukluğu: 12 formasyon/pre-signal tipi 7. günde kapanıp 14g/30g kanonik returnları kalıcı null kalıyordu → win-rate döngüsünden dışlanma | evaluate-engine yerel tablosu eskimişti; canonical harita 4 dosyada kopyaydı | **`lib/signal-horizons.ts` (YENİ, tek kaynak)**; evaluate-engine, firsatlar, firsatlar-us, signal-stats-summary, hisse-analiz oradan import |
| **BUG-A kronik kök** — `cron/evaluate` maxDuration YOKTU (Vercel 15s default) → günde ~30-50 kayıt, dev backlog | 15s'de kesilen koşu | `cron/evaluate/route.ts` (**maxDuration=300** + response'a `remaining` backlog sayacı) |
| **BUG-A onarım** — kanonik ufku null kalmış evaluated=true kayıtları yeniden açan endpoint; **38 kayıt onarıldı (apply edildi, 2026-06-12)** | — | `api/dev/repair-evaluations/route.ts` (YENİ; `?apply=true`, CRON_SECRET, idempotent) |
| **BUG-B** — BIST win-rate istatistiği US kayıtlarıyla kirleniyordu | stats sorgularında market filtresi yoktu | `api/firsatlar`, `api/signal-stats-summary` (+`?market=US` param), `api/hisse-analiz` `fetchHistoricalWinRate(market)` |
| **BUG-C** — aynı hisse iki sayfada farklı skor: firsatlar'da riskScore/sektör yok, hisse-analiz'de katalist/KAP yok | "tek karar motoru" farklı girdilerle çağrılıyordu | firsatlar: +riskScore (getMacroFull'dan hazır) +sectorMomentum +relVol5; hisse-analiz: +catalyst +kapRisk (ai_cache `news-catalyst:BIST` tek satır) +relVol5 (canlı hesap) |
| **BUG-D** — KAP faktörü prod'da ölü (kap.org.tr bloklu, kapEvent hiç tetiklenmiyordu) | fetchKapDuyurular bloklu kaynağa gidiyordu | `lib/news-impact.ts` **`deriveEventRisk`** (Sermaye/Hukuk-Risk her zaman; Finansal Sonuç/Yönetim yalnızca nötr başlıkta → katalist faktörüyle çifte sayım yok); news-catalyst cron payload'a `eventRisks` eklendi; firsatlar `fetchKapDuyurular`'ı bıraktı |
| **BUG-E** — atıl altyapı bağlandı: `sectorAlign` (±25 eşik, hizalı +5 / ters −6) + `volumeConfirm` (rel_vol5 ≥1.5 → +4, <0.7 → −4) | `void _sectorMomentum` rezervi + rel_vol5 sadece tavan skorundaydı | `lib/decision-engine.ts` (v1.1.0); firsatlar sektör momentumunu **scan_cache.candles_json'dan** hesaplar (temsilci hisseler, Yahoo fan-out YOK) |
| **Bonus** — signal-stats-summary'de yeni tipler yanlış "7g" etiketi alıyordu | SIGNAL_HORIZON_LABEL eski 9 tiple sınırlıydı | etiket kanonik ufuktan türetilir |

**Doğrulama:** 52/52 birim test (13 yeni: `lib/__tests__/decision-engine.test.ts`), tsc temiz,
build başarılı. Dev sunucu + prod DB e2e: US sızıntısı TEMİZ, volumeConfirm 71 sembolde,
sectorAlign enerji sektöründe doğru yönde (düşen sektörde long −6 / short +5) tetiklendi.

**Deploy sonrası yapılacaklar:**
1. Push + deploy sonrası news-catalyst cron'unu manuel tetikle (eventRisks dolsun):
   `curl -H "Authorization: Bearer $CRON_SECRET" https://bistai.vercel.app/api/cron/news-catalyst`
2. `cron/evaluate` response'unda `remaining` izle — backlog birkaç günde erimeli; erimezse
   ikinci günlük koşu ekle.
3. 17:50 koşusunu ertesi gün doğrula: `/api/firsatlar` `lastRefreshedAt` ≈ 17:50-17:53 TRT olmalı.

---

## 🚀 Büyüyen Şirketler — temel büyüme momentumu tarayıcısı (2026-06-10) ✅ TAMAMLANDI

İşi büyüyen (gelir↑), kârlılığı artan (net marj + net kâr↑) ve EPS'i yükselen şirketleri
tüm BIST evreninde tarayıp tek 0-100 skoruyla **sıralayan** yeni ekran. Hesaplama mantığı
mevcut `fundamental-health.ts` üstüne kuruldu (yeniden yazma yok); eksik olan tek şey
evren-geneli tarayıcı/sıralama katmanıydı.

| Bileşen | Dosya |
|---------|-------|
| Skorlama motoru (saf TS, deterministik) | `lib/growth-momentum.ts` (YENİ) |
| Çalıştırıcı + ai_cache store (merge'li, **migration YOK**) | `lib/growth-momentum-runner.ts` (YENİ) |
| BIST cron (`?part=1\|2` bölme + bistGuard + reel enflasyon) | `app/api/cron/growth-momentum-bist/route.ts` (YENİ) |
| Okuma API (`?market=BIST\|US`) | `app/api/growth-momentum/route.ts` (YENİ) |
| Sayfa + UI (toggle, EPS sparkline, kalite rozeti, stale uyarı) | `app/buyuyen-sirketler/page.tsx` + `components/BuyuyenSirketler.tsx` (YENİ) |
| Navbar linki (Piyasa dropdown) | `components/NavbarClient.tsx` |
| Cron schedule (Pzt 09:00 + 09:20 TRT) | `vercel.json` |
| Birim testleri (6 senaryo) | `lib/__tests__/growth-momentum.test.ts` (YENİ) |

**Skor (0-100):** gelir büyümesi(25) + net kâr büyümesi(25) + EPS trendi(20) + marj
genişlemesi(15) + tutarlılık(15), × kalite çarpanı (Beneish şüpheli/Piotroski<3/zayıf
kazanç kalitesi → kısılır). **BIST'te büyümeler enflasyonla REELLEŞTİRİLİR.** Bankalar
`isFinancialSector` ile hariç. EPS = netIncome/shares → hisse seyrelmesi cezalandırılır.

**ai_cache anahtarı:** `growth-momentum:BIST` (tek JSON satır, 21g TTL). 619 sembol ×
fundamentalsTimeSeries ağır → cron `?part=1\|2` ile ikiye bölünür, her parça kendi dilimini
merge eder (scan-cache 17:50 timeout dersi). part'sız çağrı = tüm evren (manuel test).

**Doğrulama:** 6/6 birim testi geçti. Canlı Yahoo (TÜFE≈35 sanity): ASELS=87 güçlü büyüme
(net kâr reel +151%), FROTO=28 küçülüyor (nominal +37% ama reel −28% — enflasyon düzeltmesi
çalışıyor), GARAN=uygulanmaz (banka). tsc temiz, build başarılı.

**Bekleyen:** Push + deploy sonrası cron'u manuel tetikle (`curl ?part=1` & `?part=2`),
ai_cache doluyor mu + `/buyuyen-sirketler` sayfası sıralı liste gösteriyor mu doğrula.
US tarayıcısı sonraki adıma bırakıldı (BIST-öncelik).

---

## 🐛 scan-cache 17:50 koşusu tetiklenmiyordu — FIX (2026-06-09) ✅

**Belirti:** Kısa Vade Fırsatlar (BIST) sayfasında 17:50 TRT taraması güncellenmiyordu;
07:30 ve 12:00 koşuları çalışıyordu.

**Kök neden (timeout, config değil):** `vercel.json` doğru (`50 14 * * 1-5` = 17:50 TRT,
deploy edilmiş, Vercel aynı-path'i `x-vercel-cron-schedule` ile destekliyor). Asıl sorun:
evren 295→**619** sembole büyümüş, `maxDuration` **300s**'de kalmıştı. Tarama **~299s**
sürüyordu (limitin 1sn altında). 17:50 günün en ağır anı (BIST kapanışına 10dk, Yahoo en
yavaş, en çok sinyal) → düzenli olarak 300s'i aşıp `FUNCTION_INVOCATION_TIMEOUT` ile
öldürülüyordu. Hafif koşular (07:30/12:00) sınırın altında bitiyordu.

**Çözüm (`app/api/cron/scan-cache/route.ts`):** Throughput artırıldı — `BATCH_SIZE` 10→**20**,
`BATCH_DELAY` 250→150ms. Batch sayısı 62→~31. `maxDuration` 300'de bırakıldı (Fluid Compute
kapalıysa >300 build'i kırar).

**Doğrulama (canlı, production):** Eski kod 17:43 TRT'de **298.9s** (limitin 1sn altı). Ara
ölçüm (BATCH_SIZE=15, midday) **261.6s** — tam tamamlandı, `failed`=7 sabit (Yahoo zorlanmadı).
15→20'de de failed 7'de kaldığı için 20'ye çıkıldı (hedef ~215s, ~85s marj).

**Manuel tetikleme:** `curl -H "Authorization: Bearer $CRON_SECRET" https://bistai.vercel.app/api/cron/scan-cache`

**Opsiyonel robustluk (önerildi, bekliyor):** Vercel → Settings → Functions → **Fluid Compute**
aç → `maxDuration` 600-800'e çıkarılabilir (evren büyümeye devam ederse).

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
`lib/financial-statements.ts` (Yahoo `fundamentalsTimeSeries`, 5 yıl, BIST+US) + `lib/fundamental-health.ts` (Piotroski F-Score 0-9, Altman Z'' gelişmekte-olan-piyasa varyantı, kazanç kalitesi=accruals+FCF dönüşümü, CAGR+marj trendi). Bankalar/finansal → Piotroski/Altman "uygulanmaz". `/api/fundamental-health` + `components/FinansalSaglik.tsx` → hisse detay "Temel" sekmesi. Doğrulandı: ASELS 6/9 Z''=6.99, TUPRS 7/9, AAPL 8/9, GARAN N/A.

### ✅ Temel Analiz Faz 2A (2026-06-05) — sektör-bazlı değerleme
`lib/sector-valuation.ts`: sektör profilleri (banka=F/DD+F/K+ROE, EV/FAVÖK&cari oran yok, ROE ağırlıklı; sigorta benzer; GYO=F/DD+temettü, borç dahil; sanayi=mevcut). `lib/investment-score.ts` `ScoringProfile` parametresi aldı (computeValuation/computeRisk profile-driven, confidence ratio-bazlı — 33 donmuş test geçer). Route `valuationModel` döndürür, `InvestableScoreCard` sektör rozeti + dinamik ağırlık gösterir. Düzeltme: bankalar artık confidence medium→high + banka-uygun F/K aralığı (default onları ultra-ucuz gösteriyordu).

### ✅ Temel Analiz Faz 2B (2026-06-05) — peer/sektör görece değerleme
`lib/sector-medians.ts` (tüm BIST evreni → sektör başına F/K/F/DD/EV-FAVÖK/ROE/marj medyanı, **ai_cache'te saklanır — migration YOK**) + `lib/peer-valuation.ts` (çarpan vs medyan % iskonto/prim + relativeScore 0-100 + label; ROE ayrı kalite; aşırı çarpan ±%100 clamp; count<5 → reliable=false). `/api/cron/sector-medians` (Pzt 07:00 UTC, ai_cache) + `/api/peer-valuation` + `components/PeerDegerleme.tsx` → hisse detay "Temel" sekmesi. Doğrulandı (canlı, banka n=17): ALBRK relScore=100 (ucuz+ROE yüksek), HALKB=0 (pahalı+ROE düşük), GARAN=63, EKGYO=57 (clamp sonrası dengeli).

### ✅ Temel Analiz Faz 2C (2026-06-05) — ileriye dönük GARP verdict
Saf görece değerleme geriye dönük → "pahalı" prim büyüme/kaliteyle haklı olabilir (ASELS). `lib/forward-outlook.ts`: büyüme-kalite skoru (reel net kâr + ROE-emsal + analist konsensüsü + marj genişlemesi) + analist momentum + **2×2 verdict** (fırsat / pahalı-ama-haklı / değer tuzağı / gerçekten-pahalı). `lib/news-catalyst.ts`: canlı RSS'te şirket+sözleşme/ihale/sipariş tarama (gerçek sipariş defteri Yahoo'da yok→proxy). `yahoo-fundamentals`'a analist alanları eklendi. `/api/forward-outlook` + `components/GelecekGorunumu.tsx` → Temel sekmesi. Doğrulandı (canlı): ASELS=🔵"pahalı ama haklı", GARAN=🟢fırsat, HALKB=🔴gerçekten pahalı.

### ✅ Temel Analiz Faz 3 (2026-06-05) — Beneish M-Score + DuPont
`lib/financial-statements.ts`'e alacaklar/MDV/faaliyet gideri/amortisman eklendi. `lib/fundamental-health.ts`: **Beneish M-Score** (8 değişkenli kâr manipülasyonu tespiti, M>-1.78 şüpheli; bankalara uygulanmaz) + **DuPont** (ROE = net marj × varlık devir hızı × kaldıraç — ROE'nin kaynağını gösterir). `FinansalSaglik` UI'a Beneish + DuPont kartları. `/api/fundamental-health` otomatik döndürür. Doğrulandı (canlı): ASELS M=-2.27 temiz / DuPont marj-odaklı; GARAN Beneish N/A / DuPont kaldıraç 10.24 (banka). **Açık: KAP, ekonomi takvimi.**

> **Temel Analiz yığını tamam:** Yatırım Skoru (sektör-bazlı) + Finansal Sağlık (Piotroski/Altman/Beneish/DuPont/trend) + Sektöre Göre Değerleme (peer) + İleriye Dönük (GARP verdict + analist + katalist).

### ✅ Hisse haberleri — her hisseye özgü (2026-06-05)
KAP onarımı denendi → **kap.org.tr yeni Next.js sitesi sunucu erişimini blokluyor** (eski API HTTP 666, /tr/api POST blackhole, RSS ölü, Vercel'den de bloklanır). Üçüncü taraf temiz genel-KAP yok. Yahoo BIST haberi alakasız (global çöp). **Çözüm:** `app/api/haber/route.ts`'e **Google News RSS** (`"{SEMBOL}" hisse`, hl=tr) birincil sembol-bazlı kaynak eklendi — Türk finans sitelerini (Mynet/Investing TR/Paratic/BloombergHT) indeksler → **HER BIST hissesi (295, küçükler dahil) kendi Türkçe haberini alır**, KAP-tipi bildirimler (ihale/sözleşme) de yüzeye çıkar. Tırnaklı tam-eşleşme çakışmaları çözer (GARAN≠GRNYO, DEVA≠parti). Doğrulandı: GARAN/DEVA/ASELS/PASEU/KONTR/EUPWR hepsi sembol-özgü. **Açık: ekonomi takvimi.**

### ✅ Haber Fiyatlandı mı? — materyalite + event-study etki (2026-06-07)
Her hissenin haberlerini önem (materyalite) bazında süzüp her material haber için
**"bu haber fiyatlandı mı?"** sorusunu fiyat+hacim tepkisiyle yanıtlar.
- `lib/news-impact.ts`: kural-tabanlı materyalite (yüksek/orta/gürültü) + **windowed
  event-study** — olayı izleyen ~3 işlem günü tepki penceresinde anormal getiri
  (hisse − BIST100, β=1) + **hacim z-skoru** + anticipation tespiti. **Kritik içgörü:**
  AR "şimdiye kadarki sürüklenme" değil, kısa tepki penceresi CAR'ı (eski haberde
  doğru ölçüm). Verdict matrisi: tepki büyüklüğü × pencere kapandı mı → fiyatlandı /
  fiyatlanıyor / henüz-fiyatlanmadı / tepkisiz. Tazelik+etki bileşik öncelik sırası.
  Eşik: max(%3, 1.5×günlük σ). 60 günden eski haber elenir.
- `lib/symbol-news.ts`: sembol-bazlı Google News çekici (`"{SEMBOL}" hisse`, zaman damgalı).
- `lib/news-impact-ai.ts`: **opsiyonel AI katmanı** — en üst ~5 haberi TEK batch Claude
  Haiku çağrısıyla materyalite(1-5)+duygu+1 cümle ile zenginleştirir. `ai_cache` (migration
  YOK) + günlük bütçe koruması; AI≥4 → rozet yükselt, AI=1 (Genel) → gürültüye düşür.
  Hata/bütçe/anahtar yoksa kural-tabanlıya zarifçe düşer.
- `app/api/news-impact/route.ts?symbol=X`: 90g günlük OHLCV + BIST100/S&P (US), 30dk cache.
- `components/HaberEtkisi.tsx` → hisse detay **"Haberler" sekmesi** (KAP'ın üstünde):
  materyaliteye sıralı, fiyatlandı-rozetli liste + AR% + hacim spike + anticipation +
  AI duygu/not, gürültü toggle, özet, "olasılıksal/tavsiye değil" notu.

**Gerçek veriyle doğrulandı (dev runtime, ASELS):** THYAO ateşkes rallisi ham +10.7% ama
AR +1.8% → "tepkisiz" (piyasa geneli, doğru ayıklama); ASELS BofA satışı AR -7.4% +
hacim 1.7×⚡ → "fiyatlandı"; "BofA devam ediyor" (taze) → "henüz fiyatlanmadı" (unpriced=1).
AI: BofA→olumsuz, temettü→nötr/mat4, fiyat-sorgusu→gürültü. **Açık: ekonomi takvimi.**

### ✅ Kısa Vade Fırsatlar — Haber Katalisti overlay (2026-06-07)
Fırsatlar denetimi sonrası: sayfa %100 teknikti, en kritik boyut KATALİST eksikti
(KAP yalnızca cezaydı, işaret-kör). Çözüm — teknik sinyale haber çapraz kontrolü:
- `lib/news-impact.ts` `deriveCatalyst`: fırsat overlay'i için tek-sembol katalist
  (en aksiyon-alınabilir = fiyatlanmamış/taze/material öncelikli). **AR-doğrulamalı
  etkin materyalite** (kural "orta" ama büyük AR+hacim → "yüksek"; AI'sız flow tespiti).
  **BUG FIX: tr-locale lowercase** — `'TEKNİK ANALİZ'.toLowerCase()` birleşik-noktalı 'i̇'
  üretiyordu → ALL-CAPS gürültü başlıkları materyalite filtresini kaçırıyordu.
- `lib/decision-engine.ts`: **catalyst faktörü (±12)** — teyit(+)/çelişki(−), güvene yansır.
- `app/api/cron/news-catalyst`: precompute (top 70 fırsat sembolü, **AI'sız → bütçe yakmaz**)
  → `ai_cache` tek satır (**migration YOK**). `vercel.json`: 2×/gün (08:00 + 12:30 TRT,
  scan-cache sonrası). `/api/firsatlar` katalisti TEK sorguyla okur (**istek-zamanı fan-out YOK**).
- `FirsatKarti`: 🗞️ rozet (destekli / zaten fiyatlandı / ⚠️ çelişiyor); `firsatlar/page`: filtre.

**3-yönlü matris:** taze+hizalı=teyit(+) · zaten fiyatlandı=tükenme · ters haber=çelişki(−).
**Doğrulandı (dev e2e):** pozitif unpriced katalist DAGI 73→83; ters katalist TTKOM 60→48;
EREGL temettü(yüksek/unpriced) AL +9; ASELS BofA satışı AL −6.

> **Sonraki adım (denetimden, atıl altyapı):** P1-1 sektör momentumunu skora bağla
> (`decision-engine.ts` `void _sectorMomentum`); P1-2 hacim teyidi (scan_cache `rel_vol5`).

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
- **Hisse Evreni**: 619 BIST sembolü (tüm BIST equity — 2026-06-05 Mynet tam listesiyle güncellendi)
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
| Yükseliş Adayları | `/yukselis-adaylari` | Bebek Hisseler — henüz yükselmemiş yüksek potansiyel (babyScore) |
| Akıllı Para Sinyali | `/akilli-para` | Teknik + akıllı para (OHLCV proxy) → tek basit aksiyon (ne yapmalı?) |
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

> NOT: Tam liste `vercel.json` — burası özet. scan-cache 2026-06-12'den beri
> **?part=1|2 İKİ PARALEL YARI** olarak tetiklenir (timeout güvencesi).

| Schedule (UTC) | TRT | Endpoint | Açıklama |
|----------------|-----|----------|----------|
| `0 6 * * 1-5` | 09:00 Pzt-Cum | `/api/cron/macro` | Makro snapshot |
| `30 5 * * 1` | 08:30 Pzt | `/api/cron/weekly-picks` | Haftanın seçimleri al |
| `30 4 * * 1-5` | 07:30 Pzt-Cum | `/api/cron/scan-cache?part=1` + `?part=2` | Sabah taraması (iki yarı, paralel) |
| `0 9 * * 1-5` | 12:00 Pzt-Cum | `/api/cron/scan-cache?part=1` + `?part=2` | Gün-içi tarama (iki yarı, paralel) |
| `50 14 * * 1-5` | **17:50** Pzt-Cum | `/api/cron/scan-cache?part=1` + `?part=2` | **Günün SON BIST taraması** (kapanış öncesi, iki yarı) |
| `0 7 * * 1-5` | 10:00 Pzt-Cum | `/api/cron/scan` | Sinyal taraması |
| `0 17 * * 1-5` | 20:00 Pzt-Cum | `/api/cron/evaluate` | Sinyal değerlendirme (maxDuration=300, `remaining` backlog sayacı) |
| `50 14 * * 5` | 17:50 Cum | `/api/cron/ai-portfolio` | AI portföy kararları |
| `30 18 * * 5` | 21:30 Cum | `/api/cron/weekly-picks-close` | Kapanış fiyatları güncelle |
| `30 7 * * 1-5` | 10:30 Pzt-Cum | `/api/cron/alerts` | Email uyarıları |
| `0 10 * * 1-5` | 13:00 Pzt-Cum | `/api/cron/price-alerts` | Fiyat alarmları |
| `30 6 * * 1` | 09:30 Pzt | `/api/cron/bulten` | Haftalık AI bülten |
| `0 8 * * *` | 11:00 hergün | `/api/cron/future-scores` | Future Score (US, 13 tema) |
| `0 8 * * 1` | 11:00 Pzt | `/api/cron/future-scores-bist` | Future Score (BIST, 5 tema) |
| `0 5 * * 1-5` | 08:00 Pzt-Cum | `/api/cron/news-catalyst` | Haber katalisti + eventRisks precompute |
| `15 5 * * 1-5` | 08:15 Pzt-Cum | `/api/cron/firsatlar-fundamentals` | Yatırım Skoru + bilanço tarihi precompute (FAZ 2) |
| `30 9 * * 1-5` | 12:30 Pzt-Cum | `/api/cron/news-catalyst` | Haber katalisti precompute (gün-içi) |
| `0 7 * * 1` | 10:00 Pzt | `/api/cron/sector-medians` | Sektör medyanları (peer değerleme) |
| `30/40/50 7 * * 1` | 10:30-10:50 Pzt | `/api/cron/long-term?part=1\|2\|3` | Uzun Vade Kompozit (FAZ 1, üç parça) |
| `10 8 * * 1` | 11:10 Pzt | `/api/cron/haftanin-secimi-uzun` | Haftanın uzun vade seçimi (long-term store'dan SONRA) |
| `30/35 8 * * 1` | 11:30-11:35 Pzt | `/api/cron/baby-candidates?part=1\|2` | Bebek Hisseler — babyScore (growth+catalyst store'dan SONRA) |
| `0 9 * * 1` | 12:00 Pzt | `/api/cron/baby-picks-snapshot` | Bebek Hisseler forward-tracking — haftalık temiz aday snapshot |
| `30 9 * * 1` | 12:30 Pzt | `/api/cron/baby-picks-evaluate` | Bebek Hisseler — ufuk dolan pick'lerin getirisi (4/12/26h) |
| `10 15 * * 1-5` | 18:10 Pzt-Cum | `/api/cron/smart-signal` | Akıllı Para Sinyali — teknik+akıllı para skoru (scan-cache'ten SONRA) |

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
