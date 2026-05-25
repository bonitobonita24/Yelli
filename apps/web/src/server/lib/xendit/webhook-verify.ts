import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time equality for the Xendit `x-callback-token` header.
 *
 * Per .claude/rules/security.md XENDIT PAYMENT WEBHOOK SECURITY rule 1:
 *   "Compare request.headers['x-callback-token'] against XENDIT_WEBHOOK_TOKEN
 *    env var. Use constant-time comparison (crypto.timingSafeEqual or
 *    equivalent) — never ===. Reject immediately with HTTP 401 if token
 *    does not match."
 *
 * Implementation notes:
 *   - Length mismatch returns false up-front BEFORE the timingSafeEqual call
 *     because timingSafeEqual throws on unequal-length buffers. That throw
 *     itself would be a timing side channel, so we short-circuit explicitly.
 *     The length leak is acceptable because the expected token's length is a
 *     server-side constant — an attacker cannot learn anything new from it.
 *   - null / undefined / empty-string receivedToken all return false.
 *     `Headers.get('x-callback-token')` returns `string | null`, so the
 *     null branch is the realistic browser/Xendit path.
 *   - utf-8 encoding matches what Xendit transmits over HTTP headers and is
 *     stable across Node versions.
 *
 * Exposed as a pure function so the unit test (webhook-verify.test.ts) can
 * exercise it without spinning up a Route Handler request.
 */
export function verifyXenditCallbackToken(
  receivedToken: string | null | undefined,
  expectedToken: string,
): boolean {
  if (receivedToken == null || receivedToken === "") return false;
  const received = Buffer.from(receivedToken, "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}
