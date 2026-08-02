# Yetim Sayfaları Yeni Tasarıma Kazandırma — Hub & Sekme Planı

> Bu döküman **kodlama planıdır** — başka bir Claude Code penceresinde faz faz uygulanacak.
> Oluşturulma: 2026-07-29

---

## Context

BistAI'da frontend redesign ekran-ekran ilerledi; yeni kabuk (`AppShell`) sidebar'ında **7 link** var: Bugün, Fırsatlar, Portföyüm, Piyasa, VIOP, AI Portföyleri, AI Asistan.

Envanter çıkardığımızda şu problem netleşti: **kodda çalışan, canlı API'si olan 30+ sayfa yeni kabuktan erişilemiyor.** Kullanıcı yeni tasarıma bir kez girdiğinde eski IA'ya (NavbarClient'ın 24 linki) dönüş yolu pratikte yok — `ChromeGate` eski navbar'ı yeni rotalarda gizliyor.

En çarpıcı kayıp: **FAZ 1'de yeniden inşa edilen uzun vade motoru** (`lib/long-term-runner.ts`, 570 likit sembol tarayan haftalık cron) kullanıcıya **hiç görünmüyor**. Aynı şekilde sektör analizi (`/sektorler` kök), emtia, gündem/haberler, izleme listesi ve fiyat alarmları erişilemez durumda.

**Amaç:** Kullanıcı değeri taşıyan yetim ekranları **hub + sekme** yapısına kazandırmak; sidebar'ı 7 linkte sabit tutarak navigasyonu sadeleştirmek. Düşük değerli/derin uzman ekranları bilinçli olarak sonraya bırakmak.

---

## Triyaj — neyi alıyoruz, neyi bırakıyoruz

### ✅ ALINACAK

| Küme | Kaynak sayfalar | Neden |
|---|---|---|
| **Uzun Vade** | `/uzun-vade-firsatlar`, `/buyuyen-sirketler`, `/gelecek-sirketler`, `/yukselis-adaylari` | FAZ 1 + growth-momentum + future-scores motorlarının TEK görünür yüzü. En büyük kayıp değer. |
| **Sektörler** | `/sektorler` (kök liste) | Kullanıcının açıkça istediği "sektör analizi". `/sektorler/[id]` detayı (`SektorDetayScreen`) zaten yeni temada — sadece kök liste eksik. |
| **Emtia** | `/emtia-endeks` | Makro ekranının doğal tamamlayıcısı. |
| **Gündem** | `/haberler` (haber + KAP + ekonomi takvimi) | Günlük dönüş (retention) sebebi; 3 API tek sekmede. |
| **Takip & Alarm** | `/watchlist`, `/fiyat-alertler`, `/sinyal-takip` | Bağlılık için kritik; Bugün ekranındaki "Takip listem" kartının doğal derinleşmesi. |

### ⏸️ SONRAYA BIRAKILAN (bilinçli karar)

| Sayfa | Gerekçe |
|---|---|
| `/tarama` | Şimdilik gerek yok. (Yeni temada hazır duruyor — istenirse ileride tek sekmeyle bağlanır.) |
| `/temalar`, `/tema/[id]` | Şimdilik gerek yok. |
| `/backtesting`, `/simulasyon`, `/ters-portfolyo` | Derin uzman araçları; "borsa bilmeyen kullanıcı" hedefiyle çelişiyor. İleride "Araçlar" hub'ı. |
| `/karsilastir`, `/araclar` | Faydalı ama nadir; ileride "Araçlar". |
| `/topluluk/*` | Ayrı ürün + moderasyon yükü. |
| `/fiyatlandirma` | Stripe env key'leri henüz yok (CLAUDE.md bekleyen madde). |
| `/dashboard` | **Ölü** — `/bugun` yerine geçti. Silinmeli. |
| `/gecmis-firsatlar` | CLAUDE.md'de zaten kasıtlı gizli (evaluate backlog erimedi). |
| `/yatirim-radari` | Agregat sayfa — yerine "Uzun Vade" sekmesi geçiyor, **ölü**. |
| `/apex-portfoyu`, `/apex-us-portfoyu`, `/aegis-us-portfoyu`, `/yapay-zeka-portfoyu`, `/haftalik-secimler` | Özetleri `AiPortfoyleriScreen`'de zaten var; detay linki ileride o ekrandan verilir. |

---

## Hedef bilgi mimarisi (sidebar 7 linkte SABİT)

```
Fırsatlar  /firsatlar   → [Kısa Vade] [Uzun Vade]
Piyasa     /makro       → [Makro] [Sektörler] [Emtia] [Gündem]
Portföyüm  /portfolyo   → [Portföy] [Takip Listem] [Alarmlar] [Sinyal Takip]
```

Sekme state'i URL'de: `?tab=uzun-vade` (paylaşılabilir + geri tuşu çalışır). Varsayılan sekme = mevcut ekran (geriye uyumlu — kimse alışkanlığını kaybetmez).

---

## Uygulama

### Ortak: sekme çubuğu bileşeni
- **Yeni:** `components/new/HubTabs.tsx` — `'use client'`. `useSearchParams` + `router.replace` ile `?tab=` yönetir, `role="tablist"` + `aria-selected`, mobilde yatay kaydırılır.
- **Teknik referans:** `HisseDetayScreen.tsx`'teki 4-sekme yönetimi — aynı yaklaşım yeniden kullanılır.
- **Önemli:** aktif olmayan sekme **mount edilmez** (HisseDetayScreen'deki tek-instance kuralı) — sekmeler paralel fetch yapmasın.

### FAZ H1 — Fırsatlar hub'ı (en yüksek değer)
1. **Yeni:** `components/new/UzunVadeScreen.tsx`
   - Veri: `/api/uzun-vade-firsatlar` (FAZ 1 bileşik skor: inv35/sağlık25/peer20/büyüme20), `/api/growth-momentum`, `/api/future-scores?market=BIST`, `/api/yukselis-adaylari`.
   - Dört ayrı eski sayfa **tek ekranda** kümelenir; kategori seçimi ekran içi filtre olarak sunulur: *Kompozit · Büyüyen · Geleceği Parlak · Yükseliş Adayları*.
   - Gösterilecek veri alanları: bileşik skor, GARP verdict, Piotroski n/9, Beneish uyarısı, peer etiketi, büyüme skoru, fiyat serisi.
2. `app/firsatlar/page.tsx` → `<AppShell><FirsatlarHub/></AppShell>`; hub `?tab`'a göre `FirsatlarScreen` | `UzunVadeScreen` render eder.
3. `app/uzun-vade-firsatlar/page.tsx`, `/buyuyen-sirketler`, `/gelecek-sirketler`, `/yukselis-adaylari` → `?tab=uzun-vade`'ye **redirect** (mevcut `/akilli-para`, `/screener` redirect stub deseni).

### FAZ H2 — Piyasa hub'ı ("sektör analizi" burada)
1. **Yeni:** `components/new/SektorlerScreen.tsx` — sektör rotasyonu/karşılaştırması; veri `/api/sectors`, `/api/sectors/ai-summary`, `/api/movers`. Sektörden `/sektorler/[id]` → mevcut `SektorDetayScreen` (zaten yeni tema, **dokunma**).
2. **Yeni:** `components/new/EmtiaScreen.tsx` — `/api/emtia-analiz`, `/api/commodity`.
3. **Yeni:** `components/new/GundemScreen.tsx` — `/api/haber`, `/api/kap`, `/api/ekonomi-takvimi`; iç alt-sekme yerine kaynak ayrımı olan tek akış.
4. `app/makro/page.tsx` → `<AppShell><PiyasaHub/></AppShell>`; eski `/sektorler`, `/emtia-endeks`, `/haberler` → redirect.
5. `lib/new-design-routes.ts`: `/sektorler` `NEW_DESIGN_CHILD_ONLY`'den çıkıp tam `NEW_DESIGN_ROUTES`'a geçer.

### FAZ H3 — Portföyüm hub'ı
1. **Yeni:** `components/new/TakipListemScreen.tsx` — `/api/watchlist` + `/api/ohlcv` + `/api/portfolyo/sinyaller`. `BugunScreen`'deki "Takip listem" kartının tam sürümü (ekle/çıkar/sırala).
2. **Yeni:** `components/new/AlarmlarScreen.tsx` — `/api/price-alerts` CRUD.
3. **Yeni:** `components/new/SinyalTakipScreen.tsx` — `/api/signal-tracker`.
4. `app/portfolyo/page.tsx` → hub; `/watchlist`, `/fiyat-alertler`, `/sinyal-takip` → redirect.
5. `BugunScreen` "Takip listem" kartındaki `/watchlist` linki → `?tab=takip`. `ProfilScreen`'deki `/fiyat-alertler` LinkRow → `?tab=alarmlar`.

### Ortak temizlik
- `app/dashboard/`, `app/yatirim-radari/` → ölü, silinir (git geçmişinde kalır).
- Yeni sekmeler auth ister; hub `/portfolyo` zaten `middleware.ts`'te korumalı — sekme olduğu için otomatik gelmeli, **doğrula**.
- `NEW_DESIGN_ROUTES` güncellenir; eski `NavbarClient` linkleri temizlenir.

---

## Tasarlanması gereken ekranlar (design'a bırakılıyor)

Aşağıdaki ekranların görsel tasarımı ayrıca yapılacak. Plan bu ekranların **ne içereceğini ve hangi veriyi göstereceğini** tanımlar; görsel dil, yerleşim ve etkileşim kararları tasarıma bırakılmıştır.

| # | Ekran | İçerik özeti | Veri kaynağı |
|---|---|---|---|
| 1 | **Uzun Vade** | Uzun vadeli yatırım adaylarının sıralı listesi; 4 kategori tek ekranda filtrelenebilir (Kompozit / Büyüyen / Geleceği Parlak / Yükseliş Adayları). Her kayıt: bileşik skor, temel sağlık göstergeleri, değerleme etiketi, büyüme sinyali, fiyat serisi. | `/api/uzun-vade-firsatlar`, `/api/growth-momentum`, `/api/future-scores`, `/api/yukselis-adaylari` |
| 2 | **Sektörler** | BIST sektörlerinin performans/momentum karşılaştırması, sektör sıralaması, öne çıkan yükselen-düşen hisseler, AI sektör yorumu. Sektörden detay sayfasına geçiş. | `/api/sectors`, `/api/sectors/ai-summary`, `/api/movers` |
| 3 | **Emtia** | Emtia ve endeks göstergeleri (altın, petrol, dolar, endeksler) + AI yorumu. | `/api/emtia-analiz`, `/api/commodity` |
| 4 | **Gündem** | Piyasa haberleri, KAP duyuruları ve ekonomi takvimi olaylarının birleşik akışı; kaynak ayrımı ve tarih/önem bilgisi. | `/api/haber`, `/api/kap`, `/api/ekonomi-takvimi` |
| 5 | **Takip Listem** | Kullanıcının izleme listesi; sembol ekleme/çıkarma, fiyat ve değişim, o sembole ait aktif sinyal durumu. | `/api/watchlist`, `/api/ohlcv`, `/api/portfolyo/sinyaller` |
| 6 | **Alarmlar** | Fiyat alarmı oluşturma/düzenleme/silme; aktif alarm listesi ve tetiklenme durumu. | `/api/price-alerts` |
| 7 | **Sinyal Takip** | Kullanıcının takibe aldığı sinyallerin güncel durumu ve performansı. | `/api/signal-tracker` |
| 8 | **Hub sekme çubuğu** | Fırsatlar / Piyasa / Portföyüm ekranlarının üstünde yer alan sekme navigasyonu (2-4 sekme, mobilde kaydırılabilir). | — |

---

## Sıralama

```
HubTabs (ortak bileşen)
  └→ H1 Fırsatlar hub  (Uzun Vade)            ← en yüksek değer, buradan başla
  └→ H2 Piyasa hub     (Sektörler/Emtia/Gündem)
  └→ H3 Portföyüm hub  (Takip/Alarm/Sinyal)
  └→ Temizlik (ölü sayfa silme, redirect, NavbarClient)
```

Her faz bağımsız deploy edilebilir.

---

## Doğrulama (her faz)

1. `npx tsc --noEmit` + `npm run build` temiz.
2. Preview: hub açılır → varsayılan sekme mevcut ekran mı (regresyon yok)?
3. `?tab=` URL'i paylaşılınca doğru sekme açılıyor mu, tarayıcı geri tuşu çalışıyor mu?
4. Sekme geçişinde **tek instance** mount/unmount — Network panelinde tüm sekmelerin API'si aynı anda çağrılmamalı.
5. Açık **ve** karanlık tema + mobil (tab bar) + masaüstü (sidebar).
6. Eski rotalar (`/sektorler`, `/haberler`, `/watchlist`...) redirect ediyor mu — kırık link kalmamalı.
7. Auth-gated sekmeler (Takip/Alarm) oturumsuz `/giris`'e düşüyor mu.
8. **Migration GEREKMEZ** — saf UI + mevcut API'ler.
