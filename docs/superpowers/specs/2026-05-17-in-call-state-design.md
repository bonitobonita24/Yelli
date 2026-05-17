# In-Call State — Phase 7 #14 Design

**Date:** 2026-05-17
**Ticket:** Phase 7 #14 — in-call-state (recommended next from `.whatsnext` after #13)
**Status:** Design approved — ready for implementation plan
**Tier:** 2 (moderate) — single-session execution, ~50-60K Opus 4.7 estimated

---

## Goal

Light up the **yellow `in_call` dot** (and disabled state) on the Speed Dial
Board for any department whose bound `default_user_id` is currently inside a
LiveKit room. Today `selectDepartmentPresence` returns only `"online" | "offline"`
even though `PresenceState` itself includes `"in_call"` and `<SpeedDialButton>`
already renders the yellow dot + disabled state for it — the data plane is the
only missing piece. Closes the second deferred-scope item from Phase 7 #12.

End-to-end UX after this ticket ships:

1. Alice (bound to Reception via `default_user_id`) is currently online → Reception shows GREEN.
2. Alice receives an incoming call from Bob → Alice joins the LiveKit room → `Room.Connected` fires → her browser emits `call:joined` → server tracks her in_call → server broadcasts `call:active {userId: alice, in_call: true}` org-scoped.
3. Every other member of Alice's org with a Speed Dial Board open now sees Reception render YELLOW + disabled (can't initiate a second call).
4. Alice hangs up → `Room.Disconnected` fires → her browser emits `call:left` → server broadcasts `call:active {userId: alice, in_call: false}` → Reception returns to GREEN (Alice is still socket-online).
5. Alice closes her browser mid-call (no client emit possible) → socket disconnect fires after transport timeout (~45s worst case) → server cleanup → broadcast off → Reception → GREEN, then eventually GRAY (offline) once presence engine also catches up.

---

## Architecture & Data Flow

```
┌─ Browser (LiveKit Room mounted on /app/call/[callId]) ─────────────┐
│                                                                     │
│  RoomEvent.Connected     ──► socket.emit("call:joined")             │
│  RoomEvent.Disconnected  ──► socket.emit("call:left")               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ Server (apps/web/src/server/socket/in-call.ts) — NEW ──────────────┐
│                                                                     │
│  createInCallRoster(): Map<orgId, Map<userId, Set<socketId>>>       │
│      ├─ addSocket    → { wasFirst }   // 0→1 user transition         │
│      ├─ removeSocket → { isLast }     // 1→0 user transition         │
│      └─ getInCallUsers(orgId): string[]                              │
│                                                                     │
│  attachInCallHandlers({io, socket, roster}):                        │
│      1. joinOrgChannel(socket, "call:active")                       │
│      2. socket.emit("call:active-snapshot", { userIds })            │
│      3. socket.on("call:joined") → roster.addSocket                 │
│            → if wasFirst: emitToOrg("call:active", {userId, in_call:true})│
│      4. socket.on("call:left") → roster.removeSocket                │
│            → if isLast: emitToOrg("call:active", {userId, in_call:false})│
│      5. socket.on("disconnect") → roster.removeSocket cleanup       │
│            → if isLast: emitToOrg("call:active", {userId, in_call:false})│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ Client (apps/web/src/lib/presence/) ──────────────────────────────┐
│                                                                     │
│  in-call-handler.ts (NEW)                                           │
│    attachInCallHandlers(socket, {onRoster, onUpdate}): Disposer     │
│    Pure handler. Node-testable per [[event-handler-disposer-test-pattern]]│
│                                                                     │
│  use-users-in-call.ts (NEW)                                         │
│    useUsersInCall(userIds): ReadonlySet<string>                     │
│    Consumes useSocketOptional() from #10. Returns frozen empty Set  │
│    when socket null.                                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ Helper update (apps/web/src/components/speed-dial/) ──────────────┐
│                                                                     │
│  selectDepartmentPresence(dept, online, inCall): PresenceState      │
│    • dept.default_user_id === null         → "offline"               │
│    • inCall.has(default_user_id)           → "in_call"  (wins)      │
│    • online[default_user_id] === true      → "online"               │
│    • else                                  → "offline"              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Locked Design Decisions

### 1. Trigger source: client-emit on LiveKit Room lifecycle

Browser emits `call:joined`/`call:left` socket events when LiveKit's
`Room.Connected`/`Room.Disconnected` fires. Server identity comes from
`socket.data.session.userId` (auth-gated by Phase 7 #8e middleware) — the client
can only emit for itself. Worst-case trust violation: an attacker marks
themselves in_call, which blocks others from calling them → only hurts the
attacker.

**Rejected alternatives:**
- **tRPC mutations only** — `calls.initiate` knows the caller but the recipient
  isn't known until someone in the dept actually joins the LiveKit room.
  Would have required a new `calls.markJoined` mutation + careful timeout handling.
- **LiveKit webhooks** — most accurate (server-side, zero client trust) but
  requires `LIVEKIT_WEBHOOK_KEY` (⏳ in `CREDENTIALS.md`) + a new
  `/api/webhooks/livekit` endpoint + signature verification. Defer until needed.

### 2. Architecture: twin-roster, twin-hook (parallel to Phase 7 #11)

A NEW `createInCallRoster()` lives alongside `createPresenceRoster()` with the
exact same `Map<orgId, Map<userId, Set<socketId>>>` shape and the same
`{wasFirst}/{isLast}` transition semantics. A NEW `useUsersInCall(userIds):
ReadonlySet<string>` hook lives alongside `useUserPresence(userIds):
Record<userId, boolean>`. Both rosters/hooks are mutually independent.

**Rejected alternative:** extending `createPresenceRoster` to track both states
and changing `useUserPresence` return type to a 3-state union. This couples two
state machines that change independently (presence = socket count; in_call =
LiveKit room membership) and breaks the existing hook signature.

### 3. Precedence: `in_call > online > offline`

Encoded as code in `selectDepartmentPresence`, not config. Explicit at the
call site. Documented in JSDoc on the helper.

Edge case: if a user appears in `inCall` set but NOT in `online` map (e.g.
their socket dropped but the in_call broadcast cleanup hasn't fired yet) — the
helper returns "in_call" anyway. This is the desired behaviour: in_call is the
authoritative signal during a live call. The brief window before transport
timeout cleans up the roster is acceptable.

### 4. Multi-tab semantics: `{wasFirst}/{isLast}` on per-user socket count

A user enters in_call iff their first socket emits `call:joined`. Exits iff
their last `call:joined`-emitting socket either emits `call:left` OR
disconnects. Matches Phase 7 #11's [[presence-roster-coalesce-pattern]].

Scenarios encoded in tests:
- Single user, single tab in call → 1 wasFirst emit, 1 isLast emit.
- Single user, 2 tabs in same call (impossible by UX but tested for safety):
  tab-1 emits joined → wasFirst → broadcast. tab-2 joined → silent.
  tab-1 left → silent (still 1 socket). tab-2 left → isLast → broadcast.
- Refresh mid-call: socket disconnects → cleanup → broadcast off → new socket
  connects → handshake snapshot includes self if LiveKit reconnect already
  fired Room.Connected on the new socket. Brief flicker is acceptable.

### 5. Channel: `${orgId}:call:active` (org-scoped)

Reuses `joinOrgChannel(socket, "call:active")` from Phase 7 #11's channels.ts.
Cross-org isolation is guaranteed by the helper sourcing orgId from
`socket.data.session` — no client-supplied orgId on the subscription path.
See [[socket-cross-org-api-surface-guard]].

### 6. Snapshot: socket-direct on connect

`socket.emit("call:active-snapshot", { userIds: [...] })` fires inside
`attachInCallHandlers` immediately after the join. Mirrors Phase 7 #11's
`presence:snapshot`. Snapshot is socket-direct (not broadcast) — only the
joining client gets the initial state.

Snapshot includes the user themselves if they happen to already be in_call
when reconnecting (e.g. fast network blip mid-call). Self-inclusion is
consistent with #11's presence snapshot.

### 7. `calls.end` and `calls.initiate` are NOT modified

The audit log + CallLog DB write at `calls.end` is orthogonal to the in_call
state machine. The caller's browser fires BOTH `calls.end` (DB write) AND
`call:left` (in_call cleanup) from the same `Room.Disconnected` handler. No
defense-in-depth at `calls.end` — socket disconnect cleanup is the sole safety
net for crashed/closed browsers.

**Rationale:** clean responsibility separation (`calls.end` = audit; socket
events = realtime state). Defense-in-depth at `calls.end` would only help if
LiveKit fires Disconnected, the browser then survives long enough to call the
tRPC mutation, but somehow fails to emit a single socket event in between —
implausible.

### 8. Event names

- `ServerToClientEvents` — `"call:active"` (transition broadcast), `"call:active-snapshot"` (per-socket init)
- `ClientToServerEvents` — `"call:joined"`, `"call:left"`

Distinct from `"presence:user"`/`"presence:snapshot"` to keep type-map
collisions impossible. Distinct from the legacy `/api/socket` server's events
(per [[parallel-socket-servers-coexistence]]).

---

## Files Changed

```
NEW
  apps/web/src/server/socket/in-call.ts                      (~85 lines — mirrors presence.ts)
  apps/web/src/server/socket/in-call.test.ts                 (~270 lines — 11 RED→GREEN cases)
  apps/web/src/lib/presence/in-call-handler.ts               (~45 lines — pure event handler)
  apps/web/src/lib/presence/in-call-handler.test.ts          (~120 lines — 5 RED→GREEN cases)
  apps/web/src/lib/presence/use-users-in-call.ts             (~40 lines — React hook)

MODIFIED
  apps/web/src/lib/socket/types.ts                           (+4 lines — new ServerToClient + ClientToServer events)
  apps/web/src/server/socket/server.ts                       (+5 lines — wire createInCallRoster + attachInCallHandlers)
  apps/web/src/components/speed-dial/department-presence.ts  (+5/-2 lines — 3rd parameter, in_call branch)
  apps/web/src/components/speed-dial/department-presence.test.ts (+4 RED→GREEN cases — in_call branches)
  apps/web/src/components/speed-dial/speed-dial-grid.tsx     (+3 lines — useUsersInCall + 3rd arg to helper)
  apps/web/src/app/app/call/[callId]/page.tsx                (+~15 lines — useSocketOptional + Room.Connected/Disconnected emit hooks)
```

Total: 5 new files + 6 modified across 4 modules (server/socket, lib/presence, lib/socket, components/speed-dial, app/call). Test suite delta: +20 cases (124 → 144).

---

## Test Plan (RED → GREEN per Rule 25)

### `apps/web/src/server/socket/in-call.test.ts` (11 cases)

Test pattern: [[presence-roster-coalesce-pattern]] from Phase 7 #11.

Roster contract (5):
- `addSocket` for new (orgId, userId) → `{wasFirst: true}`
- `addSocket` for existing user, new socketId → `{wasFirst: false}`
- `removeSocket` last socket of a user → `{isLast: true}`
- `removeSocket` non-last → `{isLast: false}`
- `getInCallUsers(orgId)` returns deduplicated user list, isolated by orgId

Handler wiring (6):
- `attachInCallHandlers` calls `joinOrgChannel(socket, "call:active")`
- Emits `call:active-snapshot` socket-direct on connect with current roster
- On `call:joined` from socket, when wasFirst → `emitToOrg("call:active", {userId, in_call: true})`
- On `call:joined` from socket, when NOT wasFirst → no emit
- On `socket disconnect`, when isLast → `emitToOrg("call:active", {userId, in_call: false})`
- Defensive: missing `socket.data.session` → no-op (no join, no emit, no listener registration)

Mock pattern: `io.to(...).emit(...)` via [[socket-revalidation-test-pattern]] hand-rolled fake; socket event registration via [[event-handler-disposer-test-pattern]].

### `apps/web/src/lib/presence/in-call-handler.test.ts` (5 cases)

Test pattern: [[event-handler-disposer-test-pattern]] from Phase 7 #10.

- Registers both `call:active-snapshot` and `call:active` listeners
- `call:active-snapshot` callback fires `onRoster(userIds)`
- `call:active` callback fires `onUpdate(userId, in_call)`
- Disposer unwires both listeners
- After dispose, firing the same event does not re-trigger callbacks

Hand-rolled `MinimalSocket` fake, same shape as `lib/presence/user-presence-handler.test.ts`.

### `apps/web/src/components/speed-dial/department-presence.test.ts` (+4 cases on existing file)

Existing 9 cases keep passing — empty `Set` passed as 3rd arg means in_call branch never fires for them.

New cases:
- Bound user in inCall set → returns `"in_call"`
- Bound user in inCall AND online → returns `"in_call"` (precedence win)
- Bound user in inCall but NOT in online map → returns `"in_call"` (transitional window)
- Unbound (default_user_id null) + matching id present in inCall → returns `"offline"` (null FK still wins)

### Hook test deferred (no jsdom infra)

`use-users-in-call.test.tsx` is deferred — same trade-off as Phase 7 #11's
`use-user-presence` (handler tests cover the contract; the hook is thin glue
around `attachInCallHandlers` + React state). Documented in lessons memory if
needed.

---

## Validation Checklist (before squash-merge)

- `pnpm test` — 144/144 (was 124/124; +20 new RED→GREEN)
- `pnpm typecheck` — 0 errors across 8 packages
- `pnpm lint` — 0 errors
- `pnpm build` — 22+ routes compiled (PERMANENT per [[instrumentation-edge-stub-required]] — new module is in `createSocketServer` import chain)
- `pnpm audit --audit-level=critical` — exit 0 (Phase 7 #9 + #10 still in effect)
- Two-stage review (Rule 25): Stage 1 spec compliance + Stage 2 code quality

---

## Scope Fences (NOT in this ticket)

- LiveKit webhook integration (deferred until LIVEKIT_API_KEY filled).
- "Do not disturb" status (would be a third state machine; out of scope).
- Per-user in_call status on user pages outside Speed Dial Board.
- Cleanup of legacy `/api/socket` `presence:update` event (covered by `legacy-socket-retirement` ticket).
- Defense-in-depth in_call clear on `calls.end` mutation (explicit choice — see Locked Decision 7).
- Presence/in_call combined snapshot at handshake (kept as two distinct events for clarity).

---

## Open Questions for Implementation Planning

None. All design questions locked by user via brainstorming flow on 2026-05-17.
The writing-plans skill will produce the TDD task breakdown next.
