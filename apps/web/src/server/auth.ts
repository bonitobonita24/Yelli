/**
 * Auth.js v5 (next-auth 5.0.0-beta.25) full server configuration.
 *
 * Imports the edge-safe shell from auth.config.ts and extends it with:
 *   - Credentials provider (bcrypt + platformPrisma — Node-only)
 *   - session() override that re-validates user against the DB
 *
 * Middleware imports auth.config.ts directly (not this file) so the Edge
 * bundle never sees bcrypt or @yelli/db.
 *
 * Security model:
 * - JWT strategy (not DB sessions) — enables securityVersion staleness check without round-trip per request
 * - session() callback re-checks security_version + user status + org suspension on every session read
 * - Stale securityVersion → return session with no user → Auth.js treats as unauthenticated
 * - Login uses platformPrisma (unguarded) — no session exists yet, tenant-guard would block lookup
 * - Generic "Invalid credentials" for all failures — never reveals whether email/org/password was wrong
 * - organizationSlug disambiguates email collision across orgs (email is unique per org, not globally)
 */
// eslint-disable-next-line no-restricted-syntax -- Server-side auth flow; Rule 13 only restricts client consumption of @yelli/db
import { platformPrisma } from "@yelli/db";
import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { authConfig } from "@/server/auth.config";

const credentialsSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
  organizationSlug: z.string().min(1).optional(),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        organizationSlug: { label: "Organization", type: "text" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { email, password, organizationSlug } = parsed.data;

        let userRecord:
          | (Awaited<ReturnType<typeof platformPrisma.user.findFirst>> & {
              organization: NonNullable<
                Awaited<
                  ReturnType<
                    typeof platformPrisma.organization.findUnique
                  >
                >
              >;
            })
          | null = null;

        if (organizationSlug) {
          const org = await platformPrisma.organization.findUnique({
            where: { slug: organizationSlug },
          });
          if (!org || org.suspended_at !== null) return null;

          const found = await platformPrisma.user.findFirst({
            where: { email, organization_id: org.id, status: "active" },
            include: { organization: true },
          });
          if (!found) return null;
          userRecord = found;
        } else {
          // No org slug — only accept if email resolves to exactly one active user
          // (super-admin login or single-org user path)
          const candidates = await platformPrisma.user.findMany({
            where: { email, status: "active" },
            include: { organization: true },
            take: 2,
          });
          if (candidates.length !== 1) return null;
          const candidate = candidates[0];
          if (candidate === undefined) return null;
          userRecord = candidate;
        }

        if (userRecord.organization.suspended_at !== null) return null;

        const ok = await bcrypt.compare(password, userRecord.password_hash);
        if (!ok) return null;

        return {
          id: userRecord.id,
          email: userRecord.email,
          organizationId: userRecord.organization_id,
          role: userRecord.role,
          isSuperAdmin: userRecord.is_super_admin,
          securityVersion: userRecord.security_version,
          displayName: userRecord.display_name,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async session({ session, token }) {
      // Module augmentation for next-auth/jwt doesn't always flow through Auth.js v5 beta,
      // so we narrow JWT fields at the boundary. The jwt() callback in auth.config.ts writes
      // these on login; we trust them to be present in subsequent calls but defensively narrow.
      const t = token as Record<string, unknown>;
      const userId = typeof t.userId === "string" ? t.userId : null;
      const organizationId = typeof t.organizationId === "string" ? t.organizationId : null;
      const tokenRole = t.role;
      const isSuperAdmin = typeof t.isSuperAdmin === "boolean" ? t.isSuperAdmin : false;
      const securityVersion = typeof t.securityVersion === "number" ? t.securityVersion : -1;
      const role: "tenant_admin" | "host" | "participant" | null =
        tokenRole === "tenant_admin" || tokenRole === "host" || tokenRole === "participant"
          ? tokenRole
          : null;

      if (!userId || !organizationId || !role) {
        return { ...session, user: undefined as never };
      }

      // Re-validate on every session read — catches role changes, suspensions, deactivations
      // without waiting for the JWT to expire (security.md §AUTH DEFAULTS item 6).
      // Middleware never reaches this code path — it uses auth.config.ts's edge-safe session().
      const current = await platformPrisma.user.findUnique({
        where: { id: userId },
        include: { organization: { select: { suspended_at: true } } },
      });

      const isInvalid =
        !current ||
        current.status !== "active" ||
        current.organization.suspended_at !== null ||
        current.security_version !== securityVersion;

      if (isInvalid) {
        return { ...session, user: undefined as never };
      }

      session.user.id = userId;
      session.user.organizationId = organizationId;
      session.user.role = role;
      session.user.isSuperAdmin = isSuperAdmin;
      session.user.securityVersion = securityVersion;
      return session;
    },
  },
});
