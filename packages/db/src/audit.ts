// =============================================================
// Audit Log Helper — L5 Always-Active Immutable Audit Trail
//
// Every mutation (CREATE, UPDATE, DELETE) in tenant-scoped routers
// must call writeAuditLog inside the same Prisma transaction.
//
// Platform-level actions (super-admin operations) use the prefix
// "PLATFORM:" in the action field to distinguish them from
// tenant-scoped mutations.
//
// Usage:
//   await prisma.$transaction(async (tx) => {
//     const user = await tx.user.create({ data: ... });
//     await writeAuditLog(tx, {
//       organizationId: ctx.organizationId,
//       userId: ctx.userId,
//       action: 'CREATE',
//       entity: 'User',
//       entityId: user.id,
//       before: null,
//       after: user,
//     });
//     return user;
//   });
// =============================================================

import { Prisma } from '@prisma/client';

// AuditAction covers standard CRUD verbs and open-ended platform
// actions (PLATFORM:VIEW_ALL_TENANTS, PLATFORM:DISABLE_TENANT, etc.).
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | (string & {});

export interface AuditLogEntry {
  /** Organization context. Null for platform-level actions. */
  organizationId: string | null;
  /** Acting user. Null for system/scheduled jobs. */
  userId: string | null;
  /** Mutation type — use 'PLATFORM:*' prefix for super-admin ops. */
  action: AuditAction;
  /** Prisma model name (table) — e.g. 'User', 'Department'. */
  entity: string;
  /** Primary key of the affected record. */
  entityId: string;
  /** Snapshot of the record state BEFORE the mutation (null for creates). */
  before: Prisma.InputJsonValue | null;
  /** Snapshot of the record state AFTER the mutation (null for deletes). */
  after: Prisma.InputJsonValue | null;
}

/**
 * Writes an immutable audit log entry within an existing Prisma transaction.
 *
 * Always call this INSIDE a $transaction to guarantee atomicity — if the
 * business operation rolls back, the audit entry rolls back with it.
 *
 * @param tx   Prisma transaction client (from $transaction callback)
 * @param entry Audit log data
 */
export async function writeAuditLog(
  tx: Prisma.TransactionClient,
  entry: AuditLogEntry,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      organization_id: entry.organizationId,
      user_id: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId,
      before: entry.before ?? Prisma.JsonNull,
      after: entry.after ?? Prisma.JsonNull,
    },
  });
}
