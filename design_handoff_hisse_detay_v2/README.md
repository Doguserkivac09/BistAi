# Handoff: Investable Edge — Hisse Detay v2 (sekmeli, dinamik grafik, liquid glass)

## Overview
Hisse detay sayfasının v2'si — eski (Vercel'deki) sürümdeki profesyonel derinliği (mum grafik, teknik profil, şirket değer skoru, çoklu zaman dilimi, sektör emsalleri, backtest edilmiş sinyal güvenilirliği) korur, ama tek uzun sayfa yerine **4 çalışan sekmeye** böler: **Genel · Teknik · Temel · Haberler**. Böylece açılış ferah kalır, derinlik isteyen sekmeye geçer.

Dosya: `Investable Edge Hisse Detay v2.dc.html` — koyu + açık tema, mobil (380px) + masaüstü (1180×860), aynı canvas'ta 4 çerçeve. Sekmeler gerçekten tıklanabilir (state ile çalışır). `support.js` yalnızca görüntüleme içindir. Veriler `renderVals()` içinde örnek; production'da ilgili endpoint'lerden gelir.

## Neden sekmeli mimari
Eski sayfa tüm bunu tek sayfada veriyordu ve "karmaşık/sonsuz kaydırma" hissi yaratıyordu. Veri kaybetmeden sadeleştirmenin yolu ilişkili blokları gruplamaktı — kullanıcı "ne yapmalıyım" (Genel), "teknik olarak durum ne" (Teknik), "şirket sağlıklı mı" (Temel), "gündemde ne var" (Haberler) sorularından hangisini soruyorsa oraya gider.

## Tema / cam reçetesi (diğer sayfalarla aynı sistem)
- **Koyu zemin** `#0a0e17` + yeşil/mor radial ışıma. **Açık zemin** pastel gradyan (`#eafaf2→#e9f0ff→#f4f0ff`) — düz beyaz değil.
- **Koyu cam:** `rgba(255,255,255,0.05)` + `blur(20-24px)` + `1px solid rgba(255,255,255,0.09-0.13)` + inset üst ışık.
- **Açık cam:** `rgba(255,255,255,0.55)` + `blur(20-22px)` + `1px solid rgba(255,255,255,0.8)`.
- Aksan yeşil `#16a35b`/`#3fce8a`, AI mor `#6b6ff5`/`#a6a9ff`, amber `#c98a00`/`#f5c451` (uyarı/orta risk), negatif `#e5484d`/`#ff6b6b`. Manrope + JetBrains Mono (sayılar).
- Sekme aktif göstergesi: alt çizgi (2px) aksan renginde + koyu/açık metin; pasif sekme muted renk.

## Sekme içerikleri

### 1. Genel (varsayılan açılan)
- Sembol rozeti (gradient mor kutuda kısaltma) + ad/sektör + takip yıldızı + Sat/Al (masaüstü topbar'da).
- Büyük fiyat + günlük değişim.
- **Mum grafiği** (gerçek OHLC candlestick, yeşil/kırmızı gövdeler + fitiller) + üzerinde **EMA çizgisi** (amber) + **destek/direnç kesikli çizgileri** + etiket.
- **Hacim barları** grafiğin altında.
- Zaman aralığı sekmeleri (15D/30D/1S/1G/1H/1A).
- **AI Sinyal** kartı (GÜÇLÜ AL rozeti, Güven/Hedef/Risk, açıklama).
- **En güvenilir sinyal** — backtest edilmiş kazanma oranı (%93, "27 geçmiş sinyale göre") + sinyal adı + süre.
- Temel istatistikler (Açılış, Önceki kapanış, Gün aralığı, Hacim, 90G Yüksek/Düşük).

### 2. Teknik
- Gösterge çip seti: EMA, BB, EMA50/200, VWAP, S/R, RSI, MACD, Hacim (görsel toggle; ilk üçü aktif gösterimde).
- Mum grafiği + EMA + **Bollinger bantları** (üst/alt).
- **Tespit edilen sinyaller** listesi (MACD Kesişimi, RSI Seviyesi, Çift Dip — renk kodlu nokta + açıklama + vade).
- **Teknik Profil** — genel skor (27 Zayıf) + 5 boyut bar (Trend/Momentum/Hacim/Sinyal Gücü/Volatilite), her biri not metniyle.
- **Destek & Direnç** — güç noktalı (●●●●●) seviye listesi, fiyat + % mesafe.
- **Çoklu zaman dilimi** — 15DK/1S/1G/1H için AL/SAT kararı + ağırlık (zayıf/orta/güçlü).

### 3. Temel
- **Şirket Değer Skoru** halkası (SVG ring, 45/100, "Tut") + Değer/Büyüme/Kâr/Risk alt skorları.
- **Fiyat hedefleri** — slider (mevcut→hedef aralığı) + Mevcut/Hedef1/Hedef2 kartları (fiyat + % fark).
- Tam temel veri tablosu (Piyasa değeri, F/K, PD/DD, FAVÖK marjı, Net borç/FAVÖK, ROE, Temettü verimi, Gelir büyümesi).
- **Sektör emsalleri** — hisse + 3 rakip, 1 aylık performans karşılaştırması, mevcut hisse vurgulu satır.
- **Özel notlarım** — kullanıcıya özel not ekleme alanı (placeholder).

### 4. Haberler
- Hisseye özel haber akışı: her kart ikon rozeti (🗞 pozitif katalist / 📊 nötr / ⚠ dikkat) + başlık + özet + kaynak/zaman.
- **AI haber özeti** — son 7 günün sentiment/katalist özetinin tek paragrafı.
- **Duygu dağılımı** — Pozitif/Nötr/Negatif yüzde barları.

## Mum grafiği (candlestick) mantığı
`renderVals()` içindeki `candles(seed, n, w, h, pad, upColor, downColor)` yardımcı fonksiyonu sözde-rastgele OHLC üretir (seed'li LCG), her bar için gövde (`<rect>`) + fitil (`<line>`) döndürür; `emaPath()` üstel hareketli ortalama çizgisi, `bandPath()` Bollinger bant çizgileri hesaplar. Gerçek veri entegrasyonunda bu üç fonksiyon API'den gelen OHLC dizisiyle değiştirilir — SVG çizim mantığı (gövde/fitil/EMA/band) aynı kalabilir.

## Etkileşim & davranış
- **Sekmeler gerçekten çalışır** — her sekme kendi state'ini tutar (mobil/masaüstü, koyu/açık için ayrı state anahtarları: `dd`/`md`/`dl`/`ml`), tıklayınca ilgili içerik gösterilir.
- Zaman aralığı / gösterge çipleri şu an görsel (statik aktif durum); gerçek uygulamada tıklanınca grafiği güncellemeli.
- Sektör emsali satırı, sinyal satırı, haber kartı → ilgili detay sayfasına gider.
- Sayı formatı TR locale (binlik `.`, ondalık `,`).

## Veri → endpoint eşlemesi
| Alan | Endpoint notu |
|---|---|
| OHLC fiyat serisi + hacim | `/api/stocks/{sym}/candles?tf=` |
| AI sinyal + en güvenilir sinyal (backtest) | `/api/ai/signal/{sym}`, `/api/ai/signal-reliability/{sym}` |
| Teknik profil (Trend/Momentum/Hacim/Sinyal/Volatilite) | `/api/stocks/{sym}/technical-profile` |
| Destek/Direnç seviyeleri | `/api/stocks/{sym}/levels` |
| Tespit edilen sinyaller | `/api/stocks/{sym}/detected-signals` |
| Çoklu zaman dilimi kararları | `/api/stocks/{sym}/mtf-analysis` |
| Şirket değer skoru + alt skorlar | `/api/stocks/{sym}/value-score` |
| Fiyat hedefleri | `/api/stocks/{sym}/price-targets` |
| Temel veriler | `/api/stocks/{sym}/fundamentals` |
| Sektör emsalleri | `/api/sectors/{sector}/peers?highlight={sym}` |
| Özel notlar | `/api/users/me/notes/{sym}` |
| Haberler + duygu analizi | `/api/news/{sym}`, `/api/news/{sym}/sentiment` |

## Files
- `Investable Edge Hisse Detay v2.dc.html` — tasarım kaynağı (4 çerçeve × 4 sekme, örnek verili `renderVals()`, çalışan sekme state'i)
- `support.js` — görüntüleme runtime'ı (production'a dahil edilmez)

## Not
Bu dosya, önceki `Investable Edge Hisse Detay.dc.html` (tek sekmeli, sade sürüm) için verilen handoff'un yerini alır — o paket hâlâ mevcuttur ama bu v2 daha kapsamlı ve mevcut canlı üründeki özellik setine daha yakındır.
