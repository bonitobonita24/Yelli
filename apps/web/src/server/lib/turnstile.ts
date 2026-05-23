import { env } from "@/env";

interface TurnstileVerifyResult {
  success: boolean;
  errorCodes: string[];
  hostname?: string;
  challengeTs?: string;
}

/**
 * (turnstile-app-env-guard) — pure predicate for the hostname-mismatch gate.
 *
 * Returns true only when running in production, where live Cloudflare sitekeys
 * are in use and the widget's hostname should match NEXT_PUBLIC_APP_URL.
 * In dev/staging we use Cloudflare's test sitekeys, which always return
 * `hostname: "localhost"` from siteverify — enforcing the match would reject
 * every valid login.
 *
 * Why APP_ENV instead of NODE_ENV: webpack's DefinePlugin inlines
 * `process.env.NODE_ENV` as the build-time literal "production" at
 * `next build`, so any `env.NODE_ENV === "production"` check constant-folds
 * to true inside the containerized bundle — re-enabling the hostname gate
 * even in dev. APP_ENV is project-controlled and survives bundling as a
 * runtime process.env read. Same trap fixed in auth-bypass.ts + socket/auth.ts.
 * See lessons.md [[webpack-define-plugin-trap]].
 */
export function shouldEnforceTurnstileHostnameMatch(envSnapshot: {
  APP_ENV: "development" | "staging" | "production";
}): boolean {
  return envSnapshot.APP_ENV === "production";
}

// Tokens are single-use and expire after 300 seconds — validate server-side on every submission.
// Client-side widget alone provides no protection; this siteverify call is the real gate.
export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string,
): Promise<TurnstileVerifyResult> {
  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
    ...(remoteIp !== undefined ? { remoteip: remoteIp } : {}),
  });

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10_000),
    },
  );

  const data = (await response.json()) as {
    success: boolean;
    "error-codes"?: string[];
    hostname?: string;
    challenge_ts?: string;
  };

  // Hostname mismatch means the token was issued by a widget for a different site —
  // reject to prevent cross-site token replay attacks.
  const expectedHost = new URL(env.NEXT_PUBLIC_APP_URL).hostname;
  if (
    data.success &&
    data.hostname !== undefined &&
    data.hostname !== expectedHost &&
    // Test keys (1x00000000000000000000AA) resolve to localhost — allow in non-production.
    // Gate keyed on APP_ENV not NODE_ENV to avoid the DefinePlugin inlining trap.
    shouldEnforceTurnstileHostnameMatch({ APP_ENV: env.APP_ENV })
  ) {
    return {
      success: false,
      errorCodes: ["hostname-mismatch"],
      ...(data.hostname !== undefined ? { hostname: data.hostname } : {}),
    };
  }

  return {
    success: data.success,
    errorCodes: data["error-codes"] ?? [],
    ...(data.hostname !== undefined ? { hostname: data.hostname } : {}),
    ...(data.challenge_ts !== undefined ? { challengeTs: data.challenge_ts } : {}),
  };
}
