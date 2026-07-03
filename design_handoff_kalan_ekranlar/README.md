# Handoff: Investable Edge — Kalan Ekranlar (Giriş, Onboarding, Hisse Detay, Sektör Detay, Tarama, AI Portföyleri, Yardım)

## Overview
Investable Edge (marka adı: **Investable**), BIST (Borsa İstanbul) için yapay zekâ destekli bir yatırım uygulamasıdır. Ana 6 ekran (Bugün, Portföyüm, Fırsatlar, Piyasa, AI Asistan, Profil) zaten kodlandı ve canlıda. Bu paket, **henüz entegre edilmemiş kalan ekranları** içerir ve hepsi mevcut uygulamanın görsel diliyle birebir tasarlanmıştır.

Bu handoff'taki ekranlar (her biri mobil + masaüstü):
1. **Karşılama / Giriş** (onboarding adım 0)
2. **Risk Profili** (onboarding adım 2/3)
3. **İlgi Alanları** (onboarding adım 3/3)
4. **Hisse Detay** (örn. THYAO)
5. **Sektör Detay** (örn. Bankacılık)
6. **Tarama** (hisse tarayıcı / filtre kurucu)
7. **AI Portföyleri** (model portföy setleri)
8. **Yardım & Destek**

### Masaüstü versiyonları
Aynı dosyada, mobil ekranların altındaki iki satırda 7 masaüstü düzeni bulunur (1180×780 çerçeveler):
- **Giriş:** Split layout — sol %46 koyu marka paneli (başlık + grafik + 3 değer önerisi), sağda ortalanmış 380px form. Sidebar yok.
- **Onboarding (Risk profili):** Üst çubukta logo + 220px ilerleme çubuğu + "2/3"; içerik ortalanmış 560px sütun; altta "Geri" + 220px "Devam et".
- **Hisse detay:** Standart uygulama kabuğu (sidebar'da **Piyasa** aktif). Topbar: geri + THYAO + yıldız + Sat/Al butonları. İçerik 2 sütun: sol (fiyat, 190px grafik, zaman sekmeleri, 3 sütunlu istatistik gridi), sağ 320px (AI Sinyal kartı, Sektör bağlantı kartı, koyu "AI Asistan'a sor" kartı).
- **Sektör detay:** Kabuk (Piyasa aktif). Sol: koyu endeks kartı + şirketler tablosu; sağ 300px: 3 istatistik satırı + AI sektör notu.
- **Tarama:** Kabuk (Fırsatlar aktif). Sol 300px filtre paneli (segment, 2 slider, toggle, "Filtreleri sıfırla") + sağda sonuç tablosu (42 eşleşme, AI skor barları). Topbar'da "Filtreyi kaydet".
- **AI Portföyleri:** Kabuk (AI Portföyleri aktif). Topbar'da risk filtreleri; içerik 2×2 kart gridi (her kartta "İncele" butonu) + altta AI açıklama bandı.
- **Yardım:** Kabuk (sidebar altında **Yardım** aktif). Ortalanmış 640px sütun: arama, 4'lü kategori satırı, SSS, koyu destek kartı ("Sohbet başlat").

**Masaüstü kabuğu (mevcut uygulamayla aynı):** 230px sidebar (`#fcfcfd` bg, 1px `#f0f1f3` sağ kenar; logo, nav öğeleri 12px radius — aktif `#16181d` bg/beyaz + yeşil nokta; altta kullanıcı kartı) + 68px topbar (1px alt kenar, 22px/800 başlık) + içerik alanı 24-28px padding. Onboarding/giriş ekranlarında sidebar yoktur.

## About the Design Files
Bu pakette bulunan dosyalar **HTML ile oluşturulmuş tasarım referanslarıdır** — nihai görünümü ve davranışı gösteren prototiplerdir, doğrudan kopyalanacak production kodu değildir. Görev, bu HTML tasarımlarını **hedef kod tabanının mevcut ortamında** (React/Next, Vue, React Native, SwiftUI, vb.) o projenin yerleşik desenleri ve kütüphaneleriyle yeniden oluşturmaktır. Eğer henüz bir ortam yoksa, proje için en uygun framework seçilip tasarımlar orada uygulanmalıdır.

Tasarım dosyaları "Design Component" (`.dc.html`) formatındadır; bir runtime (`support.js`) ile `<x-dc>` şablonu + `renderVals()` mantığını render eder. **Bu runtime'ı production'a taşımayın** — yalnızca tasarımı tarayıcıda görüntülemek içindir. İlgili veriler (hisse listeleri, portföyler, SSS vb.) `<script data-dc-script>` bloğundaki `renderVals()` içinde örnek veri olarak yer alır; gerçek uygulamada API'den gelmelidir.

Dosyayı tarayıcıda açmak için: `Investable Edge Ekranlar.dc.html` dosyasını `support.js` ile aynı klasörde açın. Canvas modunda tüm ekranlar yan yana görünür.

## Fidelity
**High-fidelity (hifi).** Tüm renkler, tipografi, boşluklar, köşe yarıçapları ve bileşen stilleri nihaidir. Geliştirici, UI'ı kod tabanının mevcut kütüphaneleriyle **piksel hassasiyetinde** yeniden oluşturmalıdır. Mevcut uygulamada zaten kodlanmış olan ekranlardaki bileşenleri (telefon kabuğu yok — gerçek ekran; status bar; alt navigasyon; kartlar) **yeniden kullanın**; bu ekranlar onlarla aynı tasarım sistemini paylaşır.

> Not: Tasarımlardaki telefon çerçevesi (`.ph`), status bar (9:41 + pil) ve "9:41" gibi öğeler yalnızca sunum amaçlıdır. Gerçek uygulamada cihazın kendi status bar'ı ve güvenli alanları (safe-area insets) kullanılır.

---

## Design Tokens

### Colors
| Token | Hex | Kullanım |
|---|---|---|
| Ink (primary) | `#16181d` | Ana metin, koyu butonlar, koyu kartlar, aktif nav |
| Surface | `#fcfcfd` | Ekran arka planı |
| White | `#ffffff` | Kartlar, başlık çubuğu, alt nav |
| Border | `#eef0f2` | Kart kenarlıkları |
| Border (alt) | `#e7e9ec` | Outline buton kenarlığı |
| Divider | `#f3f4f6` / `#f6f7f8` | Liste ayraçları |
| Fill (muted) | `#f4f5f6` | Chip/sekme/avatar arka planı |
| Text muted | `#9aa0ad` | İkincil metin |
| Text muted-2 | `#7b818c` | Pasif chip metni |
| Text faint | `#b4b8bf` | Pasif nav etiketi, tablo başlığı |
| Green (up) | `#16a35b` | Pozitif değişim, AL sinyali, başarı |
| Green (bright) | `#3fce8a` | Koyu kart üzerindeki grafik/pozitif |
| Red (down) | `#e5484d` | Negatif değişim, çıkış |
| Amber (warn) | `#c98a00` | Orta risk |
| AI purple | `#6b6ff5` | AI accent (skor barı, ✦ rozet) |
| AI purple (light) | `#8b8fff` | Koyu zemin üzerinde ✦ |
| AI card bg | `#faf9ff` | AI not/sinyal kartı arka planı |
| AI card border | `#ece9fb` | AI kart kenarlığı (1.5px) |

### Risk renkleri (rozet)
- Düşük: bg `rgba(22,163,91,0.13)`, fg `#16a35b`
- Orta: bg `rgba(201,138,0,0.14)`, fg `#c98a00`
- Yüksek: bg `rgba(229,72,77,0.12)`, fg `#e5484d`

### Typography
- **UI fontu:** Manrope (400, 500, 600, 700, 800)
- **Sayısal/mono:** JetBrains Mono (400, 500, 600) — `font-variant-numeric: tabular-nums; letter-spacing: -0.02em`. Tüm fiyat, yüzde, skor, miktar değerlerinde kullanılır.
- Büyük başlık (ekran adı): 26px / 800 / letter-spacing -0.03em
- Detay başlığı: 18px / 800 / -0.02em
- Onboarding başlık: 25px / 800 / -0.03em
- Bölüm başlığı: 15–16px / 800 / -0.01–0.02em
- Gövde: 13–15px / 500–600
- Etiket/küçük: 10–12px / 500–700
- Büyük sayı (fiyat): 28–34px / 700 JetBrains Mono

### Spacing & Radius
- Ekran iç yatay padding: 22–24px
- Kart padding: 14–18px
- Köşe yarıçapı: telefon kabuğu 40px (sadece prototip); büyük kart 18–22px; orta kart/sekme 14–16px; chip/buton 11–15px; küçük rozet 7–9px; avatar/ikon kutusu 10–13px
- Kart gölgesi (yüzen kart): `0 20px 60px -12px rgba(15,20,30,.16)` — gerçek uygulamada sayfa kartlarında daha hafif gölge yeterli
- Buton yüksekliği: 50–54px (birincil), input 48–52px
- Min dokunma hedefi: 44px

### Bileşen desenleri
- **Birincil buton:** bg `#16181d`, metin beyaz 700/15px, radius 14–15px, yükseklik 50–54px
- **İkincil (outline) buton:** 1.5px `#e7e9ec` kenar, metin `#16181d` 700/15px
- **Sekme (segmented):** aktif `#16181d`/beyaz 700, pasif `#f4f5f6`/`#7b818c` 600, radius 9–11px
- **AI kartı:** bg `#faf9ff`, 1.5px `#ece9fb` kenar, radius 16px; başlıkta `✦ AI` (mor, JetBrains Mono) + başlık
- **Koyu özet kartı:** bg `#16181d`, beyaz büyük sayı, `#9aa0ad` etiket, `#3fce8a` grafik
- **Alt navigasyon:** 5 sekme (Bugün, Fırsatlar, Portföy, AI, Profil); aktif sekme `#16181d` nokta + 700 etiket, pasif `#d4d7dc` nokta + `#b4b8bf` etiket; AI sekmesi `✦` mor glif
- **Slider:** ray `#eef0f2` 6px, dolu kısım `#16181d` (veya AI için `#6b6ff5`), tutamaç 18px daire + 3px beyaz halka + gölge
- **Toggle (açık):** 46×27px, bg `#16a35b`, 21px beyaz daire sağda
- **Grafik (sparkline/area):** SVG path; çizgi 2px `#16a35b`/`#3fce8a`, altında lineer gradient dolgu (renk → şeffaf)

---

## Screens / Views

### 1. Karşılama / Giriş
- **Amaç:** İlk açılış; e-posta veya sosyal hesapla giriş/kayıt.
- **Layout:** Üst ~%50 sinematik koyu hero (`#0b0d11`); alt beyaz form bölümü (flex column).
- **Hero sahnesi:** Derin koyu zemin + yeşil/mor radial ışık haleleri + çapraz ışık huzmesi. Sağda hafif yandan açılı (rotateY -26° / rotateX 11° / rotateZ -5°) 3D logo: koyu metalik squircle gövde (spekülar highlight, yeşil rim light, kalın yan yüz) içinde camsı yeşil squircle + beyaz yükselen trend oku; zeminde eliptik gölge. Tüm sahnenin üzerinde tam alanı kaplayan hafif blur'lu koyu cam katman (`rgba(11,13,17,0.44)` + blur 6px) ve 6-7 adet minimal parçacık (2-3px nokta, beyaz/yeşil/mor düşük opaklık). Yazılar bu katmanın üstünde.
- **Logo yazımı:** "Investable" 800 beyaz + "Edge" 600 açık yeşil (`#9fe8c6`). Uygulama adı **Investable Edge**, marka adı **Investable** — hiçbir yerde eski ad kullanılmamalı.
- **Hero (koyu):** Sol üstte logo — 34px beyaz yuvarlatılmış kare içinde 13px yeşil (`#16a35b`) kare + "Investable Edge" 21px/800 beyaz. Başlık "Borsa, yapay zekâ ile sade." 32px/800/-0.035em beyaz. Alt metin `#9aa0ad` 14px. Altında dekoratif area grafik (yeşil `#3fce8a`).
- **Form (beyaz):** "E-posta veya telefon" etiketi → dolu input alanı (`#f4f5f6`, 52px, radius 14) → birincil "Devam et" butonu → "veya" ayraç → yan yana Google / Apple butonları (outline, 50px) → en altta "Hesabın yok mu? **Kayıt ol**".
- **Davranış:** Status bar bu ekranda koyu zemine uyacak şekilde beyaz metin/pil. Gerçekte e-posta validasyonu, sosyal OAuth akışları.

### 2. Risk Profili (Onboarding 2/3)
- **Amaç:** Yatırımcının risk toleransını seçmesi; AI önerileri buna göre kişiselleşir.
- **Layout:** Üstte geri oku (chevron-left) + 3 segmentli ilerleme çubuğu (2'si dolu `#16181d`, 1'i `#eef0f2`) + "2/3". Başlık "Risk toleransın nedir?" 25px/800. Alt açıklama. 3 seçilebilir kart. En altta sabit "Devam et" butonu.
- **Kartlar:** Her kartta sol başlık (16px/700) + sağda mono beklenen yıllık getiri (`~%14/yıl` vb. `#16a35b`) + alt açıklama. **Seçili kart:** 2px `#16181d` kenar + `#fcfcfd` bg + "Seçili" rozeti (koyu bg/beyaz). Seçili değil: 1px `#eef0f2` kenar.
  - Temkinli — "Sermaye korunması önceliğim." — ~%14/yıl
  - **Dengeli (seçili)** — "Risk ve getiri arasında denge kurmak isterim." — ~%26/yıl
  - Atılgan — "Yüksek getiri için dalgalanmaya varım." — ~%41/yıl

### 3. İlgi Alanları (Onboarding 3/3)
- **Amaç:** Kullanıcının ilgilendiği sektörleri seçmesi (çoklu seçim); radar/fırsat önceliklendirmesi için.
- **Layout:** Geri oku + 3/3 dolu ilerleme + "3/3". Başlık "Hangi sektörler ilgini çekiyor?". Sektör chip'lerinden oluşan sarmalı (wrap) grid. Altta AI ipucu kutusu (mor) + "Investable Edge'a başla" butonu.
- **Chip'ler:** Seçili = `#16181d` bg / beyaz metin; seçili değil = beyaz bg / `#16181d` metin / 1px `#e7e9ec` kenar. 13px radius, 14px/700. Sektörler: Bankacılık*, Teknoloji, Havacılık*, Enerji, Perakende, Sanayi*, Sağlık, Gayrimenkul, Temettü (*seçili).
- **AI ipucu:** `#faf9ff` kutu, "✦ 3 sektör seçtin — AI bunlara göre seni yönlendirecek."

### 4. Hisse Detay (örn. THYAO)
- **Amaç:** Tek bir hissenin fiyat/grafik/AI sinyal/temel verilerini görme ve al-sat.
- **Layout:** Başlık çubuğu (geri oku + sembol "THYAO" 18px/800 + alt "Türk Hava Yolları" + sağda yıldız/takip ikonu, `#c98a00`). Kaydırılabilir içerik. Altta sabit aksiyon çubuğu (Sat / Al).
- **Fiyat bloğu:** "312,75 ₺" 34px/700 mono; altında "+7,35 ₺  +2,40% bugün" (`#16a35b`).
- **Grafik:** Area grafik (yeşil `#16a35b`). Altında zaman aralığı sekmeleri: **1G** (aktif, koyu) · 1H · 1A · 1Y · Tümü.
- **AI Sinyal kartı (mor):** "✦ AI Sinyal" + sağda **AL** rozeti (yeşil). 3 metrik: Güven %82 · Hedef 340,00 · Risk Orta (`#c98a00`). Açıklama: "Momentum güçlü, hacim son 5 günde artışta. Direnç 318 ₺."
- **İstatistik gridi (2 sütun):** Açılış 308,00 · Önceki kapanış 305,40 · Gün aralığı 306–314 · Hacim 48,2 M · F/K oranı 9,4 · Piyasa değeri 431 Mr ₺.
- **Aksiyon çubuğu:** "Sat" (outline, flex 1) + "Al" (koyu, flex 1.4).

### 5. Sektör Detay (örn. Bankacılık)
- **Amaç:** Bir sektörün performansını ve içindeki şirketleri görme.
- **Layout:** Başlık (geri oku + "Bankacılık" + "BIST Sektör · 12 şirket"). İçerik: koyu özet kartı → 3 istatistik kutusu → AI not → şirket listesi.
- **Koyu özet kartı:** "Sektör endeksi" + "14.286" 28px mono beyaz + sağda "+1,62% bugün" (`#3fce8a`) + mini area grafik.
- **İstatistik kutuları (3):** Piyasa değeri 2,4 Tr · Ort. F/K 5,8 · Temettü %4,2 (`#16a35b`).
- **AI notu (mor):** "✦ Faiz indirim beklentisi sektöre pozitif. Net faiz marjı izlenmeli."
- **Şirketler listesi:** Her satır: 38px mono etiket kutusu + sembol/ad + sağda fiyat & değişim. GARAN +2,4% · AKBNK +1,7% · YKBNK +1,1% · ISCTR +0,6% · VAKBN −0,4% (negatif `#e5484d`).

### 6. Tarama (Hisse Tarayıcı)
- **Amaç:** Filtre kurarak kriterlere uyan hisseleri bulma.
- **Layout:** Başlık "Tarama" + "Kendi filtreni oluştur". Filtre bölümleri (column, gap). Altta sonuç önizleme + sabit "Sonuçları gör" butonu. Alt nav: **Fırsatlar** aktif.
- **Filtreler:**
  - *Piyasa değeri:* 4 segment (Tümü / **Büyük** aktif / Orta / Küçük).
  - *F/K oranı:* slider, "≤ 15" (koyu dolu, ~%52).
  - *AI skoru:* slider, "≥ 70" (mor `#6b6ff5` dolu, tutamaç %70'te).
  - *Temettü veren:* satır + açık toggle (yeşil), "Verim ≥ %3".
- **Sonuç:** "**42** hisse eşleşiyor" + 3 önizleme satırı (SISE 88 · AKBNK 81 · TUPRS 76; skor mor mono) + "42 sonucu gör" butonu.

### 7. AI Portföyleri
- **Amaç:** Hedefe göre hazır model portföy setlerini gözden geçirme.
- **Layout:** Başlık "✦ AI Portföyleri" + "Hedefine göre hazır model setler". Dikey kart listesi. Alt nav: **AI** aktif (mor).
- **Portföy kartı:** Üstte ad (16px/800) + tagline + sağda risk rozeti (renk koda göre). Altında "Beklenen getiri" (mono yeşil) + "Hisse" sayısı. En altta 4 dilimli yatay allokasyon barı (renkler: `#16a35b`, `#6b6ff5`, `#c98a00`, `#9aa0ad`).
  - Temettü Kralı — "İstikrarlı nakit akışı" — %22/yıl — 8 hisse — Düşük risk
  - Dengeli Çekirdek — "Çeşitlendirilmiş ana set" — %28/yıl — 12 hisse — Orta risk
  - Büyüme Avcısı — "Yüksek momentum hisseler" — %38/yıl — 10 hisse — Yüksek risk
  - Enflasyon Kalkanı — "Reel getiri odaklı" — %25/yıl — 9 hisse — Orta risk

### 8. Yardım & Destek
- **Amaç:** SSS, kategori arama ve destek kanallarına erişim.
- **Layout:** Başlık "Yardım". Arama çubuğu → 2×2 kategori gridi → SSS listesi → koyu destek kartı. Alt nav: **Profil** aktif.
- **Arama:** `#f4f5f6` 48px input + büyüteç ikonu + "Soru ara…".
- **Kategoriler (2×2):** Her biri outline kart, ikon kutusu + başlık + alt metin: Hesap (Profil & güvenlik) · İşlemler (Al-sat & emirler) · AI Asistan (Sinyal & skorlar) · Güvenlik (2FA & gizlilik).
- **SSS:** Liste, her satırda soru + chevron. ("AI sinyalleri neye göre üretiliyor?", "Para yatırma ve çekme nasıl çalışır?", "AI skoru ne anlama geliyor?", "Risk profilimi nasıl değiştiririm?")
- **Destek kartı (koyu):** "✦ Hâlâ yardım gerek mi?" + "AI asistan veya canlı destek" + chevron.

---

## Interactions & Behavior
- **Onboarding akışı:** Karşılama → (giriş) → Risk Profili (2/3) → İlgi Alanları (3/3) → uygulamaya giriş ("Investable Edge'a başla"). Geri oku önceki adıma döner. İlerleme çubuğu adım sayısını yansıtır.
- **Seçim durumları:** Risk kartı (tek seçim/radio), sektör chip'leri (çoklu seçim/toggle). Seçili stil yukarıda tanımlı.
- **Hisse detay:** Zaman aralığı sekmeleri grafiği günceller (1G/1H/1A/1Y/Tümü). Yıldız ikonu takip listesine ekler/çıkarır. Al/Sat → emir akışı (bu pakette tasarlanmadı).
- **Tarama:** Filtre değişince "X hisse eşleşiyor" ve önizleme canlı güncellenir. "Sonuçları gör" tam sonuç listesine gider.
- **AI Portföyleri / Sektör şirketleri / SSS:** Her satır/kart tıklanabilir → detay görünümü.
- **Grafikler:** Statik SVG area path; gerçek uygulamada zaman serisi verisiyle çizilir. Geçişler için yumuşak (200–300ms) animasyon önerilir.
- **Dokunma hedefleri:** ≥44px. Liste satırları tam genişlik tıklanabilir.

## State Management
- `onboarding.step` (0–3), `onboarding.riskProfile` ('temkinli'|'dengeli'|'atılgan'), `onboarding.interests` (sektör id dizisi)
- `auth` (e-posta/oturum), sosyal OAuth durumu
- Hisse detay: `symbol`, `timeframe`, `isWatched`, fiyat/grafik/temel veri (API), AI sinyal (API)
- Tarama: filtre state (`marketCap`, `peMax`, `aiScoreMin`, `dividendOnly`) → sonuç sayısı + liste (API)
- AI Portföyleri: model portföy listesi (API)
- Sektör detay: `sectorId` → özet + şirket listesi (API)
- Yardım: arama sorgusu, SSS/kategoriler (statik veya CMS)

## Data Fetching
Tüm sayısal değerler (`renderVals()` içindeki `holdings`, `opps`, `sectorStocks`, `portfolios`, `stockStats`, `screenerPreview`, `faqs`, `helpCats` vb.) örnek veridir; production'da ilgili endpoint'lerden çekilmelidir. Fiyat/değişim formatı Türkçe yerel ayara göredir (binlik `.`, ondalık `,`; `toLocaleString('tr-TR')`).

## Assets
- **Fontlar:** Manrope + JetBrains Mono (Google Fonts). Kod tabanında yerel/host edilmiş sürümleri tercih edin.
- **İkonlar:** Tümü inline SVG (chevron, arama, ok, yıldız). Mevcut ikon kütüphanenizle (ör. Lucide/Feather) eşleştirin — kullanılanlar: chevron-left/right, search, arrow-right, star. "✦" karakteri AI rozetidir (metin glifi).
- Görsel/logo dosyası yok; logo basit kompozisyon (yuvarlatılmış kare + iç kare).

## Yeni: Bugün sayfası hızlı tarama alanı
`Investable Edge Bugun.dc.html` dosyasında, canlı Bugün sayfasına eklenecek **hızlı sembol arama** tasarımı ve çalışan prototipi var (mobil + masaüstü):
- **Input:** beyaz kart, 1px `#eef0f2` kenar, radius 14px, solda yeşil `›` (JetBrains Mono), placeholder "Sembol yaz — THY, GAR…"; yazı 600/14px, `text-transform:uppercase`, `letter-spacing:0.04em`. Mobilde selamlamanın altında; masaüstünde topbar'da (320px).
- **Davranış:** her tuş vuruşunda sembol **prefix** eşleşmesi (`startsWith`, TR locale büyük harf); en fazla **8 sonuç**; sonuç varken input sağında `N/8` sayacı.
- **Dropdown:** inputun altında yüzen panel (radius 16px, `0 18px 44px -10px rgba(15,20,30,0.18)` gölge, z-index yüksek). Her satır: 32px mono etiket kutusu + sembol (eşleşen prefix `#16a35b` renkli ve `rgba(22,163,91,0.35)` 2px alt çizgili) + şirket adı + fiyat + günlük değişim (yeşil/kırmızı mono).
- Boş sorguda panel görünmez. Amaç detaylı Tarama sayfasının yerini almak değil; gündelik hızlı erişim. Satıra tıklama → Hisse detay.
- Prototipteki 31 hisselik liste örnek veridir; production'da sembol arama endpoint'ine bağlanır.

## Files
- `Investable Edge Ekranlar.dc.html` — bu handoff'taki 8 ekranın tasarım kaynağı (şablon + örnek veri + grafik yardımcıları `renderVals()` içinde).
- `Investable Edge Sayfalar.dc.html` — **referans**: hâlihazırda kodlanmış ana ekranlar (Portföyüm, Fırsatlar, Piyasa, AI Asistan, Profil) + masaüstü düzenleri. Yeni ekranların paylaştığı bileşen/stil sistemini buradan doğrulayın.
- `support.js` — yalnızca `.dc.html` dosyalarını tarayıcıda render etmek için runtime. **Production'a dahil etmeyin.**

Dosyayı tarayıcıda görüntülemek için `Investable Edge Ekranlar.dc.html` ile `support.js` aynı klasörde olmalı; canvas üzerinde tüm ekranlar görünür.
