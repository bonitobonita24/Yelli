// =============================================================
// @yelli/db — Public Package Entry
//
// Re-exports the tenant-guarded Prisma client, the platform
// (unguarded) client, audit-log helper, RLS helper, tenant
// context utilities, and the generated Prisma types.
// =============================================================

export { prisma } from './client';
export { platformPrisma } from './platform-client';
export { writeAuditLog, type AuditAction, type AuditLogEntry } from './audit';
export { withTenantRLS } from './rls';
export {
  tenantContextStore,
  getTenantContext,
  requireTenantContext,
  runWithTenantContext,
  type TenantContext,
} from './tenant-context';

// Re-export the entire generated Prisma client surface so consumers
// can import model types, enums, and Prisma utilities from a single
// place: `import { User, PlanTier, Prisma } from '@yelli/db'`.
export * from '@prisma/client';
