/**
 * (f) Root landing page — CTA selection helper.
 *
 * The root landing serves the same public hero to everyone; only the
 * primary CTA varies based on whether the visitor is signed in.
 * Pure-function tests per [[pure-helper-extraction-pattern]] — the page
 * itself stays a thin Server Component that delegates the decision here.
 */
import { describe, expect, it } from "vitest";

import { getLandingCTAs } from "@/lib/landing/cta";

describe("getLandingCTAs", () => {
  it("returns Sign in + Get started for unauthenticated visitors", () => {
    const ctas = getLandingCTAs({ isAuthed: false });
    expect(ctas.primary).toEqual({ href: "/register", label: "Get started" });
    expect(ctas.secondary).toEqual({ href: "/login", label: "Sign in" });
  });

  it("returns Go to app (primary only) for authenticated visitors", () => {
    const ctas = getLandingCTAs({ isAuthed: true });
    expect(ctas.primary).toEqual({ href: "/app", label: "Go to app" });
    expect(ctas.secondary).toBeUndefined();
  });

  it("primary CTA is always present (stable interface for the renderer)", () => {
    expect(getLandingCTAs({ isAuthed: true }).primary).toBeDefined();
    expect(getLandingCTAs({ isAuthed: false }).primary).toBeDefined();
  });

  it("CTAs are plain data — no functions, no JSX (safe for Server→Client serialization)", () => {
    const ctas = getLandingCTAs({ isAuthed: false });
    expect(typeof ctas.primary.href).toBe("string");
    expect(typeof ctas.primary.label).toBe("string");
    expect(ctas.secondary).toBeDefined();
    if (ctas.secondary) {
      expect(typeof ctas.secondary.href).toBe("string");
      expect(typeof ctas.secondary.label).toBe("string");
    }
  });

  it("authed primary points to /app (the protected app shell), never /login", () => {
    const ctas = getLandingCTAs({ isAuthed: true });
    expect(ctas.primary.href).toBe("/app");
    expect(ctas.primary.href).not.toBe("/login");
  });

  it("unauthed primary is /register (Get started intent), secondary is /login", () => {
    // Locks the priority: a new visitor's primary action is to create
    // an account; existing-user sign-in is the secondary path. Flipping
    // this would silently change the funnel — keep the test as a guard.
    const ctas = getLandingCTAs({ isAuthed: false });
    expect(ctas.primary.href).toBe("/register");
    expect(ctas.secondary?.href).toBe("/login");
  });
});
