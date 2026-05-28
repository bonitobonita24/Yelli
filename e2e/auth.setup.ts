import { test as setup, expect } from '@playwright/test';
import * as path from 'path';

const authFile = path.join(__dirname, '../playwright/.auth/host.json');

setup('authenticate as webmaster (e2e-bypass)', async ({ page }) => {
  // Uses the framework's purpose-built bypass provider:
  // apps/web/src/server/auth-bypass.ts (id: "e2e-bypass").
  // Dual-gated server-side by AUTH_BYPASS_FOR_E2E=true + APP_ENV!=production.
  // Skips bcrypt, Turnstile, and the UI form entirely.
  // Webmaster email defaults to `webmaster@${APP_SLUG}.local` matching
  // packages/db/prisma/seed.ts.
  const APP_SLUG = process.env.APP_SLUG ?? 'yelli';
  const email = process.env.WEBMASTER_EMAIL ?? `webmaster@${APP_SLUG}.local`;

  // NextAuth requires a CSRF token on every callback POST.
  const csrfResp = await page.request.get('/api/auth/csrf');
  if (!csrfResp.ok()) {
    throw new Error(`CSRF fetch failed: ${csrfResp.status()} ${csrfResp.statusText()}`);
  }
  const { csrfToken } = (await csrfResp.json()) as { csrfToken: string };

  // Sign in via the e2e-bypass provider. Session cookie flows into page.context.
  const signInResp = await page.request.post('/api/auth/callback/e2e-bypass', {
    form: {
      csrfToken,
      email,
      callbackUrl: '/app',
      json: 'true',
    },
  });
  if (!signInResp.ok()) {
    throw new Error(
      `E2E bypass sign-in failed: ${signInResp.status()} — verify ` +
        `AUTH_BYPASS_FOR_E2E=true and APP_ENV!=production are set in the run env.`
    );
  }

  // Confirm the session resolves by visiting the authenticated shell.
  await page.goto('/app');
  await page.waitForURL(/\/app/, { timeout: 10_000 });
  await expect(page).not.toHaveURL(/\/login/);

  // Persist authentication state for all e2e specs.
  await page.context().storageState({ path: authFile });
});
