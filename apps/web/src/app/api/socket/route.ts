/**
 * Socket.IO Route Handler — placeholder only.
 *
 * Real-time WebSocket connections require an HTTP-level upgrade handshake that
 * cannot be performed inside a Next.js App Router Route Handler. The actual
 * Socket.IO upgrade is handled by the custom HTTP server bootstrapped in
 * Phase 6 (`server/custom-server.ts`), which attaches `initSocketServer()`
 * before Next.js takes over remaining requests.
 *
 * Clients that hit this endpoint during development (before the custom server
 * is wired) will receive a 503 and should fall back to long-polling via the
 * same `/api/socket` path — Socket.IO handles the degradation automatically.
 *
 * Non-tRPC: manual auth required if this handler ever processes mutations.
 */

export const runtime = "nodejs";

function unavailableResponse(): Response {
  return new Response(
    JSON.stringify({
      error:
        "WebSocket upgrade not available through Next.js Route Handlers. " +
        "Connect via the custom HTTP server (Phase 6).",
    }),
    {
      status: 503,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export function GET(): Response {
  return unavailableResponse();
}

export function POST(): Response {
  return unavailableResponse();
}
