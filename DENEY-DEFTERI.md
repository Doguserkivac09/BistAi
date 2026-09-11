# Deney Defteri

> **Neden var:** Tek tek deneyleri kilitlemek proje düzeyindeki çoklu test sorununu çözmez.
> KILL çıkan her fikrin ardından yenisi denenir; on deney sonra biri tesadüfen tutar.
> Bu defter **denenen her hipotezi** sırayla kaydeder. İleride "başarılı" ilan edilecek
> herhangi bir modelin anlamlılığı, buradaki toplam deneme sayısına göre düzeltilir.
>
> **Kural:** Yeni bir hipotez test edilmeden ÖNCE buraya satır açılır. Sonuç ne olursa
> olsun satır silinmez.

## Alan: kısa vadeli hisse sinyali (BIST / ABD)

| # | Tarih | Hipotez | Veri / ufuk | Önceden kayıtlı mı | Sonuç | Betik |
|---|---|---|---|---|---|---|
| H1 | 2026-09-11 | 4'lü dip kurulumu (RSI+ADX+VI+OBV, aynı mum) XU100'ü geçer | BIST 1g, 20g sabit ufuk | Evet | ❌ −3,6 [−7,2, −0,1] | `setup-backtest.ts` |
| H2 | 2026-09-11 | Aynı kurulum, "son 5 mumda" bölge tanımı | BIST 1g, 20g | Hayır (sıklığa bakılarak eklendi) | ❌ −1,4 [−3,2, +0,5]; ikinci yarıda RSI'dan kötü | `setup-backtest.ts` |
| H3 | 2026-09-11 | Bölge tanımı eşik ızgarası (36 varyant) | BIST 1g, 20g | Sağlamlık | RSI tabanını 36/36 geçti ama endeksi geçmedi | `setup-backtest.ts` |
| H4 | 2026-09-11 | Kâr alma aynası sonrası düşüş | BIST 1g, 20g | Evet | ❌ +1,7 (düşüş yok) | `setup-backtest.ts` |
| H5 | 2026-09-11 | POST-HOC: RSI≥70 + ADX(+DI) + VI tepe → trend devamı | BIST 1g, 20g | **Hayır (sonuca bakılarak bulundu)** | ⚠️ +3,9 [+2,4, +5,5] — kanıt değil | `setup-backtest.ts` |
| H6 | 2026-09-11 | Swing, bölge tanımı; çıkış tepe / RSI70 / hedef-stop | BIST 1s + 1g, işlem bazlı | Kısmen | BIST 1s tepe çıkışı XU100'e göre +0,8 [+0,1, +1,5]; kullanıcı dairelerini bulamadı | `swing-backtest.ts` |
| H7 | 2026-09-11 | Swing, sıralı tanım (VRT'ye bakılarak kalibre) | BIST 1s + 1g | Hayır | ❌ BIST 1s −0,3; BIST 1g ~0 | `swing-backtest.ts` |
| H8 | 2026-09-11 | Sıralı tanım, ABD yüksek hacimli | ABD 1s + 1g | Hayır | ❌ 1s ~0; ⚠️ 1g +1,1…+1,3 (24/24 pozitif, 5 anlamlı) | `swing-backtest.ts` |
| H9 | 2026-09-11 | Durum tanımı + siyah-beyaz kesişim çıkışı (kullanıcı düzeltmesi) | BIST 1s, ABD 1s + 1g | Hayır | ❌ BIST 1s, ABD 1s ~0; ⚠️ ABD 1g −DI>+DI +1,1 [+0,2, +2,1] | `swing-backtest.ts` |
| H10 | 2026-09-11 | H9 ABD 1g, ileriye dönük | ABD 1g, canlı | **Evet (ileriye dönük)** | ⏳ birikiyor (`swing_sicil`) | `lib/swing-sicil-runner.ts` |
| H11 | 2026-09-11 | Kısa Vade ham sinyalleri mutlak getiride kârlı | BIST, 118 bin sinyal, kanonik ufuk | Hayır (betimleyici) | ❌ %46,2 kazanan, −%0,44 net; evrene göre kıyas YAPILMADI | (geçici betik) |
| H12 | 2026-09-11 | **DENEY-001:** confluence momentum'un üstüne kesitsel bilgi taşır | BIST 1g, 2000–2026 (karar dönemi veri kapısıyla), h=10 | **Evet (kilitli)** | ❌ **KILL** — kısmi IC −0,0001 [−0,0055, +0,0060], MDE 0,0039; bariyer −%0,51/dönem; kararlılık %36 | `deney-001-*.ts` |

**Toplam (bu alan):** 12 hipotez, bunlardan 3'ü önceden kayıtlı (H1, H4, H12) + 1 ileriye dönük (H10).
H3'teki 36 varyant ve H6–H9'daki çıkış × zaman dilimi × ızgara kombinasyonları ayrıca
**~150 örtük test** içerir; bu alanda "anlamlı" çıkacak herhangi bir geriye dönük sonuç bu
sayıya göre düzeltilmelidir.

## Alan: fon uyarıları (ayrı)

| # | Tarih | Hipotez | Sonuç |
|---|---|---|---|
| F1 | 2026-09-09 | Fiyat-yatırımcı ayrışması çöküşü haber verir | ❌ 289 bin fon-gün, kötü sonuç %2,2 vs taban %3,5 |
| F2 | 2026-09-09 | Yatırımcı kaçışı kötü sonucu haber verir | ❌ %2,8 vs %3,5 |
| F3 | 2026-09-09 | Emsale göre sert düşüş, dağılımın genişlediğini haber verir | ✅ %21,5 vs %3,5 (yayında) |
