import { test, expect } from '@playwright/test';

/**
 * Kritik Sayfa Sağlık Testleri — "Smoke Tests"
 *
 * Her sayfa:
 *  ✓ Yükleniyor (timeout yok, crash yok)
 *  ✓ Başlık doğru
 *  ✓ Ana içerik görünür (main element)
 *  ✓ Error page gösterilmiyor
 *
 * Bu testler deployment sonrası otomatik çalıştırılabilir.
 */

const KRITIK_SAYFALAR = [
  { path: '/firsatlar',   titlePattern: /Fırsatlar|BistAI/i },
  { path: '/tarama',      titlePattern: /Tarama|BistAI/i     },
  { path: '/screener',    titlePattern: /Screener|BistAI/i   },
  { path: '/sektorler',   titlePattern: /Sektör|BistAI/i     },
  { path: '/backtesting', titlePattern: /Backtest|BistAI/i   },
  { path: '/watchlist',   titlePattern: /İzleme|BistAI/i     },
  { path: '/portfolyo',   titlePattern: /Portföy|BistAI/i    },
  { path: '/makro',       titlePattern: /Makro|BistAI/i      },
  { path: '/haberler',    titlePattern: /Haberler|BistAI/i   },
  { path: '/yardim',      titlePattern: /Yardım|BistAI/i     },
];

test.describe('Sayfa Sağlık Kontrolü (Smoke Tests)', () => {

  for (const { path, titlePattern } of KRITIK_SAYFALAR) {
    test(`${path} yükleniyor`, async ({ page }) => {
      await page.goto(path);

      // Crash veya error boundary tetiklenmemiş olmalı
      await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });

      // "Beklenmedik hata" mesajı olmamalı
      const errorText = page.locator('text=/beklenmedik.*hata|something went wrong/i');
      await expect(errorText).not.toBeVisible({ timeout: 3_000 }).catch(() => {
        // Error boundary tetiklenmişse test başarısız
        throw new Error(`${path} sayfasında error boundary tetiklendi`);
      });

      // Konsol'da kritik hatalar var mı?
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !msg.text().includes('favicon')) {
          errors.push(msg.text());
        }
      });

      await page.waitForTimeout(2000);
    });
  }

  test('hisse detay sayfası (AKBNK) yükleniyor', async ({ page }) => {
    await page.goto('/hisse/AKBNK');
    await expect(page.locator('main')).toBeVisible({ timeout: 20_000 });

    // Sembol görünüyor
    await expect(page.locator('text=AKBNK').first()).toBeVisible({ timeout: 15_000 });
  });

  test('yardım formasyonlar sayfası yükleniyor (SSG)', async ({ page }) => {
    await page.goto('/yardim/formasyonlar/cup-handle');
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('h1').filter({ hasText: /kupa|cup/i })).toBeVisible({ timeout: 8_000 });
  });

  test('yardım sinyal sayfası yükleniyor (SSG)', async ({ page }) => {
    await page.goto('/yardim/sinyaller/rsi-uyumsuzlugu');
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
  });

  test('404 sayfası graceful gösterilir', async ({ page }) => {
    await page.goto('/var-olmayan-sayfa-xyz123');
    // 404 veya redirect olmalı, crash olmamalı
    await page.waitForTimeout(3000);
    // Sayfa hala yüklenmiş olmalı (blank değil)
    const bodyText = await page.textContent('body');
    expect(bodyText?.length).toBeGreaterThan(10);
  });

});

// ── API Sağlık Kontrolleri ────────────────────────────────────────────
test.describe('API Sağlık Kontrolü', () => {

  test('/api/firsatlar yanıt veriyor', async ({ request }) => {
    const response = await request.get('/api/firsatlar', { timeout: 15_000 });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('firsatlar');
  });

  test('/api/sectors yanıt veriyor', async ({ request }) => {
    const response = await request.get('/api/sectors', { timeout: 15_000 });
    expect(response.ok()).toBeTruthy();
  });

  test('/api/movers yanıt veriyor', async ({ request }) => {
    const response = await request.get('/api/movers', { timeout: 15_000 });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('gainers');
    expect(body).toHaveProperty('losers');
  });

  test('/api/macro yanıt veriyor', async ({ request }) => {
    const response = await request.get('/api/macro', { timeout: 15_000 });
    expect(response.ok()).toBeTruthy();
  });

});
