import crypto from "node:crypto";

import { TRPCError } from "@trpc/server";
import { platformPrisma } from "@yelli/db";
import {
  registerInputSchema,
  requestPasswordResetInputSchema,
  resetPasswordInputSchema,
} from "@yelli/shared/schemas";
import bcrypt from "bcryptjs";

import { env } from "@/env";
import { sendPasswordResetEmail } from "@/server/lib/email";
import { rateLimiters } from "@/server/lib/rate-limit";
import { verifyTurnstileToken } from "@/server/lib/turnstile";
import { publicProcedure, router } from "@/server/trpc/trpc";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour — security.md AUTH DEFAULTS max

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function mintResetToken(): { plaintext: string; hash: string } {
  // 32 bytes → 43-char URL-safe base64 (no padding). Plaintext never persists.
  const plaintext = crypto.randomBytes(32).toString("base64url");
  return { plaintext, hash: sha256Hex(plaintext) };
}

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

  requestPasswordReset: publicProcedure
    .input(requestPasswordResetInputSchema)
    .mutation(async ({ input, ctx }) => {
      const emailLower = input.email.toLowerCase();

      // Rate limit first (per-email) — caps token-generation attempts.
      rateLimiters.auth.check(`requestPasswordReset:${emailLower}`);

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

      // findFirst because email is unique only per-organization (@@unique
      // [organization_id, email]). For reset we accept the first match —
      // if a person owns the same email in multiple orgs they would need
      // to disambiguate via login (Auth.js handles that flow separately).
      const user = await platformPrisma.user.findFirst({
        where: { email: emailLower },
        select: { id: true, email: true, display_name: true },
      });

      // Always return ok — never reveal whether the email exists
      // (security.md PRODUCTION ERROR HANDLING — no enumeration).
      if (!user) {
        return { ok: true as const };
      }

      const { plaintext, hash } = mintResetToken();
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      await platformPrisma.passwordResetToken.create({
        data: {
          user_id: user.id,
          token_hash: hash,
          expires_at: expiresAt,
        },
      });

      const resetUrl = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/reset-password/${plaintext}`;
      await sendPasswordResetEmail({
        to: user.email,
        token: plaintext,
        resetUrl,
      });

      return { ok: true as const };
    }),

  resetPassword: publicProcedure
    .input(resetPasswordInputSchema)
    .mutation(async ({ input }) => {
      // Rate limit on token-prefix to throttle brute-force enumeration of
      // hash space (real space is 2^256 but bots will still try).
      rateLimiters.auth.check(`resetPassword:${input.token.slice(0, 8)}`);

      const tokenHash = sha256Hex(input.token);
      const stored = await platformPrisma.passwordResetToken.findUnique({
        where: { token_hash: tokenHash },
        select: {
          id: true,
          user_id: true,
          expires_at: true,
          consumed_at: true,
        },
      });

      // Generic UNAUTHORIZED for unknown / expired / consumed — same
      // error message, no enumeration.
      const now = new Date();
      if (
        !stored ||
        stored.consumed_at !== null ||
        stored.expires_at.getTime() <= now.getTime()
      ) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "This reset link is invalid or has expired.",
        });
      }

      const passwordHash = await bcrypt.hash(input.password, 12);

      // Atomic: rotate password + bump security_version (invalidates
      // all active sessions per security.md AUTH DEFAULTS #6) + mark
      // token consumed. Single tx so a partial reset can never leave
      // the token reusable.
      await platformPrisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: stored.user_id },
          data: {
            password_hash: passwordHash,
            security_version: { increment: 1 },
          },
        });
        await tx.passwordResetToken.update({
          where: { id: stored.id },
          data: { consumed_at: now },
        });
      });

      return { ok: true as const };
    }),
});
