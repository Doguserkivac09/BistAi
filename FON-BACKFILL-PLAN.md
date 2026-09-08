# Fon Motoru — Kalıcı Depolama + Artımlı Backfill (ve kalan iş)

## Context

`/fonlar` ekranı canlı ama **store boş** (`/api/fonlar` → `count: 0`, "4 gün alınamadı").
F0/F1/F2/F5/F6-1/F7 yazıldı, 387/387 test geçiyor — ama veri birikmiyor.

### Kök neden: depolama seçimi hem backfill'i hem ürünü kilitliyor

`lib/fund-runner.ts` başlığı gerçeği zaten kaydetmiş: ham NAV geçmişi tek `ai_cache`
satırına **sığmıyor** (1 yıl ≈ 33 MB). Bu yüzden 75 günlük kayan pencere seçilmiş.
Sonuçları:

| Sorun | Etki |
|---|---|
| `fetchRawWindow` her koşuda **son N iş gününü** ister; elindeki tarihi atlamaz | Aynı günler tekrar tekrar çekilir → 429, boşa süre |
| `RAW_WINDOW_DAYS = 75` kırpması **her koşuda** uygulanır | Daha derine inilse bile aynı koşuda silinir |
| `TTL_MS = 5 gün` | Cron 5 gün koşmazsa **biriken pencere komple kaybolur**, sıfırdan başlar |
| Kategori vergisi (12 kategori × ≤4 sayfa, 2,2 sn ara) **her koşuda** ödenir | ~100-130 sn sabit maliyet → 300 sn içinde yalnız ~12-13 iş günü çekilebilir |
| 75 takvim günü ≈ 53 iş günü | `MIN_OBS.regression = 60` **hiç açılmaz** → alfa/beta/IR imkânsız; 1y/3y/5y getiri imkânsız |

Yani mevcut mimariyle mükemmel bir backfill bile **kullanıcının ilk istediği "1 yıl / 5 yıl
getirileri"ne ulaşamaz.** Karar: **`fund_prices` tablosu + 1 yıl derinlik** (kullanıcı, 2026-09-09).

### Ölçülen üç koşu (planın hafife aldığı kısıt)

| koşu | istenen | gelen gün | sonuç | süre |
|---|---|---|---|---|
| 1 | 20 | 11/20 | 631 fon skorlandı | 870 sn |
| 2 | 5 | 1/5 | **0 fon — store'u ezdi** | 424 sn |
| 3 | 12 | — | curl timeout, yazmadı | — |

Üç hata düzeltildi (sahte 70 skoru · kötü koşu koruması · kategori kalıcılığı) ama
**koşu 2'den sonra yazıldıkları için bozuk store hâlâ yerinde** ve **hiçbirinin testi yok**.

### Ek bulgu — latent crash (hedefli backfill'i doğrudan vurur)

`fund-runner.ts:271` `meta: meta.get(code)!` (non-null assertion) → `:317` `m.meta.name`.
Bir fon `raw` penceresinde var ama **bu koşuda çekilen günlerde fiyat yayımlamadıysa**
`meta.get(code)` `undefined` olur, `:251`'deki `?? onceki` sayesinde eleme aşamasını geçer,
sonra **TypeError → tüm koşu çöker**. Hedefli backfill "yalnız bazı tarihleri çeken" bir
koşu olduğu için bu yolu **sürekli** tetikler.

---

## FAZ 0 — Çalışma ağacını temizle (fon işinden bağımsız)

Ağaçta birbirinden ve fondan bağımsız **üç ayrı iş** commit edilmemiş duruyor:

1. **Misafir girişi** — `lib/guest.ts`, `components/new/MisafirSeridi.tsx`,
   `lib/__tests__/guest.test.ts`, + `app/api/chat/route.ts`, `components/new/GirisScreen.tsx`,
   `components/new/AppShell.tsx` değişiklikleri
2. **Telegram yama notu** — `changelog.json`, `app/api/changelog/`,
   `supabase/migrations/20260804_changelog_publish_log.sql`
3. **Fon işi** — `lib/fund-*`, `app/api/fonlar/`, `app/api/cron/fund-scan/`,
   `app/fonlar/`, `components/new/FonlarScreen.tsx`, + `lib/new-design-routes.ts`,
   `vercel.json`, `CLAUDE.md`

→ **Üç ayrı commit.** `npx tsc --noEmit` + `npm run build` + testler her commit öncesi temiz.
Push kullanıcı onayıyla (CLAUDE.md kuralı).

---

## FAZ 1 — Şema (migration)

**Yeni:** `supabase/migrations/20260909_fund_prices.sql` — idempotent, üç tablo:

```sql
-- Günlük NAV + akım serisi (ürünün kalbi)
fund_prices(universe text, code text, date date, price numeric not null,
            shares numeric, investors int, size numeric,
            PRIMARY KEY (universe, code, date))
  index (universe, date) · index (universe, code, date desc)

-- Fon meta — kategori KALICI (kategori vergisini bitirir + latent crash'i kökten çözer)
fund_meta(universe text, code text, name text, category int,
          category_at timestamptz, updated_at timestamptz,
          PRIMARY KEY (universe, code))

-- Tarih kapsama günlüğü — GAP tespitinin kesin kaynağı
fund_scan_days(universe text, date date, rows int not null,
               complete boolean not null default false, fetched_at timestamptz,
               PRIMARY KEY (universe, date))
  index (universe, complete, date desc)
```

**RLS: yalnız `service_role`** (public read YOK). Gerekçe: FON-ANALIZ-PLAN'ın lisans ilkesi —
*"türetilmiş analiz servis et, ham veri setini yayınlama."* API admin client ile okur,
dışarıya yalnız hesaplanmış metrik verir (`app/api/fonlar/route.ts` zaten ham pencereyi
kasıtlı olarak dışarı vermiyor — aynı disiplin korunur).

**`complete` alanı kritik:** 429 sayfalama ortasında kesilirse tarih **kısmi** yazılır.
`complete = (sayfalama hatasız bitti) && (rows >= son 5 tam günün medyanının %80'i)`.
Böylece kısmi tarih "var" sayılmaz, bir sonraki koşuda tekrar denenir.

---

## FAZ 2 — Artımlı backfill motoru (dar boğazın çözümü)

### 2-1: Eksik tarih tespiti
**Yeni:** `lib/fund-store.ts` — tablo erişim katmanı:
- `getCoveredDays(sb, universe, from, to)` → `Set<string>` (yalnız `complete = true`)
- `upsertDay(sb, universe, date, rows)` → `fund_prices` + `fund_scan_days` tek transaction
- `getSeries(sb, universe, codes, from)` → `NavPoint[]` (metrik motoruna besleme)
- `getMeta(sb, universe)` / `upsertMeta(sb, rows)` → kategori + ad

**Gap algoritması** (`fetchRawWindow`'un yerine geçer):
```
hedef   = recentBusinessDays(N)              // N = derinlik hedefi
elde    = getCoveredDays(...)                 // SQL, complete=true
eksik   = hedef − elde                        // EN YENİDEN geriye sıralı
bütçe   = maxDuration'a göre kaç gün          // gün ≈ 5 sayfa × 2,2sn ≈ 13 sn
çek     = eksik.slice(0, bütçe)
```
**Sıralama gerekçesi:** en yeni eksikten geriye. Güncel veri her zaman öncelikli (sayfa
bugünü göstermeli); güncel dolunca otomatik olarak geriye iner.

**Aynı kod iki modu taşır:** günlük cron → eksik = 1-2 gün, saniyeler içinde biter.
Backfill koşusu (`?deep=1`) → bütçesini doldurur. Ayrı kod yolu YOK.

### 2-2: Kategori vergisini kaldır
Kategori artık `fund_meta`'da kalıcı. Tazeleme yalnız `category_at` **7 günden eskiyse**.
→ Koşu başına ~100-130 sn kazanç → çekilebilir gün sayısı **~13 → ~25** (iki katı).

### 2-3: Cron
`app/api/cron/fund-scan/route.ts` güncellenir:
- `?universe=TEFAS|BES` · `?deep=1` (backfill modu) · `?target=<gün>` (derinlik hedefi)
- Yanıt: `{ fetched, skipped, remaining, oldestCovered, newestCovered, nextHint }`
  → `remaining > 0` iken tekrar çağrılır; **ilerleme görünür**
- `vercel.json`: günlük artımlı koşu (fon fiyatları akşam yayımlanır → gece/sabah)

### 2-4: `ai_cache` rolü küçülür
`fund-store:*` artık **yalnız hesaplanmış `items` + makro bağlam** tutar (~1,5 MB).
`raw` ve `cats` **kaldırılır** (tabloya taşındı) → `RAW_WINDOW_DAYS` kırpması ve
**TTL veri kaybı riski ortadan kalkar** (tablo kalıcı; ai_cache yalnız sunum önbelleği).

---

## FAZ 3 — Runner sağlamlaştırma + testler

### 3-1: Latent crash
`meta.get(code)!` non-null assertion **kaldırılır**. Meta artık `fund_meta`'dan gelir
(koşudan bağımsız, kalıcı); yoksa fon **atlanır ve sayılır**, koşu çökmez.

### 3-2: Mevcut üç korumayı teste kilitle (şu an sıfır test var)
`lib/__tests__/fund-runner.test.ts` (YENİ):
- **"Risk yoksa skor yok"** — Sharpe null iken skor null (canlıda 631 fonun tamamı 70 çıkmıştı)
- **"Kötü koşu iyi store'u ezmesin"** — items < öncekinin yarısı → önceki yayınlanır
- **Kategori kalıcılığı** — bir kategori 429 yerse önceki değer korunur
- **Yatırımcı sayısı devri** — kısmi çekimde `investors` boşsa öncekinden devralınır
- **Meta eksik** → crash yok, atlanır (3-1 regresyonu)

### 3-3: Backfill testleri
`lib/__tests__/fund-store.test.ts` (YENİ):
- Elinde 3 tam tarih varsa **onları istemez** (gap tespiti)
- `complete = false` tarih **eksik sayılır**, tekrar denenir
- Bütçe sınırı: eksik 50 gün, bütçe 25 → 25 çeker, `remaining = 25`
- Kategori 7 günden yeniyse **çekilmez**

---

## FAZ 4 — 1 yıl backfill + metrik açılımını doğrula

~250 iş günü hedef. Kategori vergisi kalktıktan sonra koşu başına ~25 gün → **~10 koşu**.
`remaining` sıfırlanana kadar tekrar tetiklenir.

### Açılacak metrikler (1 yıl ile)
| Metrik | Eşik | 1 yılda |
|---|---|---|
| Volatilite · Sharpe · Sortino · maxDD | `MIN_OBS.risk = 20` | ✅ zaten |
| **Alfa · Beta · Information Ratio** | `regression = 60` ortak gün | ✅ **açılır** |
| Yıllıklandırılmış getiri · Calmar | `daySpan ≥ 365` | ✅ açılır (sınırda) |
| 1 yıllık dönem getirisi | `coversPeriod` %90 ≈ 329 gün | ✅ açılır |

### ⚠️ 1 yılla AÇILMAYANLAR (dürüstçe etiketlenecek, uydurulmayacak)
- **Rolling tutarlılık** — 365g pencere × 30g adım × ≥3 pencere ≈ **~15 ay** gerekir
- **Tek-yıl bağımlılığı** — ≥2 tam takvim yılı gerekir
- **3y / 5y getiri** — daha derin backfill ister

→ UI'da bu metrikler *"yeterli geçmiş yok"* der; **0 veya tahmin gösterilmez**
(`coversPeriod` disiplini korunur). Tablo kalıcı olduğu için bunlar **zamanla kendiliğinden
açılır** — ya da ileride daha derin backfill koşulur.

### Ekran doğrulama + push
Açık/karanlık · mobil/masaüstü · boş durum · TEFAS↔BES geçişi · çifte sıralama ayrışması
(`THF getiride 1. / risk-ayarlıda 7.` gibi gerçek bir örnek gösterilmeli) → sonra push.

---

## FAZ 5 — F3 Para akımı (tabloyla neredeyse bedava)

`shares` (tedPaySayisi) ve `investors` (kisiSayisi) **zaten toplanıyor** ve artık kalıcı seri.

**Yeni:** `lib/fund-flows.ts`
```
❌ YANLIŞ:  Δ(fon büyüklüğü)         — fiyat artınca büyüklük de artar, para girmese bile
✅ DOĞRU:   Δ(pay adedi) × ort. birim pay değeri
```
*(Bu ayrım koda yorum olarak yazılır — gelecekteki "basitleştirme" cazibesine karşı.)*

Desenler: pay↑ + yatırımcı sabit → **kurumsal** · pay↑ + yatırımcı↑↑ → **perakende akını**
(geç para) · küçük fona hızlı giriş → **kapasite uyarısı** · sürekli çıkış → **eriyen fon**.

**⚠️ Kalibrasyon kuralı burada da geçerli:** piyasa geneli çıkış varken "para çıkışı var"
tüm evrende tetiklenir → ayrıştırıcı değil. Akım bayrakları **kategori medyanına göreli**
üretilir; `n < MIN_PEER` ise mutlak eşiğe düşülür ve rozet **sektör iddia etmez**.

**Test (kritik regresyon):** pay adedi sabit + fiyat değişti → **akım sıfır** çıkmalı.

Rozetler `FundFlag` kanalına akar → `FonlarScreen`'de ek UI kodu gerekmez.

---

## FAZ 6 — F6-2 Fon detay sayfası

**Yeni:** `app/fonlar/[kod]/page.tsx` + `components/new/FonDetayScreen.tsx` (`<AppShell>`),
`lib/new-design-routes.ts`'e ekle.

İçerik: üç katmanlı getiri (nominal → fazla → reel) · dönemsel getiriler · risk metrikleri ·
beceri metrikleri (alfa/beta/IR) · **akım grafiği** (F5) · bayraklar · kategori emsalleri
içindeki konumu · erişilebilirlik uyarısı (`ad-tabanlı-tahmin` etiketiyle).

Veri **tablodan** okunur (`getSeries`) — TEFAS'a istek yok. `lib/fund-data.ts`'teki
`getFundHistory` (yazılmış ama hiç kullanılmamış, 28 günlük parçalı çekici) yalnız
**tabloda olmayan fon** için yedek yol olarak bağlanır.

Fon dili korunur: **AL/SAT, stop, R/R YOK** — karşılaştırma ve uygunluk dili.

---

## Kapsam DIŞI (bu plan)

- ❌ **F4 maliyet/ücret** — TEFAS'ta uç bulunamadı (F0'da ölçüldü), **bloklu**. İzahname/KAP
  ayrı keşif işi. Uydurulmaz.
- ❌ **F6-3 fon karşılaştırma** — F6-2'den sonra, ayrı faz
- ❌ **3y/5y derin backfill** — 1 yıl oturduktan sonra, aynı motorla `?target=` artırılır
- ❌ BES derin backfill — TEFAS oturunca aynı kod BES'e uygulanır (şema/uç aynı)

---

## Riskler

| Risk | Azaltma |
|---|---|
| Migration çalıştırılmazsa özellik ölü | Bekleyen manuel adımlarda **en üstte**; migration olmadan FAZ 2+ başlamaz |
| TEFAS 1 yıl geriye veri vermeyebilir | FAZ 4'ün ilk koşusunda **ölçülür**; sınır neredeyse dürüstçe raporlanır, hedef ona göre düşürülür |
| 429 / rate limit | Mevcut 2,2 sn + üstel geri çekilme korunur; `complete=false` ile kısmi tarih tekrar denenir |
| `fund_prices` satır sayısı (≈639 fon × 250 gün ≈ 160k satır/yıl) | Postgres için önemsiz; indeksler tanımlı |
| Metrik "açıldı" sanılıp aslında açılmaması | FAZ 4 doğrulaması metrik metrik kontrol eder; açılmayanlar UI'da "yeterli geçmiş yok" der |
| ⚠️ Bayrak evrenin çoğunda tetikleniyor | **Kalibrasyon kuralı** (bu projede 2 kez yandı): her yeni bayrak için "evrenin yüzde kaçında tetikleniyor" ölçülür; %70 üstüyse bağlamdır, emsal-göreliye çevrilir |

---

## Doğrulama (her faz)

1. `npx tsc --noEmit` + `npm run build` temiz; **387/387 test** geçmeye devam eder.
2. Yeni testler: gap tespiti · kısmi tarih · bütçe sınırı · kategori tazeleme · üç koruma ·
   meta eksik crash yok · **akım formülü regresyonu** (fiyat değişti/pay sabit → akım 0).
3. Migration Supabase'de çalıştırıldı, üç tablo + indeksler + RLS doğrulandı.
4. Backfill: `remaining` her koşuda azalıyor; `oldestCovered` geriye iniyor; **aynı tarih
   iki kez çekilmiyor** (log'dan doğrulanır).
5. 1 yıl dolunca: alfa/beta/IR **null değil**; rolling tutarlılık hâlâ null ve UI "yeterli
   geçmiş yok" diyor (uydurmuyor).
6. `/api/fonlar` → `count > 0`; çifte sıralama ayrışması gerçek bir örnekle gösteriliyor.
7. Ekran: açık/karanlık · mobil/masaüstü · boş durum · TEFAS↔BES.

---

## 🔴 Bekleyen manuel adımlar (kullanıcı tarafı — acil sırayla)

| # | Adım | Aciliyet |
|---|---|---|
| 1 | **`20260803_firsat_picks.sql` Supabase'de çalıştır** | 🔴 **Her gün geri dönüşü olmayan veri kaybı** — fırsat sicili birikmiyor |
| 2 | **`20260909_fund_prices.sql` çalıştır** (FAZ 1 sonrası) | 🔴 Bu plan bunsuz ilerleyemez |
| 3 | Supabase'de **Google OAuth + anonim giriş** provider'larını aç | 🟠 Misafir girişi canlıda çalışmaz |
| 4 | Make.com senaryosunu `/api/signals/latest` → **`/api/changelog/latest`** çevir | 🟡 Yama notu botu yayınlamıyor |
