import { TRPCError } from "@trpc/server";
import { platformPrisma } from "@yelli/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendPasswordResetEmail } from "@/server/lib/email";
import { rateLimiters } from "@/server/lib/rate-limit";
import { verifyTurnstileToken } from "@/server/lib/turnstile";
import { authRouter } from "@/server/trpc/routers/auth";
import { createCallerFactory } from "@/server/trpc/trpc";

// Vitest hoists vi.mock above all imports automatically. The factories
// run BEFORE the imports above are resolved, so the mocked exports are
// what the imports receive.
vi.mock("@yelli/db", () => ({
  platformPrisma: {
    organization: { findUnique: vi.fn(), create: vi.fn() },
    user: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    passwordResetToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/server/lib/turnstile", () => ({
  verifyTurnstileToken: vi.fn(),
}));

vi.mock("@/server/lib/rate-limit", () => ({
  rateLimiters: {
    auth: { check: vi.fn() },
    api: { check: vi.fn() },
    public: { check: vi.fn() },
    upload: { check: vi.fn() },
  },
}));

vi.mock("@/server/lib/email", () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_APP_URL: "https://yelli.test",
  },
}));

vi.mock("bcryptjs", () => {
  const hash = vi.fn().mockResolvedValue("$2a$12$mockedhash");
  return { default: { hash }, hash };
});

const createCaller = createCallerFactory(authRouter);

function makeCtx(path = "auth") {
  return {
    session: null,
    req: new Request(`http://localhost/api/trpc/${path}`, {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1" },
    }),
  };
}

const validInput = {
  displayName: "Test User",
  organizationName: "Test Org",
  organizationSlug: "test-org",
  email: "Test@Example.com",
  password: "ValidPass123",
  turnstileToken: "fake-token",
};

describe("authRouter.register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimiters.auth.check).mockImplementation(() => {});
    vi.mocked(verifyTurnstileToken).mockResolvedValue({
      success: true,
      errorCodes: [],
    });
    vi.mocked(platformPrisma.organization.findUnique).mockResolvedValue(null);
    vi.mocked(platformPrisma.$transaction).mockImplementation(
      async (fn: unknown) => {
        const tx = {
          organization: {
            create: vi
              .fn()
              .mockResolvedValue({ id: "org-id", slug: "test-org" }),
          },
          user: { create: vi.fn().mockResolvedValue({ id: "user-id" }) },
        };
        return (fn as (t: typeof tx) => Promise<{ slug: string }>)(tx);
      },
    );
  });

  it("happy path returns { ok: true, slug } and lowercases email for rate-limit key", async () => {
    const caller = createCaller(makeCtx("auth.register"));
    const res = await caller.register(validInput);
    expect(res).toEqual({ ok: true, slug: "test-org" });
    expect(rateLimiters.auth.check).toHaveBeenCalledWith(
      "register:test@example.com",
    );
    expect(verifyTurnstileToken).toHaveBeenCalled();
    expect(platformPrisma.organization.findUnique).toHaveBeenCalledWith({
      where: { slug: "test-org" },
      select: { id: true },
    });
    expect(platformPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rate-limit throws before turnstile is verified", async () => {
    vi.mocked(rateLimiters.auth.check).mockImplementationOnce(() => {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests",
      });
    });
    const caller = createCaller(makeCtx("auth.register"));
    await expect(caller.register(validInput)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
    expect(platformPrisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it("turnstile failure → UNAUTHORIZED, no DB write", async () => {
    vi.mocked(verifyTurnstileToken).mockResolvedValueOnce({
      success: false,
      errorCodes: ["timeout-or-duplicate"],
    });
    const caller = createCaller(makeCtx("auth.register"));
    await expect(caller.register(validInput)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(platformPrisma.organization.findUnique).not.toHaveBeenCalled();
    expect(platformPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("slug already taken → CONFLICT, no transaction", async () => {
    vi.mocked(platformPrisma.organization.findUnique).mockResolvedValueOnce({
      id: "existing-org-id",
    } as never);
    const caller = createCaller(makeCtx("auth.register"));
    await expect(caller.register(validInput)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(platformPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("Zod rejects weak password and uppercase slug", async () => {
    const caller = createCaller(makeCtx("auth.register"));
    await expect(
      caller.register({ ...validInput, password: "short" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.register({ ...validInput, organizationSlug: "Bad-Slug" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(rateLimiters.auth.check).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────
// authRouter.requestPasswordReset
// Security posture: always return { ok: true } regardless of whether
// the email exists (no enumeration). Token is only emailed when a user
// matches. Plaintext token never enters the database.
// ────────────────────────────────────────────────────────────────────

describe("authRouter.requestPasswordReset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimiters.auth.check).mockImplementation(() => {});
    vi.mocked(verifyTurnstileToken).mockResolvedValue({
      success: true,
      errorCodes: [],
    });
  });

  const input = { email: "User@Example.com", turnstileToken: "fake-token" };

  it("existing user → mints token, persists hash, sends email, returns ok", async () => {
    vi.mocked(platformPrisma.user.findFirst).mockResolvedValueOnce({
      id: "user-123",
      email: "user@example.com",
      display_name: "User",
    } as never);
    vi.mocked(platformPrisma.passwordResetToken.create).mockResolvedValueOnce(
      { id: "tok-1" } as never,
    );

    const caller = createCaller(makeCtx("auth.requestPasswordReset"));
    const res = await caller.requestPasswordReset(input);

    expect(res).toEqual({ ok: true });
    expect(rateLimiters.auth.check).toHaveBeenCalledWith(
      "requestPasswordReset:user@example.com",
    );
    expect(platformPrisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
      select: { id: true, email: true, display_name: true },
    });
    expect(platformPrisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    const createCall = vi.mocked(platformPrisma.passwordResetToken.create).mock
      .calls[0]?.[0] as {
      data: { user_id: string; token_hash: string; expires_at: Date };
    };
    expect(createCall.data.user_id).toBe("user-123");
    expect(createCall.data.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(createCall.data.expires_at.getTime()).toBeGreaterThan(Date.now());
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const emailArgs = vi.mocked(sendPasswordResetEmail).mock.calls[0]?.[0];
    expect(emailArgs?.to).toBe("user@example.com");
    expect(emailArgs?.token.length).toBeGreaterThan(0);
    expect(emailArgs?.resetUrl).toContain(emailArgs?.token ?? "");
  });

  it("unknown email → returns ok but creates no token and sends no email (no enumeration)", async () => {
    vi.mocked(platformPrisma.user.findFirst).mockResolvedValueOnce(null);
    const caller = createCaller(makeCtx("auth.requestPasswordReset"));
    const res = await caller.requestPasswordReset(input);
    expect(res).toEqual({ ok: true });
    expect(platformPrisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("turnstile failure → UNAUTHORIZED, no DB lookup", async () => {
    vi.mocked(verifyTurnstileToken).mockResolvedValueOnce({
      success: false,
      errorCodes: ["timeout-or-duplicate"],
    });
    const caller = createCaller(makeCtx("auth.requestPasswordReset"));
    await expect(caller.requestPasswordReset(input)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(platformPrisma.user.findFirst).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────
// authRouter.resetPassword
// Validates token (exists + not expired + not consumed), then in a
// single transaction: updates user password_hash, increments
// security_version (invalidates all sessions per security.md AUTH
// DEFAULTS #6), and marks token consumed_at.
// ────────────────────────────────────────────────────────────────────

describe("authRouter.resetPassword", () => {
  // Fixed-length plaintext token. The router hashes it with sha256 and
  // looks up by token_hash; real crypto runs inside the router and we
  // don't pin the hash literal here.
  const PLAINTEXT_TOKEN = "a".repeat(43);

  function makeStoredToken(overrides: Partial<{
    expires_at: Date;
    consumed_at: Date | null;
  }> = {}) {
    return {
      id: "tok-1",
      user_id: "user-123",
      token_hash: "ignored — router builds this from input.token",
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
      consumed_at: null,
      created_at: new Date(),
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimiters.auth.check).mockImplementation(() => {});
    // Default $transaction implementation — passes through to tx mocks.
    vi.mocked(platformPrisma.$transaction).mockImplementation(
      async (fn: unknown) => {
        const tx = {
          user: { update: vi.fn().mockResolvedValue({ id: "user-123" }) },
          passwordResetToken: {
            update: vi.fn().mockResolvedValue({ id: "tok-1" }),
          },
        };
        return (fn as (t: typeof tx) => Promise<unknown>)(tx);
      },
    );
  });

  const validInput = {
    token: PLAINTEXT_TOKEN,
    password: "ValidNewPass456",
  };

  it("valid token → updates password, increments security_version, marks token consumed", async () => {
    vi.mocked(platformPrisma.passwordResetToken.findUnique).mockResolvedValueOnce(
      makeStoredToken() as never,
    );
    // Capture the tx work so we can assert on its inner calls.
    const userUpdate = vi.fn().mockResolvedValue({ id: "user-123" });
    const tokenUpdate = vi.fn().mockResolvedValue({ id: "tok-1" });
    vi.mocked(platformPrisma.$transaction).mockImplementationOnce(
      async (fn: unknown) => {
        const tx = {
          user: { update: userUpdate },
          passwordResetToken: { update: tokenUpdate },
        };
        return (fn as (t: typeof tx) => Promise<unknown>)(tx);
      },
    );

    const caller = createCaller(makeCtx("auth.resetPassword"));
    const res = await caller.resetPassword(validInput);
    expect(res).toEqual({ ok: true });

    // user update bumps security_version + sets password_hash
    expect(userUpdate).toHaveBeenCalledTimes(1);
    const userArgs = userUpdate.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { password_hash: string; security_version: { increment: number } };
    };
    expect(userArgs.where).toEqual({ id: "user-123" });
    expect(userArgs.data.password_hash).toBe("$2a$12$mockedhash");
    expect(userArgs.data.security_version).toEqual({ increment: 1 });

    // token marked consumed
    expect(tokenUpdate).toHaveBeenCalledTimes(1);
    const tokenArgs = tokenUpdate.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { consumed_at: Date };
    };
    expect(tokenArgs.where).toEqual({ id: "tok-1" });
    expect(tokenArgs.data.consumed_at).toBeInstanceOf(Date);
  });

  it("expired token → UNAUTHORIZED, no transaction", async () => {
    vi.mocked(platformPrisma.passwordResetToken.findUnique).mockResolvedValueOnce(
      makeStoredToken({ expires_at: new Date(Date.now() - 1000) }) as never,
    );
    const caller = createCaller(makeCtx("auth.resetPassword"));
    await expect(caller.resetPassword(validInput)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(platformPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("already-consumed token → UNAUTHORIZED, no transaction", async () => {
    vi.mocked(platformPrisma.passwordResetToken.findUnique).mockResolvedValueOnce(
      makeStoredToken({ consumed_at: new Date(Date.now() - 60_000) }) as never,
    );
    const caller = createCaller(makeCtx("auth.resetPassword"));
    await expect(caller.resetPassword(validInput)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(platformPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("unknown token → UNAUTHORIZED, no transaction", async () => {
    vi.mocked(platformPrisma.passwordResetToken.findUnique).mockResolvedValueOnce(
      null,
    );
    const caller = createCaller(makeCtx("auth.resetPassword"));
    await expect(caller.resetPassword(validInput)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(platformPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("Zod rejects weak password before any DB lookup", async () => {
    const caller = createCaller(makeCtx("auth.resetPassword"));
    await expect(
      caller.resetPassword({ ...validInput, password: "short" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(platformPrisma.passwordResetToken.findUnique).not.toHaveBeenCalled();
    expect(rateLimiters.auth.check).not.toHaveBeenCalled();
  });
});
