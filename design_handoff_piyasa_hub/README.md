# Handoff: Investable Edge — Piyasa hub (Sektörler + Emtia + Gündem, liquid glass)

## Overview
Investable Edge "Piyasa" hub'ı — tek sayfada **yatay sekme şeridi** ile üç görünüm: **Sektörler** (sektör rotasyonu), **Emtia** (emtia + döviz + endeks) ve **Gündem** (haber + KAP + ekonomi takvimi). Liquid glass estetiği, hem **koyu** hem **açık** tema, mobil (380px) + masaüstü (1180px).

Dosya: `Investable Edge Piyasa Hub.dc.html` (4 çerçeve aynı canvas'ta: mobil/masaüstü × koyu/açık). `support.js` yalnızca tarayıcıda görüntülemek için — production'a taşınmaz. Veriler `renderVals()` içinde örnek; gerçek uygulamada API'den gelir.

## Sekme şeridi (hub deseni)
Başlığın hemen altında yatay sekme şeridi (Sektörler | Emtia | Gündem). Aktif sekme aksan renkli alt çizgi (`border-bottom:2px solid`), pasif sekme muted. Sekme durumu `state.<frame>.tab`; `setTab(fk, key)` ile değişir. `<sc-if>` ile aktif sekmenin içeriği render edilir. Aynı desen Fırsatlar ve Portföyüm hub'larıyla birebir tutarlı.

## Liquid glass — neden iki tema
Cam ancak arkasında koyu/renkli zemin olduğunda okunur.
- **Koyu:** `#0a0e17` + tepede yeşil/mor radial ışıma.
- **Açık:** düz beyaz DEĞİL — pastel gradyan `linear-gradient(160deg,#e9f0ff,#f4f0ff,#eafaf2,#fef4ec)` + düşük opaklıklı blob'lar. Frosted beyaz kartlar bu tinti bulanıklaştırır.

## Cam kart reçetesi
- **Koyu kart:** `background:rgba(255,255,255,0.05)` · `backdrop-filter:blur(20-24px)` · `border:1px solid rgba(255,255,255,0.09)` · `box-shadow:inset 0 1px 0 rgba(255,255,255,0.1), 0 24px 54px -28px rgba(0,0,0,0.7)`.
- **Açık kart:** `background:rgba(255,255,255,0.55)` · `backdrop-filter:blur(20px)` · `border:1px solid rgba(255,255,255,0.8)` · `box-shadow:inset 0 1px 0 rgba(255,255,255,0.9), 0 18px 40px -22px rgba(80,90,120,0.32)`.
- **AI yorum kartı** ekstra renkli iç tint (mor/yeşil gradyan).

## Renk / tipografi (sistem geneli)
- Aksan yeşil `#16a35b` (koyu `#3fce8a`) · AI mor `#6b6ff5`/`#8b8fff`/`#a6a9ff` · negatif `#e5484d` (koyu `#ff6b6b`) · amber `#c98a00`/`#f5c451`.
- Koyu metin `#f4f6fa` / muted `#9aa3b2` / faint `#6b7280`. Açık metin `#16181d` / muted `#6b7280` / gövde `#4b5160`.
- Manrope (UI) + JetBrains Mono (tüm sayılar, tabular-nums).

## Sekme içerikleri + gerekçe

### 1. Sektörler
- **Özet şerit** (3 kart): En güçlü sektör · En zayıf sektör · Rotasyon yönü.
- **Sektör güç tablosu**: her satır sektör adı + lider hisse + trend sparkline + günlük % + haftalık % + **güç skoru barı** (0-100). Skora göre sıralı. Mobilde ilk 7, masaüstünde 12 sektör (tablo dikey kaydırır).
- **Sağ ray** (masaüstü): AI sektör yorumu + Öne çıkanlar (yükselen/düşen mover'lar).

### 2. Emtia
- **Emtia grid** (2 kolon): Gram/Ons altın, Brent, USD/TRY, EUR/TRY, BIST 100, gümüş, Bitcoin. Her kart: ad + birim + değişim çipi + büyük değer + **alan grafiği** (gradient dolgulu sparkline). Mobilde ilk 6, masaüstünde 8.
- **Sağ ray** (masaüstü): AI emtia yorumu + Makro göstergeler (TCMB faizi, enflasyon, CDS, DXY).

### 3. Gündem
- **Kaynak filtresi çipleri**: Tümü / Haber / KAP / Takvim (aktif = dolu, pasif = cam). `state.<frame>.gsrc`; `setSrc()` ile süzer.
- **Akış**: her kart tür rozeti (KAP mor / Haber yeşil / Takvim amber) + başlık + kaynak + önem etiketi (Yüksek/Orta/Düşük) + saat. Mobilde kompakt, masaüstünde geniş satır.
- **Sağ ray** (masaüstü): Ekonomi takvimi (saat + bölge + beklenti/önceki + önem noktası).

Sıralama gerekçesi: sektör (piyasanın büyük resmi) → emtia (makro bağlam) → gündem (haber akışı). Her sekmede sol içerik + sağ AI/bağlam rayı.

## Etkileşim & davranış
- Sekme şeridi → görünüm değiştirir (`<sc-if>`).
- Gündem kaynak çipi → akışı türe göre süzer.
- Sparkline/alan grafiği son ~16-20 barlık seri; pozitif yeşil, negatif kırmızı.
- Sayı formatı TR locale (binlik `.`, ondalık `,`); büyük değerler binlik ayraçlı.
- Dikey kaydırılan listelerde scrollbar gizli (`.noscroll`).

## Veri → endpoint eşlemesi
| Alan | Endpoint notu |
|---|---|
| Sektör gücü (ad, lider, günlük/haftalık %, skor, trend serisi) | `/api/market/sectors` |
| Öne çıkanlar (mover'lar) | `/api/market/movers` |
| Emtia/döviz/endeks (ad, değer, %, seri) | `/api/market/commodities` |
| Makro göstergeler | `/api/market/macro` |
| Gündem akışı (tür, başlık, kaynak, önem, saat) | `/api/market/feed?src=` |
| Ekonomi takvimi | `/api/market/calendar` |

## Files
- `Investable Edge Piyasa Hub.dc.html` — tasarım kaynağı (4 çerçeve, örnek verili `renderVals()`)
- `support.js` — görüntüleme runtime'ı (production'a dahil edilmez)
