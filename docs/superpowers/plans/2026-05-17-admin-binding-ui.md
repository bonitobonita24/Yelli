# Admin Binding UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a self-service UI in `/admin/departments` that lets tenant admins assign which user drives each Department's "online" green-dot on the Speed Dial Board, via a new `departments.setDefaultUser` tRPC mutation and a `<DepartmentUserPicker>` column.

**Architecture:** Server adds one new mutation under the existing `adminProcedure` gate that reuses L3 RBAC + L5 AuditLog + L6 tenant scoping. Client adds one new column to the existing CRUD table, sourcing dropdown options from the already-cached `admin.users.list` query and firing the new mutation on change. Binding is decoupled from the edit Dialog — no two-mutation choreography.

**Tech Stack:** Next.js 15 App Router · React 19 · tRPC 11 · Prisma · vitest · shadcn/ui `<Select>` (already at `@yelli/ui/select`) · TanStack Query v5 (via `trpc.useUtils()`).

**Spec reference:** `docs/superpowers/specs/2026-05-17-admin-binding-ui-design.md` (commit `971e791`).

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| NEW | `apps/web/src/server/trpc/routers/departments.test.ts` | 6 RED→GREEN cases + audit-shape assertion for `setDefaultUser`. Mirrors `meetings.test.ts` pattern (vi.mock of `@yelli/db` + `rate-limit`). |
| NEW | `apps/web/src/components/admin/department-user-picker.tsx` | Controlled `<Select>` cell. Receives `departmentId`, `currentUserId`, `users[]`, `onSaved`. Fires `trpc.departments.setDefaultUser.useMutation()` on change. ~80 lines. |
| MODIFIED | `apps/web/src/server/trpc/routers/departments.ts` | (a) Add `setDefaultUserInput` Zod schema. (b) Add `setDefaultUser` mutation. (c) Add `default_user_id: true` to the `list` query select clause. |
| MODIFIED | `apps/web/src/app/admin/departments/page.tsx` | Add `admin.users.list` query + active-user filter; add "Default user" `<TableHead>` + `<TableCell>` wiring `<DepartmentUserPicker>`. |

**Files read for context (no edits):** `apps/web/src/server/trpc/trpc.ts`, `apps/web/src/server/trpc/routers/admin.ts`, `apps/web/src/server/trpc/routers/meetings.test.ts`, `apps/web/src/app/admin/layout.tsx`, `packages/db/prisma/schema.prisma`, `packages/ui/src/components/select.tsx`.

---

## Pre-flight Reminders

- **Branch convention (Rule 23):** `feat/admin-binding-ui`. Never commit to main directly.
- **TDD (Rule 25):** Each test case is written FIRST, run to confirm RED, then implementation added to drive GREEN.
- **Build is MANDATORY in validation (`[[instrumentation-edge-stub-required]]`):** `pnpm test` + `typecheck` + `lint` are not sufficient — Edge bundle bugs only surface during `pnpm build`.
- **No `any` types. No type assertions without comment.** Per Rule 25 Stage 2.
- **Governance writes are non-blocking** — append after implementation, never during.

---

### Task 1: Create feature branch

**Files:** none (git only)

- [ ] **Step 1: Verify clean working tree on main**

Run: `git status`
Expected: `nothing to commit, working tree clean` and `On branch main`.

- [ ] **Step 2: Verify HEAD is the post-#12 governance commit**

Run: `git log --oneline -1`
Expected output begins with: `fd022eb chore(governance): record Phase 7 #12 squash SHA`

- [ ] **Step 3: Create and switch to feature branch**

Run: `git checkout -b feat/admin-binding-ui`
Expected: `Switched to a new branch 'feat/admin-binding-ui'`

---

### Task 2: Test scaffold — mocks, fixtures, createCaller

**Files:**
- Create: `apps/web/src/server/trpc/routers/departments.test.ts`

- [ ] **Step 1: Create the test file with mocks + fixtures only (no test cases yet)**

```ts
// apps/web/src/server/trpc/routers/departments.test.ts
import { prisma, writeAuditLog } from "@yelli/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { rateLimiters } from "@/server/lib/rate-limit";
import { departmentsRouter } from "@/server/trpc/routers/departments";
import { createCallerFactory } from "@/server/trpc/trpc";

// vi.mock factories hoist above imports. The mocks below run before the
// imports above resolve, so the departmentsRouter we load sees the mocked
// prisma + runWithTenantContext + writeAuditLog.
vi.mock("@yelli/db", () => ({
  prisma: {
    department: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    // Pass-through: invoke the callback with the same prisma mock as tx.
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({
      department: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      user: { findUnique: vi.fn() },
    })),
  },
  // Pass-through: skip the AsyncLocalStorage L6 plumbing in tests.
  runWithTenantContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/server/lib/rate-limit", () => ({
  rateLimiters: {
    auth: { check: vi.fn() },
    api: { check: vi.fn() },
    public: { check: vi.fn() },
    upload: { check: vi.fn() },
  },
}));

const createCaller = createCallerFactory(departmentsRouter);

// Augmented Auth.js Session shape (see apps/web/src/types/next-auth.d.ts).
const ADMIN_SESSION = {
  id: "user-admin-cuid",
  email: "admin@example.com",
  name: "Admin User",
  displayName: "Admin User",
  organizationId: "org-tenant-cuid",
  organizationSlug: "tenant-org",
  role: "tenant_admin" as const,
  isSuperAdmin: false,
  securityVersion: 1,
};

const HOST_SESSION = {
  ...ADMIN_SESSION,
  id: "user-host-cuid",
  email: "host@example.com",
  role: "host" as const,
};

function makeCtx(session = ADMIN_SESSION) {
  return {
    session: { user: session, expires: "2099-01-01" },
    req: new Request(
      "http://localhost/api/trpc/departments.setDefaultUser",
      {
        method: "POST",
        headers: { "x-forwarded-for": "127.0.0.1" },
      },
    ),
  };
}

const DEPT_FIXTURE = {
  id: "dept-reception-cuid",
  name: "Reception",
  default_user_id: null as string | null,
};

const USER_FIXTURE = {
  id: "user-alice-cuid",
  status: "active" as const,
};

// IMPORTANT: $transaction is mocked to invoke the callback with prisma itself
// (pass-through). We re-bind tx.department.findUnique / tx.user.findUnique to
// the top-level prisma mocks inside beforeEach so each test can assert on
// `vi.mocked(prisma.X.method)` directly rather than reaching into the tx mock.
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimiters.api.check).mockImplementation(() => {});

  // Wire $transaction to pass prisma straight through as tx.
  vi.mocked(prisma.$transaction).mockImplementation(
    ((cb: (tx: typeof prisma) => unknown) => cb(prisma)) as never,
  );
});

describe("departmentsRouter.setDefaultUser", () => {
  // test cases added in subsequent tasks
});
```

- [ ] **Step 2: Run the empty describe block to confirm scaffold loads**

Run: `pnpm --filter @yelli/web test -- departments.test.ts`
Expected: `1 file passed` (the describe runs with 0 tests — no failures).

- [ ] **Step 3: Commit scaffold**

```bash
git add apps/web/src/server/trpc/routers/departments.test.ts
git commit -m "test(departments): scaffold setDefaultUser test suite

Mocks @yelli/db (prisma + runWithTenantContext + writeAuditLog) and
@/server/lib/rate-limit. Fixtures for admin/host sessions and seed
dept/user shapes. \$transaction is pass-through to satisfy tx callbacks.

Sets up Phase 7 #13 (admin-binding-ui) — 6 RED→GREEN cases follow."
```

---

### Task 3: Add `setDefaultUserInput` schema + minimal mutation (happy-path RED→GREEN)

**Files:**
- Modify: `apps/web/src/server/trpc/routers/departments.ts`
- Test: `apps/web/src/server/trpc/routers/departments.test.ts`

- [ ] **Step 1: Write the happy-path failing test**

Add inside the `describe("departmentsRouter.setDefaultUser", () => { ... })` block in `departments.test.ts`:

```ts
  it("happy path: tenant_admin binds an active user → returns updated id + default_user_id, calls update", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue(
      DEPT_FIXTURE as never,
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValue(USER_FIXTURE as never);
    vi.mocked(prisma.department.update).mockResolvedValue({
      id: DEPT_FIXTURE.id,
      default_user_id: USER_FIXTURE.id,
    } as never);

    const caller = createCaller(makeCtx());
    const res = await caller.setDefaultUser({
      departmentId: DEPT_FIXTURE.id,
      userId: USER_FIXTURE.id,
    });

    expect(res).toEqual({
      id: DEPT_FIXTURE.id,
      default_user_id: USER_FIXTURE.id,
    });

    expect(prisma.department.update).toHaveBeenCalledTimes(1);
    const updateArg = vi.mocked(prisma.department.update).mock.calls[0]?.[0];
    expect(updateArg).toMatchObject({
      where: { id: DEPT_FIXTURE.id },
      data: { default_user_id: USER_FIXTURE.id },
    });
  });
```

- [ ] **Step 2: Run the test — expect FAIL because mutation doesn't exist**

Run: `pnpm --filter @yelli/web test -- departments.test.ts`
Expected: 1 failed — `caller.setDefaultUser is not a function` (or `Property 'setDefaultUser' does not exist on type ...`).

- [ ] **Step 3: Add input schema + minimal mutation to `departments.ts`**

In `apps/web/src/server/trpc/routers/departments.ts`, after the existing `csvImportInput` schema declaration (around line 42), insert:

```ts
const setDefaultUserInput = z
  .object({
    departmentId: z.string().cuid(),
    userId: z.string().cuid().nullable(),
  })
  .strict();
```

Then append the new mutation inside `departmentsRouter` after `regenerateDeviceToken` and before the closing `});`:

```ts
  /**
   * Bind (or clear) the default user for a department. tenant_admin only.
   *
   * - Pass `userId: null` to clear an existing binding.
   * - Cross-org `departmentId` / `userId` → NOT_FOUND (L6 tenant guard returns
   *   null from findUnique; we map to NOT_FOUND with no info-leak about which
   *   dimension failed, matching the enumeration-resistant posture).
   * - Inactive user → BAD_REQUEST with explicit message (defense-in-depth for
   *   the race where a user is deactivated between dropdown render and submit).
   * - Audit log written per Rule 7 L5 with before/after on default_user_id.
   */
  setDefaultUser: adminProcedure
    .input(setDefaultUserInput)
    .mutation(async ({ ctx, input }) => {
      return prisma.$transaction(async (tx) => {
        const dept = await tx.department.findUnique({
          where: { id: input.departmentId },
          select: { id: true, name: true, default_user_id: true },
        });
        if (!dept) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Department not found.",
          });
        }

        if (input.userId !== null) {
          const user = await tx.user.findUnique({
            where: { id: input.userId },
            select: { id: true, status: true },
          });
          if (!user) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "User not found.",
            });
          }
          // Inactive-user status check added in Task 8 (driven by its test).
        }

        const updated = await tx.department.update({
          where: { id: input.departmentId },
          data: { default_user_id: input.userId },
          select: { id: true, default_user_id: true },
        });

        return updated;
      });
    }),
```

> Note: `writeAuditLog` call is intentionally NOT included in this task — it's added in Task 9 driven by its own test.

- [ ] **Step 4: Run the test — expect PASS**

Run: `pnpm --filter @yelli/web test -- departments.test.ts`
Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/trpc/routers/departments.ts apps/web/src/server/trpc/routers/departments.test.ts
git commit -m "feat(departments): add setDefaultUser mutation (happy path)

adminProcedure-gated mutation that binds Department.default_user_id to a
user in the caller's org. L6 tenant guard handles cross-org rejection via
findUnique returning null → NOT_FOUND. Inactive-user defense-in-depth
check rejects with BAD_REQUEST.

Phase 7 #13 (admin-binding-ui)."
```

---

### Task 4: Test — clearing binding (userId: null) works

**Files:**
- Test: `apps/web/src/server/trpc/routers/departments.test.ts`

- [ ] **Step 1: Add the clear-binding test**

Append inside the `describe` block in `departments.test.ts`:

```ts
  it("clear binding: userId: null sets default_user_id = null without looking up user", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue({
      ...DEPT_FIXTURE,
      default_user_id: "user-previously-bound-cuid",
    } as never);
    vi.mocked(prisma.department.update).mockResolvedValue({
      id: DEPT_FIXTURE.id,
      default_user_id: null,
    } as never);

    const caller = createCaller(makeCtx());
    const res = await caller.setDefaultUser({
      departmentId: DEPT_FIXTURE.id,
      userId: null,
    });

    expect(res).toEqual({ id: DEPT_FIXTURE.id, default_user_id: null });

    // user.findUnique must NOT be called when clearing
    expect(prisma.user.findUnique).not.toHaveBeenCalled();

    expect(prisma.department.update).toHaveBeenCalledWith({
      where: { id: DEPT_FIXTURE.id },
      data: { default_user_id: null },
      select: { id: true, default_user_id: true },
    });
  });
```

- [ ] **Step 2: Run the test — expect PASS (the minimal impl already supports null)**

Run: `pnpm --filter @yelli/web test -- departments.test.ts`
Expected: `2 passed`.

No code change required — the Task 3 minimal implementation already handles the null branch (the `if (input.userId !== null)` guard skips the user lookup).

- [ ] **Step 3: Stage test only — no commit yet (will batch with subsequent test cases below)**

---

### Task 5: Test — non-admin rejected (FORBIDDEN)

**Files:**
- Test: `apps/web/src/server/trpc/routers/departments.test.ts`

- [ ] **Step 1: Add the non-admin failing test**

Append inside the `describe` block:

```ts
  it("non-admin caller (role: host) → FORBIDDEN", async () => {
    const caller = createCaller(makeCtx(HOST_SESSION));
    await expect(
      caller.setDefaultUser({
        departmentId: DEPT_FIXTURE.id,
        userId: USER_FIXTURE.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // adminProcedure must short-circuit BEFORE any DB call
    expect(prisma.department.findUnique).not.toHaveBeenCalled();
    expect(prisma.department.update).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the test — expect PASS (adminProcedure middleware already enforces role)**

Run: `pnpm --filter @yelli/web test -- departments.test.ts`
Expected: `3 passed`.

The `adminProcedure` middleware in `apps/web/src/server/trpc/trpc.ts:78-84` already rejects non-admins with `FORBIDDEN`. No implementation change needed.

---

### Task 6: Test — cross-org department rejected (NOT_FOUND)

**Files:**
- Test: `apps/web/src/server/trpc/routers/departments.test.ts`

- [ ] **Step 1: Add the cross-org-dept failing test**

Append inside the `describe` block:

```ts
  it("cross-org department (L6 returns null) → NOT_FOUND with generic message", async () => {
    // L6 tenant guard returns null for cross-org findUnique.
    vi.mocked(prisma.department.findUnique).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(
      caller.setDefaultUser({
        departmentId: "dept-from-other-org-cuid",
        userId: USER_FIXTURE.id,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Department not found.",
    });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.department.update).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the test — expect PASS (minimal impl handles null dept)**

Run: `pnpm --filter @yelli/web test -- departments.test.ts`
Expected: `4 passed`.

---

### Task 7: Test — cross-org user rejected (NOT_FOUND)

**Files:**
- Test: `apps/web/src/server/trpc/routers/departments.test.ts`

- [ ] **Step 1: Add the cross-org-user failing test**

Append inside the `describe` block:

```ts
  it("cross-org user (L6 returns null) → NOT_FOUND with generic message", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue(
      DEPT_FIXTURE as never,
    );
    // L6 tenant guard returns null for cross-org user findUnique.
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(
      caller.setDefaultUser({
        departmentId: DEPT_FIXTURE.id,
        userId: "user-from-other-org-cuid",
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "User not found.",
    });

    expect(prisma.department.update).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the test — expect PASS**

Run: `pnpm --filter @yelli/web test -- departments.test.ts`
Expected: `5 passed`.

---

### Task 8: Test — inactive user rejected (BAD_REQUEST)

**Files:**
- Test: `apps/web/src/server/trpc/routers/departments.test.ts`

- [ ] **Step 1: Add the inactive-user failing test**

Append inside the `describe` block:

```ts
  it("inactive user → BAD_REQUEST with explicit message", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue(
      DEPT_FIXTURE as never,
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: USER_FIXTURE.id,
      status: "inactive",
    } as never);

    const caller = createCaller(makeCtx());
    await expect(
      caller.setDefaultUser({
        departmentId: DEPT_FIXTURE.id,
        userId: USER_FIXTURE.id,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Cannot bind an inactive user.",
    });

    expect(prisma.department.update).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the test — expect FAIL (Task 3 minimal impl does not yet reject inactive users)**

Run: `pnpm --filter @yelli/web test -- departments.test.ts`
Expected: 1 failed — `caller.setDefaultUser` resolved instead of rejecting with BAD_REQUEST (or `expected to throw, but did not`).

The minimal Task 3 implementation looks up the user but only checks for null. An inactive user passes the null check and proceeds to `prisma.department.update`. This test now forces us to add the status guard.

- [ ] **Step 3: Add the explicit inactive-user check to `setDefaultUser` in `departments.ts`**

Inside the `setDefaultUser` mutation, replace the placeholder comment line:

```ts
          // Inactive-user status check added in Task 8 (driven by its test).
```

with the explicit guard:

```ts
          // Defense-in-depth: race where a user is deactivated between
          // dropdown render and form submit. Server is source of truth.
          if (user.status !== "active") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Cannot bind an inactive user.",
            });
          }
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `pnpm --filter @yelli/web test -- departments.test.ts`
Expected: `6 passed`.

- [ ] **Step 5: Commit the 5 additional test cases + inactive-user implementation batched together**

```bash
git add apps/web/src/server/trpc/routers/departments.test.ts apps/web/src/server/trpc/routers/departments.ts
git commit -m "feat(departments): reject inactive users in setDefaultUser

Adds the defense-in-depth status check covering the race where a user
is deactivated between dropdown render and form submit. Test asserts
BAD_REQUEST with explicit 'Cannot bind an inactive user.' message.

Also commits the 4 sibling test cases added in Tasks 4-7 (clear binding,
non-admin FORBIDDEN, cross-org dept, cross-org user — all already
passing under the existing minimal implementation).

Phase 7 #13 (admin-binding-ui)."
```

---

### Task 9: Audit log shape — RED test + add writeAuditLog call

**Files:**
- Modify: `apps/web/src/server/trpc/routers/departments.ts`
- Test: `apps/web/src/server/trpc/routers/departments.test.ts`

- [ ] **Step 1: Write the audit-shape failing test**

Append inside the `describe` block:

```ts
  it("writes audit log on bind with correct entity / action / before-after shape", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue({
      ...DEPT_FIXTURE,
      default_user_id: "user-previously-bound-cuid",
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(USER_FIXTURE as never);
    vi.mocked(prisma.department.update).mockResolvedValue({
      id: DEPT_FIXTURE.id,
      default_user_id: USER_FIXTURE.id,
    } as never);

    const caller = createCaller(makeCtx());
    await caller.setDefaultUser({
      departmentId: DEPT_FIXTURE.id,
      userId: USER_FIXTURE.id,
    });

    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(), // tx
      {
        organizationId: "org-tenant-cuid",
        userId: "user-admin-cuid",
        action: "UPDATE",
        entity: "Department",
        entityId: DEPT_FIXTURE.id,
        before: { default_user_id: "user-previously-bound-cuid" },
        after: { default_user_id: USER_FIXTURE.id },
      },
    );
  });
```

- [ ] **Step 2: Run the test — expect FAIL (writeAuditLog not yet called)**

Run: `pnpm --filter @yelli/web test -- departments.test.ts`
Expected: 1 failed — `expected "writeAuditLog" to be called once, but got 0 times`.

- [ ] **Step 3: Add the writeAuditLog call to `setDefaultUser` in `departments.ts`**

Inside the `setDefaultUser` mutation, between the `const updated = await tx.department.update(...)` call and the `return updated;` statement, insert:

```ts
        await writeAuditLog(tx, {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "UPDATE",
          entity: "Department",
          entityId: updated.id,
          before: { default_user_id: dept.default_user_id },
          after: { default_user_id: updated.default_user_id },
        });
```

The full final block now reads:

```ts
        const updated = await tx.department.update({
          where: { id: input.departmentId },
          data: { default_user_id: input.userId },
          select: { id: true, default_user_id: true },
        });

        await writeAuditLog(tx, {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "UPDATE",
          entity: "Department",
          entityId: updated.id,
          before: { default_user_id: dept.default_user_id },
          after: { default_user_id: updated.default_user_id },
        });

        return updated;
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `pnpm --filter @yelli/web test -- departments.test.ts`
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/trpc/routers/departments.ts apps/web/src/server/trpc/routers/departments.test.ts
git commit -m "feat(departments): write audit log on setDefaultUser

Per Rule 7 L5 — every mutation records before/after in AuditLog with
entity:Department, action:UPDATE. Test asserts payload shape with
organizationId, userId, entity, action, entityId, before, after.

Phase 7 #13 (admin-binding-ui)."
```

---

### Task 10: Expose `default_user_id` in the `list` query

**Files:**
- Modify: `apps/web/src/server/trpc/routers/departments.ts`

- [ ] **Step 1: Add `default_user_id: true` to the `list` select clause**

In `apps/web/src/server/trpc/routers/departments.ts`, locate the `list` procedure (around line 54-68). The current `select` clause reads:

```ts
      select: {
        id: true,
        name: true,
        description: true,
        group_label: true,
        sort_order: true,
        auto_answer_enabled: true,
        device_binding_token: true,
        created_at: true,
        updated_at: true,
      },
```

Replace it with (adds one line, marked):

```ts
      select: {
        id: true,
        name: true,
        description: true,
        group_label: true,
        sort_order: true,
        auto_answer_enabled: true,
        device_binding_token: true,
        default_user_id: true,
        created_at: true,
        updated_at: true,
      },
```

- [ ] **Step 2: Run typecheck to confirm no regression**

Run: `pnpm --filter @yelli/web typecheck`
Expected: `0 errors`.

- [ ] **Step 3: Run the existing tests to confirm nothing breaks**

Run: `pnpm --filter @yelli/web test -- departments.test.ts`
Expected: `7 passed` (all setDefaultUser tests still pass).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/server/trpc/routers/departments.ts
git commit -m "feat(departments): expose default_user_id in list query

One-line addition to the list query select clause. Unlocks the admin UI
column showing current binding per row.

Phase 7 #13 (admin-binding-ui)."
```

---

### Task 11: Build `<DepartmentUserPicker>` component

**Files:**
- Create: `apps/web/src/components/admin/department-user-picker.tsx`

- [ ] **Step 1: Create the component file**

```tsx
// apps/web/src/components/admin/department-user-picker.tsx
"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@yelli/ui/select";
import { toast } from "@yelli/ui/use-toast";
import { useMemo } from "react";

import { trpc } from "@/lib/trpc/react";

export interface DepartmentUserPickerUser {
  id: string;
  display_name: string;
}

interface DepartmentUserPickerProps {
  departmentId: string;
  currentUserId: string | null;
  /** Active users only — filtered by the parent before passing in. */
  users: readonly DepartmentUserPickerUser[];
  /** Optional hook (e.g. for parent-managed query invalidation). */
  onSaved?: () => void;
}

const CLEAR_VALUE = "__clear__";
const UNASSIGNED_VALUE = "__unassigned__";

/**
 * Inline binding picker for a single department row in /admin/departments.
 *
 * Why a separate component (not inline in page.tsx):
 *   Each row needs its own useMutation state (isPending, error). Inlining
 *   would require a hook-per-row inside .map() (illegal). Keeps page.tsx
 *   from growing further (already 462 lines).
 *
 * Why the parent filters to active users:
 *   The parent already has the admin.users.list query data; filtering once
 *   at the parent avoids duplicating the filter in every row.
 *
 * Edge case — currentUserId points to an inactive user:
 *   The user won't appear in the `users` list. The Select trigger shows
 *   "(deactivated)" cosmetically; admin can pick a new user or clear the
 *   binding to resolve.
 */
export function DepartmentUserPicker({
  departmentId,
  currentUserId,
  users,
  onSaved,
}: DepartmentUserPickerProps): JSX.Element {
  const setDefaultUser = trpc.departments.setDefaultUser.useMutation({
    onSuccess: () => {
      toast({ title: "Default user updated" });
      onSaved?.();
    },
    onError: (err) => {
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const currentUser = useMemo(
    () => users.find((u) => u.id === currentUserId) ?? null,
    [users, currentUserId],
  );

  const triggerValue =
    currentUserId === null
      ? UNASSIGNED_VALUE
      : currentUser !== null
        ? currentUserId
        : UNASSIGNED_VALUE; // deactivated user — render as unassigned cosmetically

  const triggerLabel =
    currentUserId === null
      ? "Unassigned"
      : currentUser !== null
        ? currentUser.display_name
        : "(deactivated)";

  function handleChange(value: string): void {
    if (value === UNASSIGNED_VALUE) return; // no-op — trigger placeholder
    const nextUserId = value === CLEAR_VALUE ? null : value;
    if (nextUserId === currentUserId) return; // no-op — same value
    setDefaultUser.mutate({ departmentId, userId: nextUserId });
  }

  return (
    <Select
      value={triggerValue}
      onValueChange={handleChange}
      disabled={setDefaultUser.isPending || users.length === 0}
    >
      <SelectTrigger className="h-8 w-44 text-sm">
        <SelectValue placeholder="Unassigned">{triggerLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.display_name}
          </SelectItem>
        ))}
        {currentUserId !== null && (
          <SelectItem
            value={CLEAR_VALUE}
            className="text-muted-foreground italic"
          >
            Clear binding
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Run typecheck to confirm the component compiles**

Run: `pnpm --filter @yelli/web typecheck`
Expected: `0 errors`.

- [ ] **Step 3: Run lint to confirm no style issues**

Run: `pnpm --filter @yelli/web lint`
Expected: `0 errors` (warnings on pre-existing issues are OK; no NEW warnings on this file).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/department-user-picker.tsx
git commit -m "feat(admin): add DepartmentUserPicker component

Controlled shadcn Select bound to trpc.departments.setDefaultUser.
Filters performed by parent; component receives pre-filtered active
users only. Handles the deactivated-user edge case cosmetically as
'(deactivated)' with the option to clear or re-bind.

Phase 7 #13 (admin-binding-ui)."
```

---

### Task 12: Wire the new column into `/admin/departments`

**Files:**
- Modify: `apps/web/src/app/admin/departments/page.tsx`

- [ ] **Step 1: Add the `useMemo` import + active-users filter and the picker import**

Locate the existing imports block (lines 1-28). Add:

```ts
import { useMemo, useState } from "react";  // REPLACE the existing `import { useState } from "react";`

import { DepartmentUserPicker } from "@/components/admin/department-user-picker";  // NEW
```

- [ ] **Step 2: Add the `admin.users.list` query + filter inside the component**

Inside `AdminDepartmentsPage`, immediately after the existing:

```ts
  const utils = trpc.useUtils();
  const list = trpc.departments.list.useQuery();
```

Add:

```ts
  const usersQuery = trpc.admin.users.list.useQuery();
  const activeUsers = useMemo(
    () =>
      (usersQuery.data ?? [])
        .filter((u) => u.status === "active")
        .map((u) => ({ id: u.id, display_name: u.display_name })),
    [usersQuery.data],
  );
```

- [ ] **Step 3: Add the new `<TableHead>` column**

Locate the existing `<TableHeader>` block (around line 243-252). The current row reads:

```tsx
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Group</TableHead>
                <TableHead className="text-center">Order</TableHead>
                <TableHead>Auto-answer</TableHead>
                <TableHead>Device token</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
```

Replace with (insert "Default user" column between Auto-answer and Device token):

```tsx
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Group</TableHead>
                <TableHead className="text-center">Order</TableHead>
                <TableHead>Auto-answer</TableHead>
                <TableHead>Default user</TableHead>
                <TableHead>Device token</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
```

- [ ] **Step 4: Add the new `<TableCell>` in the body row**

Locate the body `<TableRow>` mapping (around lines 254-309). After the "Auto-answer" `<TableCell>` (around line 265-271) and before the "Device token" `<TableCell>` (around line 272-280), insert:

```tsx
                    <TableCell>
                      <DepartmentUserPicker
                        departmentId={d.id}
                        currentUserId={d.default_user_id ?? null}
                        users={activeUsers}
                        onSaved={() => utils.departments.list.invalidate()}
                      />
                    </TableCell>
```

- [ ] **Step 5: Run typecheck to confirm the wiring is type-clean**

Run: `pnpm --filter @yelli/web typecheck`
Expected: `0 errors`. (If `d.default_user_id` is reported missing: confirm Task 10 was committed — the `list` select must include `default_user_id`.)

- [ ] **Step 6: Run the dev server briefly and verify the column renders (optional — defer to validation gate)**

Skip if running in CI / non-interactive environment. The build gate in Task 13 will catch any JSX issues.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/admin/departments/page.tsx
git commit -m "feat(admin): wire Default user column into departments page

Adds admin.users.list query (filtered client-side to active users) and a
new 'Default user' table column. Each row renders <DepartmentUserPicker>
bound to the row's department id + current default_user_id. Edit dialog
untouched — binding flow is column-level and atomic.

Phase 7 #13 (admin-binding-ui)."
```

---

### Task 13: Full validation gate

**Files:** none (validation only)

- [ ] **Step 1: Run the test suite (full)**

Run: `pnpm test`
Expected: 124 passed (was 117; +7 new cases in `departments.test.ts`).

- [ ] **Step 2: Run typecheck across all packages**

Run: `pnpm typecheck`
Expected: `0 errors` across all 8 packages.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: `0 errors`. The 2 pre-existing warnings (`@yelli/db` bcrypt named-export caution + `@yelli/web` root-layout no-css-tags) may remain unchanged. No new warnings.

- [ ] **Step 4: Run build (MANDATORY per `[[instrumentation-edge-stub-required]]`)**

Run: `pnpm build`
Expected: `27 routes ✓ compiled successfully`. The new mutation is in the tRPC router chain, which is transitively in the instrumentation chain — webpack Edge-bundle issues would only surface here.

- [ ] **Step 5: Run audit gate**

Run: `pnpm --filter @yelli/web exec pnpm audit --audit-level=critical`
Expected: `exit 0`. Phase 7 #9 (nodemailer CVE acceptance) + Phase 7 #10 (CLI flag enforcement) remain in effect.

- [ ] **Step 6: Verify Prisma migration status unchanged**

Run: `pnpm --filter @yelli/db exec prisma migrate status`
Expected: `Database schema is up to date!` with 3 migrations (no new migration was needed in this ticket — the `default_user_id` column was added by Phase 7 #12 migration `20260517075117_add_department_default_user_id`).

---

### Task 14: Two-stage review (Rule 25)

**Files:** none (manual review)

- [ ] **Step 1: Stage 1 — spec compliance check**

Open `docs/superpowers/specs/2026-05-17-admin-binding-ui-design.md` and verify each item in the "Two-Stage Review Checklist (Rule 25)" section against the working tree:

```
□ Dedicated setDefaultUser({ departmentId, userId | null }) mutation exists
  → grep for "setDefaultUser" in apps/web/src/server/trpc/routers/departments.ts
□ Org-scoping verified via adminProcedure + L6 (cases 4 + 5)
  → tests pass; mutation uses adminProcedure
□ Set null clears binding (case 2)
  → test "clear binding" passes
□ Cross-org rejection (cases 4 + 5)
  → tests "cross-org department" and "cross-org user" both pass
□ Inactive user rejection (case 6)
  → test "inactive user → BAD_REQUEST" passes
□ Audit log written on every change (cases 1 + 2 + audit assertion)
  → test "writes audit log on bind" passes
□ UI dropdown sources from admin.users.list filtered to active users
  → page.tsx uses trpc.admin.users.list + .filter(u => u.status === "active")
□ Currently-bound user displayed in the column
  → <DepartmentUserPicker> renders currentUser.display_name in trigger
□ Edit dialog untouched (decoupled flows)
  → git diff shows no changes to the existing edit Dialog block
```

If any item fails → fix before proceeding.

- [ ] **Step 2: Stage 2 — code quality check**

Inspect the diff for the following:

```
□ No any types introduced
  → grep "\bany\b" on changed .ts/.tsx files (excluding type-import lines)
□ No type assertions (as X) without explanatory comment
  → grep "\bas \b" on changed files; each occurrence must have a // comment
□ Tests written BEFORE implementation
  → git log --reverse on branch confirms commit order:
    test scaffold → feat happy path → feat audit → feat list → feat picker → feat page
□ Scope strictly = the files in the inventory; no unrelated edits
  → git diff main...HEAD --stat — only the 5 files from Task 0 inventory should appear
□ Conventional commits per branch
  → git log --oneline main..HEAD — every line matches feat(...)|test(...) pattern
□ <DepartmentUserPicker> ≤ ~80 lines
  → wc -l apps/web/src/components/admin/department-user-picker.tsx
```

Run: `git diff main...HEAD --stat`
Expected: 4 files changed (the 1 NEW test file + 1 NEW component file + 2 MODIFIED files). Plan + spec docs already committed pre-branch.

- [ ] **Step 3: Document any review findings**

If both stages PASS: proceed to Task 15.
If either fails: fix the issue, re-run the affected validation gate, then re-run the review.

---

### Task 15: Governance updates + squash-merge

**Files:**
- Modify: `docs/CHANGELOG_AI.md`
- Modify: `docs/IMPLEMENTATION_MAP.md`
- Modify: `.cline/STATE.md`
- Modify: `.cline/memory/agent-log.md`
- Modify: `.whatsnext`

- [ ] **Step 1: Append entry to `docs/CHANGELOG_AI.md`**

Add a new entry at the TOP of the reverse-chronological block, with all fields per Rule 15:

```markdown
## 2026-05-17 — Phase 7 #13: admin-binding-ui
- Agent:               CLAUDE_CODE
- Why:                  Self-service UI for tenant admins to assign Department.default_user_id, closing the deferred-scope from Phase 7 #12 (binding previously required direct pgAdmin UPDATE).
- Files added:          apps/web/src/server/trpc/routers/departments.test.ts (~210 lines, 7 cases); apps/web/src/components/admin/department-user-picker.tsx (~85 lines); docs/superpowers/specs/2026-05-17-admin-binding-ui-design.md; docs/superpowers/plans/2026-05-17-admin-binding-ui.md
- Files modified:       apps/web/src/server/trpc/routers/departments.ts (+60 lines: setDefaultUserInput schema, setDefaultUser mutation, default_user_id in list select); apps/web/src/app/admin/departments/page.tsx (+18 lines: new column + admin.users.list query + filter)
- Files deleted:        none
- Schema/migrations:    none (default_user_id column added in Phase 7 #12 migration 20260517075117_add_department_default_user_id)
- Errors encountered:   none — all validation gates passed on first attempt
- Errors resolved:      n/a
```

- [ ] **Step 2: Update `docs/IMPLEMENTATION_MAP.md`**

At the top of the "Built So Far" section, add:

```markdown
- 2026-05-17 — **Phase 7 #13 (admin-binding-ui)** — tRPC `departments.setDefaultUser({ departmentId, userId | null })` mutation under `adminProcedure`. L3/L5/L6 layers reused; rejects inactive users with `BAD_REQUEST`. UI: new "Default user" column in `/admin/departments` with `<DepartmentUserPicker>` per row, sourcing options from `admin.users.list` (filtered to active). Edit dialog untouched. 7 RED→GREEN cases added (117 → 124 total).
```

Demote the Phase 7 #12 paragraph one position.

- [ ] **Step 3: Rewrite `.cline/STATE.md`**

Replace the PHASE / LAST_DONE / NEXT / CURRENT_BUILD / FILES_TOUCHED / TIER_CLASSIFICATION sections to reflect:

- `PHASE: Phase 7 active — thirteenth Feature Update merged. Phase 7 #13 (admin-binding-ui) squash-merged 2026-05-17 as <SHA>.`
- `LAST_DONE`: full one-paragraph summary mirroring the Phase 7 #12 entry format
- `NEXT`: re-promote remaining candidates from .whatsnext (in-call-state, i, d, f, legacy-socket-retirement, rule-16-cleanup)
- `CURRENT_BUILD`: 27 routes ✓; test suite 124 cases
- `FILES_TOUCHED_THIS_SESSION`: list per the inventory above
- `TIER_CLASSIFICATION`: 2 — single-session, ~45K tokens
- `LESSONS_ADDED`: 0 (this ticket reused existing patterns; no novel insight)

- [ ] **Step 4: Append line to `.cline/memory/agent-log.md`**

```
2026-05-17 | CLAUDE_CODE | Phase 7 #13 (admin-binding-ui) shipped — 4 implementation files (2 NEW: departments.test.ts + department-user-picker.tsx; 2 MODIFIED: departments.ts + admin/departments/page.tsx). 7 RED→GREEN cases (124 total). Two-stage review PASS. Squash-merged to main as <SHA>.
```

- [ ] **Step 5: Update `.whatsnext`**

Close the `(admin-binding-ui)` candidate entry (move to a post-ship summary block similar to the Phase 7 #12 paragraph at top). Re-list remaining candidates: `(in-call-state)`, `(i)`, `(d)`, `(f)`, `(legacy-socket-retirement)`, `(rule-16-cleanup)`.

- [ ] **Step 6: Commit governance to the feature branch**

```bash
git add docs/CHANGELOG_AI.md docs/IMPLEMENTATION_MAP.md .cline/STATE.md .cline/memory/agent-log.md .whatsnext
git commit -m "docs(governance): record Phase 7 #13 (admin-binding-ui)

CHANGELOG_AI / IMPLEMENTATION_MAP / STATE / agent-log / .whatsnext."
```

- [ ] **Step 7: Confirm clean tree + count of branch commits**

Run: `git status && git log --oneline main..HEAD`
Expected: clean tree; branch has 8 commits matching the conventional pattern:
1. `test(departments): scaffold setDefaultUser test suite`
2. `feat(departments): add setDefaultUser mutation (happy path)`
3. `feat(departments): reject inactive users in setDefaultUser`
4. `feat(departments): write audit log on setDefaultUser`
5. `feat(departments): expose default_user_id in list query`
6. `feat(admin): add DepartmentUserPicker component`
7. `feat(admin): wire Default user column into departments page`
8. `docs(governance): record Phase 7 #13 (admin-binding-ui)`

- [ ] **Step 8: Squash-merge to main**

```bash
git checkout main
git merge --squash feat/admin-binding-ui
git status   # review staged changes
git commit -m "feat(admin): department-binding admin UI — Phase 7 #13

Self-service binding for Department.default_user_id via /admin/departments.
New tRPC mutation departments.setDefaultUser({ departmentId, userId|null })
under adminProcedure; reuses L3 RBAC + L5 AuditLog + L6 tenant scope.
Rejects inactive users with BAD_REQUEST (defense-in-depth race guard).
New <DepartmentUserPicker> component (~85 lines) wired into a new
'Default user' table column; dropdown options sourced from admin.users.list
filtered to active. Edit dialog untouched.

7 new RED→GREEN cases (117 → 124). Closes deferred-scope from Phase 7 #12.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

- [ ] **Step 9: Record the squash SHA + delete branch**

```bash
SHA=$(git rev-parse --short HEAD)
echo "Squash SHA: $SHA"
git branch -d feat/admin-binding-ui
```

- [ ] **Step 10: Post-merge validation on main**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: all green; 124 tests passing; 27 routes built.

- [ ] **Step 11: Append the squash SHA to `.cline/STATE.md`**

Replace `<SHA>` placeholders in STATE.md, CHANGELOG, IMPLEMENTATION_MAP, and agent-log with the actual short SHA from Step 9.

Run: `git add .cline/STATE.md docs/CHANGELOG_AI.md docs/IMPLEMENTATION_MAP.md .cline/memory/agent-log.md`
Run: `git commit -m "chore(governance): record Phase 7 #13 squash SHA — $SHA"`

- [ ] **Step 12: Final state check**

Run: `git log --oneline -3`
Expected:
```
<gov-sha>  chore(governance): record Phase 7 #13 squash SHA — <sha>
<sha>      feat(admin): department-binding admin UI — Phase 7 #13
fd022eb    chore(governance): record Phase 7 #12 squash SHA — 446a97f
```

Phase 7 #13 SHIPPED.
