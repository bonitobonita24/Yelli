// Tests for the security-header builder.
// Covers the dev-only CSP widening that permits cross-port HTTP fetches to the
// SOCKET_PORT (and any other dev-only services). Production must NOT inherit
// any localhost widening — prod CSP is unchanged from the V18 + V27 baseline.

import { describe, expect, it } from "vitest";

import { buildSecurityHeaders } from "./security-headers";

function getCsp(headers: ReturnType<typeof buildSecurityHeaders>): string {
  const csp = headers.find((h) => h.key === "Content-Security-Policy");
  if (!csp) throw new Error("Content-Security-Policy header missing");
  return csp.value;
}

describe("buildSecurityHeaders", () => {
  describe("development", () => {
    const headers = buildSecurityHeaders({ isDev: true });
    const csp = getCsp(headers);

    it("widens connect-src to allow cross-port HTTP fetches to localhost", () => {
      expect(csp).toContain("http://localhost:*");
      expect(csp).toContain("http://127.0.0.1:*");
    });

    it("preserves the prod connect-src tokens (self + Turnstile + ws/wss)", () => {
      expect(csp).toContain("connect-src");
      expect(csp).toContain("'self'");
      expect(csp).toContain("https://challenges.cloudflare.com");
      expect(csp).toContain("wss:");
      expect(csp).toContain("ws:");
    });
  });

  describe("production", () => {
    const headers = buildSecurityHeaders({ isDev: false });
    const csp = getCsp(headers);

    it("does NOT include any localhost widening", () => {
      expect(csp).not.toContain("http://localhost:*");
      expect(csp).not.toContain("http://127.0.0.1:*");
    });

    it("preserves the V18 + V27 connect-src baseline", () => {
      expect(csp).toContain("connect-src 'self' https://challenges.cloudflare.com wss: ws:");
    });
  });

  describe("invariants across modes", () => {
    const dev = buildSecurityHeaders({ isDev: true });
    const prod = buildSecurityHeaders({ isDev: false });

    function getHeader(headers: ReturnType<typeof buildSecurityHeaders>, key: string): string {
      const h = headers.find((x) => x.key === key);
      if (!h) throw new Error(`${key} header missing`);
      return h.value;
    }

    it.each([
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Strict-Transport-Security",
      "Permissions-Policy",
      "Referrer-Policy",
      "X-XSS-Protection",
    ])("%s is identical across dev and prod", (headerKey) => {
      expect(getHeader(dev, headerKey)).toBe(getHeader(prod, headerKey));
    });

    it("frame-ancestors stays 'none' in both modes", () => {
      expect(getCsp(dev)).toContain("frame-ancestors 'none'");
      expect(getCsp(prod)).toContain("frame-ancestors 'none'");
    });
  });
});
