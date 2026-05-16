/**
 * Phase 7 #8(e)-1 — Socket.IO auth: JWT verify + cookie extraction + shape narrowing.
 *
 * `verifySocketAuth` decodes the Auth.js v5 session JWT from the Socket.IO
 * handshake cookie header and returns a `SocketSession` (mirroring the
 * `session.user` shape produced by auth.config.ts's session callback) or
 * `null` if anything is wrong. Pure function — no DB, no env reads inside
 * the verify body (cookie name selection is based on the `isProduction`
 * argument, not env.NODE_ENV directly). RED→GREEN on the runtime contract.
 *
 * Cookie naming follows Auth.js v5 convention: `authjs.session-token` in dev
 * (HTTP), `__Secure-authjs.session-token` in production (HTTPS). The cookie
 * name is also the JWE `salt` per Auth.js v5 (verified against /nextauthjs
 * source) — passing the wrong salt makes decode return null.
 */
import { decode } from "next-auth/jwt";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { verifySocketAuth } from "@/server/socket/auth";

// Vitest hoists vi.mock above all imports automatically — placement here is
// cosmetic for ESLint's import/order rule (matches the pattern in auth.test.ts).
vi.mock("next-auth/jwt", () => ({
  decode: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    AUTH_SECRET: "test-secret-at-least-32-chars-long-1234567890abc",
  },
}));

const VALID_DECODED = {
  userId: "user-cuid-1",
  organizationId: "org-cuid-1",
  organizationSlug: "acme-corp",
  role: "tenant_admin",
  isSuperAdmin: false,
  securityVersion: 1,
};

describe("verifySocketAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when cookieHeader is null", async () => {
    const result = await verifySocketAuth({ cookieHeader: null, isProduction: false });
    expect(result).toBeNull();
    expect(decode).not.toHaveBeenCalled();
  });

  it("returns null when cookie header has no session token", async () => {
    const result = await verifySocketAuth({
      cookieHeader: "foo=bar; baz=qux",
      isProduction: false,
    });
    expect(result).toBeNull();
    expect(decode).not.toHaveBeenCalled();
  });

  it("uses dev cookie name in non-production and returns parsed session on success", async () => {
    vi.mocked(decode).mockResolvedValueOnce(VALID_DECODED as never);
    const result = await verifySocketAuth({
      cookieHeader: "authjs.session-token=encrypted.jwe.value; other=ignored",
      isProduction: false,
    });
    expect(result).toEqual({
      userId: "user-cuid-1",
      organizationId: "org-cuid-1",
      organizationSlug: "acme-corp",
      role: "tenant_admin",
      isSuperAdmin: false,
      securityVersion: 1,
    });
    expect(decode).toHaveBeenCalledWith({
      token: "encrypted.jwe.value",
      secret: "test-secret-at-least-32-chars-long-1234567890abc",
      salt: "authjs.session-token",
    });
  });

  it("uses production cookie name (__Secure-) when isProduction=true", async () => {
    vi.mocked(decode).mockResolvedValueOnce(VALID_DECODED as never);
    const result = await verifySocketAuth({
      cookieHeader: "__Secure-authjs.session-token=encrypted.jwe.value",
      isProduction: true,
    });
    expect(result).not.toBeNull();
    expect(decode).toHaveBeenCalledWith({
      token: "encrypted.jwe.value",
      secret: "test-secret-at-least-32-chars-long-1234567890abc",
      salt: "__Secure-authjs.session-token",
    });
  });

  it("ignores the dev cookie when in production mode", async () => {
    const result = await verifySocketAuth({
      cookieHeader: "authjs.session-token=plain.dev.value",
      isProduction: true,
    });
    expect(result).toBeNull();
    expect(decode).not.toHaveBeenCalled();
  });

  it("returns null when decode returns null (invalid signature / expired)", async () => {
    vi.mocked(decode).mockResolvedValueOnce(null as never);
    const result = await verifySocketAuth({
      cookieHeader: "authjs.session-token=tampered.value",
      isProduction: false,
    });
    expect(result).toBeNull();
  });

  it("returns null when decoded token is missing organizationSlug", async () => {
    vi.mocked(decode).mockResolvedValueOnce({
      ...VALID_DECODED,
      organizationSlug: undefined,
    } as never);
    const result = await verifySocketAuth({
      cookieHeader: "authjs.session-token=v",
      isProduction: false,
    });
    expect(result).toBeNull();
  });

  it("returns null when decoded token is missing organizationId", async () => {
    vi.mocked(decode).mockResolvedValueOnce({
      ...VALID_DECODED,
      organizationId: undefined,
    } as never);
    const result = await verifySocketAuth({
      cookieHeader: "authjs.session-token=v",
      isProduction: false,
    });
    expect(result).toBeNull();
  });

  it("returns null when role is unknown value", async () => {
    vi.mocked(decode).mockResolvedValueOnce({
      ...VALID_DECODED,
      role: "intruder",
    } as never);
    const result = await verifySocketAuth({
      cookieHeader: "authjs.session-token=v",
      isProduction: false,
    });
    expect(result).toBeNull();
  });

  it("accepts host role and participant role (not just tenant_admin)", async () => {
    vi.mocked(decode).mockResolvedValueOnce({ ...VALID_DECODED, role: "host" } as never);
    const hostResult = await verifySocketAuth({
      cookieHeader: "authjs.session-token=v",
      isProduction: false,
    });
    expect(hostResult?.role).toBe("host");

    vi.mocked(decode).mockResolvedValueOnce({
      ...VALID_DECODED,
      role: "participant",
    } as never);
    const participantResult = await verifySocketAuth({
      cookieHeader: "authjs.session-token=v",
      isProduction: false,
    });
    expect(participantResult?.role).toBe("participant");
  });

  it("returns null when securityVersion is missing (not a number)", async () => {
    vi.mocked(decode).mockResolvedValueOnce({
      ...VALID_DECODED,
      securityVersion: undefined,
    } as never);
    const result = await verifySocketAuth({
      cookieHeader: "authjs.session-token=v",
      isProduction: false,
    });
    expect(result).toBeNull();
  });

  it("defaults isSuperAdmin to false when the field is missing", async () => {
    vi.mocked(decode).mockResolvedValueOnce({
      ...VALID_DECODED,
      isSuperAdmin: undefined,
    } as never);
    const result = await verifySocketAuth({
      cookieHeader: "authjs.session-token=v",
      isProduction: false,
    });
    expect(result?.isSuperAdmin).toBe(false);
  });

  it("strips surrounding whitespace from cookie pairs", async () => {
    vi.mocked(decode).mockResolvedValueOnce(VALID_DECODED as never);
    const result = await verifySocketAuth({
      cookieHeader: "  authjs.session-token=padded.value  ; lang=en  ",
      isProduction: false,
    });
    expect(result).not.toBeNull();
    expect(decode).toHaveBeenCalledWith(
      expect.objectContaining({ token: "padded.value" }),
    );
  });
});
