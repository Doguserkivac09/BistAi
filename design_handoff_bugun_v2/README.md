# Handoff: Investable Edge — Bugün v2 (güne-başlama merkezi)

## Overview
Investable Edge'in giriş sonrası ana ekranı "Bugün"ün v2 tasarımı. Amaç: platformun daha fazla veri kaynağından beslenen ama görsel karmaşa yaratmayan bir güne-başlama merkezi. Bilgi hiyerarşisi: **önce "ne yapmalıyım" (verdict), sonra bağlam**.

Dosya: `Investable Edge Bugun v2.dc.html` (mobil 380px + masaüstü 1180×800, aynı canvas'ta). `support.js` yalnızca tarayıcıda görüntülemek için — production'a taşınmaz. Tüm veriler `renderVals()` içinde örnek; gerçek uygulamada endpoint'lerden gelir (aşağıda eşleme var).

## Design Tokens (öncekiyle aynı — değişiklik yok)
| Token | Değer |
|---|---|
| Ink | `#16181d` |
| Zemin | `#fcfcfd` · Kart `#fff` · Kenar `#eef0f2` · Dolgu `#f4f5f6` |
| Yeşil | `#16a35b` (koyu zeminde `#3fce8a`) · Kırmızı `#e5484d` · Amber `#c98a00` |
| AI mürdüm | `#6b6ff5` (koyu zeminde `#8b8fff`) · AI kart `#faf9ff` + `#ece9fb` |
| Tipografi | Manrope (UI) + JetBrains Mono (tüm sayılar, tabular-nums) |
| Verdict ölçeği | Güçlü İzle `#16a35b` · Değerlendir `#4aa84a` · İzle `#c98a00` · Uzak Dur `#8a909b` |

Hover durumları (masaüstü): kart/satır → `border-color:#d9dce1` + `box-shadow:0 4px 14px -6px rgba(15,20,30,0.12)`; sidebar nav → `background:#f4f5f6`; linkler → koyulaşır.

## Mobil blok sırası + gerekçe
1. **Selamlama + BIST açık çipi** — kimlik ve piyasa durumu tek bakışta; mevcut iskelet korundu.
2. **Hızlı sembol arama** — canlıdaki işlev aynen korundu (prefix eşleşme, maks 8 sonuç, N/8 sayacı).
3. **Portföyüm günlük K/Z şeridi (tek satır)** — kullanıcının ilk sorusu "bugün neredeyim?"; tek şerit cevabı verir, detay Portföy sayfasına devreder.
4. **Koyu AI özet kartı** (ekrandaki tek koyu kart) — makro rüzgar / rejim / risk; karar listesinin bağlamını kurar.
5. **"Bugün ne yapmalıyım?" — Bugünün sinyal akışı** (yenilendi) — sayfanın kalbi artık statik takip listesi değil, tüm BIST'te bugün gerçekleşen **işlevsel aksiyon akışı**: akıllı para girişi / teknik kırılım / verdict yükselişi / hacim anomalisi. Üstte **filtre çipleri** (Tümü / Akıllı para / Teknik / Verdict ↑ / Hacim) canlı filtreler; her satırda sinyal-tipi rozeti + tetikleyici + verdict + chg%. Mobilde ilk 3 satır gösterilir (çerçeveye sığar), masaüstünde tam liste.
6. **Takip listem kartı** (yeni) — sinyal akışının hemen altında; 5'ten fazla hisse varsa ilk N gösterilir + **"Daha fazla göster (+k)"** butonu, 5'ten az ise tümü gösterilir ve buton olmaz. Mobilde varsayılan 3 satır.
7. **Günün fırsatları yatay rayı (3 kart)** — keşif ihtiyacını tek sırada karşılar; "Tümü →" Fırsatlar sayfasına devreder.
8. **Sektör momentumu tek satırı** — günün en güçlü + en zayıf sektörü.
9. **BIST 100 mini** — kapanış bağlamı.

Mobilde ekran başına 1 koyu kart kuralı korunur; Haftanın Seçimleri ve AI Portföyleri mobile alınmadı (masaüstü şeridinde; mobilde ilgili sayfalara tab bar'dan erişiliyor — tekrar yaratmamak için).

## Masaüstü yerleşimi + gerekçe
12 kolon düşüncesi; tek uzun sütun yok:
- **Topbar** — çalışan sembol arama (korundu) + BIST açık çipi + BIST 100 değeri.
- **Bilgi şeridi** (selamlamanın altında, tek satır) — Sektör ▲/▼ · Haftanın Seçimleri +% & "BIST'i geçti" rozeti · ✦ AI Portföyleri (Aegis/APEX). Üç düşük-öncelikli kaynak tek kompakt şeritte; hiçbiri kart tüketmez.
- **Sol geniş alan (karar)** — koyu AI özet + **Bugünün sinyal akışı** (filtre çipleri + aksiyon satırları, tam liste) + günün fırsatları rayı (3 kart).
- **Sağ ray (bağlam, 330px)** — BIST 100 sparkline kartı · Portföyüm kartı · **Takip listem** (5 satır + gerekirse "Daha fazla göster", iç kaydırma) · **Verdict ölçeği** (kompakt 2 sütun, açıklamalar tooltip) + yasal not.

Sıralama gerekçesi: sol sütun "karar" akışıdır (özet → verdict → fırsat), sağ ray sabit "bağlam"dır; göz soldan karar alır, sağdan doğrular.

## Veri kaynağı → blok eşlemesi
| Kaynak | Blok | Endpoint notu |
|---|---|---|
| **Sinyal akışı** | "Bugün ne yapmalıyım?" (yeni) | `/api/signals/feed?date=today` — sembol, tip (smart/brk/vd/vol), tetikleyici metin, verdict, chg%, saat. Filtre çipleri `?type=` ile |
| **Takip listesi** | Sağ ray + mobil kart | `/api/watchlist` — sembol, fiyat, chg%, verdict (nokta rengi). 5+ ise sayfalama/expand |
| Makro durum | Koyu AI kartı alt metrikleri | `/api/macro/summary` — skor, rejim, risk |
| BIST 100 | Topbar + sağ ray kartı + mobil mini | `/api/index/bist100` (değer, chg, intraday seri) |
| Fırsatlar | Günün fırsatları rayı | `/api/opportunities/top?limit=3` — skor + etiket |
| Haftanın Seçimleri | Masaüstü bilgi şeridi | `/api/picks/weekly/summary` — haftalık %, BIST karşılaştırma |
| AI Portföyleri | Masaüstü bilgi şeridi | `/api/ai-portfolios/summary` — Aegis/APEX toplam % |
| Haber katalisti | Verdict satırı rozeti | `/api/news/catalysts?symbols=…` — pos/neg + not (tooltip) |
| Sektör momentumu | Mobil tek satır + masaüstü şerit | `/api/sectors/momentum` — en güçlü + en zayıf |
| Portföyüm | Mobil şerit + masaüstü sağ ray kartı | `/api/portfolio/summary` — toplam değer, günlük K/Z (pozisyon yoksa blok gizlenir) |
| Sembol arama | Arama inputları | `/api/symbols/search?q=` — prefix, maks 8 |

## Koyu liquid-glass sürüm (yeni — açık tema korunur)
Aynı dosyada üçüncü satır olarak koyu tema Bugün v2 (mobil + masaüstü) eklendi. Liquid glass ancak koyu/renkli zemin üzerinde okunur; bu sürüm referans estetiğini yakalar.
- **Zemin:** derin lacivert `#0a0e17` + tepede hafif yeşil `rgba(22,163,91)` ve mor `rgba(107,111,245)` radial ışıma (sofistike/düşük yoğunluk — sinyal grafikleri öne çıksın).
- **Cam kart:** `background:rgba(255,255,255,0.05)` + `backdrop-filter:blur(22px)` + `border:1px solid rgba(255,255,255,0.09)` + `box-shadow:inset 0 1px 0 rgba(255,255,255,0.1),0 18-24px 44-54px -26px rgba(0,0,0,0.7)`.
- **AI kartı:** cam + `linear-gradient(rgba(107,111,245,0.16),rgba(63,206,138,0.10))` renkli iç tint.
- **Aksan marka yeşili** korunur: pozitif/BIST/aktif = `#3fce8a`, AI = `#8b8fff`, negatif `#ff6b6b`, amber `#f5c451`. Metin `#f4f6fa` / muted `#9aa3b2` / faint `#6b7280`.
- Verdict renkleri koyu zeminde parlatıldı (`verdictsDark`): Güçlü İzle `#3fce8a` · Değerlendir `#5cc85c` · İzle `#f5c451` · Uzak Dur `#aab0bd`.
- Not: `backdrop-filter` gerçek tarayıcıda net; statik önizleme/export blur'u yaklaşık gösterir. Production'da koyu zemin + ışıma korunmalı, aksi halde cam etkisi kaybolur.

## Liquid glass (frosted) kart çerçeveleri
Önemli kart çerçeveleri hem mobil hem masaüstünde yarı saydam "liquid glass" olarak stillendi:
- **Açık cam:** `background:rgba(255,255,255,0.5)` + `backdrop-filter:blur(16px)` + `border:1px solid rgba(255,255,255,0.75)` + `box-shadow:inset 0 1px 0 rgba(255,255,255,0.65),0 8px 24px -14px rgba(15,20,30,0.16)`. Uygulandığı yerler: portföy şeridi, verdict satırları/kartları, günün fırsatları kartları, sektör şeridi, BIST 100 kartı, masaüstü bilgi şeridi ve sağ ray kartları (BIST / Portföyüm / Verdict ölçeği).
- **Koyu cam (AI özeti):** `background:rgba(18,20,26,0.66)` + `blur(18px)` + `border:1px solid rgba(255,255,255,0.14)` + `inset 0 1px 0 rgba(255,255,255,0.14)`.
- **Ambient zemin (cam okunsun diye):** mobil telefon gövdesi `linear-gradient(165deg,#e7f0ff→#fcfcfd→#eafaf1)`; masaüstü içerik alanı köşelerde `radial-gradient` mavi/yeşil tint. Camın kırılması bu tinte bağlı — production'da zemin tinti korunmalı, aksi halde kartlar düz beyaza döner.
- Not: `backdrop-filter` gerçek tarayıcıda net çalışır; bazı statik önizleme/export motorları blur'u yaklaşık gösterebilir.

## Sinyal akışı sinyal tipleri (renk kodu)
| Tip | Etiket | Açık | Koyu |
|---|---|---|---|
| smart | Akıllı para | `#6b6ff5` | `#a6a9ff` |
| brk | Teknik kırılım | `#0e9f6e` | `#3fce8a` |
| vd | Verdict ↑ | `#0e8fb7` | `#4fd0e6` |
| vol | Hacim anomalisi | `#c98a00` | `#f5c451` |

Her tip yarı saydam kendi rengiyle rozet olarak gösterilir (bg = renk @ ~%12-22 alfa). Filtre çipi aktifken koyu ink dolgu (açık) / beyaz %16 (koyu).

## Progressive disclosure (Takip listem)
Mantık `renderVals()` içinde: `watchHasMore = watchRaw.length > 5`. 5'ten fazlaysa masaüstü 5 / mobil 3 satır + buton; expand tümünü açar. 5 veya daha az ise tümü gösterilir, buton render edilmez (`<sc-if value="watchHasMore">`).

## Etkileşim & davranış
- Arama: her tuş vuruşunda prefix eşleşme (TR locale uppercase), maks 8 sonuç, eşleşen harfler yeşil + alt çizgi; satır tıklama → Hisse detay.
- Sinyal filtre çipi tıklama → akış anında filtrelenir (client-side / `?type=` ile server); "Daha fazla göster" → takip listesi expand/collapse.
- Verdict/sinyal satırı tıklama → Hisse detay.
- Fırsat kartı tıklama → Fırsat detayı; "Tümü →" → Fırsatlar sayfası.
- Portföy şeridi/kartı → Portföyüm; bilgi şeridi "Detay →" → ilgili sayfalar.
- Mobil bloklar dikey kaydırma; fırsat rayı yatay kaydırma (3'ten fazla kart gelirse).
- Sayı formatı TR locale (binlik `.`, ondalık `,`).

## Not (çerçeve yükseklikleri)
Sinyal akışı + takip kartı eklenince içerik uzadı; sabit önizleme çerçeveleri büyütüldü (mobil 1340px, masaüstü 1120px) — bunlar yalnızca canvas önizleme yükseklikleridir. Production'da mobil dikey kaydırılır, masaüstü kolonlar doğal yüksekliğini alır.

## Files
- `Investable Edge Bugun v2.dc.html` — tasarım kaynağı (mobil + masaüstü, örnek verili `renderVals()`)
- `support.js` — görüntüleme runtime'ı (production'a dahil edilmez)
