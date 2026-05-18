# Phase 7 #16 — department-binding-filter (design)

Date: 2026-05-19
Status: locked
Tier: 1 (lightweight — Tiered Decomposition §1: ~5 files, 1 module, no cross-module dependency, ~25–30K Sonnet budget)
Predecessor: Phase 7 #15 (legacy-socket-retirement, squash `af43276`) which shipped the end-to-end auth-gated `call:incoming` flow and left a deferred TODO in `incoming-call-dialog.tsx:85-89`.

## Problem

After #15, the dialog rings every org member when any user initiates a call. This matches the prior production no-op (which was broken end-to-end and never reached the UI) but is incorrect once the broadcast actually fires. The payload already carries `recipientDeptId: string` (added by #15 in `lib/livekit/types.ts`). The dialog needs:

1. A way to learn which department(s) the current user is bound to.
2. A filter applied inside `handleIncoming` that ignores payloads whose `recipientDeptId` is not in the user's bound set.

## Locked decisions

1. **Source of bound department(s) = tRPC query, not session-encoded.**
   New `departments.myBoundDepartmentIds: protectedProcedure → string[]` returning every department id where `default_user_id === ctx.session.userId`. Session-encoding rejected because the binding is mutable via Phase 7 #13's admin UI; a JWT-encoded value goes stale on admin re-bind and requires sign-out/in to recover. tRPC's default `useQuery` (refetch-on-window-focus) catches admin edits without bespoke invalidation wiring.

2. **Return type = `string[]`, not single id.**
   The `Department.default_user_id` column has no `@unique` constraint — a user can legitimately be bound to multiple departments (e.g. one user manning Reception AND Front Desk on a small clinic deployment). Filter must check `boundDeptIds.includes(payload.recipientDeptId)`. Returning a single id would silently drop calls for the second binding. Schema is the source of truth; do not narrow the type past what the schema allows.

3. **No-binding case (boundDeptIds === []) → ignore the call.**
   Filter returns false → no ring. Matches the new contract: only the bound user(s) for a dept get rung. Users with zero bindings cannot be dialed via Speed Dial anyway — the org-wide fan-out behavior being removed was the broken state, not a fallback worth preserving.

4. **Cold-mount race (query still loading at moment of call:incoming) → drop.**
   Treat `boundDeptIds === undefined` (loading) identically to `[]` — filter returns false, no ring. The cold-mount race window is sub-second; org-scoped `call:incoming` retries are not part of the protocol; no buffering machinery is justified at Tier 1.

5. **Filter logic lives in a pure helper, not inline in the dialog.**
   New `apps/web/src/lib/calls/select-incoming-call.ts` exports a single function with signature:
   ```ts
   selectIncomingCall(
     payload: Pick<IncomingCallPayload, "recipientDeptId">,
     boundDeptIds: readonly string[] | undefined,
   ): boolean
   ```
   Pure, node-testable per [[pure-helper-extraction-pattern]] — matches the [[selectDepartmentPresence]] precedent from Phase 7 #12 and the helper-extraction discipline from #14 / #15.

6. **Audit logging — none.**
   `myBoundDepartmentIds` is a read query reading a user's own dept bindings within their own org. L6 tenant guard scopes it. No mutation, no L5 AuditLog entry needed. Matches `departments.list` precedent.

7. **No new socket types or events.**
   `recipientDeptId` already exists on `IncomingCallPayload` (added in #15). The filter is purely client-side after the broadcast is received. Server-side broadcast scope is unchanged — `emitToOrg` on `${orgId}:call:incoming` continues to fan out org-wide; the dialog drops irrelevant payloads.

8. **No bound-deps cache invalidation on socket reconnect.**
   Default `useQuery` semantics suffice: stale-on-mount + refetch-on-window-focus picks up admin edits in practice. If staleness becomes a real complaint post-ship, invalidation can be added in a follow-up (Tier 1 itself). Do not pre-build it.

## File inventory

| Path | Type | Net lines | Purpose |
|---|---|---|---|
| `apps/web/src/lib/calls/select-incoming-call.ts` | NEW | ~15 | Pure filter helper |
| `apps/web/src/lib/calls/select-incoming-call.test.ts` | NEW | ~70 | RED→GREEN, 4 cases |
| `apps/web/src/server/trpc/routers/departments.ts` | MODIFIED | +~18 | Add `myBoundDepartmentIds` query |
| `apps/web/src/server/trpc/routers/departments.test.ts` | MODIFIED | +~60 | RED→GREEN, 3 cases for new query |
| `apps/web/src/components/call/incoming-call-dialog.tsx` | MODIFIED | +~8 / -3 | Wire `useQuery` + helper, remove TODO |

5 files. ~150 lines of changes. Single Sonnet task per phase well within 30K budget; controller (Opus) supervises end-to-end without subagent dispatch unless thrash is observed.

## Test cases (locked — write before implementation per Rule 25)

### `select-incoming-call.test.ts` (4 cases)
- T1.1 — Returns `false` when `boundDeptIds === undefined` (loading state).
- T1.2 — Returns `false` when `boundDeptIds === []` (no binding).
- T1.3 — Returns `false` when `boundDeptIds = ["dept-a"]` AND `payload.recipientDeptId = "dept-b"` (mismatch).
- T1.4 — Returns `true` when `boundDeptIds = ["dept-a", "dept-c"]` AND `payload.recipientDeptId = "dept-c"` (multi-binding match).

### `departments.test.ts` additions (3 cases for `myBoundDepartmentIds`)
- T3.1 — Returns `string[]` of dept ids where `default_user_id === ctx.userId`. Empty array when user is bound to nothing.
- T3.2 — Returns ALL matching dept ids when user is bound to multiple departments (verifies array semantics, not single-row narrowing).
- T3.3 — L6 tenant guard: query scoped to caller's org (no cross-org leak). Mocks `findMany` with `where: { default_user_id: ctx.userId }` — L6 injects organization_id transparently per [[trpc-test-pattern]]; assertion verifies the `where` clause shape and that the result is `string[]`, not `Department[]`.

## Out of scope

- Dialog jsdom unit test — React-hook test is deferred per Phase 7 #11/#14/#15 precedent; the pure helper covers the filter logic. Smoke-test guidance added to Rule 16 follow-up section in `.whatsnext` instead.
- Bound-deps cache invalidation on socket reconnect (decision 8).
- Multi-tab / multi-window race (admin edits binding in tab A while dialog is mounted in tab B with stale data) — same `useQuery` refetch-on-focus catches this when tab B regains focus. No bespoke wiring.
- Cross-org filtering — already handled by `emitToOrg` + `joinOrgChannel` server-side; the dialog only ever receives same-org payloads.
- Session callback edits to JWT — explicitly rejected by decision 1.
- New Prisma migration — `default_user_id` already exists; no schema change.
- Updates to `incoming-call-handler.ts` (the disposer helper) — handler stays event-routing-only; filtering is the dialog's concern, not the handler's.

## Dependencies & precedent

- `departments.default_user_id` (Phase 7 #12 migration `20260517075117_add_department_default_user_id`).
- `IncomingCallPayload.recipientDeptId` (Phase 7 #15, `lib/livekit/types.ts:+1`).
- `attachIncomingCallHandler(socket, callbacks)` (Phase 7 #15, `lib/calls/incoming-call-handler.ts`).
- `useSocketOptional()` (Phase 7 #10, `lib/socket/socket-context.ts`).
- `selectDepartmentPresence(dept, online, inCall)` (Phase 7 #12/#14, `components/speed-dial/department-presence.ts`) — direct precedent for pure-helper-derived UI state.
- `trpc.departments.setDefaultUser` mutation (Phase 7 #13) — same router file, same audit-log discipline (read query needs none).

## Validation contract

All of the following must pass before squash:
- `pnpm typecheck` — 0 errors across 8 packages.
- `pnpm lint` — 0 new errors (2 pre-existing warnings unchanged).
- `pnpm test` — 160 → 167 (7 new RED→GREEN: 4 helper + 3 router).
- `pnpm build` — 22 routes compile. MANDATORY per [[instrumentation-edge-stub-required]] — `departments.ts` is in the tRPC bundle which Edge middleware imports types from.
- `pnpm audit --audit-level=critical` — exit 0 (Phase 7 #9 + #10 still in effect; 1 HIGH = documented nodemailer per [[nodemailer-cve-mitigation]]).
- Two-stage review (Rule 25): Stage 1 spec compliance (8 locked decisions traceable to code), Stage 2 quality (no `any`, no unjustified casts, TDD RED→GREEN evidence, blast-radius ≤ 5 files, conventional commits).
