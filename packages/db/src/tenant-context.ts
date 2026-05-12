// =============================================================
// Tenant Context — AsyncLocalStorage-based per-request isolation
//
// Uses Node AsyncLocalStorage so each concurrent request gets its
// own organization context. NEVER use module-level globals for
// tenant state — concurrent requests would clobber each other.
// =============================================================

import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  organizationId: string;
  userId: string | null;
  isSuperAdmin: boolean;
}

export const tenantContextStore = new AsyncLocalStorage<TenantContext>();

/**
 * Returns the current tenant context or null if not set.
 * Use inside tRPC middleware, background jobs, or any server code
 * that has been wrapped with runWithTenantContext.
 */
export function getTenantContext(): TenantContext | null {
  return tenantContextStore.getStore() ?? null;
}

/**
 * Returns the current tenant context. Throws if not set.
 * Use when the tenant context is required (tRPC protectedProcedure).
 */
export function requireTenantContext(): TenantContext {
  const ctx = tenantContextStore.getStore();
  if (!ctx) {
    throw new Error(
      'Tenant context is not set. Wrap the call with runWithTenantContext().',
    );
  }
  return ctx;
}

/**
 * Runs `fn` with the given tenant context bound to AsyncLocalStorage.
 * All Prisma queries inside `fn` (and any async continuations) will
 * see this context via getTenantContext().
 */
export async function runWithTenantContext<T>(
  context: TenantContext,
  fn: () => Promise<T>,
): Promise<T> {
  return tenantContextStore.run(context, fn);
}
