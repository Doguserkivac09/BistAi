## BistAI Projesi — Geliştirici Özeti

Bu dosya, projeyi hiç bilmeyen bir yapay zekâya / geliştiriciye **BistAI** uygulamasının mimarisini, teknolojilerini ve şu ana kadar yapılan tüm önemli işleri özetlemek için hazırlanmıştır.

---

### 1. Genel Tanım

- **Proje adı**: BistAI  
- **Amaç**: BIST (Borsa İstanbul) hisselerini tarayıp, teknik analiz sinyallerini algılamak ve bu sinyalleri Anthropic Claude ile **Türkçe, sade** açıklamalarla kullanıcılara sunmak.  
- **Hedef kullanıcı**: Türk bireysel yatırımcılar ve traderlar.  
- **Dil**: Tüm UI metinleri **Türkçe**.

---

### 2. Teknoloji Yığını

- **Framework**: Next.js 14 (App Router)
- **Dil**: TypeScript (`strict` mod açık)
- **Stil**: Tailwind CSS + shadcn/ui tarzı bileşenler
- **Grafikler**: `lightweight-charts` (TradingView tabanlı)
- **Veri Kaynağı**: Resmî olmayan Yahoo Finance v8 chart API  
  - Kullanılan endpoint: `https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}`
  - BIST hisseleri için otomatik `.IS` soneki ekleniyor (`THYAO` → `THYAO.IS`).
- **AI Açıklamaları**: Anthropic Claude (`claude-3-5-haiku-20241022` modeli)
- **Veritabanı**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth (e-posta/şifre)
- **State Yönetimi**: (Gerekli yerlerde) React state hook’ları; global store için ileride Zustand eklenebilir (şu anda kritik değil).
- **Paket yöneticisi**: npm

---

### 3. Klasör Yapısı (Önemli Dosyalar)

**Kök:** `c:\Users\MspDo\PROJELERİMİZ\BISTAI`

#### 3.1. App Router sayfaları (`/app`)

- `app/layout.tsx`  
  - Global layout; Inter font, karanlık tema arka plan ve `globals.css` dahil.

- `app/page.tsx`  
  - **Landing Page** (Ana Sayfa)
  - Hero başlık: “BIST Hisselerinde AI Destekli Sinyal Analizi”
  - 3 özellik kartı: Sinyal Tarama / Grafik Analizi / Akıllı Açıklamalar
  - CTA: “Ücretsiz Başla” → `/kayit`
  - Üstte `Navbar` bileşeni.

- `app/tarama/page.tsx`  
  - **Sinyal Tarama** ekranı (projenin ana fonksiyonel sayfası).
  - Filtreler:
    - Sinyal tipi: `Tümü / RSI Uyumsuzluğu / Hacim Anomalisi / Trend Başlangıcı / Kırılım`
    - Yön: `Tümü / Yukarı / Aşağı`
  - Taranan semboller (hard-coded):  
    `["THYAO","AKBNK","GARAN","SISE","EREGL","KCHOL","SAHOL","TUPRS","ASELS","PGSUS","BIMAS","TCELL","FROTO","TOASO","HALKB","VAKBN","ISCTR","OYAKC","KOZAL","EKGYO"]`
  - Her sembol için:
    - Yahoo’dan OHLCV veri çek (sunucudaki `/api/ohlcv` üstünden).
    - `detectAllSignals()` ile 4 sinyal tipini hesapla.
  - **Sinyal deduplikasyonu**:
    - Her sembol için birden fazla sinyal bulunsa bile, grid’de **yalnızca en güçlü sinyal** gösterilir.
    - Öncelik sırası: `güçlü > orta > zayıf`.
  - Her kart:
    - Sembol
    - Sinyal tipi + yön + şiddet (`SignalBadge`)
    - Mini sparkline (`MiniChart`)
    - AI açıklaması (async `/api/explain` çağrısı)
    - “Detay Gör” → `/hisse/[sembol]`

- `app/hisse/[sembol]/page.tsx`  
  - **Hisse detay sayfası**
  - Özellikler:
    - Zaman aralığı (timeframe) seçici: **1H, 1G, 1H(hafta), 1A, 3A, 1Y**
      - Buton stilleri:  
        - Aktif: `bg-primary`, `text-white`  
        - Pasif: `bg-surface`, `text-text-secondary`, `hover:bg-surface/80`  
        - Hepsi `rounded-lg`, `border-border` içinde, tasarım sistemi ile uyumlu.
      - **Varsayılan**: `1A` (1 ay / günlük mumlar).
    - Ana grafik kartı:
      - `StockChart` ile mum grafiği + EMA9 / EMA21 çizgileri.
    - İkinci grafik kartı:
      - `StockChart` `showRsi` modunda, RSI(14) çizgisi.
    - “İzleme listesine ekle” butonu (Supabase Auth gerektirir):
      - Giriş yoksa `/giris?redirect=/hisse/SEMBOL`’e yönlendirir.
    - Alt bölüm:
      - `detectAllSignals` sonucu bulunan sinyaller listelenir.
      - Her sinyal kartında `SignalBadge` + `SignalExplanation` (AI açıklaması).

  - **Timeframe mantığı**:
    - State: `const [timeframe, setTimeframe] = useState<TimeframeKey>('1A');`
    - `useEffect` bağımlılıkları: `[sembol, timeframe]`
    - `timeframe === '1A'` için:
      - `fetchOHLCVClient(sembol, 30)` → 1 aylık günlük veri
    - Diğer timeframe’ler için:
      - `fetchOHLCVByTimeframeClient(sembol, timeframe)`
    - Yeni veri geldikçe:
      - `candles` güncelleniyor
      - `detectAllSignals` tekrar çalışıyor → sinyaller güncel timeframe’e göre
      - Tüm sinyaller için `/api/explain` ile Claude açıklamaları yeniden çekiliyor.

- `app/dashboard/page.tsx`  
  - Giriş yapmış kullanıcılar için dashboard.
  - Hoş geldiniz mesajı (`user.email`).
  - **Son sinyaller** listesi (maks. 10 adet, taranan BIST sembollerinden).
  - Sağda `WatchlistPanel` — kullanıcının izleme listesini gösterir.
  - Giriş yapılmamışsa kullanıcıyı `/giris` sayfasına yönlendiren bilgilendirme kartı.

- `app/giris/page.tsx`  
  - “Giriş Yap” formu (e-posta + şifre).
  - Supabase Auth ile `signInWithPassword` çağrısı.
  - `redirect` query parametresi desteklenir (örneğin `/giris?redirect=/hisse/THYAO`).
  - `useSearchParams()` kullanımı **Suspense** ile sarılmıştır (Next.js 14 gereksinimi).

- `app/kayit/page.tsx`  
  - “Ücretsiz Başla” kayıt formu (Supabase `signUp`).
  - Başarılı kayıt sonrası kısa bir başarı mesajı ve otomatik yönlendirme.

#### 3.2. API Route’ları (`/app/api`)

- `app/api/ohlcv/route.ts`
  - **GET** `?symbol=THYAO&days=90` → gün bazlı OHLCV verisi (backward-compatible).
  - **GET** `?symbol=THYAO&tf=1A` gibi timeframe parametresi ile:
    - `tf` değerleri: `'1H' | '1G' | '1W' | '1A' | '3A' | '1Y'`
    - Bu durumda `fetchOHLCVByTimeframe` çağrılır.
  - Hata durumlarında Türkçe mesaj döner (ör. “Sembol gerekli”, “Geçersiz timeframe parametresi”).

- `app/api/explain/route.ts`
  - **POST** `{ signal, priceData? }` gövdesi alır.
  - `generateSignalExplanation(signal, priceData)` ile Anthropic Claude’a istek atar.
  - Başarılı yanıt: `{ explanation: string }`
  - Hata durumunda Türkçe hata mesajı döner.

---

### 4. Domain Mantığı: Sinyaller (`/lib/signals.ts`)

Tüm fonksiyonlar `OHLCVCandle[]` girdisi ve `StockSignal` çıktısı (veya `null`) kullanır.
`StockSignal` yapısı:

- `type`: string (Türkçe sinyal adı)
- `sembol`: hisse sembolü
- `severity`: `'güçlü' | 'orta' | 'zayıf'`
- `direction`: `'yukari' | 'asagi' | 'nötr'`
- `data`: detayları tutan nesne (ör. RSI değerleri, EMA’lar, kırılan seviye vb.)

#### 4.1. RSI Uyumsuzluğu — `detectRsiDivergence`

- 14 periyotluk **RSI** hesabı (`calculateRSI`).
- 10 mumluk bir aralıkta:
  - Düşükler ve yüksekler üzerinden iki dip ve iki tepe tespiti.
  - **Bullish divergence**:
    - Fiyat: Daha düşük dip
    - RSI: Daha yüksek dip
    - RSI < 40 ve özellikle < 30 ise `severity = 'güçlü'`, 30–35 ise `'orta'`, aksi `'zayıf'`.
    - `direction: 'yukari'`
  - **Bearish divergence**:
    - Fiyat: Daha yüksek tepe
    - RSI: Daha düşük tepe
    - RSI > 60 ve özellikle > 70 ise `severity = 'güçlü'`, 65–70 ise `'orta'`, aksi `'zayıf'`.
    - `direction: 'asagi'`

#### 4.2. Hacim Anomalisi — `detectVolumeAnomaly`

- **20 günlük ortalama hacim** (`averageVolume`).
- Son mumun hacmi ve bir önceki mumun kapanışı kullanılır.
- **Eşikler (güncellenmiş)**:
  - `ratio = last.volume / avgVolume`
  - `ratio < 1.8` → sinyal yok (daha esnek hale getirildi; eskiden 2.0 idi).
  - `severity`:
    - `ratio >= 3` → `'güçlü'`
    - `2.3 <= ratio < 3` → `'orta'`
    - `1.8 <= ratio < 2.3` → `'zayıf'`
- Yön belirleme (son kapanış / önceki kapanış yüzde farkı):
  - > +%0.5 → `'yukari'`
  - < -%0.5 → `'asagi'`
  - aksi → `'nötr'`

#### 4.3. Trend Başlangıcı (EMA Crossover) — `detectTrendStart`

- EMA9 ve EMA21 hesaplanır (`calculateEMA`).
- **Güncel mantık**:
  - Son **5 mum** (eski değeri 3’tü) kontrol edilir.
  - Her adımda:
    - Önceki mumda EMA9 <= EMA21 ve şu an EMA9 > EMA21 → **bullish crossover**
    - Önceki mumda EMA9 >= EMA21 ve şu an EMA9 < EMA21 → **bearish crossover**
  - `severity`:
    - 1 mum önce olmuşsa → `'güçlü'`
    - 2 mum önce → `'orta'`
    - 3–5 mum önce → `'zayıf'`

#### 4.4. Destek/Direnç Kırılımı — `detectSupportResistanceBreak`

- Son 20 mumun high/low değerleri:
  - `high20`: maksimum high
  - `low20`: minimum low
- Hacim:
  - 20 günlük ortalama hacim
  - Son mum hacmi ortalamanın üzerinde olmalı.
- Kırılım:
  - Son kapanış `high20` üzerinde ve hacim ortalamanın en az 1.0x üzeri → **direnç kırılımı**
  - Son kapanış `low20` altında ve hacim ortalamanın en az 1.0x üzeri → **destek kırılımı**
  - `severity`: hacim ortalamanın 1.5x üzerindeyse `'güçlü'`, aksi `'orta'`.

#### 4.5. Toplayıcı Fonksiyon — `detectAllSignals`

```ts
export function detectAllSignals(sembol: string, candles: OHLCVCandle[]): StockSignal[] {
  const signals: StockSignal[] = [];
  const rsi = detectRsiDivergence(sembol, candles);
  const vol = detectVolumeAnomaly(sembol, candles);
  const trend = detectTrendStart(sembol, candles);
  const breakout = detectSupportResistanceBreak(sembol, candles);
  if (rsi) signals.push(rsi);
  if (vol) signals.push(vol);
  if (trend) signals.push(trend);
  if (breakout) signals.push(breakout);
  return signals;
}
```

Bu fonksiyon hem taramada hem hisse detay sayfasında kullanılıyor.

---

### 5. Yahoo Finance Entegrasyonu (`/lib/yahoo.ts`)

`yahoo-finance2` paketi, Next.js build sırasında Deno test bağımlılıkları yüzünden sorun çıkardığı için **kaldırıldı**. Onun yerine doğrudan Yahoo chart JSON endpoint’i kullanılıyor.

#### 5.1. Ortak Noktalar

- BIST sembollerine `.IS` soneki ekleniyor:

  ```ts
  const BIST_SUFFIX = '.IS';
  function toYahooSymbol(sembol: string): string {
    const trimmed = sembol.trim().toUpperCase();
    return trimmed.endsWith(BIST_SUFFIX) ? trimmed : `${trimmed}${BIST_SUFFIX}`;
  }
  ```

- Ortak parse mantığı:
  - `chart.result[0].timestamp[]`
  - `chart.result[0].indicators.quote[0]` içindeki `open, high, low, close, volume` dizileri.
  - Bunlardan `OHLCVCandle[]` dizisi üretiliyor.

#### 5.2. Gün bazlı fonksiyon — `fetchOHLCV`

- Girdi: `sembol`, `days` (varsayılan 90)
- `days` değerine göre `range` seçiliyor (örn. 30 gün → `1mo`, 90 gün → `3mo`).
- `interval` her zaman `1d`.

#### 5.3. Timeframe bazlı fonksiyon — `fetchOHLCVByTimeframe`

- `YahooTimeframe` tipi: `'1H' | '1G' | '1W' | '1A' | '3A' | '1Y'`
- `getTimeframeParams` fonksiyonu ile `range` + `interval` belirleniyor (örn. `1H` → `range=1d`, `interval=5m`).
- Bu fonksiyon hisse detay sayfasındaki timeframe butonları tarafından dolaylı olarak kullanılıyor (`/api/ohlcv?tf=...`).

---

### 6. Anthropic Claude Entegrasyonu (`/lib/claude.ts`)

- Kütüphane: `@anthropic-ai/sdk`
- Fonksiyon: `generateSignalExplanation(signal, priceData?)`
- **System prompt** (Türkçe, sade açıklama):  

  > Sen BistAI'ın borsa analiz asistanısın. Türk bireysel yatırımcılara ve traderlara teknik analiz sinyallerini sade, anlaşılır Türkçe ile açıklıyorsun. Jargonu minimumda tut, somut ol. Cevabın maksimum 3 cümle olsun.

- **Kullanıcı prompt şablonu**:

  ```txt
  Hisse: {sembol}
  Sinyal tipi: {signal.type}
  Sinyal yönü: {signal.direction}
  Sinyal şiddeti: {signal.severity}
  Ek veri: {JSON.stringify(signal.data)}
  Bu sinyali yatırımcıya kısaca açıkla.
  ```

- Hata durumunda:
  - Ortam değişkeni eksikse: “AI açıklaması için ANTHROPIC_API_KEY ortam değişkeni tanımlanmalı.”
  - API hatası varsa: “AI açıklaması alınamadı: {mesaj}”

Bu fonksiyon yalnızca **sunucu tarafında** (API route üzerinden) çağrılıyor; istemci tarafı sadece `/api/explain` endpoint’ine istek atıyor.

---

### 7. Supabase ve Veritabanı Şeması

#### 7.1. Supabase client (`/lib/supabase.ts`)

- `createClient()` → `createSupabaseClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)`
- Yardımcı fonksiyonlar:
  - `getWatchlist(userId)`
  - `addToWatchlist(userId, sembol)`
  - `removeFromWatchlist(userId, sembol)`
  - `isInWatchlist(userId, sembol)`
  - `saveSignal(userId, sembol, signalType, signalData, aiExplanation)`
  - `getRecentSavedSignals(userId, limit)`

#### 7.2. SQL şema (`/supabase/schema.sql`)

- **watchlist**
  - `id uuid primary key default gen_random_uuid()`
  - `user_id uuid not null references auth.users(id) on delete cascade`
  - `sembol text not null`
  - `created_at timestamptz default now()`
  - `unique(user_id, sembol)`

- **saved_signals**
  - `id uuid primary key default gen_random_uuid()`
  - `user_id uuid not null references auth.users(id) on delete cascade`
  - `sembol text not null`
  - `signal_type text not null`
  - `signal_data jsonb not null default '{}'`
  - `ai_explanation text not null`
  - `created_at timestamptz default now()`

- **RLS (row level security)** her iki tablo için açılmış ve politika sadece `auth.uid() = user_id` satırlarına izin verecek şekilde ayarlanmıştır.

---

### 8. UI Bileşenleri ve Tasarım Sistemi

- **Renkler** (`tailwind.config.ts` + `globals.css`):
  - Arka plan: `#0a0a0f` → `bg-background`
  - Yüzey: `#12121a` → `bg-surface`
  - Kenarlık: `#1e1e2e` → `border-border`
  - Birincil: `#6366f1` → `bg-primary`, `text-primary`
  - Bullish: `#22c55e` → `text-bullish`
  - Bearish: `#ef4444` → `text-bearish`
  - Yazı: `#f1f5f9` (`text-text-primary`), ikincil `#94a3b8` (`text-text-secondary`)
  - Kart radius: `12px` (`rounded-card`)

- **Önemli bileşenler**:
  - `Navbar` — üst navigasyon, logo + Ana Sayfa/Tarama/Dashboard + Giriş/Ücretsiz Başla butonları.
  - `StockCard` — sembol, `SignalBadge`, `MiniChart`, `SignalExplanation`, “Detay Gör”.
  - `SignalBadge` — sinyal tipi + yukarı/aşağı/nötr ikon + şiddet etiketi.
  - `MiniChart` — lightweight-charts kullanarak küçük çizgi grafik.
  - `StockChart` — ana mum grafiği (EMA’lar) ve RSI grafiği (ayrı mod).
  - `WatchlistPanel` — sağ sidebar benzeri panelde izleme listesi yönetimi.
  - Tüm buton/input/card vb. için shadcn benzeri `components/ui/*` bileşenleri.

Tüm asenkron operasyonlarda (tarama, grafik yükleme, form submit, AI açıklaması) uygun **loading/hata durumları** ve Türkçe mesajlar gösterilmektedir.

---

### 9. Çevre Değişkenleri (`.env.local`)

- `NEXT_PUBLIC_SUPABASE_URL=`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=`
- `ANTHROPIC_API_KEY=`
- `NEXT_PUBLIC_APP_URL=http://localhost:3000`

Bu değerler boş bırakılmıştır; kullanıcı tarafından doldurulmalıdır.

---

### 10. Build Durumu ve Uyum

- `npm run build` başarıyla çalışmaktadır.
- Tüm sayfalar Next.js 14 App Router kurallarına uygundur (özellikle `useSearchParams` için Suspense kullanımı).
- `yahoo-finance2` yerine pure `fetch` kullanıldığı için Deno/Node test bağımlılığı sorunları çözülmüştür.

---

Bu dosya, başka bir yapay zekânın projeyi hızlıca anlaması için **yüksek seviye ama teknik** bir özet sunar. İhtiyaç halinde ek API detayları veya kod seviyesinde açıklamalar buradan genişletilebilir.

