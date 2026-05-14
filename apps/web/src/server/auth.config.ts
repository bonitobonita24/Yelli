/**
 * Edge-safe Auth.js v5 configuration shell.
 *
 * Imported by middleware.ts so the Edge bundle stays free of bcrypt and the
 * Prisma client. The full server config (auth.ts) spreads this and adds the
 * Credentials provider + DB-backed session re-validation.
 *
 * The session() callback here is the edge-safe variant — it copies JWT claims
 * into session.user without touching the database. auth.ts overrides this
 * callback with the DB-backed variant for tRPC procedures + route handlers
 * (security.md §AUTH DEFAULTS item 6 — securityVersion staleness check).
 */
import { env } from "@/env";

import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  secret: env.AUTH_SECRET,
  trustHost: env.AUTH_TRUST_HOST,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login", error: "/login" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as {
          id: string;
          organizationId: string;
          role: "tenant_admin" | "host" | "participant";
          isSuperAdmin: boolean;
          securityVersion: number;
        };
        (token as Record<string, unknown>).userId = u.id;
        (token as Record<string, unknown>).organizationId = u.organizationId;
        (token as Record<string, unknown>).role = u.role;
        (token as Record<string, unknown>).isSuperAdmin = u.isSuperAdmin;
        (token as Record<string, unknown>).securityVersion = u.securityVersion;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as Record<string, unknown>;
      const userId = typeof t.userId === "string" ? t.userId : null;
      const organizationId =
        typeof t.organizationId === "string" ? t.organizationId : null;
      const tokenRole = t.role;
      const isSuperAdmin =
        typeof t.isSuperAdmin === "boolean" ? t.isSuperAdmin : false;
      const securityVersion =
        typeof t.securityVersion === "number" ? t.securityVersion : -1;
      const role: "tenant_admin" | "host" | "participant" | null =
        tokenRole === "tenant_admin" ||
        tokenRole === "host" ||
        tokenRole === "participant"
          ? tokenRole
          : null;

      if (!userId || !organizationId || !role) {
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
} satisfies NextAuthConfig;
