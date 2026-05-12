// =============================================================
// PostgreSQL Row-Level Security Helper — L2 DORMANT
//
// Status: DORMANT in single-tenant self-hosted mode.
// Activated on SaaS multi-tenant deployment by enabling the RLS
// policies written as SQL comments in schema.prisma.
//
// When activated, this helper sets the PostgreSQL session variable
// `app.current_tenant_id` inside a transaction so RLS policies
// on each table can enforce tenant isolation at the database level.
//
// Usage (when L2 RLS is active):
//   await withTenantRLS(prisma, ctx.organizationId, async (tx) => {
//     const users = await tx.user.findMany();  // RLS filters by org
//     await writeAuditLog(tx, { ... });
//     return users;
//   });
//
// In single-tenant mode: still safe to call — the SET CONFIG is a
// no-op if no RLS policy reads app.current_tenant_id. The L6
// Prisma tenant-guard (client.ts) provides isolation instead.
// =============================================================

import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Executes `fn` within a Prisma transaction that sets the PostgreSQL
 * session configuration variable `app.current_tenant_id` to the given
 * `organizationId`. This enables L2 PostgreSQL RLS policies to filter
 * rows by tenant at the database level.
 *
 * DORMANT in single-tenant self-hosted mode — RLS policies in
 * schema.prisma are written as SQL comments and not yet enabled.
 * Call this wrapper in multi-tenant SaaS mode once RLS policies are
 * activated via:
 *   ALTER TABLE "tablename" ENABLE ROW LEVEL SECURITY;
 *
 * @param prismaClient  The Prisma client instance (tenant-guarded or platform)
 * @param organizationId  The current tenant's organization ID
 * @param fn  Callback that receives the transaction client and runs inside the RLS context
 */
export async function withTenantRLS<T>(
  prismaClient: PrismaClient,
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prismaClient.$transaction(async (tx) => {
    // Set the tenant ID as a PostgreSQL session-local configuration variable.
    // `true` as the third argument to set_config makes it transaction-local:
    // the setting is automatically reset when the transaction ends.
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${organizationId}, true)`;

    return fn(tx);
  });
}
