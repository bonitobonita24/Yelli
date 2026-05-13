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
// Middleware
// ---------------------------------------------------------------------------

const authMiddleware = middleware(async ({ ctx, next }) => {
  if (typeof ctx.session?.user?.id !== "string") {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  // Narrow session to non-nullable after the guard above
  const session = ctx.session;
  return next({ ctx: { ...ctx, session } });
});

const tenantMiddleware = middleware(async ({ ctx, next }) => {
  // authMiddleware must run first — session is non-null here
  const user = ctx.session!.user;
  const organizationId = user.organizationId;
  const userId = user.id;
  const isSuperAdmin = user.isSuperAdmin;

  return runWithTenantContext(
    { organizationId, userId, isSuperAdmin },
    () =>
      next({
        ctx: {
          ...ctx,
          organizationId,
          userId,
        },
      }),
  );
});

const apiRateLimitMiddleware = middleware(async ({ ctx, next }) => {
  rateLimiters.api.check(ctx.session!.user.id);
  return next();
});

// ---------------------------------------------------------------------------
// Procedures
// ---------------------------------------------------------------------------

/** Unauthenticated — no session required */
export const publicProcedure = procedure;

/** Authenticated — requires valid session + tenant context + rate limit */
export const protectedProcedure = procedure
  .use(authMiddleware)
  .use(tenantMiddleware)
  .use(apiRateLimitMiddleware);
