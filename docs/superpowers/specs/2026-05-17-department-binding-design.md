# Department-Binding Presence — Phase 7 #12 Design

**Date:** 2026-05-17
**Ticket:** `(department-binding)` from `.whatsnext` recommended-next slot
**Tier:** 2 (single-session, ~50-60K Opus 4.7 context)
**Prereq:** Phase 7 #11 (user-level presence engine) merged as `81356e9`

## Goal

Wire the now-live user-level presence engine into `<SpeedDialGrid>` so each Speed Dial button shows a real online/offline dot driven by the bound user's socket state — replacing the all-offline stub left in place after #11.

## Locked decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Binding model = `default_user_id` nullable FK on `Department` | Simplest schema; reuses existing users table; additive migration; FK enforces referential integrity with `ON DELETE SET NULL` |
| 2 | Resolution path = client-side via `useUserPresence(boundUserIds)` | No new server emit type; reuses Phase 7 #11's `presence:user`+`presence:snapshot` events; type contract preserved |
| 3 | `in_call` state = deferred to a follow-up ticket | New engine returns boolean; `in_call` requires separate `call:active` broadcast or active-call query — out of scope |
| 4 | Admin UI = deferred to a follow-up ticket | Bindings set via seed + pgAdmin for now; UI is its own Tier 1-2 ticket |
| 5 | Unbound dept (NULL FK) renders as `offline` | Same as today's UX; predictable; no new presence state to maintain |

## Architecture

```
Server Component (departments page)
  └─ prisma.department.findMany({
       select: { ..., default_user_id: true }
     })
        ↓ props (Department[] with default_user_id?: string|null)
<SpeedDialGrid departments={...}>
  ├─ boundUserIds = departments.flatMap(d =>
  │    d.default_user_id ? [d.default_user_id] : [])
  ├─ const online = useUserPresence(boundUserIds)
  │    // Phase 7 #11 hook — shared SocketProvider, no new socket
  └─ per dept:
       presenceState =
         d.default_user_id && online[d.default_user_id]
           ? "online"
           : "offline"
```

Per-dept `presenceState` remains the existing `PresenceState` union (`"online" | "offline" | "in_call"`) — we just never emit `"in_call"` in this ticket. `<SpeedDialButton>` is untouched.

## File inventory

| Change | Path | Notes |
|---|---|---|
| Schema | `packages/db/prisma/schema.prisma` | Add `default_user_id String? @db.Uuid` + `default_user User? @relation("DepartmentDefaultUser", fields:[default_user_id], references:[id], onDelete: SetNull)` on `Department`; add inverse `defaultForDepartments Department[] @relation("DepartmentDefaultUser")` on `User` |
| Migration | `packages/db/prisma/migrations/<ts>_add_department_default_user_id/migration.sql` | `ALTER TABLE "departments" ADD COLUMN "default_user_id" UUID REFERENCES "users"(id) ON DELETE SET NULL;` + `CREATE INDEX "departments_default_user_id_idx" ON "departments"("default_user_id");` |
| Seed (if applicable) | `packages/db/prisma/seed.ts` | Backfill one demo binding so Visual QA shows green dot |
| Query callsite | (locate via grep — likely `apps/web/src/app/app/page.tsx`) | Add `default_user_id` to select; widen TS prop type |
| Rewire | `apps/web/src/components/speed-dial/speed-dial-grid.tsx` | Extend local `Department` interface; swap `usePresence(ids)` → `useUserPresence(boundUserIds)`; derive per-dept state |
| Delete | `apps/web/src/lib/presence/use-presence.ts` | Sole consumer migrated; close the migration started in #11 |
| Test (NEW) | `apps/web/src/components/speed-dial/speed-dial-grid.test.tsx` | RED→GREEN per Rule 25 |

## Test plan (Rule 25 — RED first)

Unit-level with React Testing Library; mock `useUserPresence` at the module boundary (the hook is already tested in #11; this ticket tests the wiring).

```
Case 1  bound user online       → green dot, button enabled, aria 'online'
Case 2  bound user offline      → gray dot, button disabled
Case 3  unbound dept (NULL FK)  → gray dot, button disabled
Case 4  mixed grid              → correct state per dept independently
Case 5  empty departments[]     → empty-state message preserved
Case 6  boundUserIds filter     → useUserPresence called with ONLY non-null FKs (no null leaks)
```

Pattern: `vi.mock("@/lib/presence/use-user-presence", () => ({ useUserPresence: vi.fn() }))`. Per-test return value. NO SocketProvider mocking needed — the hook IS the mock boundary. Mirrors [[socket-client-factory-test-pattern]] discipline (mock the dep, assert call args + rendered output).

## Validation gates

| # | Command | Expected |
|---|---|---|
| 1 | `pnpm test` | 108→114 (+6 new cases) all GREEN |
| 2 | `pnpm typecheck` | 0 errors (Department type widening flows through Server Component → grid props) |
| 3 | `pnpm lint` | 0 errors |
| 4 | `pnpm build` | **MANDATORY per [[instrumentation-edge-stub-required]]** — schema change → Prisma generate → potential type-import bundle impact |
| 5 | `pnpm audit --audit-level=critical` | exit 0 (Phase 7 #9 acceptance + #10 CLI flag still in effect) |
| 6 | `pnpm db:migrate` | clean forward apply on dev DB |

## Out of scope (explicit YAGNI fence)

- `in_call` derivation — separate ticket
- Admin UI for binding assignment — separate ticket (Phase 7 #13 candidate)
- Many-to-many `department_users` table — not requested; one-user-per-dept is sufficient
- Server-side `presence:department` event — option (a) explicitly rejected; option (b) chosen
- `device_binding_token` separate device-login concept — rejected for simplicity
- New `"unconfigured"` `PresenceState` variant — rejected; unbound depts render as `offline`

## Tier classification

```
files: 7   modules: 2 (packages/db + apps/web)   dependency_depth: 2
score = (7 × 2.5) + (2 × 5) + (2 × 3) = 17.5 + 10 + 6 = 33.5
33.5 < 40 → Tier 2 confirmed
~50-60K Opus 4.7 context — well under 80K SAFE zone
single-session execution; no Sonnet dispatch; no §2.5b escalation
```

## Governance writes (post-merge, non-blocking)

- `docs/CHANGELOG_AI.md` — Phase 7 #12 entry, Agent: CLAUDE_CODE
- `docs/IMPLEMENTATION_MAP.md` — Phase 7 #12 entry promoted to top
- `.cline/STATE.md` — PHASE / LAST_DONE / NEXT
- `.cline/memory/lessons.md` — capture any new pattern (e.g. `[[server-component-prisma-select-widening]]` if non-obvious type flow surfaces)
- `.whatsnext` — close `(department-binding)`, promote next recommended slot
- `.cline/memory/agent-log.md` — Phase 7 #12 line
