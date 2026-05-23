/**
 * (auth-bypass-for-e2e) — Playwright/E2E auth bypass helper.
 *
 * Provides a deterministic auth path for end-to-end smoke tests that does
 * NOT require Turnstile, bcrypt, or the credentials form UI. Replaces the
 * manual "stop the dev container" recipe from
 * [[playwright-smoke-auth-configuration-blocker]] with an env-gated provider
 * that never registers when NODE_ENV === "production".
 *
 * Security guards (BOTH required — single point of failure if either is wrong):
 *   1. AUTH_BYPASS_FOR_E2E === true (env schema, defaults false)
 *   2. APP_ENV !== "production" (env enum, validated at boot)
 *
 * Why APP_ENV instead of NODE_ENV: webpack's DefinePlugin inlines
 * `process.env.NODE_ENV` as `"production"` at `next build` time, so a NODE_ENV
 * guard constant-folds to false in any containerized dev build — defeating
 * the bypass entirely. APP_ENV is a project-controlled var that webpack does
 * NOT inline (only NODE_ENV is in DefinePlugin's static-replacement target
 * list). See lessons.md [[auth-bypass-prod-guard]] + [[webpack-define-plugin-trap]].
 *
 * Tests live in auth-bypass.test.ts.
 */
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

// eslint-disable-next-line no-restricted-syntax -- Type-only import; same exemption rationale as auth.ts (Rule 13 covers runtime DB client consumption, not types).
import type { UserStatus } from "@yelli/db";

/**
 * Pure predicate — given the env snapshot, should the bypass provider be
 * wired into NextAuth's providers array? Extracted so the call-site in
 * auth.ts stays a one-liner and so this check is trivially unit-testable
 * without spinning up the full Auth.js runtime.
 */
export function isE2EBypassEnabled(env: {
  AUTH_BYPASS_FOR_E2E: boolean;
  APP_ENV: "development" | "staging" | "production";
}): boolean {
  return env.AUTH_BYPASS_FOR_E2E === true && env.APP_ENV !== "production";
}

const bypassSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

/**
 * Minimal Prisma-like surface this helper depends on. Accepting an interface
 * (rather than importing platformPrisma directly) keeps the function pure
 * for tests — fakes can satisfy this shape without a real DB.
 */
export type BypassPrismaClient = {
  user: {
    findMany: (args: {
      where: { email: string; status: UserStatus };
      include?: { organization: true };
      take?: number;
    }) => Promise<
      Array<{
        id: string;
        email: string;
        organization_id: string;
        role: "tenant_admin" | "host" | "participant";
        is_super_admin: boolean;
        security_version: number;
        display_name: string;
        organization: { id: string; slug: string; suspended_at: Date | null };
      }>
    >;
  };
};

/**
 * The bypass authorize() function. Returns the same shape as the real
 * authorize() in auth.ts so JWT + session callbacks treat the result
 * identically — same role propagation, same securityVersion check, etc.
 *
 * Differences from the real authorize():
 *   - No password / bcrypt step (this is the point of the bypass)
 *   - No Turnstile token (E2E runs don't render the captcha widget)
 *   - No organizationSlug input (email must match exactly one active user)
 *
 * Authorization checks that ARE preserved (defense in depth):
 *   - User must exist and be status === "active" (filtered in the query)
 *   - User's organization must not be suspended
 *   - Email must resolve to EXACTLY one active user (no cross-org ambiguity)
 */
export async function authorizeE2EBypass(
  rawCredentials: { email?: unknown },
  db: BypassPrismaClient,
): Promise<{
  id: string;
  email: string;
  organizationId: string;
  organizationSlug: string;
  role: "tenant_admin" | "host" | "participant";
  isSuperAdmin: boolean;
  securityVersion: number;
  displayName: string;
} | null> {
  const parsed = bypassSchema.safeParse(rawCredentials);
  if (!parsed.success) return null;

  const { email } = parsed.data;

  const candidates = await db.user.findMany({
    where: { email, status: "active" },
    include: { organization: true },
    take: 2,
  });

  if (candidates.length !== 1) return null;
  const userRecord = candidates[0];
  if (userRecord === undefined) return null;
  if (userRecord.organization.suspended_at !== null) return null;

  return {
    id: userRecord.id,
    email: userRecord.email,
    organizationId: userRecord.organization_id,
    organizationSlug: userRecord.organization.slug,
    role: userRecord.role,
    isSuperAdmin: userRecord.is_super_admin,
    securityVersion: userRecord.security_version,
    displayName: userRecord.display_name,
  };
}

/**
 * Factory for the NextAuth Credentials provider used by E2E. The caller in
 * auth.ts conditionally includes this in the providers array based on
 * isE2EBypassEnabled(env). The provider is named "e2e-bypass" so Playwright
 * tests can target it explicitly via signIn("e2e-bypass", { email, ... }).
 *
 * Accepts the real Prisma client surface via a structural cast. The cast is
 * safe because findMany's runtime contract — when called with the args
 * authorizeE2EBypass uses — returns rows that satisfy BypassPrismaClient.
 * The structural type exists for unit-test fakes; the real client satisfies
 * a strict superset of the interface (it returns more fields, never fewer).
 */
export function buildE2EBypassProvider(db: unknown) {
  return Credentials({
    id: "e2e-bypass",
    name: "E2E Bypass (dev/staging only — never production)",
    credentials: {
      email: { label: "Email", type: "email" },
    },
    async authorize(rawCredentials) {
      return authorizeE2EBypass(rawCredentials ?? {}, db as BypassPrismaClient);
    },
  });
}
