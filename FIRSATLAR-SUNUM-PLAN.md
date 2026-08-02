# Fırsatlar Sunum Katmanı — "Neden bu hisse?" + Tuzak Eleme

> Bu döküman **kodlama planıdır** — başka bir Claude Code penceresinde uygulanacak.
> Oluşturulma: 2026-08-02
>
> **Altın kural:** Bu bir MOTOR planı değil, **SUNUM** planıdır. Yeni sinyal/skor
> hesaplanmayacak — hesaplanmış olan her şey profesyonelce **görünür** kılınacak.
> Motor değişikliği yalnızca "yayın eşiği" (tuzak eleme) ile sınırlı.

---

## ⏳ İLERLEME DURUMU (2026-08-02)

- **✅ S0 TAMAM** (commit 7df6e32): Yayın kapısı canlı. `lib/scoring-config.ts` →
  `MIN_PUBLISH_SCORE = 40` (plandaki 55 bu skor ölçeğinde listeyi ~3'e düşürüyordu —
  ölçek sinyal-denetimi ağırlık düşüşü sonrası sıkıştı; kullanıcı kararı 40) +
  `HARD_FLAG_VERDICTS = ['kağıt-üstü']`. `app/api/firsatlar/route.ts` sort öncesi yayın
  kapısı, **yalnız `isScoringV2('short')` açıkken** (kapalıyken eski davranış).
  NOT: Beneish/Altman firsatlar'da hiç çalışmıyordu (fundamental input geçilmiyor) →
  onun yerine earnings-quality MAP verdict'i (`earningsFlags[sembol]`) kullanıldı.
  İki-katman (onaylı/tümü) veri işaretlemesi S2'ye bırakıldı.
- **✅ S1 TAMAM** (commit 4b01d71): `lib/opportunity-reasons.ts` — saf gerekçe üretimi.
  `deriveReasons(OpportunityInput)` + `selectTopReasons(max=4, warn korunur)` +
  `buildSummary()`. 23 sinyal sözlüğü + sinyal-dışı gerekçeler (akıllı para, combo
  kanıtı, hacim, MA, katalist, kâr-kalitesi uyarısı). 12 test geçiyor.
- **⏳ S2 BEKLİYOR** ← BU OTURUMDA YAP. FirsatItem alanlarından `OpportunityInput`
  kurup 3 ekranı bağla: `components/new/FirsatlarScreen.tsx` (`reasonOf()` KALDIR),
  `components/FirsatKarti.tsx` (ham `📅 Bilanço -8` rozetleri KALDIR),
  `components/new/BugunScreen.tsx` sinyal akışı. + onaylı/tümü katman geçişi + boş durum.
  **NOT:** FirsatItem'da `relVol5` ve `aboveMA` doğrudan YOK — S2'de firsatlar route'a
  eklenebilir (opsiyonel; yoksa deriveReasons o gerekçeleri atlar, sorun değil).

---

## Context

### Problem 1 — Tuzaklar listede görünüyor
`SCORING_V2` (27 Tem'den beri açık) temel veto katmanını çalıştırıyor:
- Beneish şüpheli / Altman sıkıntı → skor **40'a tavanlanıyor**
- GARP değer tuzağı → **55'e tavanlanıyor**

Ama veto **skoru kırpıyor, hisseyi elemiyor.** `/api/firsatlar`'da nihai skor için alt
sınır yok — sadece giriş kapıları var (`MIN_CONFLUENCE=45`, `MIN_ADV_TL=10M`, `MIN_RR=1.5`).

→ Kâr manipülasyonu şüpheli hisse 40 puanla **hâlâ Fırsatlar sayfasında.**
**"Fırsatlar" sayfasında olmak başlı başına bir onaydır** — kullanıcı 40 puanı okumaz,
listede olmasını okur.

### Problem 2 — Gerekçe görünmüyor
Kullanıcının istediği: *"bu hissede hareketli ortalama üstü, para girişi var, akıllı para
girişi var vs yazsın."* Şu an:
- `FirsatlarScreen.reasonOf()` ham sinyal adlarını birleştiriyor → **jargon**
  ("RSI Uyumsuzluğu" borsa bilmeyen kullanıcıya hiçbir şey söylemiyor)
- `FirsatKarti` rozetleri **motor içini sızdırıyor** (`📅 Bilanço -8`, `KAP -10`) —
  kullanıcı −8'in ne olduğunu bilmez
- Gerekçe iki ayrı yerde, iki farklı mantıkla üretiliyor (eski kart + yeni ekran)

### Zaten elimizde olan (kullanılmayan) zenginlik

| Kaynak | İçerik |
|---|---|
| `lib/signals.ts` | **23 sinyal tipi** — RSI Uyumsuzluğu, Para Akışı Uyumsuzluğu, Hacim Anomalisi, Trend Başlangıcı, S/R Kırılımı, MACD Kesişimi, Bollinger Sıkışması, Altın Çapraz (+Yaklaşıyor), Çift Dip/Tepe, Bull/Bear Flag, Cup&Handle, Ters OBO, Yükselen Üçgen, Higher Lows, Vortex, Direnç Testi, Trend Olgunlaşıyor, MACD Daralıyor |
| `lib/smart-signal/summary.ts` | ⭐ **Önceliklendirilmiş insan-dili cümle üretici zaten var** — `{priority, tone, text, active}` deseni. *"akıllı para girişi başladı"*, *"sessiz birikim aşamasında"*, *"dağıtım baskısı var"* |
| `lib/smart-signal/phase.ts` | `smart_money_entered` · `accumulation` · `distribution` |
| `scan_cache.rel_vol5` | Göreli hacim — *"5 günlük ortalamanın 2.3 katı"* |
| `computeConfluence` | Kaç sinyal uyuşuyor |
| combo-stats katmanı | ⭐ **Ölçülmüş** kombinasyon isabet oranı — "onaylı kurulum" rozeti |
| `decision-engine` `DecisionFactors` | catalyst, sectorAlign, volumeConfirm, earningsRisk, kapEvent |
| `weeklyAligned`, `tavanYaklasıyor`, S/R seviyeleri | Mevcut |

**Sonuç:** Bu iş %90 sunum, %10 eşik. Yeni hesap yok.

---

## Tasarım ilkeleri (sunum kusursuz olmalı)

1. **Jargon yasak.** Kullanıcı "RSI Uyumsuzluğu" görmez; *"Fiyat düşerken alım gücü artıyor"* görür.
2. **Motor içi sızmaz.** `−8`, `−10`, `scoreCap` gibi iç değerler UI'da **asla** görünmez.
   Bunlar gerekçeye çevrilir: *"Bilanço 3 gün sonra — belirsizlik yüksek"*.
3. **Sınırlı rozet.** Kart başına **en fazla 4** gerekçe. Hepsini göstermek = hiçbirini göstermek.
   Fazlası detayda (progressive disclosure).
4. **Öncelik sırası sabit.** Rastgele değil — `smart-signal/summary.ts`'teki `priority`
   deseni genelleştirilir. En aksiyon-alınabilir olan en üstte.
5. **Ton ayrımı.** Her gerekçe `pos | warn | neutral`. Uyarılar **gizlenmez** — güven
   uyarıyı göstermekten gelir. Ama pozitiflerle karışmaz.
6. **Tek kaynak.** Gerekçe üretimi **tek dosyada**; hem eski `FirsatKarti` hem yeni
   `FirsatlarScreen` hem `BugunScreen` aynı fonksiyonu tüketir.
7. **Kanıt varsa göster.** combo-stats isabet oranı varsa *"Bu kurulum geçmişte %68 tuttu"* —
   ezber değil ölçüm. Yoksa iddia edilmez.

---

## FAZ S0 — Tuzak eleme (yayın eşiği) 🔴

> Sunumdan önce: listede olmaması gerekenler çıkmalı.

### S0-1: Yayın kapısı
`app/api/firsatlar/route.ts` — nihai skora **alt sınır** ekle ve veto'yu elemeye çevir:

| Durum | Şu an | Olacak |
|---|---|---|
| Beneish şüpheli / Altman sıkıntı | skor 40'a tavanlanır, **listede kalır** | **Listeden ÇIKAR** (sert red-flag) |
| GARP değer tuzağı | 55'e tavanlanır, listede kalır | Listede kalır ama **"teknik-öncelikli" katmanına** düşer + uyarı rozeti |
| Nihai skor < eşik | sınır yok | **Yayınlanmaz** (`MIN_PUBLISH_SCORE`) |

- `lib/scoring-config.ts`'e `MIN_PUBLISH_SCORE` + `HARD_FLAG_EXCLUDE` sabitleri.
- **Rejim kapısı bağlanır:** `regimeGate.surfacedCount` zaten hesaplanıyor (SCORING_V2) —
  ayı rejiminde daha az fırsat yayınlanır. Boş liste **hata değil, dürüst mesajdır.**

### S0-2: İki katman (kullanıcı seçimiyle uyumlu)
- **Varsayılan: "Onaylı kurulumlar"** — teknik + temel + (varsa) katalist uyumlu.
- **Geçiş: "Tümünü göster"** — teknik-öncelikliler de görünür, **açıkça etiketli**:
  *"Yalnız teknik — temel teyidi yok"*.
- **Sert red-flag'liler hiçbir katmanda görünmez.**
- **Bankalar:** Piotroski/Altman uygulanmaz → şu an kör nokta. Geçici kural: banka
  **"temel teyidi uygulanmadı"** etiketiyle onaylı katmanda kalır; kalıcı çözüm
  `BANKA-MOTORU-PLAN.md`'de.

### Doğrulama (S0)
Bilinen Beneish-şüpheli bir sembol listede **görünmüyor**; boş/az sonuç durumu zarif;
mevcut testler geçiyor; `SCORING_V2=false` iken davranış eskisi gibi.

---

## FAZ S1 — Gerekçe üretim katmanı (çekirdek)

**Yeni:** `lib/opportunity-reasons.ts` — saf/deterministik, UI'sız.

```ts
export type ReasonTone = 'pos' | 'warn' | 'neutral';
export interface Reason {
  id: string;            // stabil anahtar (test + telemetri)
  priority: number;      // düşük = önce
  tone: ReasonTone;
  text: string;          // kısa rozet metni (sade Türkçe)
  detail?: string;       // tooltip / detay satırı
  evidence?: string;     // ölçülmüş kanıt (combo isabet oranı vb.)
}
export function deriveReasons(input: OpportunityInput): Reason[];
```

**Desen kaynağı:** `lib/smart-signal/summary.ts`'teki `{priority, tone, text, active}`
dizisi — aynı yaklaşım genelleştirilir, o dosya da bu katmana taşınabilir/ortaklaşabilir.

### S1-1: Rozet sözlüğü (23 sinyal → sade Türkçe)

> Motor adları **değişmez** (`signals.ts` dokunulmaz); yalnız görüntü adı eşlenir.

| Sinyal (motor) | Rozet (kullanıcı görür) | Ton |
|---|---|---|
| Trend Başlangıcı | Yeni yükseliş trendi başlıyor | pos |
| Altın Çapraz | Uzun vadeli al sinyali (Altın Kesişim) | pos |
| Altın Çapraz Yaklaşıyor | Altın Kesişim'e yaklaşıyor | pos |
| MACD Kesişimi | Momentum yukarı döndü | pos |
| Hacim Anomalisi | Olağandışı hacim girişi | pos |
| Para Akışı Uyumsuzluğu | Fiyat düşerken alım gücü artıyor | pos |
| RSI Uyumsuzluğu | Satış baskısı zayıflıyor | pos |
| Destek/Direnç Kırılımı | Direnci kırdı | pos |
| Bollinger Sıkışması | Sıkışma — sert hareket yakın | neutral |
| Çift Dip · Ters OBO · Cup&Handle · Bull Flag · Yükselen Üçgen · Higher Lows | Dönüş formasyonu: **{ad}** | pos |
| Direnç Testi | Direnç seviyesini test ediyor | neutral |
| Trend Olgunlaşıyor · MACD Daralıyor | Momentum yavaşlıyor | warn |
| Çift Tepe · Bear Flag | Zayıflama formasyonu: **{ad}** | warn |
| RSI Seviyesi (aşırı alım) | Aşırı alım bölgesinde | warn |

### S1-2: Sinyal dışı gerekçeler

| Kaynak | Rozet | Ton |
|---|---|---|
| `smart_money_entered` | **Akıllı para girişi başladı** | pos |
| `accumulation` | Sessiz birikim aşamasında | pos |
| `distribution` | Dağıtım baskısı var | warn |
| `rel_vol5 ≥ 1.5` | Hacim ortalamanın **{n}×** üstünde | pos |
| Fiyat > EMA20/50 | **Hareketli ortalamaların üstünde** | pos |
| `weeklyAligned` | Haftalık trend de aynı yönde | pos |
| `catalyst` (pozitif, fiyatlanmamış) | Haber katalisti destekliyor | pos |
| `catalyst` (fiyatlanmış) | Haber etkisi zaten fiyatlanmış | warn |
| `catalyst` (çelişen) | ⚠️ Haber sinyalle çelişiyor | warn |
| `sectorAlign > 0` | Sektörü de güçlü | pos |
| `earningsRisk < 0` | Bilanço **{n} gün** sonra — belirsizlik | warn |
| `kapEvent` | Son 7 günde kritik şirket duyurusu | warn |
| `tavanYaklasıyor` / `isTavan` | Tavana yakın / tavan | neutral |
| combo-stats isabet | **Onaylı kurulum** — geçmişte %{n} tuttu | pos + `evidence` |
| Temel veto (yumuşak) | ⚠️ Ucuz görünüyor ama temeli zayıf | warn |
| Banka (teyit uygulanmadı) | Temel teyidi uygulanmadı (banka) | neutral |

### S1-3: Seçim ve sıralama kuralları
1. `priority`'ye göre sırala.
2. **En fazla 4** rozet göster; **en az 1 warn varsa mutlaka görünür** (uyarı asla
   pozitiflere kurban edilmez).
3. Aynı aileden birden fazla varsa **en güçlüsü** (örn. 3 formasyon → en yüksek severity).
4. Hiç rozet yoksa → o kart zaten zayıftır; **skor eşiğinin altındaysa yayınlanmaz**.

### Doğrulama (S1)
`lib/__tests__/opportunity-reasons.test.ts` — sözlük kapsaması (her sinyal tipinin
karşılığı var mı), 4-rozet sınırı, warn'ın korunması, boş durum, banka durumu.

---

## FAZ S2 — Kart ve ekran sunumu

> Görsel dil **tasarıma bırakılır** (bkz. aşağıdaki tasarım brief'i). Burası **içerik
> mimarisi ve davranış** sözleşmesidir.

### S2-1: Tek kaynak entegrasyonu
- `components/new/FirsatlarScreen.tsx` → `reasonOf()` **kaldırılır**, `deriveReasons()` tüketir.
- `components/FirsatKarti.tsx` → ham `adjustments` rozetleri (`📅 Bilanço -8`) **kaldırılır**,
  `deriveReasons()` tüketir. *(Eski tema kart — fonksiyon kaybı yok, gerekçe zenginleşir.)*
- `components/new/BugunScreen.tsx` sinyal akışı → aynı fonksiyon.

### S2-2: Kart bilgi hiyerarşisi (yukarıdan aşağı)
1. **Sembol + şirket adı** · fiyat · günlük değişim
2. **Tek cümlelik özet** — en yüksek öncelikli 1-2 gerekçeden üretilir
3. **Gerekçe rozetleri** (maks 4, tonlu)
4. **Skor** + varsa "Onaylı kurulum" kanıt rozeti
5. **Bağlam satırı** — sektör · hacim · R/R
6. (detayda) Tüm gerekçeler + stop/hedef + grafik

### S2-3: Filtre çipleri (mevcut yapıyı koru, adlandırmayı düzelt)
Mevcut: `tumu · guclu · momentum · akilli · katalist`.
Eklenir: **`onayli`** (varsayılan) ve **`uyarili`** (warn içerenler — şeffaflık).

### S2-4: Boş / zayıf durumlar (kusursuz sunumun testi)
- Onaylı katman boş → *"Bugün onaylı kurulum yok. Piyasa temkinli — beklemek de bir karar."*
  \+ "Tümünü göster" geçişi. **Boşluğu doldurmak için eşik düşürülmez.**
- Rejim kapısı devrede → *"Rejim temkinli, daha seçici gösteriliyor."*

### Doğrulama (S2)
Preview'de: rozetler render, 4 sınırı tutuyor, warn görünüyor, jargon yok, motor içi sayı
sızmıyor; açık/karanlık tema; mobil/masaüstü; boş durum; `?filtre=` davranışı.

---

## Tasarlanması gereken ekranlar (design'a bırakılıyor)

Plan **ne gösterileceğini** tanımlar; görsel dil, yerleşim, tipografi ve etkileşim
kararları tasarıma bırakılmıştır.

| # | Yüzey | İçerik özeti |
|---|---|---|
| 1 | **Fırsat kartı** | Sembol/fiyat/değişim · tek cümlelik özet · en fazla 4 tonlu gerekçe rozeti (pozitif/uyarı ayrımı görünür) · skor · varsa "onaylı kurulum" kanıt rozeti · bağlam satırı (sektör, hacim, R/R) |
| 2 | **Fırsatlar liste ekranı** | İki katman geçişi (Onaylı ↔ Tümü), filtre çipleri, sayaçlar, rejim bağlam şeridi, boş/zayıf durum mesajları |
| 3 | **Fırsat detayı** | Tüm gerekçeler (kısıtsız), her birinin açıklaması, stop/hedef, grafik, "bu kurulum geçmişte nasıl performans gösterdi" |

---

## Kapsam DIŞI

- ❌ Yeni sinyal/gösterge hesabı — mevcut 23 sinyal yeterli
- ❌ Motor skorlama değişikliği (yalnız yayın eşiği)
- ❌ Gün-içi veri gerektiren rozetler (VWAP, gap, intraday RVOL) — günlük veri var
- ❌ Kullanıcının strateji seçtiği screener paradigması — kart **kendini** açıklar

---

## Riskler

| Risk | Azaltma |
|---|---|
| Eşik çok sert → liste sürekli boş | `MIN_PUBLISH_SCORE` tek sabitte, kolay ayarlanır; boş durum zaten dürüst mesaj |
| Bankalar sessizce elenir | Açık "teyit uygulanmadı" etiketi + `BANKA-MOTORU-PLAN.md` |
| Rozet enflasyonu | Sert 4 sınırı + öncelik sırası + test |
| Uyarıların gizlenmesi | Kural: en az 1 warn varsa mutlaka görünür (testli) |
| Sadeleştirirken bilgi kaybı | Detay görünümünde tam liste (progressive disclosure) |

---

## Sıralama

```
S0 Tuzak eleme (yayın eşiği + iki katman)   🔴 önce — listede olmaması gerekenler çıksın
   └→ S1 Gerekçe üretim katmanı (lib/opportunity-reasons.ts)
        └→ S2 Kart + ekran entegrasyonu (tek kaynak)
```

---

## Doğrulama (her faz)

1. `npx tsc --noEmit` + `npm run build` temiz; mevcut testler geçer.
2. `SCORING_V2=false` → eski davranış (regresyon yok).
3. Rozet sözlüğü **kapsama testi**: `signals.ts`'teki her tipin karşılığı var mı.
4. Jargon taraması: UI'da ham motor adı veya negatif sayı **görünmemeli**.
5. Gerçek veriyle preview: onaylı/tümü geçişi, sayaçlar, boş durum.
6. Açık/karanlık tema + mobil/masaüstü.
7. **Migration GEREKMEZ** — saf sunum + mevcut API'ler.

---

## Açık kararlar

1. `MIN_PUBLISH_SCORE` başlangıç değeri? (Öneri: 55 — "Tut" bandının üstü; A/B ile ayarlanır.)
2. Varsayılan katman "Onaylı" mı olsun, yoksa ilk sürümde "Tümü" kalıp onaylı çip olarak mı gelsin?
3. Eski `FirsatKarti` (eski tema) da güncellensin mi, yoksa yalnız yeni tasarım ekranları mı?
