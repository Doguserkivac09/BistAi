# Handoff: Investable Edge — Portföyüm (liquid glass)

## Overview
Portföyüm sayfası — liquid glass, koyu + açık tema, mobil (380px) + masaüstü (1180×800). 4 çerçeve aynı canvas'ta. `support.js` yalnızca görüntüleme içindir. Veriler `renderVals()` içinde örnek; production'da `/api/portfolio` benzeri endpoint'ten gelir.

## Tema / cam reçetesi (Fırsatlar ile aynı sistem)
- **Koyu zemin:** `#0a0e17` + yeşil/mor radial ışıma. **Açık zemin:** pastel gradyan `linear-gradient(162deg,#e9f0ff,#eafaf2,#f4f0ff,#fef4ec)` + renk blob'ları (düz beyaz DEĞİL — cam bunun üstünde okunur).
- **Koyu cam:** `rgba(255,255,255,0.05)` + `blur(20-24px)` + `1px solid rgba(255,255,255,0.09)` + inset üst ışık + koyu düşen gölge.
- **Açık cam:** `rgba(255,255,255,0.55)` + `blur(20px)` + `1px solid rgba(255,255,255,0.8)` + inset üst ışık.
- **Değer/AI kartları** renkli iç tint (`linear-gradient` yeşil↔mor).
- Aksan yeşil `#16a35b`/`#3fce8a`, AI mor `#6b6ff5`/`#8b8fff`/`#a6a9ff`, negatif `#e5484d`/`#ff6b6b`. Manrope + JetBrains Mono (sayılar).

## Blok listesi + gerekçe
1. **Değer kartı** — toplam değer + günlük değişim (₺ ve %) + değer eğrisi (sparkline) + alt şerit: Toplam K/Z · Getiri · Nakit. Kullanıcının ilk sorusu "ne kadarım var, bugün ne oldu"; kart bunu tek bakışta verir.
2. **Allokasyon** — SVG **donut** (sektör dağılımı, `stroke-dasharray`/`dashoffset` ile dilimler) + renk-kodlu legend (Bankacılık/Havacılık/Sanayi/Perakende). Konsantrasyon riskini görselleştirir.
3. **AI portföy notu** — mor tint cam; ağırlık uyarısı + çeşitlendirme önerisi. Masaüstünde "AI ile analiz et" butonu.
4. **Varlıklarım** — pozisyon listesi/tablosu: sembol, lot, ortalama maliyet, güncel değer, pozisyon K/Z%. Mobilde kompakt kart (lot·maliyet alt satırda), masaüstünde tam tablo (başlık satırlı, hover). K/Z'ye göre sıralı.

Masaüstü kurgu: sol geniş alan = özet kutular + varlık tablosu (aksiyon), sağ ray = değer kartı + allokasyon + AI notu (bağlam). "İşlem yap" birincil aksiyon topbar'da.

## Donut (SVG) mantığı
Her dilim tek `<circle r>`; `C = 2πr`; `dash = pct/100 × C`, `gap = C − dash`; `dashoffset = −(önceki yüzdelerin toplamı) × C`; `transform="rotate(-90 cx cy)"` ile tepeden başlar. `renderVals().makeDonut(items, r)` hesaplar (koyu için parlak renkler `donut`/`donutD`, açık için marka renkleri `donutL`/`donutLD`).

## Etkileşim & davranış
- Varlık satırı tıklama → Hisse detay. "İşlem yap" → al/sat akışı. "AI ile analiz et" → AI Asistan (portföy bağlamıyla).
- Değer eğrisi zaman aralığı seçilebilir (opsiyonel; bu tasarımda günlük).
- Sayı formatı TR locale (binlik `.`, ondalık `,`).

## Veri → endpoint eşlemesi
| Alan | Endpoint notu |
|---|---|
| Özet (toplam değer, günlük %/₺, toplam K/Z, getiri, nakit, değer serisi) | `/api/portfolio/summary` |
| Pozisyonlar (sembol, ad, lot, ort. maliyet, fiyat → değer & K/Z hesaplanır) | `/api/portfolio/holdings` |
| Sektör dağılımı (donut) | `/api/portfolio/allocation` |
| AI portföy notu | `/api/ai/portfolio-insight` |

## Files
- `Investable Edge Portfoyum.dc.html` — tasarım kaynağı (4 çerçeve, örnek verili `renderVals()`)
- `support.js` — görüntüleme runtime'ı (production'a dahil edilmez)
