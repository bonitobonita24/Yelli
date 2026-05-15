import { TRPCError } from "@trpc/server";
import { platformPrisma } from "@yelli/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    user: { create: vi.fn() },
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

vi.mock("bcryptjs", () => {
  const hash = vi.fn().mockResolvedValue("$2a$12$mockedhash");
  return { default: { hash }, hash };
});

const createCaller = createCallerFactory(authRouter);

function makeCtx() {
  return {
    session: null,
    req: new Request("http://localhost/api/trpc/auth.register", {
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
    const caller = createCaller(makeCtx());
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
    const caller = createCaller(makeCtx());
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
    const caller = createCaller(makeCtx());
    await expect(caller.register(validInput)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(platformPrisma.organization.findUnique).not.toHaveBeenCalled();
    expect(platformPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("slug already taken → CONFLICT, no transaction", async () => {
    // Router uses `select: { id: true }` so only id matters at runtime;
    // cast satisfies Prisma's wide return type that TS sees here.
    vi.mocked(platformPrisma.organization.findUnique).mockResolvedValueOnce({
      id: "existing-org-id",
    } as never);
    const caller = createCaller(makeCtx());
    await expect(caller.register(validInput)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(platformPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("Zod rejects weak password and uppercase slug", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.register({ ...validInput, password: "short" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.register({ ...validInput, organizationSlug: "Bad-Slug" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Neither call should have reached the rate limiter.
    expect(rateLimiters.auth.check).not.toHaveBeenCalled();
  });
});
