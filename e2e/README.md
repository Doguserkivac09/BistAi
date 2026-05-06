# BistAI E2E Testleri

Playwright ile yazılmış kritik akış testleri.

## Testler

| Dosya | Kapsam |
|---|---|
| `auth.setup.ts` | Giriş — session kaydeder |
| `01-giris.spec.ts` | Giriş/kayıt akışı |
| `02-hisse-inceleme.spec.ts` | Hisse arama + detay + watchlist |
| `03-alarm.spec.ts` | Fiyat alarmı + bildirim tercihleri |
| `04-sayfa-sagligi.spec.ts` | Smoke test (tüm sayfalar) + API sağlık |

## Çalıştırma

```bash
# .env.test dosyası oluştur
E2E_EMAIL=seninemailin@example.com
E2E_PASSWORD=sifren

# Tüm testler
npm run e2e

# Sadece smoke testler (hızlı CI)
npm run e2e:smoke

# Görsel UI ile (debug)
npm run e2e:ui

# Raporu gör
npm run e2e:report
```

## CI/CD

GitHub Actions için `.github/workflows/e2e.yml`:

```yaml
- name: E2E Tests
  env:
    E2E_BASE_URL: ${{ secrets.VERCEL_URL }}
    E2E_EMAIL: ${{ secrets.E2E_EMAIL }}
    E2E_PASSWORD: ${{ secrets.E2E_PASSWORD }}
  run: npm run e2e:smoke
```

## Notlar

- Testler **mobil emülasyon** ile çalışır (iPhone 14 Pro)
- `storageState` sayesinde her test ayrıca giriş yapmaz
- Smoke testler deployment sonrası otomatik çalışabilir
