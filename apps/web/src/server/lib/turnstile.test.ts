/**
 * (turnstile-app-env-guard) — Turnstile prod-gate helper tests.
 *
 * Purpose: verify the hostname-mismatch enforcement gate uses APP_ENV (not
 * NODE_ENV), so that containerized dev/staging builds correctly skip the
 * hostname check that would otherwise reject test-key tokens (which resolve
 * to "localhost" via Cloudflare's siteverify).
 *
 * Why the gate matters: Cloudflare's test sitekeys
 * (1x00000000000000000000AA, etc.) return `hostname: "localhost"` from
 * siteverify regardless of where the widget actually rendered. The real
 * app's expected host is whatever NEXT_PUBLIC_APP_URL points at — so any
 * non-production build comparing localhost vs e.g. http://localhost:43512
 * would either match or not depending on the URL shape. The hostname check
 * is meaningful in production only; in dev/staging we accept the mismatch
 * and trust the success bit.
 *
 * Why APP_ENV not NODE_ENV: webpack's DefinePlugin inlines
 * `process.env.NODE_ENV` as `"production"` at `next build` time. A NODE_ENV
 * gate constant-folds to `true` in any containerized build, forcing the
 * hostname check on regardless of the runtime container env — breaking
 * test-key login flows in containerized dev. APP_ENV is project-controlled
 * and survives bundling as a runtime process.env read. See lessons.md
 * [[webpack-define-plugin-trap]] + [[auth-bypass-prod-guard]].
 */
import { describe, expect, it } from "vitest";

import { shouldEnforceTurnstileHostnameMatch } from "@/server/lib/turnstile";

describe("shouldEnforceTurnstileHostnameMatch", () => {
  it("returns false when APP_ENV=development (test keys must be accepted)", () => {
    expect(
      shouldEnforceTurnstileHostnameMatch({ APP_ENV: "development" }),
    ).toBe(false);
  });

  it("returns false when APP_ENV=staging (test keys still in use)", () => {
    expect(shouldEnforceTurnstileHostnameMatch({ APP_ENV: "staging" })).toBe(
      false,
    );
  });

  it("returns true when APP_ENV=production (live keys must match hostname)", () => {
    expect(
      shouldEnforceTurnstileHostnameMatch({ APP_ENV: "production" }),
    ).toBe(true);
  });
});
