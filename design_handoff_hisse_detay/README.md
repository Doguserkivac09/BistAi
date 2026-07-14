# Handoff: Investable Edge — Hisse Detay (sade & profesyonel, liquid glass)

## Overview
Hisse detay sayfası — sadeleştirilmiş, büyük grafik odaklı, profesyonel. Liquid glass, koyu + açık tema, mobil (380px) + masaüstü (1180×800). 4 çerçeve aynı canvas'ta. `support.js` yalnızca görüntüleme içindir. Veriler `renderVals()` içinde örnek; production'da `/api/stocks/{sym}` benzeri endpoint'ten gelir.

## Tema / cam reçetesi (diğer sayfalarla aynı sistem)
- **Koyu zemin** `#0a0e17` + yeşil/mor radial ışıma. **Açık zemin** pastel gradyan (`#eafaf2→#e9f0ff→#f4f0ff`) + renk blob'ları (düz beyaz DEĞİL).
- **Koyu cam:** `rgba(255,255,255,0.05)` + `blur(20-24px)` + `1px solid rgba(255,255,255,0.09-0.13)` + inset üst ışık + koyu düşen gölge.
- **Açık cam:** `rgba(255,255,255,0.55)` + `blur(20px)` + `1px solid rgba(255,255,255,0.8)` + inset üst ışık.
- Aksan yeşil `#16a35b`/`#3fce8a`, AI mor `#6b6ff5`/`#a6a9ff`, direnç amber `#c98a00`/`#f5c451`, negatif `#e5484d`/`#ff6b6b`. Manrope + JetBrains Mono (sayılar).

## Tasarım kararı: sade ama yetkin
İlk sürüm fazla boşaldığı için 3 gerçek-değer öğesi eklendi (kalabalık yapmadan):
1. **Grafik üstü Destek/Direnç çizgileri** — grafiğin üstünde ince kesikli yatay çizgiler + minik etiket (Direnç 318 amber, Destek 302 mor). Trader'ın ilk baktığı seviyeler; AI metnindeki cümle yerine görselleştirildi.
2. **Hacim şeridi** — fiyat grafiğinin hemen altında düşük yükseklikli bar grafiği (her 5. bar vurgulu). Grafik altı boşluğu anlamlı doldurur.
3. **Alım/satım baskısı barı** — tek satır: %64 alıcı (yeşil) / %36 satıcı (kırmızı) + günlük nabız. Mobilde grafiğin altında, masaüstünde zaman aralığı sekmelerinin yanında.

## Blok listesi (yukarıdan aşağı)
1. **Header** — geri oku + sembol (THYAO) + ad/sektör + takip yıldızı (dolu, amber). Masaüstünde ek olarak Sat/Al butonları topbar'da.
2. **Fiyat** — büyük mono fiyat (mobil 34px, masaüstü 40px) + günlük değişim ₺ ve %.
3. **Büyük grafik** — sayfanın odağı. Mobilde 184px, masaüstünde orta sütunu dolduran esnek yükseklik. Alan + çizgi, üstünde S/R çizgileri.
4. **Hacim şeridi** — grafiğin altında.
5. **Zaman aralığı** — 1G (aktif) / 1H / 1A / 1Y / Tümü segment kontrolü.
6. **Alım/satım baskısı** — mobilde ayrı satır, masaüstünde sekmelerin yanında.
7. **AI Sinyal kartı** — AL rozeti + Güven %82 / Hedef 340,00 / Risk Orta; masaüstünde ek açıklama cümlesi.
8. **Temel istatistikler** — sade: mobil 4 (Açılış, Gün aralığı, Hacim, F/K), masaüstü 6 (+ Önceki kapanış, Piyasa değeri). Cam kart içinde.
9. **Al/Sat aksiyon çubuğu** — mobilde sabit alt bar (Sat outline + Al dolu, 1:1.4), masaüstünde topbar'da.

Masaüstü kurgu: sol geniş sütun = fiyat + büyük grafik + hacim + sekmeler + baskı; sağ 320px ray = AI sinyal + temel istatistik listesi.

## Grafik yardımcı çizimleri (SVG)
- Fiyat: `linePath`/`areaPath`, `preserveAspectRatio="none"`.
- S/R: grafik container'ı `position:relative`, çizgiler yüzde `top` ile absolute `border-top:1px dashed` + etiket (`transform:translateY(-50%)`). `resTop`/`supTop` renderVals'ta % olarak.
- Hacim: `viewBox="0 0 100 100" preserveAspectRatio="none"`, `<rect>` barlar; her 5. bar vurgu rengi.
- Baskı: iki flex segment (`buyPct`/`sellPct`).

## Etkileşim & davranış
- Zaman aralığı sekmesi grafiği + hacmi + S/R'yi seçilen aralığa göre günceller.
- Takip yıldızı → takip listesine ekle/çıkar.
- Al/Sat → emir akışı. Sembol/başlık statik; gerçek fiyat & seri API'den.
- Sayı formatı TR locale (binlik `.`, ondalık `,`).

## Veri → endpoint eşlemesi
| Alan | Endpoint notu |
|---|---|
| Fiyat + günlük değişim + fiyat serisi | `/api/stocks/{sym}/quote` + `/history?tf=` |
| Hacim serisi | `/api/stocks/{sym}/volume?tf=` |
| Destek/Direnç seviyeleri | `/api/stocks/{sym}/levels` |
| Alım/satım baskısı | `/api/stocks/{sym}/pressure` |
| AI sinyal (verdict, güven, hedef, risk, açıklama) | `/api/ai/signal/{sym}` |
| Temel veriler (açılış, kapanış, aralık, hacim, F/K, piyasa değeri) | `/api/stocks/{sym}/fundamentals` |

## Files
- `Investable Edge Hisse Detay.dc.html` — tasarım kaynağı (4 çerçeve, örnek verili `renderVals()`)
- `support.js` — görüntüleme runtime'ı (production'a dahil edilmez)
