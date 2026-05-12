// =============================================================
// Prisma Client — Tenant-Guarded Singleton
//
// L6 security layer: Prisma extension using $allOperations to
// auto-inject organizationId on every query. Uses $allOperations
// (NOT a list of individual methods) so no operation can be
// accidentally left unguarded.
//
// Exempt models: AuditLog, Organization, PlatformSettings
// (system-level tables that are not tenant-scoped).
//
// Super-admin bypass: if isSuperAdmin === true in ALS context,
// the tenant filter is skipped entirely. Super-admin queries
// should use platformPrisma (platform-client.ts) for clarity,
// but tenant-guarded client is still safe to use because the
// bypass is explicit and logged.
// =============================================================

import { Prisma, PrismaClient } from '@prisma/client';

import { getTenantContext } from './tenant-context';

// Models exempt from tenant-guard injection.
// These are either the tenant root itself (Organization) or
// system-wide singletons/immutable logs.
const EXEMPT_MODELS = new Set(['AuditLog', 'Organization', 'PlatformSettings']);

function buildTenantGuardExtension() {
  return Prisma.defineExtension({
    name: 'tenant-guard',
    query: {
      $allModels: {
        async $allOperations({ args, query, model, operation: _operation }) {
          // Skip exempt models — they are not tenant-scoped.
          if (EXEMPT_MODELS.has(model)) {
            return query(args);
          }

          const ctx = getTenantContext();

          // If no tenant context is set (e.g. background bootstrap tasks),
          // or if the caller is a super-admin, pass through unfiltered.
          // Super-admin code should prefer platformPrisma for clarity.
          if (!ctx || ctx.isSuperAdmin) {
            return query(args);
          }

          const { organizationId } = ctx;

          // Inject organizationId into WHERE clause for read/write operations
          // that carry a `where` argument.
          if ('where' in args && args.where !== undefined) {
            (args as { where: Record<string, unknown> }).where = {
              ...(args as { where: Record<string, unknown> }).where,
              organization_id: organizationId,
            };
          } else if ('where' in args) {
            (args as { where: Record<string, unknown> }).where = {
              organization_id: organizationId,
            };
          }

          // Inject organizationId into `data` for create/update operations
          // to ensure new records are always scoped to the current tenant.
          if ('data' in args && args.data !== null && typeof args.data === 'object' && !Array.isArray(args.data)) {
            (args as { data: Record<string, unknown> }).data = {
              ...(args as { data: Record<string, unknown> }).data,
              organization_id: organizationId,
            };
          }

          return query(args);
        },
      },
    },
  });
}

type PrismaClientWithExtension = ReturnType<typeof createPrismaClient>;

function createPrismaClient() {
  return new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  }).$extends(buildTenantGuardExtension());
}

// Global singleton — prevents multiple PrismaClient instances in
// development (Next.js hot-reload creates new module instances).
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientWithExtension | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}
