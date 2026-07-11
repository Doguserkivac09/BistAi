# TradingView Advanced Charting Library — Kurulum

> Amaç: TradingView'in **tam profesyonel grafik arayüzünü** (çizim araçları, indikatörler)
> **kendi verimizle** (Yahoo OHLCV, 619 BIST + US) çalıştırmak. Böylece TradingView'in
> ücretsiz embed widget'ının BIST veri-lisansı sorunu ("Sembol sadece TradingView'de
> bulunabilir" / yanlışlıkla Apple gösterme) **tamamen ortadan kalkar** — veri bizden gelir.

## Neden manuel bir adım gerekiyor?

Charting Library **npm'de yok** ve **redistribute edilemez** (lisans). TradingView'den
erişim alıp dosyaları indirmek gerekiyor. Bu adım **sizin TradingView hesabınızla** yapılır;
kod tarafındaki her şey (datafeed, bileşen, entegrasyon) **hazır** — dosyalar yerine konunca
otomatik devreye girer. Dosyalar yokken grafikler zarifçe kendi SignalChart'ımıza düşer
(BIST grafikleri yine çalışır).

## Adımlar

### 1) Erişim iste (bir kez)
- https://www.tradingview.com/advanced-charts/ → "Get the library" / GitHub erişim formu.
- TradingView, `charting_library` özel GitHub reposuna erişim verir (genelde 1-2 gün).

### 2) Dosyaları indir ve yerleştir
Repodan iki şey lazım — ikisi de `public/` altına:

```
public/
  charting_library/            ← repo'daki charting_library/ klasörünün TAMAMI
    charting_library.standalone.js
    ... (bundles, static, vs.)
  datafeeds/
    udf/
      dist/
        bundle.js              ← repo'daki datafeeds/udf/dist/bundle.js
```

> Bileşenin beklediği yollar (`components/new/AdvancedChart.tsx`):
> - `/charting_library/charting_library.standalone.js`
> - `/datafeeds/udf/dist/bundle.js`
> - `library_path: '/charting_library/'`

### 3) Bitti — otomatik devreye girer
Dosyalar yerindeyse `AdvancedChart` kütüphaneyi yükler ve `/api/udf` datafeed'imizden
(bizim OHLCV verimiz) besler. Hisse detay grafiği + tüm sparkline modalları tam TradingView
arayüzünü gösterir. Dosya yoksa sessizce SignalChart'a düşer.

## Kod tarafında hazır olanlar (bu commit)

| Parça | Dosya |
|-------|-------|
| UDF datafeed (config/symbols/search/history/time) | `app/api/udf/[action]/route.ts` |
| UDF yardımcıları (çözünürlük eşleme, bar formatı, arama) | `lib/udf.ts` |
| Kütüphane bileşeni + SignalChart fallback | `components/new/AdvancedChart.tsx` |
| Modal + hisse detay entegrasyonu | `components/new/ChartModal.tsx`, `app/hisse/[sembol]/HisseDetailClient.tsx` |

## Datafeed notları
- **Veri kaynağı:** Yahoo OHLCV (mevcut `fetchOHLCV*`). BIST: 15dk/30dk/1s/G/H/A. US: G/H/A.
- **Fiyat ölçeği:** 2 ondalık (pricescale 100). BIST para birimi TRY, US USD.
- **Gerçek-zamanlı akış yok** (streaming). Barlar gecikmeli/geçmiş; `subscribeBars` boş
  (UDFCompatibleDatafeed periyodik `getBars` çeker). İleride canlı feed eklenebilir.
- **CORS açık** (`/api/udf`) — kütüphane farklı origin'de host edilse de çalışır.

## Test (dosyalar gelmeden)
`/api/udf/*` endpoint'leri şimdiden gerçek veri döndürür:
```
/api/udf/config
/api/udf/symbols?symbol=GARAN
/api/udf/search?query=gar
/api/udf/history?symbol=GARAN&resolution=D&from=<unix>&to=<unix>
```
