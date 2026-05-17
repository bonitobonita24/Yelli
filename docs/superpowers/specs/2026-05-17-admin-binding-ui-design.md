# Admin Binding UI — Phase 7 #13 Design

**Date:** 2026-05-17
**Ticket:** Phase 7 #13 — admin-binding-ui (recommended next from `.whatsnext` after #12)
**Status:** Design approved — ready for implementation plan
**Tier:** 2 (moderate) — single-session execution, ~45K Opus 4.7 estimated

---

## Goal

Give tenant admins a self-service UI to assign which user drives each Department's
"online" green-dot on the Speed Dial Board, via the existing `/admin/departments`
page. Bindings can be set, changed, or cleared. Closes the deferred-scope from
Phase 7 #12, which left bindings only settable via direct pgAdmin `UPDATE`.

End-to-end UX after this ticket ships:

1. Tenant admin opens `/admin/departments` → sees a new "Default user" column
   showing the currently-bound user (or "Unassigned") for every department.
2. Admin clicks the cell → shadcn `<Select>` opens with all active org users +
   a "Clear binding" option at the bottom.
3. Admin picks a user → mutation fires → row updates optimistically → toast.
4. Speed Dial Board immediately reflects the new binding on next render
   (page refresh or socket reconnect). Real-time push to live Speed Dial
   sessions is out of scope.

---

## Architecture & Data Flow

```
┌─ /admin/departments/page.tsx (client) ──────────────────────────┐
│                                                                  │
│  trpc.departments.list.useQuery()    ──►  table rows             │
│      └─► returns: existing fields + default_user_id              │
│                                                                  │
│  trpc.admin.users.list.useQuery()    ──►  dropdown options       │
│      └─► filter client-side: status === "active"                 │
│      └─► client-side join: dept.default_user_id → user.name      │
│                                                                  │
│  <DepartmentUserPicker> per row (controlled <Select>)            │
│      └─► onChange: trpc.departments.setDefaultUser.useMutation() │
│      └─► invalidate departments.list on success                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ trpc: departments.setDefaultUser (adminProcedure) ──────────────┐
│  input: { departmentId: cuid, userId: cuid | null } .strict()    │
│                                                                  │
│  prisma.$transaction:                                            │
│    1. findUnique(dept by id) — L6 scopes to org. 404 if missing. │
│    2. IF userId !== null:                                        │
│         findUnique(user by id) — L6 scopes to org. 404 if missing│
│         IF user.status !== "active" → BAD_REQUEST "inactive"     │
│    3. update(dept) set default_user_id = userId                  │
│    4. writeAuditLog(entity:"Department", action:"UPDATE",        │
│         before:{default_user_id}, after:{default_user_id})       │
│    5. return { id, default_user_id }                             │
└──────────────────────────────────────────────────────────────────┘
```

### Security layering reused (no new layers introduced)

- **L3 RBAC** — `adminProcedure` gates on `role === "tenant_admin"` (existing
  middleware in `apps/web/src/server/trpc/trpc.ts`).
- **L5 AuditLog** — `writeAuditLog` after every mutation (existing pattern from
  every other mutation in `departments.ts`).
- **L6 Tenant guard** — `runWithTenantContext` auto-scopes all `findUnique` /
  `update` queries to the caller's org (existing). Cross-org `departmentId` or
  `userId` returns `null` from `findUnique` → mapped to `NOT_FOUND`.
- **Defense-in-depth** — explicit `status !== "active"` check after the
  `findUnique` succeeds, covering the race where a user is deactivated between
  dropdown render and submit.

---

## Locked Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Dedicated `setDefaultUser` mutation** (not extension of `update`) | Atomic, easy to unit-test, audit log captures ONLY binding changes (clean before/after), no regression risk to other update paths. |
| 2 | **Inline "Default user" column with `<Select>`** (not new modal, not extension of edit Dialog) | Bindings visible at-a-glance across all departments; one-click rebind; matches the dedicated mutation's atomic nature (no two-mutation choreography on save). |
| 3 | **Reuse `admin.users.list`, filter client-side to active users** (not new `usersForBinding` query) | TanStack caches the existing query across pages; admin/users page already calls it; one fewer endpoint to maintain. Server still rejects inactive as defense-in-depth. |
| 4 | **Server rejects inactive users with `BAD_REQUEST`** | Race condition: a user could be deactivated between dropdown render and form submit. Server is source of truth. |
| 5 | **shadcn `<Select>` (not `<Combobox>`)** | Basic Select handles ~20–50 options cleanly (typical org size). No search needed at this scale. Future swap is trivial — same prop shape on `<DepartmentUserPicker>`. |
| 6 | **`<DepartmentUserPicker>` as a separate component file** | Each row needs its own mutation hook state (`isPending`, error). Inlining would require a hook-per-row inside `.map()` (illegal). Keeps page.tsx from growing further (already 462 lines). |
| 7 | **No `<DepartmentUserPicker>` unit test** | Project posture: React UI components are not unit-tested (no jsdom/RTL in the project — confirmed at Phase 7 #12). Visual QA covers UI surface. |
| 8 | **No real-time push to Speed Dial Board on rebinding** | Out of scope. Page refresh / next socket reconnect picks up the new binding. Real-time propagation is a future ticket if needed. |
| 9 | **No self-binding restriction** | Admin is a valid speed-dial target. Not required by spec. |
| 10 | **No prompt to create a user from inside the dropdown** | YAGNI — admins go to `/admin/users` to invite. |

---

## tRPC Mutation Contract

### New input schema

```ts
const setDefaultUserInput = z
  .object({
    departmentId: z.string().cuid(),
    userId: z.string().cuid().nullable(),
  })
  .strict();
```

### New mutation

```ts
setDefaultUser: adminProcedure
  .input(setDefaultUserInput)
  .mutation(async ({ ctx, input }) => {
    return prisma.$transaction(async (tx) => {
      // 1. Department must exist in caller's org (L6 scopes findUnique).
      const dept = await tx.department.findUnique({
        where: { id: input.departmentId },
        select: { id: true, name: true, default_user_id: true },
      });
      if (!dept) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Department not found." });
      }

      // 2. If binding a user (not clearing), verify they exist in org + are active.
      //    L6 auto-scopes — cross-org userId returns null → NOT_FOUND.
      if (input.userId !== null) {
        const user = await tx.user.findUnique({
          where: { id: input.userId },
          select: { id: true, status: true },
        });
        if (!user) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
        }
        if (user.status !== "active") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot bind an inactive user.",
          });
        }
      }

      // 3. Apply the change.
      const updated = await tx.department.update({
        where: { id: input.departmentId },
        data: { default_user_id: input.userId },
        select: { id: true, default_user_id: true },
      });

      // 4. Audit log (Rule 7 L5).
      await writeAuditLog(tx, {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: "UPDATE",
        entity: "Department",
        entityId: updated.id,
        before: { default_user_id: dept.default_user_id },
        after:  { default_user_id: updated.default_user_id },
      });

      return updated;
    });
  }),
```

### Modify `departments.list` — expose `default_user_id`

One-line addition to the existing select clause:

```ts
select: {
  id: true,
  name: true,
  description: true,
  group_label: true,
  sort_order: true,
  auto_answer_enabled: true,
  device_binding_token: true,
  default_user_id: true,   // NEW
  created_at: true,
  updated_at: true,
},
```

### No Prisma schema change

`default_user_id` column + FK + index were all added in Phase 7 #12 migration
`20260517075117_add_department_default_user_id`. The `default_user` named
relation already exists in `schema.prisma`. This ticket only exposes the FK
column in the existing `list` query payload.

### Error contract

| Scenario | Code | Message |
|---|---|---|
| Caller not tenant_admin | `FORBIDDEN` | `"Access denied."` (existing from `adminProcedure`) |
| Department doesn't exist OR is in other org | `NOT_FOUND` | `"Department not found."` |
| `userId` doesn't exist OR is in other org | `NOT_FOUND` | `"User not found."` |
| `userId` references an inactive user | `BAD_REQUEST` | `"Cannot bind an inactive user."` |
| `userId` is `null` | OK | clears the binding |

`NOT_FOUND` messages intentionally don't distinguish "doesn't exist" from "wrong
org" — matches the existing enumeration-resistant posture in the rest of the app.

---

## UI Composition

### New component: `<DepartmentUserPicker>`

Location: `apps/web/src/components/admin/department-user-picker.tsx`
(matches the existing `admin-sidebar.tsx` neighbour).

**Contract:**

```ts
interface UserOption {
  id: string;
  display_name: string;
}

interface DepartmentUserPickerProps {
  departmentId: string;
  currentUserId: string | null;
  users: readonly UserOption[];        // already-filtered active users
  onSaved?: () => void;                // for query invalidation hook
}
```

**Behaviour:**

- Renders a shadcn `<Select>` with the current user pre-selected (or "Unassigned"
  sentinel).
- A separate "Clear binding" option at the bottom of the dropdown
  (`value="__clear__"`) maps to `userId: null`.
- On change: optimistic local state update → call
  `trpc.departments.setDefaultUser.useMutation()` → on success:
  `utils.departments.list.invalidate()` + toast → on error: revert local state +
  error toast.
- `disabled` while the mutation is `isPending` so users can't chain rapid changes.
- Pure-component-ish: no internal queries; parent owns `users` and `currentUserId`.

### Changes to `/admin/departments/page.tsx`

Add the queries:

```tsx
const usersQuery = trpc.admin.users.list.useQuery();
const activeUsers = useMemo(
  () => (usersQuery.data ?? []).filter((u) => u.status === "active"),
  [usersQuery.data],
);
```

New column inserted between "Auto-answer" and "Device token":

```
Name      Group    Order  Auto-answer  Default user      Device token    Actions
Reception Front      0    Enabled      [ Alice    ▾ ]   abc123…         Edit Delete
Pharmacy  Clinical   1    Off          [ Unassigned ▾]  —              Edit Delete
Lab       Clinical   2    Off          [ Bob      ▾ ]   xyz789…         Edit Delete
```

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

**Edit dialog untouched.** Binding is a column-level interaction, deliberately
decoupled from the edit-everything-else dialog. Keeps the "no two-mutation
choreography on save" promise from Decision 2.

### Loading & empty states

- While `usersQuery.isLoading`: render a `disabled` Select with placeholder
  "Loading users…".
- If `activeUsers.length === 0`: render `disabled` Select with "No active users
  available" (rare — admin always counts as a user, but defensive).
- If `currentUserId` is set but the user isn't in the active-users list (e.g.,
  recently deactivated): show `(inactive)` label suffix in the Select trigger and
  allow clearing. This is the only edge case where rendered state diverges from
  the dropdown options.

---

## Testing Plan

### Server-side tests — `apps/web/src/server/trpc/routers/departments.test.ts` (NEW)

The existing `departments.ts` router has **zero test coverage**. This ticket adds
the file with a focused 6-case suite for `setDefaultUser`. Existing CRUD mutations
stay untested in this ticket (out of scope — separate test-coverage ticket).

```
RED → GREEN cases for setDefaultUser:

1. happy path: tenant_admin binds an active user
   → dept.default_user_id updates, audit row written, returns { id, default_user_id }
2. clear binding: passing userId: null sets default_user_id = null
   → audit row written with before: { default_user_id: <prev> }, after: { default_user_id: null }
3. non-admin rejected: protectedProcedure caller (role: "host") → FORBIDDEN
   (verifies adminProcedure middleware is on the path)
4. cross-org department rejected: caller in Org A passes a Dept B id → NOT_FOUND
   (L6 tenant guard verification, no info leak)
5. cross-org user rejected: caller in Org A passes a User B id → NOT_FOUND
   (L6 tenant guard verification, no info leak)
6. inactive user rejected: caller passes a user with status "inactive" → BAD_REQUEST
   (explicit defense-in-depth check)
```

Plus 1 audit-log shape assertion across cases 1 + 2: confirm
`entity: "Department"`, `action: "UPDATE"`, and `before`/`after` payload shape
match the contract.

Test infrastructure already exists (vitest live since Phase 7 #2, coverage gate
live since #5). Pattern lifted from
`apps/web/src/server/trpc/routers/meetings.test.ts` (closest existing router
test — same `createCaller` + seeded org pattern).

### Coverage gate

After this ticket the per-file gate on
`apps/web/src/server/trpc/routers/auth.ts` stays at 100/80.95/100/100
(unchanged — different file). Global floor (12/6/12/12) passes with wide margin.
The new `setDefaultUser` mutation in `departments.ts` is the only newly-covered
surface; the 6 cases drive every branch of that mutation (happy path, clear,
non-admin, cross-org dept, cross-org user, inactive user). The rest of
`departments.ts` (existing CRUD + csvImport + regenerateDeviceToken) remains
untested in this ticket per Decision-style scope fence.

### Client-side

No unit test for `<DepartmentUserPicker>` per Decision 7. Visual QA in the
`(rule-16-cleanup)` ticket will cover the UI surface end-to-end alongside the
Phase 7 #12 green-dot smoke.

### Validation gates (Rule 25 + `[[instrumentation-edge-stub-required]]`)

```
pnpm test                          — 117 → 123+ cases, all GREEN
pnpm typecheck                     — 0 errors across all packages
pnpm lint                          — 0 errors, no new warnings
pnpm build                         — 27 routes ✓ (MANDATORY per
                                     [[instrumentation-edge-stub-required]];
                                     router changes are in the instrumentation
                                     chain transitively)
pnpm audit --audit-level=critical  — exit 0 (Phase 7 #9 + #10 still in effect)
```

---

## Scope Fences

| Out of scope | Why | When |
|---|---|---|
| In-call state overlay on the Speed Dial Board | Distinct ticket — `(in-call-state)` is the other queued #12 deferred scope | Next Phase 7 ticket if user picks it |
| Adding test coverage to existing CRUD mutations (`create` / `update` / `delete` / `csvImport` / `regenerateDeviceToken`) | Would balloon scope; existing patterns are stable | Separate test-debt ticket |
| Replacing `<Select>` with `<Combobox>` (search-enabled picker) | Premature for typical org sizes; trivial future swap | When an org reports >50 active users and admins complain |
| Self-binding restriction (preventing admin from binding themselves) | Not required by spec; admin IS a valid speed-dial target | Never unless requested |
| Inviting/creating a user from inside the dropdown | YAGNI — admins go to `/admin/users` to create | Never |
| Visual QA smoke test | Covered by `(rule-16-cleanup)` ticket which already tracks Phase 7 #12 green-dot smoke | When `(rule-16-cleanup)` is picked |
| Real-time push to the Speed Dial Board after rebinding | Page refresh / next socket reconnect picks up the new binding | Future ticket if needed |
| `departments.list` joined `default_user { display_name }` Prisma include | Client-side join with `admin.users.list` data (Decision 3) makes this unnecessary | Never unless `admin.users.list` is removed |

---

## Files Touched (Inventory)

| Action | Path | Approximate size |
|---|---|---|
| NEW | `apps/web/src/server/trpc/routers/departments.test.ts` | ~180 lines (6 cases + setup) |
| NEW | `apps/web/src/components/admin/department-user-picker.tsx` | ~80 lines |
| NEW | `docs/superpowers/specs/2026-05-17-admin-binding-ui-design.md` | this file |
| NEW | `docs/superpowers/plans/2026-05-17-admin-binding-ui.md` | by writing-plans skill |
| MODIFIED | `apps/web/src/server/trpc/routers/departments.ts` | +60 / -0 (new mutation + `default_user_id` in select) |
| MODIFIED | `apps/web/src/app/admin/departments/page.tsx` | +15 / -0 (new column, query, picker import) |
| MODIFIED (governance) | `docs/CHANGELOG_AI.md` / `IMPLEMENTATION_MAP.md` / `.cline/STATE.md` / `.cline/memory/agent-log.md` / `.whatsnext` | end-of-ticket |

---

## Tier Classification (memory-governance.md §1)

| Metric | Count |
|---|---|
| Files created | 3 |
| Files modified | 2 |
| Files for context (read-only) | ~5 (trpc.ts, admin.ts, meetings.test.ts, schema.prisma, db helpers) |
| Modules touched | 2 (apps/web/server + apps/web/components+app) |
| Dependency depth | 2 |
| Score | (5 × 2.5) + (2 × 5) + (2 × 3) = **28.5** < 40 |

**Tier 2 — moderate. Single-session execution, no Sonnet dispatch, no §2.5b
Opus-executor escalation needed.** Token estimate ~45K Opus 4.7 (well under the
80K SAFE zone).

---

## Two-Stage Review Checklist (Rule 25 — referenced by writing-plans)

**Stage 1 — spec compliance:**
- Dedicated `setDefaultUser({ departmentId, userId | null })` mutation exists
- Org-scoping verified via `adminProcedure` + L6 (cases 4 + 5)
- Set `null` clears binding (case 2)
- Cross-org rejection (cases 4 + 5)
- Inactive user rejection (case 6)
- Audit log written on every change (cases 1 + 2 + audit assertion)
- UI dropdown sources from `admin.users.list` filtered to active users
- Currently-bound user displayed in the column
- Edit dialog untouched (decoupled flows)

**Stage 2 — code quality:**
- No `any` types introduced
- Tests written BEFORE implementation (RED → GREEN per Rule 25)
- Scope strictly = the files in the inventory; no unrelated edits
- Conventional commits per branch (e.g. `feat(departments): add setDefaultUser`)
- `<DepartmentUserPicker>` is a small composable piece (~80 lines)
