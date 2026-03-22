# Phase 9.4 — Kişiselleştirilmiş Ana Sayfa

## Mevcut Durum
- `app/page.tsx` → Server component, herkese aynı landing page gösteriyor
- `middleware.ts` → Login olan kullanıcıyı `/giris` ve `/kayit`'ten `/dashboard`'a yönlendiriyor ama `/` (ana sayfa) için yönlendirme yok
- `app/dashboard/page.tsx` → Server component, watchlist + kayıtlı sinyaller gösteriyor

## Yaklaşım
Ana sayfa (`/`) auth durumuna göre farklı içerik gösterecek:

### Seçenek: Server component'te auth kontrolü
- `app/page.tsx` → Server component olarak kalır
- Auth durumunu kontrol eder:
  - **Giriş yapmamış** → Mevcut landing page (pazarlama içeriği)
  - **Giriş yapmış** → Kişiselleştirilmiş dashboard-home (özet widget'lar + hızlı erişim)

Bu yaklaşım middleware redirect'ten daha iyi çünkü:
- URL değişmez (`/` kalır)
- SEO için landing page meta verileri korunur
- Kullanıcı her seferinde redirect yemez

## Authenticated Home İçeriği
Giriş yapan kullanıcı için yeni bir zengin ana sayfa:

1. **Hoşgeldin banner** — "Merhaba, [isim/email]" + tarih
2. **Hızlı Özet kartlar** (3'lü grid):
   - Makro Skor gauge (küçük) + rüzgar yönü
   - Risk Skoru (küçük gauge)
   - Günlük alert sayısı
3. **Hızlı Erişim butonları** — Tarama Başlat, Makro Radar, Topluluk, Backtest
4. **Son Sinyaller** — Son 5 kayıtlı sinyal (mini tablo)
5. **Son Topluluk Paylaşımları** — Son 3 post (mini kart)

## Dosya Değişiklikleri

| Dosya | Değişiklik |
|-------|-----------|
| `app/page.tsx` | Auth kontrolü + koşullu render (landing vs auth-home) |
| `app/page.tsx` | Landing kısmı mevcut koddan aynen kalır |
| `components/AuthHome.tsx` | YENİ — Client component, giriş yapan kullanıcının ana sayfası |

## Adımlar
1. `components/AuthHome.tsx` oluştur — widget'lar + hızlı erişim
2. `app/page.tsx`'i güncelle — auth kontrol + koşullu render
3. Test et — login/logout ile farklı içerik göründüğünü doğrula
