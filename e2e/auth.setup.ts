import { test as setup, expect } from '@playwright/test';
import path from 'path';

/**
 * Auth Setup — giriş yapıp session'ı kaydeder.
 * Diğer testler bu session'ı kullanır, her test ayrıca giriş yapmaz.
 *
 * Env vars (CI'da secret, local'de .env.test):
 *   E2E_EMAIL    — test hesabı emaili
 *   E2E_PASSWORD — test hesabı şifresi
 */
const authFile = path.join(__dirname, '.auth/user.json');

setup('giriş yap ve session kaydet', async ({ page }) => {
  const email    = process.env.E2E_EMAIL    ?? 'test@bistai.dev';
  const password = process.env.E2E_PASSWORD ?? 'testpassword123';

  await page.goto('/giris');

  // Sayfa yüklendi
  await expect(page).toHaveTitle(/Giriş|BistAI/i, { timeout: 15_000 });

  // Email + şifre
  await page.getByPlaceholder(/e-posta|email/i).fill(email);
  await page.getByPlaceholder(/şifre|password/i).fill(password);
  await page.getByRole('button', { name: /giriş|devam/i }).click();

  // Dashboard veya tarama sayfasına yönlendirildi
  await page.waitForURL(/dashboard|tarama|firsatlar/, { timeout: 20_000 });
  await expect(page).not.toHaveURL(/giris/);

  // Session'ı kaydet — sonraki testler kullanacak
  await page.context().storageState({ path: authFile });
});
