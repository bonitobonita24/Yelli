// In-memory rate limiter backed by LRUCache.
// For multi-instance deployments: swap the token cache for a Redis store (same API surface).
import { TRPCError } from "@trpc/server";
import { LRUCache } from "lru-cache";

interface RateLimitOptions {
  uniqueTokenPerInterval?: number;
  interval?: number;
  limit?: number;
}

function rateLimit(options?: RateLimitOptions) {
  const tokenCache = new LRUCache<string, number[]>({
    max: options?.uniqueTokenPerInterval ?? 500,
    ttl: options?.interval ?? 60_000,
  });

  return {
    check: (token: string, limitOverride?: number) => {
      const maxRequests = limitOverride ?? options?.limit ?? 60;
      const now = Date.now();
      const windowStart = now - (options?.interval ?? 60_000);
      const tokenCount = tokenCache.get(token) ?? [];
      const requestsInWindow = tokenCount.filter((t) => t > windowStart);

      if (requestsInWindow.length >= maxRequests) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Rate limit exceeded. Try again later.",
        });
      }

      tokenCache.set(token, [...requestsInWindow, now]);
    },
  };
}

export const rateLimiters = {
  // Unauthenticated public pages and endpoints
  public: rateLimit({ interval: 60_000, limit: 30 }),
  // Login, register, password reset — brute-force surface
  auth: rateLimit({ interval: 60_000, limit: 10 }),
  // Authenticated tRPC API calls
  api: rateLimit({ interval: 60_000, limit: 120 }),
  // File upload endpoints
  upload: rateLimit({ interval: 60_000, limit: 20 }),
  // Video/audio call initiation — resource-intensive operation
  callInitiation: rateLimit({ interval: 60_000, limit: 10 }),
};
