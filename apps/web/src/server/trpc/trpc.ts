import { initTRPC, TRPCError } from "@trpc/server";
import { runWithTenantContext } from "@yelli/db";
import superjson from "superjson";
import { ZodError } from "zod";


import { rateLimiters } from "@/server/lib/rate-limit";

import type { Context } from "@/server/trpc/context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
        // Never leak Prisma details or internal IDs in production
        message:
          process.env.NODE_ENV === "production" &&
          shape.data.code === "INTERNAL_SERVER_ERROR"
            ? "Internal server error"
            : shape.message,
      },
    };
  },
});

export const { router, middleware, procedure } = t;

// ---------------------------------------------------------------------------
// Procedures
// ---------------------------------------------------------------------------

/** Unauthenticated — no session required */
export const publicProcedure = procedure;

/**
 * Authenticated procedure. The three-step chain is inlined so each middleware
 * sees the narrowed context from the previous step:
 *   1. authMiddleware  — guards on session.user.id, narrows `user` into ctx
 *   2. tenantMiddleware — extracts organizationId + userId from ctx.user,
 *                          runs the resolver inside runWithTenantContext (L6)
 *   3. apiRateLimitMiddleware — per-user rate limit using ctx.user.id
 */
export const protectedProcedure = procedure
  .use(async ({ ctx, next }) => {
    if (typeof ctx.session?.user?.id !== "string") {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    // Narrow: after the guard, session.user is known to be non-nullable
    const user = ctx.session.user;
    return next({ ctx: { ...ctx, user } });
  })
  .use(async ({ ctx, next }) => {
    const { id: userId, organizationId, isSuperAdmin } = ctx.user;
    return runWithTenantContext(
      { organizationId, userId, isSuperAdmin },
      () =>
        next({
          ctx: { ...ctx, organizationId, userId },
        }),
    );
  })
  .use(async ({ ctx, next }) => {
    rateLimiters.api.check(ctx.user.id);
    return next();
  });

/**
 * Tenant Admin procedure — protectedProcedure + role gate.
 * Authorises only users whose session role is "tenant_admin" for the active org.
 * Runs inside L6 tenant context (writes/reads still org-scoped).
 * Used by /admin/* routers (departments mutations, users, settings, billing, reports).
 */
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "tenant_admin") {
    // Generic message — never reveal whether role/permission is the failing dimension
    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." });
  }
  return next();
});

/**
 * Super Admin procedure — platform-level privilege, bypasses tenant guard.
 * Per security.md §SUPERADMIN AND PLATFORM-LEVEL ROLES:
 *   - Resolvers MUST use platformPrisma (no L6 extension) — not the guarded prisma.
 *   - Runs OUTSIDE runWithTenantContext to make tenant-bypass explicit.
 *   - All operations logged via writeAuditLog with "PLATFORM:*" action prefix.
 *
 * Auth chain: session present → isSuperAdmin flag set → strict rate limit (auth tier).
 * NOTE: securityVersion staleness is already enforced in Auth.js session() callback
 * (apps/web/src/server/auth.ts), so a stale token from a demoted user cannot reach here.
 */
export const superAdminProcedure = procedure
  .use(async ({ ctx, next }) => {
    if (typeof ctx.session?.user?.id !== "string") {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    if (ctx.session.user.isSuperAdmin !== true) {
      // Same generic message as adminProcedure — no enumeration vector
      throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." });
    }
    const user = ctx.session.user;
    return next({ ctx: { ...ctx, user } });
  })
  .use(async ({ ctx, next }) => {
    rateLimiters.auth.check(`platform:${ctx.user.id}`);
    return next();
  });
