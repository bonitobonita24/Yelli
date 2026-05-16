/* eslint-disable no-console -- instrumentation.ts is the process boot/shutdown
   entrypoint; console.log/warn here are the intended way to surface lifecycle
   events to stdout (no request-scoped logger is available at this point in the
   Next.js lifecycle). Matches the pattern in the official Next.js docs. */
/**
 * Next.js 15 instrumentation hook.
 *
 * Runs once at process start (BEFORE the first request) on the Node.js
 * runtime ONLY. We use it to bootstrap a Socket.IO server on a separate
 * port from the Next.js HTTP server — chosen Phase 7 #8e-1 over a custom
 * server.ts to keep `next start` and `output: standalone` Docker builds
 * unchanged. The Socket.IO origin is reachable at NEXT_PUBLIC_SOCKET_URL
 * from the browser (configured via CORS in server/socket/server.ts).
 *
 * SOCKET_PORT=0 (or unset) disables the listener — useful during Next
 * build's route-collection pass where we don't want a port allocated.
 *
 * Reference: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register(): Promise<void> {
  // Edge runtime evaluates this file too; only Node should boot Socket.IO.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // SKIP_ENV_VALIDATION=1 is set during build/typecheck — skip listener.
  if (process.env.SKIP_ENV_VALIDATION === "1") return;

  const portRaw = process.env.SOCKET_PORT;
  const port = portRaw ? parseInt(portRaw, 10) : 0;
  if (!port || Number.isNaN(port)) {
    console.warn(
      "[socket] SOCKET_PORT not set — skipping Socket.IO bootstrap. Real-time features will be unavailable until SOCKET_PORT is set.",
    );
    return;
  }

  // Dynamic imports keep this file Edge-bundle-safe; the Node-only modules
  // (http, socket.io, @/server/socket/server) load lazily after the runtime
  // check passes.
  const { createServer } = await import("http");
  const { createSocketServer } = await import("@/server/socket/server");

  const httpServer = createServer();
  const io = createSocketServer(httpServer);

  httpServer.listen(port, () => {
    console.log(`[socket] listening on :${port}`);
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    console.log(`[socket] received ${signal} — closing connections`);
    io.close(() => {
      httpServer.close(() => {
        process.exit(0);
      });
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
