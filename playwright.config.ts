import { defineConfig, devices } from '@playwright/test';

/**
 * BistAI E2E Test Konfigürasyonu
 *
 * Test akışları:
 *  1. Giriş (kayıt + oturum açma)
 *  2. Hisse inceleme (sinyal → detay → watchlist)
 *  3. Alarm kurma (fiyat alarmı + bildirim tercihi)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Sıralı çalış — auth state paylaşımı için
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Mobil emülasyon — en kritik test ortamı
    viewport: { width: 390, height: 844 }, // iPhone 14 Pro
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    // Gerçek kullanıcı gibi davran
    hasTouch: true,
    isMobile: true,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
  },

  projects: [
    // Auth setup — credentials'ı kaydet, diğer testler kullanır
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },

    // Mobil — iPhone 14 (gerçek kullanıcı profili)
    {
      name: 'mobile-chrome',
      dependencies: ['setup'],
      use: {
        ...devices['iPhone 14'],
        storageState: 'e2e/.auth/user.json',
      },
    },

    // Masaüstü — hızlı CI doğrulama için
    {
      name: 'desktop-chrome',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        isMobile: false,
        hasTouch: false,
        storageState: 'e2e/.auth/user.json',
      },
    },
  ],

  // Next.js dev server'ı otomatik başlat (local test için)
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
