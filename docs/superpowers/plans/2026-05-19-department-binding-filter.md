# Phase 7 #16 — department-binding-filter (implementation plan)

Date: 2026-05-19
Design spec: `docs/superpowers/specs/2026-05-19-department-binding-filter-design.md` (locked)
Tier: 1
Branch: `feat/department-binding-filter`
Predecessor squash: `af43276` (Phase 7 #15 legacy-socket-retirement)

## Execution model

Inline controller (Opus 4.7). No subagent dispatch unless mid-task thrash is observed — Tier 1 budget is well within Sonnet's 30K, but the 5-file fan-out + 7 RED→GREEN cases is small enough that controller-led execution costs less context than a dispatch cycle. If thrash appears during T1 or T2 (e.g. test file imports won't resolve, vi.mock factories misfire), escalate that single task to a reviewer subagent rather than rerunning Sonnet.

## Pre-flight

Before T1: confirm working tree clean on `main`, branch `feat/department-binding-filter` does not yet exist. Then `git checkout -b feat/department-binding-filter`.

```bash
git status                                          # expect: clean
git branch --list feat/department-binding-filter    # expect: empty
git checkout -b feat/department-binding-filter
```

If the branch already exists from a prior interrupted run: `git checkout feat/department-binding-filter` and inspect with `git log main..HEAD` per H3 (TYPE 4 recovery) before starting T1. Do NOT create a new branch.

---

## T1 — Pure filter helper (RED → GREEN)

**Scope.** Extract the dialog's filter into a node-testable pure helper, per [[pure-helper-extraction-pattern]].

**Files.**
- NEW `apps/web/src/lib/calls/select-incoming-call.ts`
- NEW `apps/web/src/lib/calls/select-incoming-call.test.ts`

**T1.a (RED) — write test file first.**
4 cases per spec §Test cases:
- `boundDeptIds === undefined` → `false`
- `boundDeptIds === []` → `false`
- mismatch (`["dept-a"]` vs `"dept-b"`) → `false`
- match in multi-binding (`["dept-a", "dept-c"]` vs `"dept-c"`) → `true`

Each test imports the (not-yet-existing) helper. Run `pnpm --filter @yelli/web test select-incoming-call` → all 4 cases RED (module not found is acceptable for RED phase one — write a stub file with the export signature before running again).

**T1.b (GREEN) — implement the helper.**

```ts
// apps/web/src/lib/calls/select-incoming-call.ts
import type { IncomingCallPayload } from "@/lib/livekit/types";

/**
 * Returns true iff the incoming call is destined for one of the current user's
 * bound departments. Returns false when boundDeptIds is undefined (query still
 * loading) or empty (user has no binding) — both treated as "do not ring" per
 * Phase 7 #16 design decisions 3 + 4.
 */
export function selectIncomingCall(
  payload: Pick<IncomingCallPayload, "recipientDeptId">,
  boundDeptIds: readonly string[] | undefined,
): boolean {
  if (boundDeptIds === undefined) return false;
  return boundDeptIds.includes(payload.recipientDeptId);
}
```

Run tests again → all 4 GREEN.

**T1.c — validate locally before commit.**
```bash
pnpm --filter @yelli/web typecheck
pnpm --filter @yelli/web test select-incoming-call
pnpm --filter @yelli/web lint apps/web/src/lib/calls/select-incoming-call.ts apps/web/src/lib/calls/select-incoming-call.test.ts
```

**Commit.**
```
git add apps/web/src/lib/calls/select-incoming-call.ts apps/web/src/lib/calls/select-incoming-call.test.ts
git commit -m "feat(calls): pure helper selectIncomingCall for dept-binding filter (Phase 7 #16 T1)"
```

---

## T2 — `departments.myBoundDepartmentIds` tRPC query (RED → GREEN)

**Scope.** Add the user→dept reverse lookup query the dialog will consume. Read-only, protectedProcedure, no audit log (per spec §6).

**Files.**
- MODIFIED `apps/web/src/server/trpc/routers/departments.ts`
- MODIFIED `apps/web/src/server/trpc/routers/departments.test.ts`

**T2.a (RED) — add test cases.**
3 cases per spec §Test cases. Reuse the existing vi.mock factories in `departments.test.ts` (`@yelli/db prisma + runWithTenantContext + writeAuditLog + rateLimiters`). Pattern per [[trpc-test-pattern]]:

- T3.1: `prisma.department.findMany` mocked to return `[]` → procedure returns `[]`.
- T3.2: `findMany` returns `[{id: "d1"}, {id: "d2"}]` → procedure returns `["d1", "d2"]` (verifies `.map(d => d.id)` shape, not raw Department[]).
- T3.3: assertion on `findMany` `where` argument — must be exactly `{ default_user_id: ctx.userId }` (L6 injects org_id transparently; do NOT pass it explicitly per `setDefaultUser` precedent in same file). Asserts no audit-log call.

Run tests → 3 RED (procedure does not exist).

**T2.b (GREEN) — add the procedure.**
Append to `departmentsRouter` block (placement: after `list`, before `create` — group reads together):

```ts
/**
 * Return the ids of every Department whose default_user_id equals the caller.
 * Used by IncomingCallDialog (Phase 7 #16) to filter call:incoming broadcasts
 * down to calls actually destined for this user. L6 scopes to caller's org.
 *
 * Returns string[] (not single id) because Department.default_user_id has no
 * @unique constraint — one user may man multiple departments (e.g. one
 * receptionist covering both Front Desk and Reception on a small deployment).
 */
myBoundDepartmentIds: protectedProcedure.query(async ({ ctx }) => {
  const rows = await prisma.department.findMany({
    where: { default_user_id: ctx.userId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}),
```

Run tests → 3 GREEN.

**T2.c — validate.**
```bash
pnpm --filter @yelli/web typecheck
pnpm --filter @yelli/web test departments
pnpm --filter @yelli/web lint apps/web/src/server/trpc/routers/departments.ts apps/web/src/server/trpc/routers/departments.test.ts
```

**Commit.**
```
git add apps/web/src/server/trpc/routers/departments.ts apps/web/src/server/trpc/routers/departments.test.ts
git commit -m "feat(departments): myBoundDepartmentIds query for incoming-call filter (Phase 7 #16 T2)"
```

---

## T3 — Wire query + helper into `IncomingCallDialog`

**Scope.** Replace the TODO with a real filter. Two new pieces inside the component:
1. `const { data: boundDeptIds } = trpc.departments.myBoundDepartmentIds.useQuery();`
2. Inside `handleIncoming`: short-circuit on `!selectIncomingCall(incoming, boundDeptIds)` before `setPayload` + `setOpen` + `startRingtone`.

**File.** MODIFIED `apps/web/src/components/call/incoming-call-dialog.tsx`.

**Diff sketch.**

```tsx
// header imports — add these two
import { trpc } from "@/lib/trpc/client";              // confirm import path matches existing usage in the file or its peers
import { selectIncomingCall } from "@/lib/calls/select-incoming-call";
```

Inside the component, after `const socket = useSocketOptional();`:

```tsx
const { data: boundDeptIds } = trpc.departments.myBoundDepartmentIds.useQuery();
```

Replace `handleIncoming` body:

```tsx
const handleIncoming = (incoming: IncomingCallPayload): void => {
  if (!selectIncomingCall(incoming, boundDeptIds)) {
    // Not for this user's bound department(s) — silently drop.
    // Phase 7 #16 design decisions 3+4: undefined (loading) and []
    // (no binding) both fall through to false here.
    return;
  }
  setPayload(incoming);
  setOpen(true);
  startRingtone();
};
```

`boundDeptIds` must be in the `useEffect` dependency array — re-register the listener when the query resolves so the captured closure uses the fresh array. Add it as the 4th dep: `[socket, boundDeptIds, startRingtone, stopRingtone]`.

**Remove** the entire TODO comment block (lines 85-89 in the current file).

**No new test.** React-hook component tests are deferred per Phase 7 #11/#14/#15 precedent — pure filter logic is fully covered by T1 helper tests, and the wiring is a 1-line useQuery + a 1-line conditional. Smoke test goes onto Rule 16 follow-up.

**T3.a — confirm `trpc` client import path.**
Before writing, grep for an existing `trpc.<router>.<x>.useQuery` call site in the dialog's neighbors to copy the exact import:

```bash
grep -rn "trpc\." apps/web/src/components --include="*.tsx" | head -3
```

If the project uses `@/lib/trpc/client` → use that. If `@/utils/trpc` → use that. Whatever the existing pattern is, copy it — do NOT introduce a second import path.

**T3.b — apply edit + validate.**
```bash
pnpm --filter @yelli/web typecheck
pnpm --filter @yelli/web test                 # full suite — confirms nothing else broke
pnpm --filter @yelli/web lint apps/web/src/components/call/incoming-call-dialog.tsx
```

**Commit.**
```
git add apps/web/src/components/call/incoming-call-dialog.tsx
git commit -m "feat(call): filter IncomingCallDialog by user's bound departments (Phase 7 #16 T3)"
```

---

## T4 — Full-suite validation

**Scope.** Run the locked validation contract from spec §Validation contract end-to-end on the branch.

```bash
pnpm typecheck                       # 0 errors, 8 packages
pnpm test                            # 160 + 7 = 167 passing
pnpm lint                            # 0 new errors (2 pre-existing warnings unchanged)
pnpm build                           # 22 routes — MANDATORY per [[instrumentation-edge-stub-required]]
pnpm audit --audit-level=critical    # exit 0 (1 HIGH = documented nodemailer)
```

Any failure → fix in-place on the branch (do not start T5 until all 5 commands pass cleanly). If a failure surfaces a real issue with the design (rather than a typo or wiring bug), update the spec doc with a 🟡 fix entry and re-run T1/T2/T3 as needed.

No commit — T4 is purely a gate.

---

## T5 — Two-stage review (Rule 25)

**Stage 1 — Spec compliance.** Walk each of the 8 locked decisions in the spec and confirm a code artifact exists:
1. tRPC query (not session-encoded) → `myBoundDepartmentIds` exists in `departments.ts`.
2. Return type `string[]` → procedure returns `rows.map(r => r.id)`, asserted in T3.2.
3. No-binding ignore → helper T1.2 case.
4. Loading drop → helper T1.1 case.
5. Pure helper extraction → file exists at `lib/calls/select-incoming-call.ts`.
6. No audit log → asserted in T3.3.
7. No new socket types/events → grep `lib/socket/types.ts` for diff — must be empty.
8. No cache invalidation wiring → grep dialog for `utils.departments.myBoundDepartmentIds.invalidate` — must be empty.

**Stage 2 — Code quality.**
- No `any` types introduced (grep new files for `: any` or `as any` — must be zero).
- No unjustified type assertions.
- Tests written before implementation (verified by RED phases in T1.a and T2.a).
- Only 5 blast-radius files touched (verify `git diff --stat main..HEAD`).
- Conventional commit format on all 3 task commits.
- `useEffect` dep array correctly includes `boundDeptIds`.

If either stage fails → fix, re-run T4, re-run T5. Do NOT proceed to T6 with stale review.

---

## T6 — Squash-merge to `main`

```bash
git checkout main
git merge --squash feat/department-binding-filter
git commit -m "feat(call): filter incoming-call by user's bound departments (Phase 7 #16)

Picks up the deferred-scope TODO from Phase 7 #15 in incoming-call-dialog.tsx.
After the legacy socket retirement landed, the dialog rang every org member
on call:incoming. This adds:

- NEW lib/calls/select-incoming-call.ts — pure filter helper (node-testable
  per [[pure-helper-extraction-pattern]])
- NEW departments.myBoundDepartmentIds tRPC query — read-only reverse lookup
  user → dept ids (string[], no @unique on default_user_id so multi-binding
  is legal)
- IncomingCallDialog wires useQuery + helper; drops payloads whose
  recipientDeptId is not in the user's bound set

Loading state (query in flight) and no-binding ([]) both fall through to
'do not ring' — design decisions 3+4. No session/JWT changes (binding is
mutable via Phase 7 #13 admin UI; session-encoding would go stale).

Test suite 160 → 167 (+7 RED→GREEN: 4 helper + 3 router).
typecheck ✓ · lint ✓ · build ✓ 22 routes · audit ✓ (1 HIGH = nodemailer
mitigation still in effect).

Closes (department-binding-filter)."

git branch -d feat/department-binding-filter
```

Capture squash SHA for the governance commit in T7.

---

## T7 — Governance updates

**Files.**
- `.cline/STATE.md` — rewrite: PHASE="Phase 7 #16 complete", LAST_DONE="department-binding-filter shipped", NEXT="Feature Update or Phase 8".
- `docs/CHANGELOG_AI.md` — append Phase 7 #16 entry per Rule 15 (Agent: CLAUDE_CODE).
- `docs/IMPLEMENTATION_MAP.md` — promote Phase 7 #16 to top of Project Status, demote #15 to prior detail.
- `.cline/memory/agent-log.md` — append plan + impl + governance entry.
- `.whatsnext` — close (department-binding-filter); promote next recommended candidate from the Phase 7 #16 candidate list ((i) BullMQ cleanup or (rule-16-cleanup)). Append the new smoke test for Phase 7 #16 to the Rule 16 follow-up section.
- `.cline/memory/lessons.md` — only if a 🔴/🟡/🟤 emerged during execution. Expected: zero new lessons (all patterns already encoded).

**Commit.**
```
git add .cline/STATE.md docs/CHANGELOG_AI.md docs/IMPLEMENTATION_MAP.md .cline/memory/agent-log.md .whatsnext
git commit -m "chore(governance): record Phase 7 #16 squash SHA — <SHA>"
```

---

## Output contract (Rule 25)

Before reporting Phase 7 #16 complete:
- [ ] All 3 task commits (T1, T2, T3) on `feat/department-binding-filter`.
- [ ] T4 validation: all 5 commands pass on branch HEAD.
- [ ] T5 two-stage review: Stage 1 PASS (8/8), Stage 2 PASS (6/6).
- [ ] Squash-merged to `main`; feature branch deleted.
- [ ] Governance commit recorded with squash SHA.
- [ ] `.whatsnext` reflects Phase 7 #16 closed + Phase 7 #17 candidates surfaced.
- [ ] No new lessons unless something novel emerged.

## Risks & mitigations

- **R1 — `trpc` client import path varies across the codebase.** Mitigation: T3.a grep step picks the existing pattern verbatim.
- **R2 — `useEffect` closure captures stale `boundDeptIds`.** Mitigation: add it to dep array explicitly; the existing array `[socket, startRingtone, stopRingtone]` becomes `[socket, boundDeptIds, startRingtone, stopRingtone]`.
- **R3 — `useQuery` SSR/Edge concerns.** The dialog is already `"use client"` (line 1 of current file); query runs in browser only. No Edge bundle impact beyond what `departments.ts` already contributes.
- **R4 — Multi-binding user case never tested in the wild.** T3.2 explicit test for `["d1", "d2"]` and T1.4 explicit test for multi-match exercise the path. If the binding model changes in a future ticket (e.g. adding `@unique`), the type stays `string[]` so the helper remains correct.
- **R5 — Admin re-binds while dialog is mounted.** Default `useQuery` refetch-on-focus catches it once the user refocuses the tab. Real-time invalidation deferred (decision 8). If this becomes a complaint, follow-up ticket adds socket-emit `binding:changed` → tRPC utils invalidate.
