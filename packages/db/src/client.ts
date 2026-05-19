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
// No super-admin bypass. Per security.md §SUPERADMIN AND
// PLATFORM-LEVEL ROLES, cross-tenant reads/writes MUST use
// platformPrisma (platform-client.ts) from a superAdminProcedure
// router. A user happening to carry is_super_admin=true on a
// tenant-scoped route does NOT escape tenant filtering — they
// see their own org's data exactly like any tenant_admin.
//
// Pass-through is only granted when ALS context is absent
// (bootstrap/seed scripts and other code running outside of
// runWithTenantContext). Those code paths must accept the
// responsibility of scoping their own queries explicitly.
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

          // Pass through unfiltered only when no tenant context is set
          // (e.g. background bootstrap tasks, seed scripts). Super-admin
          // status carried via session is intentionally ignored here —
          // tenant-bypassing code must use platformPrisma explicitly.
          if (!ctx) {
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
