# Fon Motoru — Kalıcı Depolama + Artımlı Backfill

> Bu döküman **kodlama planıdır**. Oluşturulma: 2026-09-09 · Son güncelleme: 2026-09-09 (uygulama sonrası)

---

## ✅ DURUM: FAZ 0-5 TAMAMLANDI, VERİ CANLI

**İKİ EVREN DE CANLI — 240 tam gün (2025-09-25 → 2026-09-09), 0 backfill hatası.**

| Evren | Fon | Kategorili | Sharpe | Skor | Fiyat satırı |
|---|---|---|---|---|---|
| TEFAS | 643 | %100 | %100 | **%100** | 471.673 |
| BES | 364 | %99 | %100 | **%99** | 94.224 |

`/fonlar` ekranı canlı doğrulandı: her iki sekme, açık/karanlık tema, mobil/masaüstü.
Misafir girişi de uçtan uca çalışıyor (anonim oturum → `/bugun`).

| Faz | Durum | Commit |
|---|---|---|
| FAZ 0 Temiz ağaç (3 ayrı commit) | ✅ | `ade485a` `68668a9` `b6dd6f1` |
| FAZ 1 Şema (`fund_prices` · `fund_meta` · `fund_scan_days`) | ✅ migration çalıştırıldı | `566779c` |
| FAZ 2 Artımlı backfill (gap tespiti, kategori vergisi, süre bütçesi) | ✅ | `566779c` |
| FAZ 3 Sağlamlaştırma + testler (387 → 438) | ✅ | `566779c` |
| FAZ 4 **1 yıl backfill + doğrulama** | ✅ | `5d19d90` `e04a45c` `24aacdc` |
| FAZ 5 Para akımı (F3) | ✅ | `dd6e986` |

### 📊 Metrik açılımı — ÖLÇÜLDÜ (n=643)

| Metrik | Kapsam |
|---|---|
| Kategori · nominal · fazla getiri · reel getiri · akım | **%100** |
| Volatilite · **Sharpe** · maxDrawdown · **risk-ayarlı skor** | **%100** (642/643) |
| Gözlem sayısı | min 14 · **medyan 240** · max 240 |

*Tek eksik fon 14 gözlemli yeni bir fon — `MIN_OBS.risk = 20` altında olduğu için
metrik ÜRETİLMEDİ (uydurulmadı). Tasarım böyle çalışıyor.*

### ⭐ Ürün tezi canlı veriyle kanıtlandı

Çifte sıralama ayrışması gerçek:
- `AIS` (Katılım) → **getiride 13. · risk-ayarlıda 1.** (nominal %44,2 · Sharpe 4,82)
- `DBP` (Değişken) → **getiride 47. · risk-ayarlıda 1.** (nominal %37,3 · Sharpe 0,35)

Ham getiri sıralaması kullanıcıyı bambaşka bir fona götürüyor. Ekranda üç katmanlı
getiri (Nominal %44,2 → Risksize göre %9,1 → Enflasyona göre %11,6) yan yana duruyor.

### 🎯 Kalibrasyon ölçümü — TAMAM, müdahale gerekmedi

Planın zorunlu adımı: *"bayrak evrenin %70'inden fazlasında tetikleniyorsa ayrıştırıcı
değil bağlamdır."* Ölçüm (n=643):

| Bayrak | Tetiklenme | Karar |
|---|---|---|
| `fon-fazla-poz` | %53 | ✅ ayrıştırıcı |
| `fon-fazla-neg` | %47 | ✅ ayrıştırıcı |
| `fon-risk-ayarli-iyi` / `-zayif` | %44 / %42 | ✅ |
| `fon-reel-neg` | %39 | ✅ |
| `fon-akim-emsalalti` / `-emsalustu` | %27 / %24 | ✅ |
| `fon-dusuk-dalga` | %23 | ✅ |
| `fon-eriyor` · `fon-perakende-akini` · `fon-kapasite` | %7 · %5 · **%1** | ✅ |

**BES'te de aynı sonuç:** en yüksek `fon-fazla-neg` %54, hiçbiri %70'i geçmiyor.

**Hiçbiri %70'i geçmedi — bağlama çevrilmesi gereken bayrak yok.** Emsale-göreli
tasarım işe yaradı. Endişelenilen ikisi de temiz: "risksiz getirinin altında" evreni
kaplamadı (%47), kalibre edilmemiş `KAPASITE_ESIK_PCT = 30` yalnız %1'de tetikledi.

---

## 🐛 Çalıştırınca çıkan 8 hata (hepsi düzeltildi)

Bunların hiçbiri kod okuyarak görünmezdi.

| # | Hata | Belirti | Commit |
|---|---|---|---|
| 1 | `meta` backfill'den ÖNCE okunuyordu | `scored: 0`, 2.034 fon eleniyor | `c4e42dd` |
| 2 | Kategori sorgusu BUGÜNÜN tarihini kullanıyordu (TEFAS akşam yayımlıyor) | kategori hiç dolmuyor | `c4e42dd` |
| 3 | Boş gün her koşuda tekrar deneniyordu | ~50 sn/koşu boşa | `c4e42dd` |
| 4 | Kategoriye bütçe ayrılmıyordu (backfill hepsini yiyor) | skorların TAMAMI null | `2ec171b` |
| 5 | Kategori taraması koşular arası devam edemiyordu | 577/2034'te takılı | `a6e99f5` |
| 6 | 12 kategoriden **3'ü TEFAS'ta boş** (103/172/173) → "hepsi taze mi?" ASLA true olamıyor | sonsuz tazeleme, backfill 0 güne düştü | `23c6a4f` |
| 7 | **Sayfa boyutu 500** → gün başına 5 istek | sürekli 429 | `e04a45c` |
| 8 | Cron 240 günde tüm evreni okuyor (471k satır) | `FUNCTION_INVOCATION_TIMEOUT` | `24aacdc` |
| 9 | **BES'te `sfonTurKod` filtresi TEFAS tarafından yok sayılıyor** | 400 fonun tamamı kategorisiz → **skor %0** | `7a4263d` |

**#9 detay:** BES backfill 240 günü doldurdu ve Sharpe %100 üretildi, ama emsal grubu
kurulamadığı için skorların TAMAMI null kaldı. TEFAS geçersiz kategori filtresini yok
sayıp her sorguya tüm evreni döndürüyor (12 × 400 = 4.800 çakışan kayıt). Günlük satırda
kategori alanı YOK; `fonTurGetir` ucu YAT ve EMK için AYNI 12 kodu döndürüyor — yani kod
listesi değil **filtre** bozuk. Çözüm: BES kategorisi fon ADINDAN çıkarılıyor
(`guessBesCategory`, `guessAccessibility` ile aynı desen; eşleşme yoksa null, uydurma
kategori ATANMAZ). Ölçülen: **397/400 (%99)**, tüm gruplar ≥12 fon.
Canlı doğrulama: `MUHAFAZAKAR KATILIM DEĞİŞKEN` → Katılım · `OKS TEMKİNLİ DEĞİŞKEN` →
Değişken · `ÖZEL SEKTÖR BORÇLANMA` → Borçlanma. Öncelik sırası teste kilitlendi (446 test).

### ⚠️ DERS: "host suçlu" demeden önce iki hostta aynı yükü ölç

429'lar önce **"Vercel'in paylaşımlı IP'si engelleniyor"** diye teşhis edildi ve buna
göre yerel betik yazıldı. **Yanlıştı.** Yerel backfill de aynı 429'ları aldı (10 günde
4 hata). Yanıltan şey ilk probe'un 9 *seyrek* istek atmasıydı.

Gerçek neden tek sabitti: **`bitSira` 500 → 2500**. TEFAS tüm evreni (2.041 fon) TEK
istekte döndürüyor. Gün başına istek %80 azaldı → **10/10 gün, sıfır hata**.
Tam koşu: 206 gün, **0 hata**, 18,8 sn/gün.

İkinci düzeltme: 429 için ayrı ve cömert geri çekilme (20/40/60 sn). Eskisi
4,4/8,8/17,6 sn'ydi; ölçümde kova ~40 sn'de doluyor. Yetersiz bekleme yüzünden gün
"boş" sanılıp 8 saat throttle'a giriyordu — **8 Ağustos günü tam olarak böyle kayboldu.**

---

## 🚧 KALAN İŞ

### 1️⃣ Alfa · Beta · Information Ratio — **VERİ VAR, KOD YOK**

Plan "1 yıl ile alfa/beta/IR açılır" diyordu. **Veri açısından doğru** (240 gün ≥ 60
ortak gün) ama **kod bunları hiç hesaplamıyor**: `fund-runner.ts:490` `benchmark: null`
geçiyor ve `FundEntry`'de alan yok.

Yapılacak: kategori medyanı NAV serisini kur (aynı `getFlowSeries` okumasından
türetilebilir, ek sorgu yok) → `computeFundMetrics`'e `benchmark` olarak ver →
`skill.alpha/beta/informationRatio` alanlarını `FundEntry`'ye ekle.
`fund-metrics.ts` bu hesapları ZATEN içeriyor ve testleri var — yalnız beslenmiyor.

**Bu, "beceri mi şans mı" sorusunun tek gerçek cevabı** (FON-ANALIZ-PLAN F2-4).

### 2️⃣ ~~BES backfill~~ ✅ TAMAM
240 tam gün, 0 hata, 364 fon skorlanıyor (bkz. hata #9).

### 3️⃣ FAZ 6 — Fon detay sayfası (`/fonlar/[kod]`)
`components/new/FonDetayScreen.tsx` + `app/fonlar/[kod]/page.tsx` + `new-design-routes`.
Üç katmanlı getiri · dönemsel getiriler · risk · beceri (yukarıdaki 1. madde sonrası) ·
**akım grafiği** · bayraklar · kategori emsalleri içindeki konum · erişilebilirlik
uyarısı (`ad-tabanlı-tahmin`). Veri tablodan okunur, TEFAS'a istek YOK.
Fon dili korunur: **AL/SAT, stop, R/R YOK.**

### 4️⃣ F6-3 — Fon karşılaştırma (2-4 fon yan yana)

### 5️⃣ Hâlâ açılmayanlar (dürüstçe etiketli kalmalı)
- **Rolling tutarlılık** — 365g pencere × 30g adım × ≥3 pencere ≈ **~15 ay** gerekir
- **Tek-yıl bağımlılığı** — 2 tam takvim yılı gerekir
- **3y/5y getiri** — `?target=` artırılarak derinleşir (TEFAS 1 yıldan öteye veriyor mu ölçülmedi)

### ⚠️ ÖLÇEK UYARISI (3 yıla çıkılırsa)
Cron şu an 240 gün × 643 fon ≈ 154k satır okuyor (~124 sn). Supabase sayfa tavanı
**range ne olursa olsun 1.000** (ölçüldü) → satır sayısı doğrudan istek sayısı.
3 yılda ~460k satır = ~460 istek → yine timeout. Kalıcı çözüm: **sunucu tarafı
toplama (Postgres RPC)** veya metrikleri yerel betikte hesaplayıp store'a yazmak.

---

## 📌 Bekleyen manuel adımlar

| # | Adım | Durum |
|---|---|---|
| 1 | `20260803_firsat_picks.sql` | ✅ Çalıştırılmış (tablo doğrulandı; boş olması normal — cron haftalık, Pzt 08:00 UTC) |
| 2 | `20260909_fund_prices.sql` | ✅ Çalıştırıldı |
| 3 | `.claude/settings.local.json` gitignore | ✅ `8949dd2` (webhook secret geçmişe HİÇ girmedi, önlendi) |
| 4a | Supabase **anonim giriş** | ✅ **Zaten açık** — misafir girişi canlıda uçtan uca doğrulandı |
| 4b | Supabase **Google OAuth** | 🟠 Kapalı. Google Cloud Console'da OAuth client (callback: `https://atdhhojyrsrtptwyhhkl.supabase.co/auth/v1/callback`) → Supabase Auth → Providers → Google |
| 5 | Make.com → `/api/changelog/latest` | 🟡 Çevrilmedi |

---

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

## 🔴 Bekleyen manuel adımlar (kullanıcı tarafı — 2026-09-09 itibarıyla)

| # | Adım | Durum |
|---|---|---|
| 1 | `20260803_firsat_picks.sql` | ✅ **Çalıştırılmış** (tablo doğrulandı). Boş olması normal — cron haftada bir (Pzt 08:00 UTC), kod deploy edilince dolar |
| 2 | `20260909_fund_prices.sql` | ✅ **Çalıştırıldı (2026-09-09)** |
| 3 | **5 commit'i push + deploy** | ⛔ **BEKLİYOR** — FAZ 4 bunsuz başlayamaz (`ade485a` · `68668a9` · `b6dd6f1` · `566779c` · `dd6e986`) |
| 4 | `.gitignore`'a **`.claude/settings.local.json`** ekle + `git rm --cached` | 🔴 İçinde TradingView webhook secret'ı var; geçmişte henüz YOK, commit edilirse GitHub'a sızar |
| 5 | Supabase'de **Google OAuth + anonim giriş** provider'larını aç | 🟠 Misafir girişi canlıda çalışmaz |
| 6 | Make.com senaryosunu `/api/signals/latest` → **`/api/changelog/latest`** çevir | 🟡 Yama notu botu yayınlamıyor |
