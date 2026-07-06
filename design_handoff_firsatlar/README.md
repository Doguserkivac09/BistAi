# Handoff: Investable Edge — Fırsatlar (yatırım radarı, liquid glass)

## Overview
Investable Edge "Fırsatlar" sayfasının yeniden tasarımı — liquid glass estetiğiyle, hem **koyu** hem **açık** tema, mobil (380px) + masaüstü (1180×800). Eski düz liste yerine zengin bir "yatırım radarı": özet şerit + Günün Fırsatı kartı (skor halkası + sparkline + AI gerekçe) + sıralı radar tablosu + kategori dağılımı.

Dosya: `Investable Edge Firsatlar.dc.html` (4 çerçeve aynı canvas'ta). `support.js` yalnızca tarayıcıda görüntülemek için — production'a taşınmaz. Veriler `renderVals()` içinde örnek; gerçek uygulamada `/api/opportunities` benzeri endpoint'ten gelir.

## Liquid glass — neden iki tema
Liquid glass ancak **arkasında koyu/renkli bir zemin** olduğunda okunur (cam bu zemini bulanıklaştırıp kırar). Düz beyaz zeminde etki kaybolur. Bu yüzden iki varyant:
- **Koyu:** derin lacivert `#0a0e17` + tepede yeşil/mor radial ışıma.
- **Açık:** düz beyaz DEĞİL — pastel gradyan zemin `linear-gradient(162deg,#e9f0ff,#f4f0ff,#eafaf2,#fef4ec)` + düşük opaklıklı renk blob'ları. Frosted beyaz kartlar bu tinti bulanıklaştırır.

## Cam kart reçetesi
- **Koyu kart:** `background:rgba(255,255,255,0.05)` · `backdrop-filter:blur(20-24px)` · `border:1px solid rgba(255,255,255,0.09)` · `box-shadow:inset 0 1px 0 rgba(255,255,255,0.1), 0 18-24px 44-54px -26px rgba(0,0,0,0.7)`.
- **Açık kart:** `background:rgba(255,255,255,0.55)` · `backdrop-filter:blur(20px)` · `border:1px solid rgba(255,255,255,0.8)` · `box-shadow:inset 0 1px 0 rgba(255,255,255,0.9), 0 12-18px 30-40px -18px rgba(80,90,120,0.3)`.
- **Öne çıkan kart** ekstra renkli iç tint: koyu `linear-gradient(140deg,rgba(63,206,138,0.16),rgba(107,111,245,0.12))`, açık `linear-gradient(140deg,rgba(22,163,91,0.12),rgba(107,111,245,0.1))`.

## Renk / tipografi (öncekiyle aynı sistem)
- Aksan yeşil: `#16a35b` (koyu zeminde `#3fce8a`) · AI mor `#6b6ff5`/`#8b8fff`/`#a6a9ff` · negatif `#e5484d` (koyu `#ff6b6b`) · amber `#c98a00`/`#f5c451`.
- Koyu tema metin: `#f4f6fa` / muted `#9aa3b2` / faint `#6b7280`. Açık tema metin: `#16181d` / muted `#6b7280` / gövde `#4b5160`.
- Manrope (UI) + JetBrains Mono (tüm sayılar, tabular-nums).

## Blok listesi + gerekçe
1. **Başlık + Canlı çipi** — "Fırsatlar · Yatırım radarı · 12 aktif sinyal"; sayfanın canlı olduğunu belirtir.
2. **Radar özet şeridi** (3 cam kutu) — Bugün yeni · Ortalama skor · En güçlü sektör; kullanıcıya tek bakışta radarın nabzını verir.
3. **Filtre chipleri** — Tümü / Momentum / Akıllı para / Temettü (aktif = dolu, pasif = cam).
4. **Günün Fırsatı** (öne çıkan kart) — en yüksek skorlu sinyal: sembol + değişim + **skor halkası** (SVG ring, `stroke-dasharray` ile skor/100) + geniş sparkline + AI gerekçe cümlesi + etiketler. Masaüstünde sağ rayda + "İzle / Detay" butonları. Sayfanın odak noktası.
5. **Sıralı radar** — skora göre sıralı liste. Her satır: sıra no, sembol, **mini trend sparkline**, fiyat (masaüstü), değişim, skor barı. Mobilde kompakt kart, masaüstünde tam tablo (başlık satırlı).
6. **Kategori dağılımı** (masaüstü sağ ray) — Momentum / Akıllı para / Temettü bar dağılımı + yasal not.

Sıralama gerekçesi: önce radarın özeti (nabız), sonra tek "en iyi" fırsat (odak), sonra tam sıralı liste (derinlik), en sonda dağılım/bağlam.

## Skor halkası (score ring)
SVG iki daire: arka (soluk) + ön (aksan renk). Ön dairede `stroke-dasharray="{{ dash }} {{ C }}"`, `C = 2πr`, `dash = score/100 × C`, `transform="rotate(-90 cx cy)"`. Merkeze skor sayısı + "SKOR" etiketi. Ölçüler renderVals'ta hesaplanır (ringDash/ringC mobil r=23, ringDash2/ringC2 masaüstü r=24).

## Etkileşim & davranış
- Filtre chip → listeyi kategoriye göre süzer; aktif chip dolu.
- Satır / öne çıkan kart tıklama → Hisse detay. "İzle" → takip listesine ekler, "Detay" → hisse detayı.
- Sparkline'lar son ~16 barlık intraday/trend; pozitif yeşil, negatif kırmızı.
- Sayı formatı TR locale (binlik `.`, ondalık `,`).

## Veri → endpoint eşlemesi
| Alan | Endpoint notu |
|---|---|
| Fırsat listesi (sembol, fiyat, chg, skor, kategori, etiket, gerekçe, trend serisi) | `/api/opportunities?sort=score` |
| Radar özeti (yeni sayısı, ort. skor, en güçlü sektör) | `/api/opportunities/summary` |
| Kategori dağılımı | `/api/opportunities/categories` |

## Files
- `Investable Edge Firsatlar.dc.html` — tasarım kaynağı (4 çerçeve, örnek verili `renderVals()`)
- `support.js` — görüntüleme runtime'ı (production'a dahil edilmez)
