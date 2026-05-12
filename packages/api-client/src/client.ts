import {
  createTRPCClient,
  httpBatchLink,
  loggerLink,
  type CreateTRPCClient,
  type HTTPHeaders,
} from '@trpc/client';
import { type AnyTRPCRouter } from '@trpc/server';
import superjson from 'superjson';

export interface ApiClientOptions {
  /**
   * Base URL for the tRPC endpoint.
   * @example "http://localhost:3000/api/trpc"
   * @example "/api/trpc" (relative — works in browser, not in Node.js SSR)
   */
  url: string;

  /**
   * Optional function returning auth headers (e.g. forwarded cookies for SSR).
   * Called per-request. May be async.
   */
  headers?: () => HTTPHeaders | Promise<HTTPHeaders>;

  /**
   * Enable the logger link.
   * Defaults to `true` in development, `false` in production.
   */
  enableLogger?: boolean;
}

/**
 * Create a typed tRPC client. The `TRouter` type parameter must be supplied
 * by the consuming app — `apps/web` defines `AppRouter` in Phase 4 Part 5.
 *
 * This package is intentionally free of any React / TanStack Query dependency.
 * That integration is added in `apps/web` during Phase 4 Part 5.
 *
 * The transformer cast is required because `AnyTRPCRouter` does not pin the
 * router's transformer type. The consuming router MUST declare `superjson`
 * via `initTRPC.create({ transformer: superjson })` to keep wire compatibility.
 *
 * @example
 *   // apps/web/src/lib/api.ts
 *   import type { AppRouter } from "@/server/trpc/router.js";
 *   import { createApiClient } from "@yelli/api-client";
 *
 *   export const api = createApiClient<AppRouter>({
 *     url: "/api/trpc",
 *   });
 */
export function createApiClient<TRouter extends AnyTRPCRouter>(
  options: ApiClientOptions,
): CreateTRPCClient<TRouter> {
  const isProduction = typeof process !== 'undefined' && process.env['NODE_ENV'] === 'production';
  const enableLogger = options.enableLogger ?? !isProduction;

  return createTRPCClient<TRouter>({
    links: [
      ...(enableLogger
        ? [
            loggerLink({
              enabled: (op) =>
                !isProduction || (op.direction === 'down' && op.result instanceof Error),
            }),
          ]
        : []),
      httpBatchLink({
        url: options.url,
        transformer: superjson,
        headers: options.headers,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ],
  });
}
