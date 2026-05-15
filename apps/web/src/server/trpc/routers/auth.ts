import { TRPCError } from "@trpc/server";
import { platformPrisma } from "@yelli/db";
import { registerInputSchema } from "@yelli/shared/schemas";
import bcrypt from "bcryptjs";

import { rateLimiters } from "@/server/lib/rate-limit";
import { verifyTurnstileToken } from "@/server/lib/turnstile";
import { publicProcedure, router } from "@/server/trpc/trpc";

export const authRouter = router({
  register: publicProcedure
    .input(registerInputSchema)
    .mutation(async ({ input, ctx }) => {
      // 1. Rate limit — FIRST, before any DB call
      rateLimiters.auth.check(`register:${input.email.toLowerCase()}`);

      // 2. Turnstile bot protection
      const turnstileResult = await verifyTurnstileToken(
        input.turnstileToken,
        ctx.req.headers.get("x-forwarded-for") ??
          ctx.req.headers.get("cf-connecting-ip") ??
          undefined,
      );
      if (!turnstileResult.success) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Captcha verification failed. Please try again.",
        });
      }

      // 3. Slug pre-check (before transaction to surface conflict early)
      const existingOrg = await platformPrisma.organization.findUnique({
        where: { slug: input.organizationSlug },
        select: { id: true },
      });
      if (existingOrg) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "That workspace slug is taken.",
        });
      }

      // 4. Hash password (cost factor 12 — matches Auth.js login flow)
      const passwordHash = await bcrypt.hash(input.password, 12);
      const emailLower = input.email.toLowerCase();

      // 5. Atomic Org + User creation. Email uniqueness is per-org by design
      // (User.email has no @unique constraint), so no global pre-check needed.
      const { slug } = await platformPrisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            name: input.organizationName,
            slug: input.organizationSlug,
            billing_email: emailLower,
          },
          select: { id: true, slug: true },
        });

        await tx.user.create({
          data: {
            display_name: input.displayName,
            email: emailLower,
            password_hash: passwordHash,
            role: "tenant_admin",
            organization_id: org.id,
          },
        });

        return org;
      });

      return { ok: true as const, slug };
    }),
});
