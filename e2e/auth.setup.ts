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

  // Primary selectors (Auth.js Credentials provider form labels)
  const usernameField =
    page.getByLabel('Username').or(page.locator('input[name="username"]')).first();
  const passwordField =
    page.getByLabel('Password').or(page.locator('input[name="password"]')).first();

  await usernameField.fill('webmaster');
  await passwordField.fill(password);

  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for redirect to the authenticated app shell
  await page.waitForURL(/\/app/, { timeout: 10_000 });
  await expect(page).not.toHaveURL(/\/login/);

  // Persist authentication state for all e2e specs
  await page.context().storageState({ path: authFile });
});
