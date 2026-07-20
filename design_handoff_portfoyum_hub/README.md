# Handoff: Investable Edge — Portföyüm hub (Takip Listem + Alarmlar + Sinyal Takip, liquid glass)

## Overview
Investable Edge "Portföyüm" hub'ı — tek sayfada **yatay sekme şeridi** ile üç görünüm: **Takip Listem** (izleme listesi), **Alarmlar** (fiyat/verdict/hacim/haber alarmları) ve **Sinyal Takip** (akıllı para / teknik / verdict↑ / hacim sinyalleri). Liquid glass estetiği, hem **koyu** hem **açık** tema, mobil (380px) + masaüstü (1180px).

Dosya: `Investable Edge Portfoyum Hub.dc.html` (4 çerçeve aynı canvas'ta: mobil/masaüstü × koyu/açık). `support.js` yalnızca tarayıcıda görüntülemek için — production'a taşınmaz. Veriler `renderVals()` içinde örnek; gerçek uygulamada API'den gelir.

> Not: Bu hub takip/alarm/sinyal odaklıdır. Pozisyon/varlık bazlı portföy değeri, allokasyon ve K/Z görünümü ayrı `Investable Edge Portfoyum.dc.html` dosyasındadır (`design_handoff_portfoyum`).

## Sekme şeridi (hub deseni)
Başlığın hemen altında yatay sekme şeridi (Takip Listem | Alarmlar | Sinyal Takip). Aktif sekme aksan renkli alt çizgi, pasif muted. `state.<frame>.tab`; `setTab(fk, key)` ile değişir, `<sc-if>` ile içerik render edilir. Fırsatlar ve Piyasa hub'larıyla birebir tutarlı.

## Liquid glass — neden iki tema
Cam ancak arkasında koyu/renkli zemin olduğunda okunur.
- **Koyu:** `#0a0e17` + tepede yeşil/mor radial ışıma.
- **Açık:** pastel gradyan `linear-gradient(162deg,#e9f0ff,#f4f0ff,#eafaf2,#fef4ec)` + düşük opaklıklı blob'lar.

## Cam kart reçetesi
- **Koyu kart:** `background:rgba(255,255,255,0.05)` · `backdrop-filter:blur(20-24px)` · `border:1px solid rgba(255,255,255,0.09)` · `box-shadow:inset 0 1px 0 rgba(255,255,255,0.1)`.
- **Açık kart:** `background:rgba(255,255,255,0.55)` · `backdrop-filter:blur(20px)` · `border:1px solid rgba(255,255,255,0.8)` · `box-shadow:inset 0 1px 0 rgba(255,255,255,0.9)`.

## Renk / tipografi (sistem geneli)
- Aksan yeşil `#16a35b` (koyu `#3fce8a`) · AI mor `#6b6ff5`/`#8b8fff`/`#a6a9ff` · negatif `#e5484d` (koyu `#ff6b6b`) · amber `#c98a00`/`#f5c451`.
- Koyu metin `#f4f6fa` / muted `#9aa3b2`. Açık metin `#16181d` / muted `#6b7280` / gövde `#4b5160`.
- Manrope (UI) + JetBrains Mono (tüm sayılar, tabular-nums).
- **Verdict etiketleri**: iyi (ucuz/iskontolu) yeşil · nötr (makul) mor · dikkat (pahalı) amber. `white-space:nowrap` ile tek satır.

## Sekme içerikleri + gerekçe

### 1. Takip Listem
- **Sembol tablosu**: her satır sembol + ad + trend sparkline + fiyat + değişim % + **verdict etiketi**. Mobilde kompakt kart (ilk 8), masaüstünde tam tablo (başlık satırlı, 10 sembol, dikey kaydırır).
- **Sağ ray** (masaüstü): Takip özeti (yükselen/düşen sayısı + verdict dağılım barları) + AI takip notu.

### 2. Alarmlar
- **Özet şerit** (3 kart): Aktif alarm · Bugün tetiklenen · Pasif.
- **Alarm listesi**: her satır tür ikonu (Fiyat ₺ / Verdict ◆ / Hacim ≈ / Haber ✦) + sembol + koşul metni + durum etiketi + **aç/kapa toggle** (aktif = aksan dolu, sağda knob). Toggle durumu veriden (`on`).
- **Sağ ray** (masaüstü): Yeni alarm türü seçici + Bugün tetiklenen zaman çizelgesi.

### 3. Sinyal Takip
- **Tür filtresi çipleri**: Tümü / Akıllı para / Teknik / Verdict↑ / Hacim. `state.<frame>.sig`; `setSig()` süzer.
- **Sinyal akışı**: her kart tür rozeti + sembol + açıklama + detay + **yön etiketi** (Pozitif yeşil / Negatif kırmızı / Nötr gri) + saat. Mobilde kompakt (ilk 7), masaüstünde geniş satır.
- **Sağ ray** (masaüstü): AI sinyal özeti + sinyal tür dağılımı + yasal not.

Sıralama gerekçesi: neyi izliyorum (takip) → ne zaman haber ver (alarm) → şu an ne oluyor (sinyal).

## Etkileşim & davranış
- Sekme şeridi → görünüm değiştirir.
- Alarm toggle → aktif/pasif (görsel durum veriden).
- Sinyal tür çipi → akışı süzer.
- Verdict/yön etiketleri `white-space:nowrap` — bütünlük için tek satır.
- Sparkline son ~16 bar; pozitif yeşil, negatif kırmızı.
- Sayı formatı TR locale. Dikey listelerde scrollbar gizli (`.noscroll`).

## Veri → endpoint eşlemesi
| Alan | Endpoint notu |
|---|---|
| Takip listesi (sembol, ad, fiyat, %, verdict, trend serisi) | `/api/watchlist` |
| Takip özeti + verdict dağılımı | `/api/watchlist/summary` |
| Alarmlar (sembol, tür, koşul, aktif) | `/api/alerts` |
| Tetiklenen alarmlar | `/api/alerts/triggered` |
| Sinyal akışı (tür, sembol, başlık, yön, saat) | `/api/signals?type=` |
| Sinyal tür istatistiği | `/api/signals/stats` |

## Files
- `Investable Edge Portfoyum Hub.dc.html` — tasarım kaynağı (4 çerçeve, örnek verili `renderVals()`)
- `support.js` — görüntüleme runtime'ı (production'a dahil edilmez)
