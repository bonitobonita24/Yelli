import { test as setup, expect } from '@playwright/test';
import * as path from 'path';

const authFile = path.join(__dirname, '../playwright/.auth/host.json');

setup('authenticate as webmaster', async ({ page }) => {
  const password = process.env.WEBMASTER_PASSWORD;
  if (!password) {
    throw new Error(
      'WEBMASTER_PASSWORD is not set. Copy .env.test.e2e.example to .env.test.e2e and fill in the value.'
    );
  }

  await page.goto('/login');

  // Login form uses Email field with z.string().email() validation
  // (apps/web/src/app/(auth)/login/page.tsx). Webmaster email defaults to
  // `webmaster@${APP_SLUG}.local` matching packages/db/prisma/seed.ts.
  const APP_SLUG = process.env.APP_SLUG ?? 'yelli';
  const email = process.env.WEBMASTER_EMAIL ?? `webmaster@${APP_SLUG}.local`;

  const emailField = page.getByLabel('Email').first();
  const passwordField = page.getByLabel('Password').first();

  await emailField.fill(email);
  await passwordField.fill(password);

  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for redirect to the authenticated app shell
  await page.waitForURL(/\/app/, { timeout: 10_000 });
  await expect(page).not.toHaveURL(/\/login/);

  // Persist authentication state for all e2e specs
  await page.context().storageState({ path: authFile });
});
