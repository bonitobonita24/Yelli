# Department-Binding Presence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Phase 7 #11 user-level presence engine into `<SpeedDialGrid>` so each Speed Dial button shows a real online/offline dot driven by a designated user's socket state.

**Architecture:** Add nullable `default_user_id` FK on `Department` → `User`. Extract two pure helpers (`extractBoundUserIds`, `selectDepartmentPresence`) tested in node env per `[[pure-helper-extraction-pattern]]`. `<SpeedDialGrid>` composes them and calls `useUserPresence(boundUserIds)` from Phase 7 #11. No new server emit type. Legacy `usePresence` stub deleted.

**Tech Stack:** Next.js 15.5.18, Prisma, PostgreSQL, TypeScript strict, Vitest (node env), React 19, Tailwind, shadcn/ui, Auth.js v5, Socket.IO (auth-gated, Phase 7 #8e+).

**Spec:** `docs/superpowers/specs/2026-05-17-department-binding-design.md`

---

## Task 0: Pre-flight + branch

**Files:**
- Read-only: `apps/web/src/components/speed-dial/speed-dial-grid.tsx`
- Read-only: any callsite that renders `<SpeedDialGrid>` (located in this task)

- [ ] **Step 1: Verify clean main**

Run: `git status`
Expected: `nothing to commit, working tree clean`
If dirty: STOP. Resolve before continuing.

- [ ] **Step 2: Verify inputs.yml validates**

Run: `pnpm tools:validate-inputs`
Expected: exit 0
If fails: STOP. Phase 7 pre-flight per `.claude/rules/phases.md` requires this gate.

- [ ] **Step 3: Create feature branch**

Run: `git checkout -b feat/department-binding`
Expected: `Switched to a new branch 'feat/department-binding'`
If branch exists (resuming): `git checkout feat/department-binding` and inspect `git log feat/department-binding ^main` for prior partial work.

- [ ] **Step 4: Locate the `<SpeedDialGrid>` callsite**

Run: `grep -rn "SpeedDialGrid" apps/web/src --include="*.tsx" --include="*.ts"`
Expected: at least one consumer (likely `apps/web/src/app/app/page.tsx` or similar).
Record the file path + the surrounding `prisma.department.findMany({...})` call. This is the file we modify in Task 6.

- [ ] **Step 5: Verify no other `usePresence` consumers**

Run: `grep -rn 'from "@/lib/presence/use-presence"' apps/web/src --include="*.tsx" --include="*.ts"`
Expected: ONLY `apps/web/src/components/speed-dial/speed-dial-grid.tsx`
If other consumers exist: STOP. Spec assumes single consumer. Update spec before proceeding.

- [ ] **Step 6: Confirm `vi.mock` pattern available**

Run: `grep -rn "vi.mock" apps/web/src --include="*.test.ts" --include="*.test.tsx" | head -5`
Expected: pattern is used elsewhere (e.g. `session-invalidation.test.ts` per Phase 7 #10 / `presence.test.ts` per Phase 7 #11).

No commit for Task 0 — pre-flight only.

---

## Task 1: RED — pure helper tests

**Files:**
- Create: `apps/web/src/components/speed-dial/department-presence.ts` (declarations only — empty exports for now)
- Create: `apps/web/src/components/speed-dial/department-presence.test.ts`

- [ ] **Step 1: Create stub helper file**

Write `apps/web/src/components/speed-dial/department-presence.ts`:

```ts
/**
 * Pure presence-derivation helpers for the Speed Dial Board.
 * Node-testable per [[pure-helper-extraction-pattern]] — no React deps.
 */
import type { PresenceState } from "@/lib/presence/types";

export interface DepartmentBinding {
  id: string;
  default_user_id: string | null;
}

export function extractBoundUserIds(
  _departments: ReadonlyArray<DepartmentBinding>,
): string[] {
  throw new Error("not implemented");
}

export function selectDepartmentPresence(
  _department: DepartmentBinding,
  _online: Readonly<Record<string, boolean>>,
): PresenceState {
  throw new Error("not implemented");
}
```

- [ ] **Step 2: Write the failing tests**

Write `apps/web/src/components/speed-dial/department-presence.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  extractBoundUserIds,
  selectDepartmentPresence,
  type DepartmentBinding,
} from "./department-presence";

describe("extractBoundUserIds", () => {
  it("returns empty array for empty input", () => {
    expect(extractBoundUserIds([])).toEqual([]);
  });

  it("returns only non-null default_user_id values", () => {
    const depts: DepartmentBinding[] = [
      { id: "d1", default_user_id: "u1" },
      { id: "d2", default_user_id: null },
      { id: "d3", default_user_id: "u3" },
    ];
    expect(extractBoundUserIds(depts)).toEqual(["u1", "u3"]);
  });

  it("preserves order matching the input department order", () => {
    const depts: DepartmentBinding[] = [
      { id: "d1", default_user_id: "u-late" },
      { id: "d2", default_user_id: "u-early" },
    ];
    expect(extractBoundUserIds(depts)).toEqual(["u-late", "u-early"]);
  });

  it("does NOT deduplicate (caller responsibility if needed)", () => {
    const depts: DepartmentBinding[] = [
      { id: "d1", default_user_id: "u1" },
      { id: "d2", default_user_id: "u1" },
    ];
    expect(extractBoundUserIds(depts)).toEqual(["u1", "u1"]);
  });
});

describe("selectDepartmentPresence", () => {
  it("returns 'online' when bound user is online", () => {
    const dept: DepartmentBinding = { id: "d1", default_user_id: "u1" };
    expect(selectDepartmentPresence(dept, { u1: true })).toBe("online");
  });

  it("returns 'offline' when bound user is offline", () => {
    const dept: DepartmentBinding = { id: "d1", default_user_id: "u1" };
    expect(selectDepartmentPresence(dept, { u1: false })).toBe("offline");
  });

  it("returns 'offline' when bound user missing from presence map", () => {
    const dept: DepartmentBinding = { id: "d1", default_user_id: "u1" };
    expect(selectDepartmentPresence(dept, {})).toBe("offline");
  });

  it("returns 'offline' when default_user_id is null (unbound)", () => {
    const dept: DepartmentBinding = { id: "d1", default_user_id: null };
    expect(selectDepartmentPresence(dept, { u1: true })).toBe("offline");
  });

  it("treats undefined presence entry as offline (no crash)", () => {
    const dept: DepartmentBinding = { id: "d1", default_user_id: "u-unknown" };
    expect(selectDepartmentPresence(dept, { u1: true })).toBe("offline");
  });
});
```

- [ ] **Step 3: Run tests — confirm RED**

Run: `pnpm --filter @yelli/web test department-presence`
Expected: 9 tests FAIL with `Error: not implemented`.
If 0 tests fail: the test file isn't being picked up — check vitest config glob.

No commit yet — RED proven, GREEN next.

---

## Task 2: GREEN — implement pure helpers

**Files:**
- Modify: `apps/web/src/components/speed-dial/department-presence.ts`

- [ ] **Step 1: Replace stub bodies with implementations**

Edit `apps/web/src/components/speed-dial/department-presence.ts` — replace the two `throw new Error("not implemented")` bodies:

```ts
export function extractBoundUserIds(
  departments: ReadonlyArray<DepartmentBinding>,
): string[] {
  const out: string[] = [];
  for (const d of departments) {
    if (d.default_user_id !== null) out.push(d.default_user_id);
  }
  return out;
}

export function selectDepartmentPresence(
  department: DepartmentBinding,
  online: Readonly<Record<string, boolean>>,
): PresenceState {
  if (department.default_user_id === null) return "offline";
  return online[department.default_user_id] === true ? "online" : "offline";
}
```

- [ ] **Step 2: Run tests — confirm GREEN**

Run: `pnpm --filter @yelli/web test department-presence`
Expected: 9 tests PASS in <2s.
If any test fails: re-read the failing assertion against the implementation. Do NOT loosen the test.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/speed-dial/department-presence.ts \
        apps/web/src/components/speed-dial/department-presence.test.ts
git commit -m "feat(speed-dial): add pure presence-derivation helpers

extractBoundUserIds(departments) and selectDepartmentPresence(dept, online)
are node-testable per [[pure-helper-extraction-pattern]]. RED-GREEN proven
with 9 cases covering bound/unbound/missing-from-map and ordering.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Wire helpers into `<SpeedDialGrid>`

**Files:**
- Modify: `apps/web/src/components/speed-dial/speed-dial-grid.tsx`

- [ ] **Step 1: Extend the local `Department` interface**

In `apps/web/src/components/speed-dial/speed-dial-grid.tsx`, find the `interface Department { ... }` declaration (around lines 11-18) and add the new field:

```tsx
interface Department {
  id: string;
  name: string;
  description: string | null;
  group_label: string | null;
  sort_order: number;
  auto_answer_enabled: boolean;
  default_user_id: string | null;
}
```

- [ ] **Step 2: Replace imports**

Replace:
```tsx
import { usePresence } from "@/lib/presence/use-presence";
```

With:
```tsx
import {
  extractBoundUserIds,
  selectDepartmentPresence,
} from "@/components/speed-dial/department-presence";
import { useUserPresence } from "@/lib/presence/use-user-presence";
```

- [ ] **Step 3: Swap the presence call inside `SpeedDialGrid`**

Replace these two lines inside `SpeedDialGrid` (around lines 33-35):

```tsx
const router = useRouter();
const ids = departments.map((d) => d.id);
const presence = usePresence(ids);
```

With:

```tsx
const router = useRouter();
const boundUserIds = extractBoundUserIds(departments);
const online = useUserPresence(boundUserIds);
```

- [ ] **Step 4: Update the `<SpeedDialButton presenceState={...}>` prop**

Find the JSX block that renders `<SpeedDialButton>` (around line 113-121) and replace:

```tsx
presenceState={presence[dept.id] ?? "offline"}
```

With:

```tsx
presenceState={selectDepartmentPresence(dept, online)}
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @yelli/web typecheck`
Expected: 0 errors. The Server Component callsite hasn't been updated yet — if it errors on the missing `default_user_id` field, that's expected and gets fixed in Task 5; record the error message but don't try to fix here.

If typecheck errors are confined to the consumer callsite (the file located in Task 0 Step 4): proceed.
If typecheck errors are inside `speed-dial-grid.tsx`: investigate before continuing.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/speed-dial/speed-dial-grid.tsx
git commit -m "feat(speed-dial): wire useUserPresence via pure helpers

SpeedDialGrid now derives per-department presence from the Phase 7 #11
user-level engine via extractBoundUserIds + selectDepartmentPresence.
Department interface widened with default_user_id. Server Component
callsite update follows in next commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Delete legacy `use-presence.ts`

**Files:**
- Delete: `apps/web/src/lib/presence/use-presence.ts`

- [ ] **Step 1: Re-verify no consumers remain**

Run: `grep -rn 'from "@/lib/presence/use-presence"' apps/web/src --include="*.tsx" --include="*.ts"`
Expected: NO results (Task 3 removed the import).
If any result: STOP. There's a consumer we missed. Update Task 3 to handle it.

- [ ] **Step 2: Delete the file**

Run: `git rm apps/web/src/lib/presence/use-presence.ts`
Expected: file removed from working tree and staged.

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @yelli/web typecheck`
Expected: same state as Task 3 Step 5 (Server Component callsite error remains, no new errors from the deletion).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(presence): remove legacy department-level usePresence stub

Sole consumer (SpeedDialGrid) migrated to useUserPresence via
pure helpers in prior commit. Closes the migration started in
Phase 7 #11 — see [[parallel-socket-servers-coexistence]] note
about the legacy /api/socket server's presence:update event,
which never fired and is now orphaned. (legacy-socket-retirement
ticket will collapse the parallel server itself.)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Update Server Component query callsite

**Files:**
- Modify: the file located in Task 0 Step 4 (likely `apps/web/src/app/app/page.tsx` — use the recorded path)

- [ ] **Step 1: Add `default_user_id` to the Prisma select**

Open the callsite file. Locate the `prisma.department.findMany({...})` call. Add `default_user_id: true` to the `select:` object:

```ts
const departments = await prisma.department.findMany({
  where: { /* unchanged */ },
  select: {
    id: true,
    name: true,
    description: true,
    group_label: true,
    sort_order: true,
    auto_answer_enabled: true,
    default_user_id: true,  // NEW — Phase 7 #12 department-binding
  },
  orderBy: { sort_order: "asc" },
});
```

If the callsite uses `include:` or no select clause: `default_user_id` is already available via the default Prisma model — no change needed; verify by checking the prop type passed to `<SpeedDialGrid>`.

- [ ] **Step 2: Widen the prop type (if hand-rolled at the callsite)**

If the callsite declares its own `Department` interface or type alias for the prop, add `default_user_id: string | null` to it. If the prop is typed via `Prisma.DepartmentGetPayload<...>` or similar generated type, the new field flows through automatically once the schema is updated in Task 7.

- [ ] **Step 3: Defer typecheck**

Typecheck will fail here until Task 7 adds the column to the Prisma schema (the `select.default_user_id` line will be flagged). That's expected — record the error, do NOT add `// @ts-ignore`, proceed to Task 6.

- [ ] **Step 4: Commit**

```bash
git add <callsite-path-from-Task-0>
git commit -m "feat(departments): select default_user_id for Speed Dial binding

Server Component now passes department.default_user_id through to
SpeedDialGrid. Schema column added in next commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Prisma schema + migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_add_department_default_user_id/migration.sql`

- [ ] **Step 1: Add `default_user_id` to the `Department` model**

In `packages/db/prisma/schema.prisma`, locate the `model Department { ... }` block. Add the field and relation. Field placement: after `auto_answer_enabled`, before any `@@` block-level attributes.

```prisma
model Department {
  // ... existing fields ...
  auto_answer_enabled Boolean  @default(false)

  default_user_id String?  @db.Uuid
  default_user    User?    @relation("DepartmentDefaultUser", fields: [default_user_id], references: [id], onDelete: SetNull)

  // ... existing relations ...

  @@index([default_user_id])
}
```

- [ ] **Step 2: Add the inverse relation to the `User` model**

Locate the `model User { ... }` block. Add the inverse relation field:

```prisma
model User {
  // ... existing fields ...
  default_for_departments Department[] @relation("DepartmentDefaultUser")
  // ... rest of relations ...
}
```

The named relation `"DepartmentDefaultUser"` is REQUIRED because Department→User may already have another relation (e.g. organization owner, tenant_admin). The explicit name prevents Prisma's ambiguous-relation error.

- [ ] **Step 3: Generate migration**

Run: `pnpm --filter @yelli/db exec prisma migrate dev --name add_department_default_user_id --create-only`
Expected: new migration directory created under `packages/db/prisma/migrations/` containing `migration.sql`.

- [ ] **Step 4: Inspect generated SQL**

Read the generated `migration.sql`. Expected content (Postgres):

```sql
-- AlterTable
ALTER TABLE "departments" ADD COLUMN "default_user_id" UUID;

-- CreateIndex
CREATE INDEX "departments_default_user_id_idx" ON "departments"("default_user_id");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_default_user_id_fkey" FOREIGN KEY ("default_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

If the generated SQL diverges materially (e.g. `NOT NULL`, no index, different `ON DELETE`): edit the file to match — Prisma's generator can be inconsistent across versions.

- [ ] **Step 5: Apply migration to dev DB**

Run: `pnpm --filter @yelli/db exec prisma migrate dev`
Expected: migration applied; `Prisma Client generated` message.

- [ ] **Step 6: Regenerate Prisma client**

Run: `pnpm --filter @yelli/db exec prisma generate`
Expected: client regenerated. `Department` type now includes `default_user_id: string | null`.

- [ ] **Step 7: Run typecheck across the workspace**

Run: `pnpm typecheck`
Expected: 0 errors. The Task 5 callsite typecheck error and the Task 3 grid integration are both unblocked by the new schema field.
If errors remain: read each error, address at source — do NOT cast or suppress.

- [ ] **Step 8: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat(db): add Department.default_user_id (FK → users)

Nullable UUID FK with ON DELETE SET NULL — when the bound user is
removed, the department gracefully degrades to unconfigured (renders
as offline). Indexed for fan-out queries on user presence.

Inverse relation named DepartmentDefaultUser to disambiguate from
any future Department→User relations.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Optional seed update for Visual QA

**Files:**
- Modify (CONDITIONAL): `packages/db/prisma/seed.ts`

- [ ] **Step 1: Check whether seed.ts seeds departments**

Run: `grep -n "department" packages/db/prisma/seed.ts 2>/dev/null || echo "NO_SEED"`
If `NO_SEED` or grep returns no matches: skip this task entirely. The migration is non-destructive; existing rows have `default_user_id = NULL` which renders as offline.

- [ ] **Step 2: Bind one seeded department to one seeded user**

If departments ARE seeded, modify the seed script to set `default_user_id` on at least one demo department to a seeded user's id. This gives Visual QA something to verify (green dot when that user is signed in).

Example pattern (adapt to actual seed structure):

```ts
const demoUser = await prisma.user.findFirst({ where: { email: "webmaster@yelli.local" } });
if (demoUser) {
  await prisma.department.updateMany({
    where: { name: "Reception" },
    data: { default_user_id: demoUser.id },
  });
}
```

- [ ] **Step 3: Re-run seed**

Run: `pnpm --filter @yelli/db exec prisma db seed`
Expected: seed completes; one or more departments now have a bound user.

- [ ] **Step 4: Commit (only if seed was modified)**

```bash
git add packages/db/prisma/seed.ts
git commit -m "feat(seed): bind demo department to demo user for Speed Dial QA

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Full validation suite

**Files:** none modified

- [ ] **Step 1: Run unit + integration tests**

Run: `pnpm test`
Expected: previous 108 → 117 (+9 new from department-presence.test.ts) all GREEN, ~1.4s runtime.

- [ ] **Step 2: Run typecheck across all packages**

Run: `pnpm typecheck`
Expected: 0 errors across all 8 packages.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: 0 errors. Pre-existing warnings (bcrypt named-export, root-layout no-css-tags) unchanged.

- [ ] **Step 4: Run build (MANDATORY)**

Run: `pnpm build`
Expected: 27 routes compiled successfully in ~60-70s.
Why mandatory: `[[instrumentation-edge-stub-required]]` — schema change → Prisma generate → potential type-import bundle impact. `pnpm test/typecheck/lint` cannot catch Edge-bundle webpack failures.
If build fails: read the error against the Phase 7 #10 webpack alias documentation in `next.config.ts` — likely a Prisma client import path issue. Do NOT proceed to Step 5 until build is green.

- [ ] **Step 5: Run dependency audit**

Run: `pnpm audit --audit-level=critical`
Expected: exit 0. Phase 7 #9 nodemailer CVE acceptance + Phase 7 #10 CLI flag enforcement still in effect.

- [ ] **Step 6: Verify migration is idempotent**

Run: `pnpm --filter @yelli/db exec prisma migrate status`
Expected: `Database schema is up to date!`

No commit for Task 8 — validation only.

---

## Task 9: Two-stage code review (Rule 25)

**Files:** none modified — review only.

- [ ] **Step 1: Stage 1 — Spec compliance check**

Re-read `docs/superpowers/specs/2026-05-17-department-binding-design.md`. Verify each locked decision:

| # | Decision | Verified by |
|---|---|---|
| 1 | `default_user_id` nullable FK on Department | Task 6 schema + migration |
| 2 | Client-side resolution via `useUserPresence` | Task 3 imports + call |
| 3 | `in_call` deferred — `PresenceState` only emits online/offline | `selectDepartmentPresence` returns "online" \| "offline" only |
| 4 | No admin UI | No `/admin/departments` edit changes in this PR |
| 5 | Unbound dept = offline | Task 1 test case `selectDepartmentPresence(null FK)` returns "offline" |

If any decision is NOT verified: STOP. Fix before proceeding.

- [ ] **Step 2: Stage 2 — Code quality check**

Run: `git diff main...HEAD` and verify:

- [ ] No `any` types introduced (`grep -P '\bany\b' $(git diff main...HEAD --name-only -- '*.ts' '*.tsx')` should return zero non-comment hits)
- [ ] No type assertions without comment (`grep -E ' as [A-Z]' $(git diff main...HEAD --name-only -- '*.ts' '*.tsx')` — any hit must have an inline rationale comment)
- [ ] Tests were written BEFORE implementation (verify by `git log --oneline feat/department-binding ^main` — commit message containing tests-only comes before the GREEN impl commit OR a single combined commit contains both — visible per Task 1/2 boundary)
- [ ] Scope is blast-radius-only — `git diff --name-only main...HEAD` should match this list:
  - `apps/web/src/components/speed-dial/department-presence.ts`
  - `apps/web/src/components/speed-dial/department-presence.test.ts`
  - `apps/web/src/components/speed-dial/speed-dial-grid.tsx`
  - `apps/web/src/lib/presence/use-presence.ts` (DELETED)
  - `<callsite-path>` (Server Component query update)
  - `packages/db/prisma/schema.prisma`
  - `packages/db/prisma/migrations/<ts>_add_department_default_user_id/migration.sql`
  - `packages/db/prisma/seed.ts` (CONDITIONAL — only if Task 7 fired)
- [ ] All commit messages use conventional format (`feat(scope):`, `chore(scope):`)
- [ ] Pure helpers (Task 2 deliverable) have NO React imports — verify with `grep -n "react" apps/web/src/components/speed-dial/department-presence.ts` returns nothing

If any item fails: fix and re-verify before Task 10.

No commit for Task 9 — review only.

---

## Task 10: Governance writes (non-blocking — Rule 3)

**Files:**
- Modify: `docs/CHANGELOG_AI.md`
- Modify: `docs/IMPLEMENTATION_MAP.md`
- Modify: `.cline/STATE.md`
- Modify: `.cline/memory/agent-log.md`
- Modify: `.whatsnext`
- Modify: `.cline/memory/lessons.md` (CONDITIONAL — only if new pattern emerged)

- [ ] **Step 1: Prepend Phase 7 #12 entry to `docs/CHANGELOG_AI.md`**

Insert at the TOP of the reverse-chronological block (per existing pattern):

```markdown
## 2026-05-17 — Phase 7 #12: Department-binding presence

- **Agent:** CLAUDE_CODE
- **Why:** Wire Phase 7 #11 user-level engine into Speed Dial Board so per-department dots reflect real online state.
- **Files added:**
  - `apps/web/src/components/speed-dial/department-presence.ts` (pure helpers — 30 lines)
  - `apps/web/src/components/speed-dial/department-presence.test.ts` (9 cases)
  - `packages/db/prisma/migrations/<ts>_add_department_default_user_id/migration.sql`
- **Files modified:**
  - `apps/web/src/components/speed-dial/speed-dial-grid.tsx` (Department interface +1 field; usePresence → useUserPresence via helpers)
  - `packages/db/prisma/schema.prisma` (Department.default_user_id + inverse on User)
  - `<callsite-path>` (Prisma select +1 field)
  - `packages/db/prisma/seed.ts` (CONDITIONAL — demo binding for Visual QA)
- **Files deleted:**
  - `apps/web/src/lib/presence/use-presence.ts` (legacy stub — sole consumer migrated)
- **Schema/migrations:** `<timestamp>_add_department_default_user_id` — additive, non-destructive, ON DELETE SET NULL.
- **Errors encountered:** [list anything caught in Task 8 + how it was fixed, or "none"]
- **Errors resolved:** [as above]
```

- [ ] **Step 2: Update `docs/IMPLEMENTATION_MAP.md`**

Add a new Phase 7 #12 entry at the top of the Built So Far section. Demote the Phase 7 #11 paragraph to second position.

- [ ] **Step 3: Rewrite `.cline/STATE.md`**

Update:
- `PHASE:` "Phase 7 active — twelfth Feature Update on branch feat/department-binding pending squash-merge. Phase 7 #12 (department-binding) wires presence engine into Speed Dial via two pure helpers..."
- `LAST_DONE:` describe Tier 2 single-session, files touched, validation results
- `NEXT:` Phase 7 #13 candidates — promote (i) password_reset cleanup OR (admin-binding-ui) as the natural follow-up; demote (department-binding)
- `GIT_BRANCH:` `feat/department-binding` (or `main` after merge in Task 11)
- `TOKEN_ESTIMATE:`, `CHECKPOINT_TYPE: full`, `FILES_TOUCHED_THIS_SESSION:` per existing schema
- `TIER_CLASSIFICATION:` per spec (7 files, 2 modules, depth 2, score 33.5, Tier 2)

- [ ] **Step 4: Append to `.cline/memory/agent-log.md`**

```
CLAUDE_CODE | 2026-05-17 | Phase 7 #12 department-binding complete on branch feat/department-binding — 7 files, +N lines, 9 new tests (117/117 ✓), build ✓ 27 routes, audit ✓ exit 0. Two-stage review PASS. Squash-merge pending in Task 11.
```

- [ ] **Step 5: Update `.whatsnext`**

- Close `(department-binding)` line: move out of candidates list, add a "Phase 7 #12 shipped on 2026-05-17" paragraph at the top of the Phase 7 section (mirror the #11 format)
- Promote next recommended candidate. Suggested: `(admin-binding-ui)` as NEW candidate ("Admin UI for assigning default_user_id — Tier 1-2") OR keep (i) password_reset cleanup as RECOMMENDED NEXT
- Add `(rule-16-cleanup)` line for #12: "Speed Dial green-dot smoke — sign in as bound user in one tab, verify dot turns green within ~1s of socket handshake; sign out, verify dot returns to gray within ~45s"

- [ ] **Step 6: CONDITIONAL — append lesson if novel pattern emerged**

If anything non-obvious was learned (e.g. Prisma named-relation requirement, jsdom-free RTL pattern, Server Component → client prop typing gotcha): write a Rule-18 typed entry to `.cline/memory/lessons.md`.
If nothing surprising came up: skip — do NOT pad lessons with restated documentation.

- [ ] **Step 7: Commit governance**

```bash
git add docs/CHANGELOG_AI.md docs/IMPLEMENTATION_MAP.md \
        .cline/STATE.md .cline/memory/agent-log.md .whatsnext \
        .cline/memory/lessons.md
git commit -m "docs(governance): Phase 7 #12 department-binding records

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 11: Squash-merge to main (Rule 23)

**Files:** none modified — git operations only.

- [ ] **Step 1: Verify branch is clean**

Run: `git status`
Expected: `nothing to commit, working tree clean`

- [ ] **Step 2: Switch to main**

Run: `git checkout main`
Expected: `Switched to branch 'main'`

- [ ] **Step 3: Squash-merge the feature branch**

Run: `git merge --squash feat/department-binding`
Expected: changes staged but not committed; merge summary printed.

- [ ] **Step 4: Create the squash commit**

```bash
git commit -m "feat(presence): department-binding — wire user-level engine into Speed Dial (Phase 7 #12)

Adds nullable default_user_id FK on Department → User. Two pure helpers
(extractBoundUserIds, selectDepartmentPresence) compose the wiring,
tested node-side per [[pure-helper-extraction-pattern]]. SpeedDialGrid
now consumes useUserPresence(boundUserIds) from Phase 7 #11. Legacy
usePresence stub deleted.

Migration is additive and non-destructive: ON DELETE SET NULL means
removing the bound user gracefully degrades the department to offline.
Unbound departments (NULL FK) render as offline — matches existing UX.

Validation: pnpm test 117/117 ✓ (+9 from 108), pnpm typecheck ✓ 0,
pnpm lint ✓ 0, pnpm build ✓ 27 routes, pnpm audit ✓ exit 0.
Two-stage review (Rule 25) PASS.

Spec: docs/superpowers/specs/2026-05-17-department-binding-design.md
Plan: docs/superpowers/plans/2026-05-17-department-binding.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

- [ ] **Step 5: Delete the feature branch**

Run: `git branch -d feat/department-binding`
Expected: `Deleted branch feat/department-binding (was <sha>).`
If git complains the branch is not fully merged (because we squash-merged): use `git branch -D feat/department-binding` — content is preserved in the squash commit.

- [ ] **Step 6: Final post-merge validation**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build && pnpm audit --audit-level=critical`
Expected: all green on main.

- [ ] **Step 7: Record the squash SHA**

Run: `git rev-parse --short HEAD`
Update `.cline/STATE.md` PHASE line to record the squash SHA. Append a one-line follow-up governance commit (per existing Phase 7 #11 pattern — see commit `f1b1b16`):

```bash
git add .cline/STATE.md
git commit -m "chore(governance): record Phase 7 #12 squash SHA — <sha>

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Validation summary (expected end-state)

| Gate | Before | After |
|---|---|---|
| `pnpm test` | 108 ✓ | 117 ✓ (+9 from department-presence.test.ts) |
| `pnpm typecheck` | 0 errors | 0 errors |
| `pnpm lint` | 0 errors | 0 errors |
| `pnpm build` | 27 routes ✓ | 27 routes ✓ |
| `pnpm audit --audit-level=critical` | exit 0 | exit 0 |
| `pnpm db:migrate status` | up to date | up to date (+1 migration applied) |
| Speed Dial UX | All dots gray | Green dot when bound user online; gray otherwise |
| Code surface | `usePresence` stub all-offline | `useUserPresence` via pure helpers, full path live |

## Definition of Done

- [ ] All 11 tasks complete
- [ ] Squash commit on main with conventional message
- [ ] Branch `feat/department-binding` deleted
- [ ] All 6 validation gates green on main
- [ ] Spec decisions all implemented (verified in Task 9 Stage 1)
- [ ] No `any` types, no suppressions, no orphan files
- [ ] STATE.md / CHANGELOG / IMPLEMENTATION_MAP all reflect Phase 7 #12 completion
- [ ] `.whatsnext` promotes next ticket
