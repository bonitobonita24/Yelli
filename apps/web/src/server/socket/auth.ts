/**
 * Socket.IO auth — JWT verify + cookie extraction + shape narrowing.
 *
 * Wired into the Socket.IO server (apps/web/src/server/socket/server.ts) as
 * `io.use(socketAuthMiddleware)` so every connection MUST present a valid
 * Auth.js v5 session cookie before any room subscription is allowed.
 *
 * Cookie naming follows Auth.js v5 convention:
 *   - dev / HTTP:   authjs.session-token
 *   - prod / HTTPS: __Secure-authjs.session-token
 * The cookie name is ALSO the JWE `salt` (Auth.js v5 derives the AEAD key
 * from secret + cookie-name) — passing the wrong salt makes decode return
 * null even if the secret is correct. We pass the cookie name we just used
 * to read the token; production cookies never decode with the dev salt.
 *
 * The narrowed shape mirrors `session.user` produced by auth.config.ts's
 * session callback, MINUS the DB-revalidation pass (the 60s session-
 * revalidation loop in c-2 catches role/tenant/security_version changes
 * after handshake; here we just check the token is well-formed and signed).
 */

import { decode } from "next-auth/jwt";

import { env } from "@/env";

import type { Socket } from "socket.io";

const DEV_COOKIE_NAME = "authjs.session-token";
const PROD_COOKIE_NAME = "__Secure-authjs.session-token";

export type SocketSession = {
  userId: string;
  organizationId: string;
  organizationSlug: string;
  role: "tenant_admin" | "host" | "participant";
  isSuperAdmin: boolean;
  securityVersion: number;
};

function parseCookieValue(cookieHeader: string, name: string): string | null {
  for (const raw of cookieHeader.split(";")) {
    const pair = raw.trim();
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    if (pair.slice(0, eq) === name) {
      return pair.slice(eq + 1).trim();
    }
  }
  return null;
}

export async function verifySocketAuth(args: {
  cookieHeader: string | null;
  isProduction: boolean;
}): Promise<SocketSession | null> {
  if (!args.cookieHeader) return null;

  const cookieName = args.isProduction ? PROD_COOKIE_NAME : DEV_COOKIE_NAME;
  const token = parseCookieValue(args.cookieHeader, cookieName);
  if (!token) return null;

  let decoded: Record<string, unknown> | null;
  try {
    const result = await decode({
      token,
      secret: env.AUTH_SECRET,
      salt: cookieName,
    });
    decoded = result as Record<string, unknown> | null;
  } catch {
    // decode throws on malformed JWE / wrong secret; treat as auth fail
    return null;
  }
  if (!decoded) return null;

  const userId = typeof decoded.userId === "string" ? decoded.userId : null;
  const organizationId =
    typeof decoded.organizationId === "string" ? decoded.organizationId : null;
  const organizationSlug =
    typeof decoded.organizationSlug === "string" ? decoded.organizationSlug : null;
  const securityVersion =
    typeof decoded.securityVersion === "number" ? decoded.securityVersion : null;
  const tokenRole = decoded.role;
  const role: "tenant_admin" | "host" | "participant" | null =
    tokenRole === "tenant_admin" ||
    tokenRole === "host" ||
    tokenRole === "participant"
      ? tokenRole
      : null;
  const isSuperAdmin =
    typeof decoded.isSuperAdmin === "boolean" ? decoded.isSuperAdmin : false;

  if (
    !userId ||
    !organizationId ||
    !organizationSlug ||
    !role ||
    securityVersion === null
  ) {
    return null;
  }

  return {
    userId,
    organizationId,
    organizationSlug,
    role,
    isSuperAdmin,
    securityVersion,
  };
}

/**
 * Socket.IO middleware: rejects unauthenticated handshakes; attaches the
 * narrowed session to `socket.data.session` for downstream namespace +
 * room subscription logic (added in c-2).
 */
export async function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void,
): Promise<void> {
  // APP_ENV not NODE_ENV — webpack DefinePlugin inlines process.env.NODE_ENV
  // at build time as "production" (next build always builds in prod mode),
  // so env.NODE_ENV is unreliable at runtime in containerized builds. APP_ENV
  // is project-controlled and survives bundling as a runtime read. See
  // lessons.md [[webpack-define-plugin-trap]] + [[auth-bypass-prod-guard]].
  const session = await verifySocketAuth({
    cookieHeader: socket.handshake.headers.cookie ?? null,
    isProduction: env.APP_ENV === "production",
  });

  if (!session) {
    next(new Error("UNAUTHORIZED"));
    return;
  }

  socket.data.session = session;
  next();
}
