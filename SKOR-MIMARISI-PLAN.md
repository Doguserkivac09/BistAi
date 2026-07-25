# Skor Mimarisi Yeniden Düzenleme — "Seçim = Teknik + Temel + Duyarlılık, Makro = Kapı"

> Bu döküman **kodlama planıdır** — başka bir Claude Code penceresinde faz faz uygulanacak.
> Amaç: composite skoru hisse-seçici güçlerine indirgemek; **skaler** makro/rejimi skordan
> çıkarıp kapıya taşımak; ama makroyu **hisse-duyarlılığıyla çarpılmış vektör** olarak
> ranking'e geri koymak. Her şeyden önce: **ölçülebilirlik.**
> Oluşturulma: 2026-07-23

---

## 0. Tez (neden yapıyoruz)

Composite skor (`lib/decision-engine.ts` v1.2.0 + `lib/composite-signal.ts`) teknik ×
makro × sektör karışımı. Üç gözlem:

1. **Skaler makro/rejim skoru kesitte sabittir** — belli bir günde 619 hissede aynı sayı.
   Kesitte sabit faktör **sıralamayı değiştiremez**, yalnız ortalamayı kaydırır → hisse
   *seçmeye* katkısı ~0.
2. **Ama makro/sektör × hisse-duyarlılığı kesitte DEĞİŞKENDİR.** Örn: para sağlığa akınca
   SELEC %60 etkilenirken başka hisse %10-20 etkilenir. Bu çarpım kesitte **ayrıştırıcıdır**
   → gerçekten hisse seçer. TR'de siyasi şok kaynaklı sektör rotasyonu sert/ani olduğu için
   bu kanalın değeri gelişmiş piyasalardan **yüksek**.
3. **Skaler makro verisi zayıf** (`DATA-AUDIT.md`: TCMB faizi/CDS/EVDS fallback/proxy).

**Sonuç — üç ayrı kanal:**

| Kanal | Kesitte | Rolü |
|---|---|---|
| **Teknik + Temel** | Değişken | Ranking çekirdeği (her zaman) |
| **Skaler makro rejim** | Sabit | **Kapı** — eşik / pozisyon boyutu / güven / gösterilen sinyal sayısı |
| **Makro/sektör × hisse-duyarlılığı** | Değişken | **Ranking'e katkı** (yalnız hisse-özel olduğu için meşru) |

Tek cümle: **skaler makroyu skordan çıkar → kapıya taşı; duyarlılıkla çarpılmış makroyu
skora geri koy.** Enflasyon düzeltmesi (temel-girdisi) korunur.

**En kritik kısıt:** Şu an hiçbir "iyileşme" ölçülemez — `signal_performance` kirli
(entry Nisan'da takılı, ~62.893 evaluate backlog). **Ölçemediğin şeyi geliştiremezsin.**
Bu yüzden Faz 0 = ölçülebilirlik, diğer her şeyden önce gelir.

---

## 1. Sağlamlık değerlendirmesi (dürüst)

| İddia | Verdict |
|---|---|
| Skaler makro kesitte sıralama değiştirmez | ✅ Matematiksel olarak doğru |
| Makro × duyarlılık kesitte ayrıştırıcıdır (SELEC örneği) | ✅ Doğru — en yüksek potansiyelli kanal |
| Duyarlılık katsayısı (0.6) kırılgandır | ⚠️ Regresyonla üretmek kararsız/overfit → **kural-tabanlı başla** |
| Skaler makro = risk kapısı olarak değerli | ✅ Literatürde desteklenir |
| Enflasyon düzeltmesi korunmalı | ✅ Temel-girdisi |
| "Önce A/B backtest ile ölç" | ⚠️ Veri temizlenene dek güvenilmez → Faz 0 zorunlu |

**Beklenen kazanç dürüst çerçeve:** "daha yüksek getiri" garantisi YOK. Beklenen fayda
**daha az yanlış sinyal + daha yumuşak düşüş + kararlı sıralama** (risk-ayarlı, ham değil).
Gerçek yüzde ancak **kendi A/B tablon**dan çıkar. Başarı metriği: **Sharpe + max drawdown**,
"kaç sinyal tuttu" değil. Rejime göre (boğa/ayı/yatay) **ayrıştırılmış** ölçülür.

---

## 2. Tasarım ilkeleri

1. **Ranking = Teknik + Temel + (Makro×Duyarlılık).** Üçü de kesitte ayrıştırıcı.
2. **Skaler makro/rejim = kapı**, skor değil (güven / eşik / pozisyon boyutu / sinyal sayısı).
3. **Ufka göre ağırlık:** kısa vade = teknik-öncelikli + temel-VETO; uzun vade = temel-öncelikli.
4. **Duyarlılık kural-tabanlı başlar, veriyle DOĞRULANIR** — kırılgan regresyona düşme.
5. **Enflasyon düzeltmesi korunur.**
6. **Geriye uyumluluk:** `SCORING_V2` flag'i arkasında; kapalıyken davranış birebir aynı.

---

## 3. FAZ 0 — Ölçülebilirlik (HER ŞEYDEN ÖNCE) 🔴

> Bu faz olmadan sonraki hiçbir değişikliğin değeri kanıtlanamaz.

### F0-1: Evaluate backlog'unu erit
- `app/api/cron/evaluate` `remaining` sayacını izle; backlog ~0'a inene dek düzenli koştur
  (gerekirse ikinci günlük koşu ekle). Hedef: güncel entry tarihli, evaluated=true kayıtlar.
- `app/api/dev/eval-status` ile ilerlemeyi doğrula.

### F0-2: A/B ölçüm hattı
- **Yeni:** `app/api/dev/scoring-ab/route.ts` (dev-only, CRON_SECRET). Aynı evren + aynı
  tarih aralığında (A) mevcut composite vs (B) `SCORING_V2` ranking → çıktı:
  **win-rate / ortalama getiri / Sharpe / max drawdown**, `lib/backtesting.ts` üstünden.
- **Rejime göre ayrıştır:** sonuçları boğa/ayı/yatay (`lib/regime-engine.ts`) bazında böl.
- **Uyarı yorumu (koda):** backlog erimeden sonuç yönlendirici değil, gözlem amaçlı.

### Doğrulama (F0)
Backlog `remaining` düşüyor; A/B endpoint temiz veriyle win-rate/Sharpe/drawdown tablosu
üretiyor; rejim kırılımı çalışıyor.

---

## 4. FAZ 1 — Motor: ranking / kapı ayrımı + temel veto

- `lib/scoring-config.ts` (YENİ) — tek sabit `SCORING_V2` (aç/kapa) + yüzey-bazlı kademe
  (`PREMIUM_PREVIEW` deseni gibi tek anahtar).
- `lib/decision-engine.ts` (v2.0.0, flag arkasında):
  - **Ranking skoru** = teknik confluence + temel kalite. `macro riskScore` + `sectorAlign`
    ranking toplamından **çıkarılır**.
  - **Kapı çıktısı** (yeni alan): `regimeGate: { confidenceMultiplier, thresholdBump,
    suggestedSizePct, surfacedCount }` — skaler makro + rejimden.
  - **Temel veto katmanı:** Beneish şüpheli / Altman sıkıntı / GARP "değer tuzağı" →
    kısa vadede sinyali **ele veya güveni kır**; toplamsal +puan YOK.
  - `sectorAlign` / `volumeConfirm` → **kaldırılmaz**, `context` bloğuna taşınır (gösterim
    + çok küçük güven etkisi). **FAZ 0 unit testleri korunur.**
- `lib/composite-signal.ts`: "Teknik × Makro × Sektör" → "Teknik + Temel (ranking) ⊕
  Makro (kapı)". BUY/HOLD/SELL ranking + kapı eşiğinden.
- `lib/__tests__/decision-engine.test.ts`: V2 ranking + veto + kapı senaryoları.

---

## 5. FAZ 2 — Makro/sektör × hisse-duyarlılığı kanalı (SELEC örneği)

> Birinci sınıf tasarım kararı. **Kural-tabanlı başla.**

- **Yeni:** `lib/exposure-map.ts` — hisse → maruziyet vektörü, elle tanımlı net eksenler:
  `usdSensitivity` (ihracatçı+ / ithalatçı−), `rateSensitivity` (banka−, borçlu−),
  `commoditySensitivity`, `sectorThemeWeight` (ana sektör teması). Değerler {düşük/orta/yüksek}
  kaba kademeler (kırılgan ondalık beta DEĞİL). SELEC → sağlık teması yüksek.
- `lib/decision-engine.ts`: ranking'e **duyarlılık katkısı** = (sektör/makro akım yönü) ×
  (hisse maruziyeti). Yalnız hisse-özel olduğu için ranking'e meşru girer.
- **Doğrulama katmanı:** her maruziyet ataması, o hissenin geçmiş sektör-getiri ilişkisiyle
  A/B harness'te **kontrol edilir** — tutmuyorsa haritayı düzelt (ezberden büyütme).
- İstatistiksel ince ayar (veri-türevli beta) → **Faz 3 opsiyonel**, F0 verisi olgunlaşınca.

---

## 6. FAZ 3 — API + UI (skor/kapı/duyarlılık ayrı gösterilir)

- `app/api/firsatlar/route.ts`: sıralama yalnız ranking skoruna göre; skaler makro kapısı
  **kaç fırsat + eşik** belirler (ayı rejiminde daha seçici). Duyarlılık ranking'e gömülü.
- `app/api/hisse-analiz/route.ts`: ranking skoru + ayrı "rejim kapısı" + "temel veto" +
  "sektör duyarlılığı" blokları (tek karışık sayı değil).
- `lib/long-term-runner.ts`: zaten temel-öncelikli; makro girdisi yalnız enflasyon
  düzeltmesine indirilir.
- UI (`FirsatKarti`, `FirsatlarScreen`, `BugunScreen`): ranking skoru öne çıkar; makro/rejim
  **ayrı bağlam rozeti** ("Rejim: temkinli — daha seçici gösteriliyor"), sabit-metin picker DEĞİL.

---

## 7. Riskler

- **Veri kirliliği:** F0 bitmeden karar verme. V2 flag arkasında, forward ölçümle teyit.
- **Duyarlılık overfit:** kural-tabanlı + A/B doğrulama ile sınırla; ondalık beta'ya kaçma.
- **Regresyon:** FAZ 0 sectorAlign/volumeConfirm/catalyst silinmez, `context`e taşınır.
- **Aşırı sadeleştirme:** skaler makro kapı olarak KALIR (ayı koruması), yalnız skordan çıkar.
- **Ufuk karışması:** kısa vadede temel yalnız veto (toplamsal skora sızmasın).

---

## 8. Fazlar & sıralama

```
FAZ 0  Ölçülebilirlik (evaluate backlog + A/B harness)   🔴 ÖNCE — diğer her şeyin ön koşulu
FAZ 1  Motor: ranking/kapı ayrımı + temel veto (flag)
FAZ 2  Makro/sektör × duyarlılık kanalı (kural-tabanlı + doğrulama)
FAZ 3  API + UI (skor/kapı/duyarlılık ayrı)
Faz opsiyonel: veri-türevli duyarlılık ince ayarı
```

`SCORING_V2` kapalıyken FAZ 1-3 no-op; açıkken kademeli.

---

## 9. Doğrulama (her faz)

1. `npx tsc --noEmit` + `npm run build` temiz; tüm mevcut testler geçer.
2. `SCORING_V2=false` → çıktı bit-bazında eskiyle aynı (regresyon yok).
3. `SCORING_V2=true` → makro günden güne oynadığında **sıralama sabit** (skaler makro
   sıralamayı sürüklemiyor); ayı rejiminde gösterilen fırsat sayısı ↓ + pozisyon önerisi ↓.
4. Duyarlılık kanalı: sağlığa akım senaryosunda SELEC ranking'i akım-duyarlı hisselerin
   üstüne çıkar; A/B harness bu maruziyeti geçmiş veriyle doğrular.
5. Kısa vadede Beneish-şüpheli/değer-tuzağı hisse elenir/güveni düşer (skora +puan almaz).
6. A/B harness rejim-kırılımlı Sharpe/drawdown tablosu üretir.
7. **Migration GEREKMEZ** — saf motor/UI + mevcut API'ler (A/B & backlog dev-only/cron).

---

## 10. Açık kararlar (kodlamadan önce)

- **F0 sırası:** backlog erime beklenmeden FAZ 1 motoru flag arkasında kodlanabilir; ama
  **karar/açma** F0 verisi gelene dek beklemeli. (Öneri: paralel kodla, veriyle aç.)
- **Duyarlılık haritası kapsamı:** kaç eksen? (öneri: usd / faiz / emtia / sektör-teması —
  4 eksenle başla, SELEC gibi net vakaları kanıtla, sonra genişlet.)
- **Yüzey sırası:** FAZ 3'te önce Fırsatlar mı (en çok görülen) yoksa Bugün mü?
