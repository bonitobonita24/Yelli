import { env } from "@/env";

interface TurnstileVerifyResult {
  success: boolean;
  errorCodes: string[];
  hostname?: string;
  challengeTs?: string;
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
    // Test keys (1x00000000000000000000AA) resolve to localhost — allow in non-production
    env.NODE_ENV === "production"
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
