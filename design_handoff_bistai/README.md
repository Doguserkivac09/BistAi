# Handoff: bistAI — Modern-minimalist UI yeniden tasarımı

> **Bu paketi Claude Code'a şöyle ver:** Repo kök dizinine `design_handoff_bistai/` klasörünü kopyala, sonra Claude Code'da şunu yaz:
> *"design_handoff_bistai/README.md dosyasını oku ve buradaki tasarımı mevcut Next.js + Tailwind kod tabanımıza, mevcut bileşen ve pattern'leri kullanarak hi-fi sadakatle uygula. HTML dosyaları birebir kopyalanacak kod değil, görsel referanstır."*

---

## Genel Bakış

bistAI (kod tabanında **InvestableEdge**), BIST hisseleri için yapay zekâ destekli, "olabildiğince basit" bir borsa takip platformudur. Çekirdek fikir: kullanıcıya her gün **tek net aksiyon** sunmak — *Uzak Dur / İzle / Değerlendir / Güçlü İzle*. Bu handoff, uygulamanın tüm ana ekranlarının modern-minimalist, hi-fi yeniden tasarımını içerir (mobil + masaüstü).

## Tasarım Dosyaları Hakkında

Bu paketteki `.dc.html` dosyaları **HTML ile oluşturulmuş tasarım referanslarıdır** — amaçlanan görünüm ve davranışı gösteren prototiplerdir, doğrudan kopyalanacak production kodu **değildir**. Görev: bu tasarımları **mevcut kod tabanının ortamında** (Next.js App Router + React + Tailwind CSS, repodaki STRUCTURE.md'ye göre) o projenin yerleşik pattern'leri, bileşenleri ve veri kaynaklarıyla **yeniden inşa etmektir**.

Dosyalar `<x-dc>` adlı özel bir render runtime'ı (`support.js`) kullanır — bu runtime'ı **taşımayın**. Sadece markup, stil değerleri ve veri yapısını referans alın.

## Sadakat (Fidelity)

**High-fidelity (hi-fi).** Renkler, tipografi, boşluk ve etkileşimler nihai niyeti yansıtır. Geliştirici UI'ı kod tabanının mevcut kütüphaneleriyle (Tailwind, varsa shadcn/ui veya mevcut bileşenler) **piksel-yakın** yeniden üretmelidir. Grafikler örnek (mock) verilerle çizilmiştir — gerçek fiyat/sinyal verisine bağlanacaktır.

---

## Tasarım Sistemi (Design Tokens)

### Renkler
| Token | Hex | Kullanım |
|---|---|---|
| Ink (ana metin / nötr aksiyon) | `#16181d` | Başlıklar, koyu kartlar, nötr butonlar, aktif nav |
| Up / yükseliş | `#16a35b` | Pozitif değişim, "Al", "Güçlü İzle" |
| Up (koyu zeminde) | `#3fce8a` | Koyu kart üzerindeki pozitif metin/çizgi |
| Down / düşüş | `#e5484d` | Negatif değişim, "Sat", çıkış |
| AI vurgu (mürdüm) | `#6b6ff5` | AI öğeleri, ✦ ikon, skor barları |
| AI vurgu (koyu zeminde) | `#8b8fff` | Koyu kart üzerindeki ✦ |
| Uyarı / orta risk | `#c98a00` | "İzle", "Orta" risk |
| "Değerlendir" yeşili | `#4aa84a` | Orta-pozitif verdict |
| "Uzak Dur" grisi | `#8a909b` | Nötr/negatif verdict |
| Metin ikincil | `#7b818c` | Açıklama metinleri |
| Metin üçüncül | `#9aa0ad` | Etiketler, alt başlık |
| Metin sönük | `#b4b8bf` | Placeholder, en sönük |
| Yüzey / panel | `#ffffff` | Kart arka planı |
| Sayfa zemini | `#fcfcfd` | Uygulama arka planı, sidebar |
| Dolgu yüzey | `#f4f5f6` | İkon kutuları, input, segment |
| Hairline ayraç | `#eef0f2` / `#f0f1f3` / `#f6f7f8` | Kenarlık ve satır ayraçları |
| AI panel zemini | `#faf9ff` | Açık AI kartı arka planı |
| AI panel kenar | `#ece9fb` | Açık AI kartı kenarlığı |
| Açık yeşil rozet zemini | `#eaf7ef` | "BIST açık" durum çipi |

### Tipografi
- **Başlık/gövde fontu:** Manrope (400, 500, 600, 700, 800)
- **Sayısal font:** JetBrains Mono (400, 500, 600) — `font-variant-numeric: tabular-nums; letter-spacing: -0.02em`. **Tüm fiyat/yüzde/sayı değerleri mono.**
- Ölçek (kullanılan başlıca boyutlar):
  - Ekran başlığı (mobil): 26px / 800 / letter-spacing -0.03em
  - Ekran başlığı (masaüstü): 22–28px / 800 / -0.03em
  - Büyük fiyat: 30–36px / 700 mono / -0.03em
  - Kart başlığı: 15–17px / 800 / -0.02em
  - Gövde: 14–15px / 500–600
  - Etiket: 11–12px / 500–600
  - Mikro etiket (uppercase): 11–12px / 700 / letter-spacing 0.05–0.08em

### Köşe yarıçapı
- Telefon çerçevesi: 40px
- Masaüstü pencere: 24px
- Büyük kart / koyu panel: 18–22px
- Orta kart: 16–18px
- İkon kutusu / chip / buton: 9–15px
- Bar / progress: 3–4px

### Gölge
- Kart yükseltme: `0 20px 60px -12px rgba(15,20,30,.16)`
- Hafif kart: `0 8px 24px -8px rgba(0,0,0,.10)`

### Boşluk
8px tabanlı; kart iç dolgusu genelde 16–22px, ekran yatay dolgusu 24–28px, öğeler arası gap 11–18px.

---

## Ekranlar / Görünümler

> Her ekranın **mobil (≈380px genişlik telefon çerçevesi)** ve çoğunun **masaüstü (sidebar + içerik, ≈1180px)** versiyonu vardır. Mobilde alt **tab bar** (Bugün · Fırsatlar · Portföy · AI · Profil); masaüstünde sol **sidebar** (Bugün · Fırsatlar · Portföyüm · Piyasa · AI Portföyleri · AI Asistan) + üst topbar (arama + BIST 100 + "BIST açık" durumu).

### 0. Giriş / Onboarding — `bistAI Frontend v2.dc.html`
- **Karşılama (splash):** Logo, dekoratif çizgi grafik, "Borsa, sadeleştirildi." (34px/800), açıklama, "Ücretsiz başla" (ink dolu buton) + "Giriş yap" (gri dolu buton). Altta "Yatırım tavsiyesi değildir".
- **Giriş:** "Tekrar hoş geldin" başlığı, E-posta (gri dolu input) + Şifre (ink kenarlıklı aktif input, "Göster"), "Giriş yap" butonu, "veya" ayracı, Google/Apple butonları, "Kayıt ol" linki.
- **Akış kuralı:** Aktif oturum varsa uygulama **doğrudan "Bugün"** ekranıyla açılır. Oturum yoksa **Giriş** ekranı gelir. (Onboarding'deki "Tekrar hoş geldin" zaten dönen kullanıcı bağlamına uygundur.)

### 1. Bugün (giriş sonrası karşılama) — `bistAI Bugun.dc.html`
**Her aktif oturumda açılan ilk ekran.** Çekirdek özellik.
- **Selamlama:** "Günaydın, Ahmet" + tarih + sağda "BIST açık" durum çipi (yeşil nokta + `#eaf7ef` zemin).
- **AI günlük özeti (koyu kart `#16181d`):** ✦ AI etiketi + "Bugünün özeti", 1–2 cümle piyasa yorumu, alt satırda 3 metrik (Makro rüzgar `+34` yeşil, Rejim "Yükseliş", Risk "Orta" sarı).
- **"Bugün ne yapmalıyım?" listesi:** Her satır = takip edilen hisse kartı: solda 4px renkli verdict şeridi, ikon kutusu, sembol+fiyat, kısa gerekçe metni, sağda verdict rozeti + değişim %. Verdict renkleri yukarıdaki ölçeğe göre.
- **BIST 100 mini kartı:** değer + sparkline + değişim.
- **Masaüstü:** sol sidebar + üst topbar; içerikte solda AI özeti (yatay) + verdict listesi (tablo benzeri satırlar), sağ kolonda BIST 100 grafiği + "Verdict ölçeği" lejantı (4 seviye açıklamalı) + "kural-tabanlı, AI yalnızca özetler" notu.

### 2. Portföyüm — `bistAI Sayfalar.dc.html`
- **Değer kartı (koyu):** Toplam değer (büyük mono), tüm-zamanlar K/Z (₺ + %), sparkline.
- **Varlıklarım:** hisse satırları (ikon, sembol, "X lot · ort. maliyet", güncel değer, K/Z %).
- **Masaüstü ek:** "Dağılım" kartı (sektör yüzde barları) + "✦ AI Portföy notu" (açık mürdüm kart). Varlıklar tablo başlıklı (Sembol/Lot/Maliyet/Değer/K-Z).

### 3. Fırsatlar — `bistAI Sayfalar.dc.html`
Yatırım radarı / tarama.
- **Filtre çipleri:** Tümü (aktif=ink) · Momentum · Akıllı para · Temettü.
- **Fırsat kartı/satırı:** ikon, sembol+ad, değişim %, **skor barı** (mürdüm, 0–100) + sayısal skor, etiketler (chip).
- **Masaüstü:** tablo görünümü (Sembol/Fiyat/Değişim/Skor/Etiketler).

### 4. Piyasa — `bistAI Sayfalar.dc.html`
- **Makro kartları:** USD/TRY, Gram Altın, Brent (değer + değişim %, renkli).
- **Sektör performansı:** her sektör için isim + **diverging bar** (merkez=0; pozitif sağa yeşil, negatif sola kırmızı) + değişim %.

### 5. AI Asistan — `bistAI Sayfalar.dc.html`
Sohbet arayüzü.
- **Header:** ✦ ikon + "AI Asistan" + "Çevrimiçi · canlı piyasa verisine bağlı" (yeşil).
- **Mesajlar:** AI baloncuğu (beyaz, sol, köşe 18/18/18/6) + kullanıcı baloncuğu (ink, sağ, köşe 18/18/6/18). AI yanıtının içine **içgörü kartı** gömülebilir (açık mürdüm kart: sembol + verdict rozeti + Güven/Hedef/Risk metrikleri).
- **Alt giriş:** öneri çipleri ("Portföyümü analiz et" vb.) + input + ink gönder butonu (ok ikonu).
- **Masaüstü:** geniş sohbet alanı, daha fazla öneri çipi.

### 6. Profil — `bistAI Sayfalar.dc.html`
- Avatar (baş harfler) + ad + e-posta.
- 3'lü istatistik kartı: Pozisyon / Getiri / Takip.
- Ayar listesi: Bildirimler, Tema, Risk profili, Güvenlik, Yardım & Destek (her satır ikon + label + değer + chevron).
- "Çıkış yap" (kırmızı).

---

## Etkileşim & Davranış
- **Navigasyon:** Mobil alt tab bar / masaüstü sidebar; aktif sekme = ink renk + dolu nokta, pasif = `#b4b8bf`/`#d4d7dc`. AI sekmesi her zaman ✦ mürdüm ikonla işaretli.
- **Auth yönlendirme:** Oturum varsa `/bugun`, yoksa `/giris`. "Bugün" varsayılan landing.
- **Buton durumları:** Birincil = ink dolu (`#16181d`, beyaz metin); ikincil = `#f4f5f6` dolu; Al = `#16a35b` dolu; Sat = `#f4f5f6` (kırmızı metin opsiyonel). Hover'da ~4–6% koyulaşma uygulanabilir (kod tabanı pattern'ine göre).
- **Grafikler:** çizgi + alan dolgusu (gradient, üst %16 opaklık → 0). Sparkline'lar stroke-only. Mum grafik (Frontend v2'de) yeşil/kırmızı gövde + fitil.
- **Verdict rozetleri:** metin + arka planı rengin %12–14 opaklığı.
- **Responsive:** ≤768px mobil layout (tek kolon + alt tab bar); ≥1024px masaüstü (sidebar + çok kolon). Aradaki kırılım kod tabanının Tailwind breakpoint'lerine göre.

## State Yönetimi (öneri)
- `session` (auth) → landing route seçimi.
- `bugun`: verdict listesi + günlük AI özeti (kural motoru çıktısı; AI sadece özet metni).
- `portfolio`: holdings, toplam değer, K/Z, dağılım.
- `opportunities`: tarama sonuçları + aktif filtre.
- `market`: makro değerler + sektör performansı.
- `chat`: mesaj geçmişi + öneri çipleri.
- Veri çekme: repodaki mevcut veri katmanı / API route'ları kullanılmalı (mock veriler örnektir).

## Veri Modeli (mock — `.dc.html` logic bloklarında)
- **Hisse:** `{ sym, name, price, chg(%), vol, signal }`
- **Verdict:** `{ sym, name, price, chg, verdict: 'Güçlü İzle'|'Değerlendir'|'İzle'|'Uzak Dur', reason }`
- **Holding:** `{ sym, name, lots, avg, price }` → değer = lots×price, K/Z% = (price−avg)/avg
- **Fırsat:** `{ sym, name, price, chg, score(0–100), tags[] }`
- **Sektör:** `{ name, chg(%) }` → diverging bar
- Tüm sayılar Türkçe formatında: ondalık virgül, binlik nokta (`tr-TR`).

## Assets
- Harici görsel **yok**. İkonlar inline SVG (stroke 2.2–2.6, lucide tarzı). Grafikler runtime'da prosedürel çizilir.
- Fontlar Google Fonts: Manrope + JetBrains Mono.
- ✦ karakteri (U+2726) AI işareti olarak kullanılıyor — istenirse lucide `Sparkles` ikonuyla değiştirilebilir.

## Dosyalar
- `bistAI Bugun.dc.html` — Bugün (giriş sonrası karşılama), mobil + masaüstü
- `bistAI Sayfalar.dc.html` — Portföyüm, Fırsatlar, Piyasa, AI Asistan, Profil (mobil + masaüstü Portföyüm/Fırsatlar/AI Asistan)
- `bistAI Frontend v2.dc.html` — Onboarding (splash + giriş), Piyasa listesi, Hisse detay (mum + AI analiz), masaüstü dashboard
- `support.js` — `.dc.html` render runtime'ı (yalnızca dosyaları tarayıcıda açıp görmek için; **porting etmeyin**)

> Dosyaları tarayıcıda açıp görsel referans olarak inceleyin. Markup'taki inline stiller birebir token kaynağıdır.
