// =============================================================
// Platform Prisma Client — Unguarded Singleton
//
// This client has NO tenant-guard extension. Use it ONLY for
// super-admin / platform-level operations that must read or write
// across all tenants (e.g. listing all Organizations, billing
// aggregations, platform settings management).
//
// SECURITY NOTE: Never use this client in tenant-scoped routers.
// Every usage site must be in a super-admin-gated tRPC router
// (apps/api/src/server/trpc/routers/platform.ts) with its own
// RBAC middleware checking isSuperAdmin.
//
// All platformPrisma operations must write to AuditLog with the
// action prefix "PLATFORM:" to distinguish from tenant actions.
// =============================================================

import { PrismaClient } from '@prisma/client';

function createPlatformPrismaClient() {
  return new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });
}

// Global singleton — same pattern as the guarded client to prevent
// multiple instances during hot-reload in development.
const globalForPlatformPrisma = globalThis as unknown as {
  platformPrisma: PrismaClient | undefined;
};

export const platformPrisma =
  globalForPlatformPrisma.platformPrisma ?? createPlatformPrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalForPlatformPrisma.platformPrisma = platformPrisma;
}
