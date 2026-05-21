// HTTP security headers — see .claude/rules/security.md §SECURE PRODUCTION DEFAULTS
// + V27 Turnstile CSP requirements.
//
// CSP `connect-src` baseline (V18 + V27):
//   'self' + https://challenges.cloudflare.com (Turnstile) + wss: + ws:
//
// Dev-only widening (this file's reason for existing as its own module):
//   In development, the Next.js dev server runs on APP_PORT (e.g. 43512) and
//   the Socket.IO server runs on a separate SOCKET_PORT (e.g. 43515) — see
//   apps/web/src/instrumentation.ts. Cross-port localhost requests are
//   cross-origin per the browser, and the socket.io-client v4 EIO=4 handshake
//   may issue an HTTP polling probe even when `transports: ['websocket', 'polling']`
//   is set. Without the widening below, the polling probe is blocked by CSP
//   and the socket connection fails — see also lessons.md
//   [[csp-dev-cross-port-socket-blocked]] (2026-05-21 regression).
//
// In production, the socket server is fronted by Traefik on the same hostname
// as the app over wss:// — already covered by the `wss:` token in the baseline.
// The dev widening MUST NOT leak into production CSP.
//
// Tighten script-src 'unsafe-inline'/'unsafe-eval' to nonces in a future
// production hardening pass.

export interface SecurityHeader {
  readonly key: string;
  readonly value: string;
}

export interface BuildSecurityHeadersOptions {
  readonly isDev: boolean;
}

function buildConnectSrc(isDev: boolean): string {
  const base = "connect-src 'self' https://challenges.cloudflare.com wss: ws:";
  if (!isDev) return base;
  // Dev widening: any localhost or 127.0.0.1 port over HTTP. Covers SOCKET_PORT,
  // MinIO console, MailHog UI, and any other future dev-only cross-port service.
  return `${base} http://localhost:* http://127.0.0.1:*`;
}

export function buildSecurityHeaders(
  options: BuildSecurityHeadersOptions,
): readonly SecurityHeader[] {
  return [
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    {
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    },
    {
      key: "Permissions-Policy",
      value:
        "camera=(self), microphone=(self), geolocation=(), payment=(self), display-capture=(self)",
    },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-XSS-Protection", value: "1; mode=block" },
    {
      key: "Content-Security-Policy",
      value: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        buildConnectSrc(options.isDev),
        "frame-src 'self' https://challenges.cloudflare.com",
        "media-src 'self' blob:",
        "worker-src 'self' blob:",
        "frame-ancestors 'none'",
      ].join("; "),
    },
  ];
}
