/**
 * Root landing page CTA selection.
 *
 * The hero serves the same public landing to everyone; only the primary
 * (and presence of a secondary) CTA shifts based on session state.
 * Authed visitors get a single "Go to app" → /app; unauthed visitors get
 * "Get started" → /register as the primary and "Sign in" → /login as the
 * secondary. Plain-data return value so the page Server Component can
 * pass it straight into a Client Component without serialization issues.
 */

export type LandingCTA = {
  href: string;
  label: string;
};

export type LandingCTAs = {
  primary: LandingCTA;
  secondary?: LandingCTA;
};

export function getLandingCTAs({
  isAuthed,
}: {
  isAuthed: boolean;
}): LandingCTAs {
  if (isAuthed) {
    return { primary: { href: "/app", label: "Go to app" } };
  }
  return {
    primary: { href: "/register", label: "Get started" },
    secondary: { href: "/login", label: "Sign in" },
  };
}
