# In-Call State Implementation Plan — Phase 7 #14

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Light up the yellow `in_call` dot on the Speed Dial Board when a department's bound `default_user_id` is currently inside a LiveKit room.

**Architecture:** Twin-roster + twin-hook parallel to Phase 7 #11 presence engine. Browser emits `call:joined`/`call:left` on LiveKit `Room.Connected`/`Room.Disconnected`; server tracks per-org per-user socket-set roster with `{wasFirst}/{isLast}` coalescing; broadcasts `call:active` org-scoped via `emitToOrg`; client overlays in_call > online > offline at `selectDepartmentPresence`.

**Tech Stack:** Socket.IO 4.x server + client (auth-gated server on `SOCKET_PORT` from Phase 7 #8e), vitest, TypeScript strict, livekit-client, React hooks (`useSocketOptional` from Phase 7 #10).

**Spec reference:** `docs/superpowers/specs/2026-05-17-in-call-state-design.md`

---

## File Structure

**NEW files (5):**
- `apps/web/src/server/socket/in-call.ts` — `createInCallRoster()` + `attachInCallHandlers()`. Mirrors `presence.ts`.
- `apps/web/src/server/socket/in-call.test.ts` — 11 RED→GREEN cases. Mirrors `presence.test.ts`.
- `apps/web/src/lib/presence/in-call-handler.ts` — Pure client handler `attachInCallHandlers(socket, callbacks)`. Mirrors `user-presence-handler.ts`.
- `apps/web/src/lib/presence/in-call-handler.test.ts` — 5 RED→GREEN cases. Mirrors `user-presence-handler.test.ts`.
- `apps/web/src/lib/presence/use-users-in-call.ts` — React hook `useUsersInCall(userIds): ReadonlySet<string>`. Mirrors `use-user-presence.ts`. No test (jsdom-deferred — same trade-off as #11).
- `apps/web/src/lib/livekit/use-emit-call-participation.ts` — Composable hook `useEmitCallParticipation(room)` that wires socket emits to LiveKit Room lifecycle. Invoked by both `useLiveKitRoom` and `useMeetingRoom`.

**MODIFIED files (6):**
- `apps/web/src/lib/socket/types.ts` — add 2 ServerToClient events + 2 ClientToServer events.
- `apps/web/src/server/socket/server.ts` — wire `createInCallRoster` + `attachInCallHandlers` alongside presence.
- `apps/web/src/components/speed-dial/department-presence.ts` — add 3rd parameter, in_call branch.
- `apps/web/src/components/speed-dial/department-presence.test.ts` — +4 cases for in_call branch + precedence.
- `apps/web/src/components/speed-dial/speed-dial-grid.tsx` — wire `useUsersInCall` + pass to helper.
- `apps/web/src/lib/livekit/use-livekit-room.ts` — invoke `useEmitCallParticipation(roomInstance)`.
- `apps/web/src/lib/livekit/use-meeting-room.ts` — same.

**File count:** 6 new + 7 modified = 13 files. Tier 2 confirmed (score = (13 × 2.5) + (4 × 5) + (2 × 3) = 58.5; Opus controller stays well under 80K SAFE zone because tasks decompose into discrete narrow read sets).

---

## Pre-Flight (do BEFORE Task 1)

- [ ] **Step 1: Read STATE.md to confirm orientation**

Run: `cat .cline/STATE.md | head -20`
Confirm: `PHASE` = "Phase 7 active", `GIT_BRANCH` = `main`, `LAST_DONE` references Phase 7 #13 squash `77d94b2`.

- [ ] **Step 2: Read lessons memory entries (🔴 first, 🟤 second)**

Run: `cat .cline/memory/lessons.md | grep -E '🔴|🟤' | head -30`
Identify and re-read in full the entries referenced by name in the spec:
- `[[presence-roster-coalesce-pattern]]` (Phase 7 #11)
- `[[event-handler-disposer-test-pattern]]` (Phase 7 #10)
- `[[pure-helper-extraction-pattern]]` (Phase 7 #7c-2 / #8e / #10 / #11 / #12)
- `[[socket-cross-org-api-surface-guard]]`
- `[[parallel-socket-servers-coexistence]]`
- `[[instrumentation-edge-stub-required]]` (PERMANENT — pnpm build mandatory)
- `[[pnpm10-audit-level-ignored]]` (CLI flag in audit, not .npmrc only)

- [ ] **Step 3: Create feature branch**

Run: `git checkout -b feat/in-call-state`
Expected: `Switched to a new branch 'feat/in-call-state'`

- [ ] **Step 4: Verify baseline green build**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: typecheck 0 errors across 8 packages, lint 0 errors, test 124/124 passing.

If anything fails: STOP — investigate before starting Task 1. Phase 7 #13 left a clean main; failures here mean environment drift.

---

## Task 1: Server in-call roster — pure state

**Files:**
- Create: `apps/web/src/server/socket/in-call.ts`
- Test: `apps/web/src/server/socket/in-call.test.ts`

This is the in-memory state machine for tracking which users are currently in calls, per org. Mirrors `createPresenceRoster()` byte-for-byte in structure — same Map shape, same `{wasFirst}/{isLast}` semantics. The handler wiring (`attachInCallHandlers`) comes in Task 2.

- [ ] **Step 1: Write the failing roster contract test**

Create `apps/web/src/server/socket/in-call.test.ts` with these 5 roster cases (the handler-wiring cases follow in Task 2):

```ts
/**
 * Phase 7 #14 — `createInCallRoster` + `attachInCallHandlers` unit tests.
 *
 * Mirrors `presence.test.ts` (Phase 7 #11) byte-for-byte in structure.
 * The roster is in-memory state with `{wasFirst}/{isLast}` semantics on
 * the per-user socket count. The handler wires LiveKit-emitted client
 * socket events onto the roster and broadcasts org-scoped on transitions.
 *
 * See `apps/web/src/lib/presence/in-call-handler.ts` for the client-side
 * handler. See `docs/superpowers/specs/2026-05-17-in-call-state-design.md`
 * for the locked design decisions.
 */
import { describe, expect, it, vi } from "vitest";

import {
  createInCallRoster,
  attachInCallHandlers,
} from "@/server/socket/in-call";

import type { Server as IOServer, Socket } from "socket.io";

describe("createInCallRoster", () => {
  it("addSocket returns {wasFirst: true} for the first socket of a user", () => {
    const roster = createInCallRoster();
    const result = roster.addSocket("org-1", "user-a", "sock-1");
    expect(result.wasFirst).toBe(true);
  });

  it("addSocket returns {wasFirst: false} when the user already has a socket", () => {
    const roster = createInCallRoster();
    roster.addSocket("org-1", "user-a", "sock-1");
    const result = roster.addSocket("org-1", "user-a", "sock-2");
    expect(result.wasFirst).toBe(false);
  });

  it("removeSocket returns {isLast: true} when removing the last socket of a user", () => {
    const roster = createInCallRoster();
    roster.addSocket("org-1", "user-a", "sock-1");
    const result = roster.removeSocket("org-1", "user-a", "sock-1");
    expect(result.isLast).toBe(true);
  });

  it("removeSocket returns {isLast: false} when the user still has another socket", () => {
    const roster = createInCallRoster();
    roster.addSocket("org-1", "user-a", "sock-1");
    roster.addSocket("org-1", "user-a", "sock-2");
    const result = roster.removeSocket("org-1", "user-a", "sock-1");
    expect(result.isLast).toBe(false);
  });

  it("getInCallUsers returns deduplicated user ids isolated by org", () => {
    const roster = createInCallRoster();
    roster.addSocket("org-1", "user-a", "sock-1");
    roster.addSocket("org-1", "user-a", "sock-2");
    roster.addSocket("org-1", "user-b", "sock-3");
    roster.addSocket("org-2", "user-c", "sock-4");
    expect(roster.getInCallUsers("org-1").sort()).toEqual(["user-a", "user-b"]);
    expect(roster.getInCallUsers("org-2")).toEqual(["user-c"]);
    expect(roster.getInCallUsers("org-unknown")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @yelli/web test in-call.test.ts`
Expected: FAIL with "Cannot find module '@/server/socket/in-call'" or similar.

- [ ] **Step 3: Implement the roster**

Create `apps/web/src/server/socket/in-call.ts`:

```ts
/**
 * Phase 7 #14 — in-call roster + handler attach.
 *
 * Twin-roster parallel to `presence.ts`. The roster tracks which (org, user)
 * pairs currently have at least one socket reporting an active LiveKit room
 * participation. The handler wires the client-emitted `call:joined`/
 * `call:left` events onto the roster and broadcasts `call:active`
 * org-scoped on 0↔1 transitions.
 *
 * Source of truth: the browser. LiveKit Room.Connected → `socket.emit("call:joined")`;
 * Room.Disconnected → `socket.emit("call:left")`. Socket disconnect cleanup
 * catches crashed/closed browsers. See the locked design decisions in
 * `docs/superpowers/specs/2026-05-17-in-call-state-design.md`.
 *
 * Process-local Map state — single-instance only. When Phase 6 introduces the
 * Redis adapter for multi-instance, this swaps to a Valkey hash keyed by orgId
 * with the same `{wasFirst}/{isLast}` contract.
 *
 * Cross-org isolation: `joinOrgChannel(socket, "call:active")` sources orgId
 * from `socket.data.session` (auth middleware in Phase 7 #8e-1). The roster
 * itself is keyed by orgId; a malicious socket cannot inject entries for
 * another org because addSocket only fires from the authenticated handler.
 */
import { emitToOrg, joinOrgChannel } from "@/server/socket/channels";

import type { SocketSession } from "@/server/socket/auth";
import type { Server as IOServer, Socket } from "socket.io";

const CALL_ACTIVE_EVENT = "call:active";
const CALL_SNAPSHOT_EVENT = "call:active-snapshot";

export interface InCallRoster {
  /** Add a socket to the roster. `wasFirst` ↔ 0→1 transition for that user. */
  addSocket(
    orgId: string,
    userId: string,
    socketId: string,
  ): { wasFirst: boolean };
  /** Remove a socket. `isLast` ↔ 1→0 transition for that user. */
  removeSocket(
    orgId: string,
    userId: string,
    socketId: string,
  ): { isLast: boolean };
  /** Snapshot of currently-in-call user ids for an org. */
  getInCallUsers(orgId: string): string[];
}

export function createInCallRoster(): InCallRoster {
  const orgs = new Map<string, Map<string, Set<string>>>();

  function getOrgMap(orgId: string): Map<string, Set<string>> {
    let m = orgs.get(orgId);
    if (!m) {
      m = new Map();
      orgs.set(orgId, m);
    }
    return m;
  }

  return {
    addSocket(orgId, userId, socketId) {
      const orgMap = getOrgMap(orgId);
      let sockets = orgMap.get(userId);
      if (!sockets) {
        sockets = new Set();
        orgMap.set(userId, sockets);
      }
      const wasFirst = sockets.size === 0;
      sockets.add(socketId);
      return { wasFirst };
    },
    removeSocket(orgId, userId, socketId) {
      const orgMap = orgs.get(orgId);
      if (!orgMap) return { isLast: false };
      const sockets = orgMap.get(userId);
      if (!sockets) return { isLast: false };
      const hadIt = sockets.delete(socketId);
      if (!hadIt) return { isLast: false };
      const isLast = sockets.size === 0;
      if (isLast) {
        orgMap.delete(userId);
        if (orgMap.size === 0) orgs.delete(orgId);
      }
      return { isLast };
    },
    getInCallUsers(orgId) {
      const orgMap = orgs.get(orgId);
      if (!orgMap) return [];
      return Array.from(orgMap.keys());
    },
  };
}

/** Stub — filled in Task 2 to keep the test file imports green during commit boundary. */
export function attachInCallHandlers(_args: {
  io: IOServer;
  socket: Socket;
  roster: InCallRoster;
}): void {
  void _args;
}
```

Note the `attachInCallHandlers` stub at the bottom. Task 2 fills it; this keeps the test file's import statement green so we can commit Task 1 atomically.

- [ ] **Step 4: Run to verify the 5 roster cases pass**

Run: `pnpm --filter @yelli/web test in-call.test.ts`
Expected: 5 tests PASS in the `createInCallRoster` describe block.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/socket/in-call.ts apps/web/src/server/socket/in-call.test.ts
git commit -m "test(socket): in-call roster contract + stub handler (Phase 7 #14)

5 RED→GREEN cases proving the {wasFirst}/{isLast} semantics. Roster
shape mirrors presence.ts exactly. Handler wiring follows in next commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Server in-call handler attach + wire-up tests

**Files:**
- Modify: `apps/web/src/server/socket/in-call.ts` (replace stub with full handler)
- Modify: `apps/web/src/server/socket/in-call.test.ts` (add 6 handler-wiring cases)

Wire the handler to call `joinOrgChannel`, send the socket-direct snapshot, register `call:joined`/`call:left`/`disconnect` listeners, and emit org-scoped `call:active` on transitions only. Mirrors `attachPresenceHandlers` in `presence.ts`.

- [ ] **Step 1: Add 6 failing handler-wiring tests**

Append to `apps/web/src/server/socket/in-call.test.ts` (after the closing `});` of the `createInCallRoster` describe):

```ts
/**
 * The handler-wiring tests use the same fake-socket + spy-on-emit pattern
 * established by `presence.test.ts` and `revalidation.test.ts`. We don't
 * import socket.io's real Server class — we hand-roll the minimum surface
 * we exercise and cast at the boundary (the only place TS needs the strict
 * shape) per [[socket-revalidation-test-pattern]].
 */

type EmitSpy = ReturnType<typeof vi.fn>;
type ListenerMap = Map<string, ((...args: unknown[]) => void)[]>;

function makeFakeSocket(opts: {
  session?: SocketSession;
  id?: string;
}): {
  socket: Socket;
  listeners: ListenerMap;
  emitDirect: EmitSpy;
  joinedRooms: string[];
  fireDisconnect: () => void;
} {
  const listeners: ListenerMap = new Map();
  const joinedRooms: string[] = [];
  const emitDirect = vi.fn();

  const socket = {
    id: opts.id ?? "sock-test-1",
    data: { session: opts.session },
    on: (event: string, handler: (...args: unknown[]) => void) => {
      const arr = listeners.get(event) ?? [];
      arr.push(handler);
      listeners.set(event, arr);
    },
    join: (room: string) => {
      joinedRooms.push(room);
    },
    emit: emitDirect,
  } as unknown as Socket;

  const fireDisconnect = () => {
    const arr = listeners.get("disconnect") ?? [];
    arr.forEach((h) => {
      h();
    });
  };

  return { socket, listeners, emitDirect, joinedRooms, fireDisconnect };
}

function makeFakeIO(): {
  io: IOServer;
  emitToRoomSpy: EmitSpy;
  lastRoomTargeted: { room?: string };
} {
  const emitToRoomSpy = vi.fn();
  const lastRoomTargeted: { room?: string } = {};
  const io = {
    to: (room: string) => {
      lastRoomTargeted.room = room;
      return { emit: emitToRoomSpy };
    },
  } as unknown as IOServer;
  return { io, emitToRoomSpy, lastRoomTargeted };
}

const TEST_SESSION: SocketSession = {
  userId: "user-alice",
  organizationId: "org-1",
  organizationSlug: "acme",
  isSuperAdmin: false,
  securityVersion: 1,
};

describe("attachInCallHandlers", () => {
  it("joins the org-scoped call:active room and emits initial snapshot socket-direct", () => {
    const roster = createInCallRoster();
    const { socket, joinedRooms, emitDirect } = makeFakeSocket({
      session: TEST_SESSION,
    });
    const { io } = makeFakeIO();

    attachInCallHandlers({ io, socket, roster });

    expect(joinedRooms).toContain("org-1:call:active");
    expect(emitDirect).toHaveBeenCalledWith("call:active-snapshot", {
      userIds: [],
    });
  });

  it("snapshot includes existing in-call users in the org at connect time", () => {
    const roster = createInCallRoster();
    roster.addSocket("org-1", "user-bob", "sock-other");
    roster.addSocket("org-1", "user-carol", "sock-other-2");
    roster.addSocket("org-2", "user-stranger", "sock-stranger");

    const { socket, emitDirect } = makeFakeSocket({ session: TEST_SESSION });
    const { io } = makeFakeIO();

    attachInCallHandlers({ io, socket, roster });

    const snapshotCall = emitDirect.mock.calls.find(
      ([event]) => event === "call:active-snapshot",
    );
    expect(snapshotCall).toBeDefined();
    const payload = snapshotCall?.[1] as { userIds: string[] };
    expect(payload.userIds.sort()).toEqual(["user-bob", "user-carol"]);
  });

  it("on call:joined when wasFirst, broadcasts call:active {userId, in_call:true} to the org room", () => {
    const roster = createInCallRoster();
    const { socket, listeners } = makeFakeSocket({ session: TEST_SESSION });
    const { io, emitToRoomSpy, lastRoomTargeted } = makeFakeIO();

    attachInCallHandlers({ io, socket, roster });

    const joinedListener = listeners.get("call:joined")?.[0];
    expect(joinedListener).toBeDefined();
    joinedListener?.();

    expect(lastRoomTargeted.room).toBe("org-1:call:active");
    expect(emitToRoomSpy).toHaveBeenCalledWith("call:active", {
      userId: "user-alice",
      in_call: true,
    });
  });

  it("on call:joined when NOT wasFirst (user already in-call from another socket), does NOT re-broadcast", () => {
    const roster = createInCallRoster();
    // Pre-seed: user-alice already in-call from a different socket.
    roster.addSocket("org-1", "user-alice", "sock-other");

    const { socket, listeners } = makeFakeSocket({ session: TEST_SESSION });
    const { io, emitToRoomSpy } = makeFakeIO();

    attachInCallHandlers({ io, socket, roster });
    // Reset any emits from the snapshot step.
    emitToRoomSpy.mockClear();

    const joinedListener = listeners.get("call:joined")?.[0];
    joinedListener?.();

    // Only the snapshot was emitted, no broadcast.
    expect(emitToRoomSpy).not.toHaveBeenCalled();
  });

  it("on socket disconnect when isLast, broadcasts call:active {userId, in_call:false}", () => {
    const roster = createInCallRoster();
    const { socket, listeners, fireDisconnect } = makeFakeSocket({
      session: TEST_SESSION,
    });
    const { io, emitToRoomSpy } = makeFakeIO();

    attachInCallHandlers({ io, socket, roster });
    // Simulate a call:joined to put user-alice in-call.
    listeners.get("call:joined")?.[0]?.();
    emitToRoomSpy.mockClear();

    fireDisconnect();

    expect(emitToRoomSpy).toHaveBeenCalledWith("call:active", {
      userId: "user-alice",
      in_call: false,
    });
  });

  it("defensive: missing socket.data.session is a no-op (no join, no emit, no listeners)", () => {
    const roster = createInCallRoster();
    const { socket, listeners, joinedRooms, emitDirect } = makeFakeSocket({});
    const { io, emitToRoomSpy } = makeFakeIO();

    attachInCallHandlers({ io, socket, roster });

    expect(joinedRooms).toEqual([]);
    expect(emitDirect).not.toHaveBeenCalled();
    expect(emitToRoomSpy).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify the 6 new tests fail**

Run: `pnpm --filter @yelli/web test in-call.test.ts`
Expected: 5 roster tests still PASS; 6 handler tests FAIL (because `attachInCallHandlers` is still a stub).

- [ ] **Step 3: Replace the stub `attachInCallHandlers` with the real implementation**

In `apps/web/src/server/socket/in-call.ts`, replace the `attachInCallHandlers` stub with:

```ts
/**
 * Wire in-call lifecycle onto an authenticated socket. Call once per
 * connection — typically from `io.on("connection", socket => …)`.
 *
 * Defensive: if `socket.data.session` is missing (which should never happen
 * post-auth-middleware), the function returns without joining/emitting/
 * registering. Mirrors the guard in `attachPresenceHandlers`.
 */
export function attachInCallHandlers(args: {
  io: IOServer;
  socket: Socket;
  roster: InCallRoster;
}): void {
  const { io, socket, roster } = args;
  const session = socket.data.session as SocketSession | undefined;
  if (!session) return;

  const { organizationId, userId } = session;

  joinOrgChannel(socket, CALL_ACTIVE_EVENT);

  socket.emit(CALL_SNAPSHOT_EVENT, {
    userIds: roster.getInCallUsers(organizationId),
  });

  socket.on("call:joined", () => {
    const { wasFirst } = roster.addSocket(organizationId, userId, socket.id);
    if (wasFirst) {
      emitToOrg(io, organizationId, CALL_ACTIVE_EVENT, {
        userId,
        in_call: true,
      });
    }
  });

  socket.on("call:left", () => {
    const { isLast } = roster.removeSocket(organizationId, userId, socket.id);
    if (isLast) {
      emitToOrg(io, organizationId, CALL_ACTIVE_EVENT, {
        userId,
        in_call: false,
      });
    }
  });

  socket.on("disconnect", () => {
    const { isLast } = roster.removeSocket(organizationId, userId, socket.id);
    if (isLast) {
      emitToOrg(io, organizationId, CALL_ACTIVE_EVENT, {
        userId,
        in_call: false,
      });
    }
  });
}
```

- [ ] **Step 4: Run to verify all 11 cases pass**

Run: `pnpm --filter @yelli/web test in-call.test.ts`
Expected: 11/11 PASS.

- [ ] **Step 5: Run full test suite to confirm no regression**

Run: `pnpm test`
Expected: 135/135 PASS (was 124; +11 new in-call.test.ts cases).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/server/socket/in-call.ts apps/web/src/server/socket/in-call.test.ts
git commit -m "feat(socket): in-call roster + handler with {wasFirst}/{isLast} (Phase 7 #14)

6 RED→GREEN handler cases — joinOrgChannel, snapshot, broadcast on
wasFirst, no-broadcast on second socket, disconnect cleanup, defensive
no-session guard. Total 11 cases (5 roster + 6 handler).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Add events to socket types map

**Files:**
- Modify: `apps/web/src/lib/socket/types.ts`

This declares the new event payloads so both server and client gain TypedSocket awareness. No test — pure type addition.

- [ ] **Step 1: Edit `apps/web/src/lib/socket/types.ts`**

Find the `ServerToClientEvents` interface and add these two members at the end (before the closing `}`):

```ts
  // Phase 7 #14 — in-call state engine on the auth-gated server.
  // `call:active` broadcasts a single user's in-call transition (0↔1 LiveKit
  // room memberships in the in-call roster); `call:active-snapshot` is sent
  // socket-direct on connect with the initial roster of in-call users in
  // the org. See apps/web/src/server/socket/in-call.ts.
  "call:active": (payload: { userId: string; in_call: boolean }) => void;
  "call:active-snapshot": (payload: { userIds: string[] }) => void;
```

Find the `ClientToServerEvents` interface and add these two members at the end:

```ts
  // Phase 7 #14 — client signals from useEmitCallParticipation. Fired when
  // a LiveKit Room.Connected/Disconnected event indicates this user has
  // joined or left a call. Server identity comes from socket.data.session.
  "call:joined": () => void;
  "call:left": () => void;
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: 0 errors across 8 packages.

- [ ] **Step 3: Run full test suite (no regression)**

Run: `pnpm test`
Expected: 135/135 PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/socket/types.ts
git commit -m "types(socket): add call:active + call:joined event signatures (Phase 7 #14)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Wire in-call engine into createSocketServer

**Files:**
- Modify: `apps/web/src/server/socket/server.ts`

Instantiate the in-call roster once at server boot, attach handlers to every connection alongside presence handlers.

- [ ] **Step 1: Read the current server.ts**

Run: `cat apps/web/src/server/socket/server.ts`

Note where `createPresenceRoster` is imported and where `attachPresenceHandlers` is invoked inside `io.on("connection", ...)`.

- [ ] **Step 2: Edit `apps/web/src/server/socket/server.ts`**

Update the imports (add `createInCallRoster` and `attachInCallHandlers` to the existing presence import or add a new line):

```ts
import {
  attachPresenceHandlers,
  createPresenceRoster,
} from "@/server/socket/presence";
import {
  attachInCallHandlers,
  createInCallRoster,
} from "@/server/socket/in-call";
```

In the body of `createSocketServer`, where `presenceRoster` is created and the connection handler is registered, add the parallel in-call instantiation and wire both inside the SAME `io.on("connection", ...)`:

```ts
  // Phase 7 #11 — user-level presence engine.
  const presenceRoster = createPresenceRoster();

  // Phase 7 #14 — in-call state engine. Parallel roster + handler structure;
  // see in-call.ts and docs/superpowers/specs/2026-05-17-in-call-state-design.md.
  const inCallRoster = createInCallRoster();

  io.on("connection", (socket) => {
    attachPresenceHandlers({ io, socket, roster: presenceRoster });
    attachInCallHandlers({ io, socket, roster: inCallRoster });
  });

  return io;
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 4: Run pnpm build (MANDATORY per [[instrumentation-edge-stub-required]])**

Run: `pnpm build`
Expected: 22+ routes compiled, no Edge bundle errors. `server/socket/in-call.ts` is in the `createSocketServer` import chain so this is the gate that catches Edge incompatibility (e.g. accidentally importing a Node-only module).

If build fails: investigate immediately. Most likely cause is a transitive import of a module that doesn't have an Edge-runtime stub. See [[instrumentation-edge-stub-required]] in lessons memory for the fix pattern.

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: 135/135 PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/server/socket/server.ts
git commit -m "feat(socket): wire in-call engine into createSocketServer (Phase 7 #14)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Client in-call handler — pure module

**Files:**
- Create: `apps/web/src/lib/presence/in-call-handler.ts`
- Test: `apps/web/src/lib/presence/in-call-handler.test.ts`

Mirrors `user-presence-handler.ts` from Phase 7 #11. Pure module, node-testable.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/presence/in-call-handler.test.ts`:

```ts
/**
 * Phase 7 #14 — `attachInCallHandlers` (client-side) unit tests.
 *
 * The Socket.IO server emits two events for in-call state
 * (apps/web/src/server/socket/in-call.ts):
 *   - `call:active-snapshot` {userIds[]} — sent socket-direct on connect;
 *     the initial roster of in-call users in the org.
 *   - `call:active` {userId, in_call} — broadcast to the org channel on
 *     0↔1 transitions for a user's in-call socket count.
 *
 * This pure handler surfaces both as callbacks. `useUsersInCall` composes
 * it with `useState` + `useSocketOptional` to drive a ReadonlySet<userId>.
 * Pure module (no React) keeps it node-env testable per the
 * [[pure-helper-extraction-pattern]] (Phase 7 #11 precedent).
 */
import { describe, expect, it, vi } from "vitest";

import {
  attachInCallHandlers,
  type MinimalInCallSocketTarget,
} from "@/lib/presence/in-call-handler";

function makeFakeSocket(): {
  socket: MinimalInCallSocketTarget;
  listeners: Map<string, Set<(...args: unknown[]) => void>>;
  emit: (event: string, ...args: unknown[]) => void;
} {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const loose = {
    on: (event: string, handler: (...args: unknown[]) => void) => {
      const set = listeners.get(event) ?? new Set<(...args: unknown[]) => void>();
      set.add(handler);
      listeners.set(event, set);
    },
    off: (event: string, handler: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(handler);
    },
  };
  const emit = (event: string, ...args: unknown[]) => {
    listeners.get(event)?.forEach((h) => {
      h(...args);
    });
  };
  return {
    socket: loose as unknown as MinimalInCallSocketTarget,
    listeners,
    emit,
  };
}

describe("attachInCallHandlers (client)", () => {
  it("registers listeners for call:active-snapshot and call:active", () => {
    const { socket, listeners } = makeFakeSocket();
    attachInCallHandlers(socket, {
      onRoster: () => undefined,
      onUpdate: () => undefined,
    });
    expect(listeners.get("call:active-snapshot")?.size).toBe(1);
    expect(listeners.get("call:active")?.size).toBe(1);
  });

  it("invokes onRoster with userIds when the server emits call:active-snapshot", () => {
    const { socket, emit } = makeFakeSocket();
    const onRoster = vi.fn();
    attachInCallHandlers(socket, {
      onRoster,
      onUpdate: () => undefined,
    });
    emit("call:active-snapshot", { userIds: ["user-a", "user-b"] });
    expect(onRoster).toHaveBeenCalledTimes(1);
    expect(onRoster).toHaveBeenCalledWith(["user-a", "user-b"]);
  });

  it("invokes onUpdate with (userId, in_call) when the server emits call:active", () => {
    const { socket, emit } = makeFakeSocket();
    const onUpdate = vi.fn();
    attachInCallHandlers(socket, {
      onRoster: () => undefined,
      onUpdate,
    });
    emit("call:active", { userId: "user-x", in_call: true });
    expect(onUpdate).toHaveBeenCalledWith("user-x", true);

    emit("call:active", { userId: "user-x", in_call: false });
    expect(onUpdate).toHaveBeenCalledWith("user-x", false);
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it("returns a disposer that removes both listeners", () => {
    const { socket, listeners, emit } = makeFakeSocket();
    const onRoster = vi.fn();
    const onUpdate = vi.fn();
    const dispose = attachInCallHandlers(socket, { onRoster, onUpdate });
    dispose();
    expect(listeners.get("call:active-snapshot")?.size).toBe(0);
    expect(listeners.get("call:active")?.size).toBe(0);
    emit("call:active-snapshot", { userIds: [] });
    emit("call:active", { userId: "x", in_call: true });
    expect(onRoster).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("does not invoke callbacks after dispose even if events fire later", () => {
    const { socket, emit } = makeFakeSocket();
    const onRoster = vi.fn();
    const onUpdate = vi.fn();
    const dispose = attachInCallHandlers(socket, { onRoster, onUpdate });

    emit("call:active", { userId: "user-y", in_call: true });
    expect(onUpdate).toHaveBeenCalledTimes(1);

    dispose();
    emit("call:active", { userId: "user-y", in_call: false });
    expect(onUpdate).toHaveBeenCalledTimes(1); // no new call after dispose
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @yelli/web test in-call-handler.test.ts`
Expected: FAIL with "Cannot find module '@/lib/presence/in-call-handler'".

- [ ] **Step 3: Implement the handler**

Create `apps/web/src/lib/presence/in-call-handler.ts`:

```ts
/**
 * Phase 7 #14 — pure handler for the in-call state engine (client side).
 *
 * The auth-gated Socket.IO server (apps/web/src/server/socket/in-call.ts)
 * emits two events for in-call state:
 *
 *   - `call:active-snapshot` {userIds[]} — socket-direct on connect; the
 *     initial roster of in-call users in the org.
 *   - `call:active` {userId, in_call} — broadcast to the org channel on
 *     0↔1 transitions for a user's in-call socket count.
 *
 * This module exposes them as plain callbacks via `attachInCallHandlers`.
 * `useUsersInCall` (apps/web/src/lib/presence/use-users-in-call.ts) composes
 * it with `useState` + `useSocketOptional()` to drive a ReadonlySet<userId>.
 * Pure module — no React, no Next.js — node-testable per the
 * [[pure-helper-extraction-pattern]] (Phase 7 #11 precedent).
 *
 * Mirrors `user-presence-handler.ts` byte-for-byte in structure — the only
 * differences are event names and payload field names.
 */

export interface InCallSnapshotPayload {
  userIds: string[];
}

export interface InCallUpdatePayload {
  userId: string;
  in_call: boolean;
}

export interface MinimalInCallSocketTarget {
  on(
    event: "call:active-snapshot",
    handler: (payload: InCallSnapshotPayload) => void,
  ): unknown;
  on(
    event: "call:active",
    handler: (payload: InCallUpdatePayload) => void,
  ): unknown;
  off(
    event: "call:active-snapshot",
    handler: (payload: InCallSnapshotPayload) => void,
  ): unknown;
  off(
    event: "call:active",
    handler: (payload: InCallUpdatePayload) => void,
  ): unknown;
}

export interface InCallCallbacks {
  /** Replace the local in-call user set with the server's snapshot. */
  onRoster: (userIds: string[]) => void;
  /** Patch the local set for a single user's in-call transition. */
  onUpdate: (userId: string, in_call: boolean) => void;
}

export type InCallDisposer = () => void;

export function attachInCallHandlers(
  socket: MinimalInCallSocketTarget,
  callbacks: InCallCallbacks,
): InCallDisposer {
  const onSnapshot = (payload: InCallSnapshotPayload): void => {
    callbacks.onRoster(payload.userIds);
  };
  const onUpdate = (payload: InCallUpdatePayload): void => {
    callbacks.onUpdate(payload.userId, payload.in_call);
  };

  socket.on("call:active-snapshot", onSnapshot);
  socket.on("call:active", onUpdate);

  return () => {
    socket.off("call:active-snapshot", onSnapshot);
    socket.off("call:active", onUpdate);
  };
}
```

- [ ] **Step 4: Run to verify all 5 cases pass**

Run: `pnpm --filter @yelli/web test in-call-handler.test.ts`
Expected: 5/5 PASS.

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: 140/140 PASS (was 135; +5).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/presence/in-call-handler.ts apps/web/src/lib/presence/in-call-handler.test.ts
git commit -m "feat(presence): client in-call handler — pure module (Phase 7 #14)

5 RED→GREEN cases. Mirrors user-presence-handler structure.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Client React hook — useUsersInCall

**Files:**
- Create: `apps/web/src/lib/presence/use-users-in-call.ts`

No test — same trade-off as `use-user-presence.ts` from Phase 7 #11 (no jsdom infra; the handler tests in Task 5 cover the contract; the hook is thin glue around React state).

- [ ] **Step 1: Create the hook**

Create `apps/web/src/lib/presence/use-users-in-call.ts`:

```ts
"use client";

/**
 * Phase 7 #14 — `useUsersInCall(userIds)` React hook.
 *
 * Returns a `ReadonlySet<userId>` containing the subset of the caller's
 * argument that are currently in a LiveKit call (i.e. their browser has
 * emitted `call:joined` and not yet emitted `call:left` or disconnected).
 * Consumes the shared `useSocketOptional()` from `@/lib/socket/socket-context`
 * (Phase 7 #10) — does NOT open its own socket. When the SocketProvider is
 * absent or NEXT_PUBLIC_SOCKET_URL is undefined, the hook degrades silently:
 * returns a frozen empty Set.
 *
 * Data flow:
 *   1. On mount: socket emits `call:active-snapshot` {userIds: [...]} (the
 *      org roster as the server sees it at handshake time). Pure handler
 *      replaces our local in-call-set with the snapshot.
 *   2. While connected: server broadcasts `call:active` {userId, in_call}
 *      on every 0↔1 transition for any user in the org. Handler patches
 *      the in-call-set for that single id.
 *   3. On unmount: dispose unwires both listeners.
 *
 * Public contract: the returned Set is the FULL in-call user set for the
 * org (not filtered to userIds). Callers compose it via
 * `selectDepartmentPresence(dept, online, inCall)` — the helper does the
 * .has() check. This matches the precedent set by Phase 7 #11 where the
 * online-set is also unfiltered.
 *
 * Mirrors `use-user-presence.ts` byte-for-byte in structure; the only
 * differences are the handler import + the return type (Set vs Record).
 */
import { useEffect, useState } from "react";

import { attachInCallHandlers } from "@/lib/presence/in-call-handler";
import { useSocketOptional } from "@/lib/socket/socket-context";

const EMPTY_SET: ReadonlySet<string> = Object.freeze(new Set<string>());

export function useUsersInCall(_userIds: string[]): ReadonlySet<string> {
  const socket = useSocketOptional();
  // The userIds argument is currently unused — kept in the signature for
  // API symmetry with useUserPresence(userIds) and to allow a future
  // filtering optimisation without breaking callers.
  void _userIds;

  const [inCallSet, setInCallSet] = useState<ReadonlySet<string>>(EMPTY_SET);

  useEffect(() => {
    if (socket === null) return;

    const dispose = attachInCallHandlers(socket, {
      onRoster: (ids) => {
        setInCallSet(new Set(ids));
      },
      onUpdate: (userId, in_call) => {
        setInCallSet((prev) => {
          if (in_call && prev.has(userId)) return prev;
          if (!in_call && !prev.has(userId)) return prev;
          const next = new Set(prev);
          if (in_call) next.add(userId);
          else next.delete(userId);
          return next;
        });
      },
    });

    return dispose;
  }, [socket]);

  return inCallSet;
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 3: Run full test suite (no regression)**

Run: `pnpm test`
Expected: 140/140 PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/presence/use-users-in-call.ts
git commit -m "feat(presence): useUsersInCall React hook (Phase 7 #14)

Consumes useSocketOptional + attachInCallHandlers. Returns
ReadonlySet<userId>. Hook test deferred — same trade-off as #11.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Update selectDepartmentPresence helper — 3rd parameter + in_call branch

**Files:**
- Modify: `apps/web/src/components/speed-dial/department-presence.ts`
- Modify: `apps/web/src/components/speed-dial/department-presence.test.ts`

The helper signature changes from `(department, online)` to `(department, online, inCall)`. The single existing caller (`speed-dial-grid.tsx`) is updated in Task 9.

- [ ] **Step 1: Add 4 failing test cases**

In `apps/web/src/components/speed-dial/department-presence.test.ts`, **modify** the existing `selectDepartmentPresence` cases to pass a 3rd argument `new Set<string>()` (empty Set), then add new cases.

Edit the existing 5 `selectDepartmentPresence` cases. Each currently looks like:
```ts
expect(selectDepartmentPresence(dept, { u1: true })).toBe("online");
```
Change all 5 to:
```ts
expect(selectDepartmentPresence(dept, { u1: true }, new Set())).toBe("online");
```

Then **append** these 4 NEW cases inside the same `describe("selectDepartmentPresence", ...)`:

```ts
  it("returns 'in_call' when bound user is in the inCall set", () => {
    const dept: DepartmentBinding = { id: "d1", default_user_id: "u1" };
    expect(
      selectDepartmentPresence(dept, {}, new Set(["u1"])),
    ).toBe("in_call");
  });

  it("returns 'in_call' (precedence wins) when bound user is BOTH online and in_call", () => {
    const dept: DepartmentBinding = { id: "d1", default_user_id: "u1" };
    expect(
      selectDepartmentPresence(dept, { u1: true }, new Set(["u1"])),
    ).toBe("in_call");
  });

  it("returns 'in_call' even when online map says offline (transitional window)", () => {
    // Edge case: server-side in-call roster still has the user but the
    // online-presence engine already cleaned up (e.g. socket dropped before
    // call:left fired). in_call is authoritative per locked decision 3.
    const dept: DepartmentBinding = { id: "d1", default_user_id: "u1" };
    expect(
      selectDepartmentPresence(dept, { u1: false }, new Set(["u1"])),
    ).toBe("in_call");
  });

  it("returns 'offline' when default_user_id is null even if a matching id is in inCall set", () => {
    // Unbound dept: null FK always wins as offline. inCall.has check is gated
    // by the null check.
    const dept: DepartmentBinding = { id: "d1", default_user_id: null };
    expect(
      selectDepartmentPresence(dept, {}, new Set(["u1"])),
    ).toBe("offline");
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @yelli/web test department-presence.test.ts`
Expected: 5 existing cases FAIL with "Expected 2 arguments, but got 3" (typecheck error in test). 4 new cases also FAIL.

Note: this is a typecheck-time failure in the test file. Vitest reports it as a test failure when types don't match.

- [ ] **Step 3: Update the helper signature**

Edit `apps/web/src/components/speed-dial/department-presence.ts`. Replace the entire `selectDepartmentPresence` function:

```ts
/**
 * Derive a department's PresenceState from the bound user's online status
 * and the org's in-call user set.
 *
 * Precedence (Phase 7 #14 locked design):
 *   1. default_user_id is null (unbound)         → "offline"
 *   2. bound user is in the inCall set           → "in_call"  (wins)
 *   3. bound user is in the online map = true    → "online"
 *   4. else                                       → "offline"
 *
 * The in_call branch wins over online even when the online map says
 * offline — in_call is the authoritative signal during a live call.
 * See docs/superpowers/specs/2026-05-17-in-call-state-design.md
 * locked decision 3.
 */
export function selectDepartmentPresence(
  department: DepartmentBinding,
  online: Readonly<Record<string, boolean>>,
  inCall: ReadonlySet<string>,
): PresenceState {
  if (department.default_user_id === null) return "offline";
  if (inCall.has(department.default_user_id)) return "in_call";
  return online[department.default_user_id] === true ? "online" : "offline";
}
```

- [ ] **Step 4: Run tests to verify all 13 cases pass**

Run: `pnpm --filter @yelli/web test department-presence.test.ts`
Expected: 13/13 PASS (4 extractBoundUserIds + 5 existing selectDepartmentPresence + 4 new selectDepartmentPresence).

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: FAIL — `speed-dial-grid.tsx` still calls `selectDepartmentPresence(dept, online)` with only 2 args. This is expected; Task 9 fixes it. For this commit boundary, temporarily fix it by passing `new Set()` as the 3rd arg in `speed-dial-grid.tsx`.

Edit `apps/web/src/components/speed-dial/speed-dial-grid.tsx`. Find the line:
```tsx
presenceState={selectDepartmentPresence(dept, online)}
```
Change to (TEMPORARY — Task 9 replaces with real inCall):
```tsx
presenceState={selectDepartmentPresence(dept, online, new Set())}
```

Then re-run typecheck:
```bash
pnpm typecheck
```
Expected: 0 errors.

- [ ] **Step 6: Run full test suite**

Run: `pnpm test`
Expected: 144/144 PASS (was 140; +4 in department-presence.test.ts).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/speed-dial/department-presence.ts apps/web/src/components/speed-dial/department-presence.test.ts apps/web/src/components/speed-dial/speed-dial-grid.tsx
git commit -m "feat(speed-dial): selectDepartmentPresence adds inCall 3rd param (Phase 7 #14)

Precedence: unbound → offline; in_call (wins) > online > offline.
4 new RED→GREEN cases. SpeedDialGrid wired with empty Set placeholder
— Task 9 replaces with real useUsersInCall.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Composable LiveKit emit hook — useEmitCallParticipation

**Files:**
- Create: `apps/web/src/lib/livekit/use-emit-call-participation.ts`

A small hook that takes a LiveKit Room instance and wires socket emits on Room.Connected and Room.Disconnected. Invoked from both `useLiveKitRoom` and `useMeetingRoom` to avoid duplication.

No test file — the hook is ~25 lines of glue around LiveKit's event API and useEffect; no node-testable surface (Room mock would be heavier than the code it tests). The wiring will be visually QA'd as part of the Rule 16 follow-up smoke test.

- [ ] **Step 1: Create the hook**

Create `apps/web/src/lib/livekit/use-emit-call-participation.ts`:

```ts
"use client";

/**
 * Phase 7 #14 — emit `call:joined`/`call:left` socket events when a LiveKit
 * Room transitions between Connected and Disconnected.
 *
 * Composable hook invoked from `useLiveKitRoom` (intercom calls) and
 * `useMeetingRoom` (scheduled meetings) — both flows result in the same
 * server-side in-call state. The hook takes a Room instance (or null while
 * the LiveKit token request is in flight) and a stable callId for logging.
 *
 * Lifecycle:
 *   • room === null            → no-op (no listeners attached)
 *   • room becomes non-null    → register Connected/Disconnected handlers
 *   • room becomes null again  → previous useEffect cleanup unwires handlers
 *
 * The socket comes from `useSocketOptional()` (Phase 7 #10). When the
 * socket is null (SocketProvider absent or NEXT_PUBLIC_SOCKET_URL unset),
 * the hook is a silent no-op — same degradation pattern as useUserPresence.
 *
 * SECURITY: the server sources userId from socket.data.session — the client
 * cannot lie about identity. Worst-case misuse: a malicious client emits
 * call:joined without actually joining a LiveKit room, which marks itself
 * in_call → blocks others from calling them → only hurts the attacker.
 */
import { RoomEvent, type Room } from "livekit-client";
import { useEffect } from "react";

import { useSocketOptional } from "@/lib/socket/socket-context";

export function useEmitCallParticipation(room: Room | null): void {
  const socket = useSocketOptional();

  useEffect(() => {
    if (socket === null || room === null) return;

    const onConnected = (): void => {
      socket.emit("call:joined");
    };
    const onDisconnected = (): void => {
      socket.emit("call:left");
    };

    room.on(RoomEvent.Connected, onConnected);
    room.on(RoomEvent.Disconnected, onDisconnected);

    return () => {
      room.off(RoomEvent.Connected, onConnected);
      room.off(RoomEvent.Disconnected, onDisconnected);
    };
  }, [socket, room]);
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/livekit/use-emit-call-participation.ts
git commit -m "feat(livekit): useEmitCallParticipation hook (Phase 7 #14)

Composable hook for both intercom + meeting flows. Wires socket emits
to LiveKit Room.Connected/Disconnected lifecycle.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Wire useUsersInCall + useEmitCallParticipation at integration points

**Files:**
- Modify: `apps/web/src/components/speed-dial/speed-dial-grid.tsx`
- Modify: `apps/web/src/lib/livekit/use-livekit-room.ts`
- Modify: `apps/web/src/lib/livekit/use-meeting-room.ts`

Three small wirings: SpeedDialGrid swaps the placeholder empty Set for the real `useUsersInCall` hook; both LiveKit room hooks invoke `useEmitCallParticipation(roomInstance)`.

- [ ] **Step 1: Wire useUsersInCall in SpeedDialGrid**

Edit `apps/web/src/components/speed-dial/speed-dial-grid.tsx`. Find the existing imports for `useUserPresence`:
```ts
import { useUserPresence } from "@/lib/presence/use-user-presence";
```
Add a sibling import:
```ts
import { useUsersInCall } from "@/lib/presence/use-users-in-call";
```

Find the hook usage near the top of `SpeedDialGrid`:
```ts
const boundUserIds = extractBoundUserIds(departments);
const online = useUserPresence(boundUserIds);
```
Add the in-call hook below it:
```ts
const boundUserIds = extractBoundUserIds(departments);
const online = useUserPresence(boundUserIds);
const inCall = useUsersInCall(boundUserIds);
```

Find the `presenceState` line from Task 7 step 5 (currently passing `new Set()`):
```tsx
presenceState={selectDepartmentPresence(dept, online, new Set())}
```
Replace with:
```tsx
presenceState={selectDepartmentPresence(dept, online, inCall)}
```

- [ ] **Step 2: Wire useEmitCallParticipation in useLiveKitRoom**

Edit `apps/web/src/lib/livekit/use-livekit-room.ts`. Add the import near the top:
```ts
import { useEmitCallParticipation } from "@/lib/livekit/use-emit-call-participation";
```

Inside the `useLiveKitRoom` function body, AFTER the existing `useEffect` that connects to LiveKit but BEFORE the `return { room, status, errorMessage, hangup };` line, add:
```ts
  // Phase 7 #14 — emit call:joined/call:left socket events on Room lifecycle.
  // Server-side in-call roster tracks this user as in-call for Speed Dial green/yellow dots.
  useEmitCallParticipation(roomInstance);
```

(`roomInstance` is the `useState`-backed Room reference already present in `useLiveKitRoom`. Confirm by reading the file — the variable that's set inside the connect promise via `setRoomInstance(room)`.)

- [ ] **Step 3: Wire useEmitCallParticipation in useMeetingRoom**

Edit `apps/web/src/lib/livekit/use-meeting-room.ts`. Add the same import:
```ts
import { useEmitCallParticipation } from "@/lib/livekit/use-emit-call-participation";
```

Find the equivalent place where the meeting Room instance is exposed via state (look for a `useState<Room | null>` or `setRoomInstance` call). Invoke the hook the same way:
```ts
useEmitCallParticipation(<roomInstanceVar>);
```

Replace `<roomInstanceVar>` with the actual state variable name from this file. If `use-meeting-room.ts` does NOT expose a Room state variable (e.g. it owns the Room via a ref only), refactor to add a `roomInstance` useState alongside the existing ref — same shape as `use-livekit-room.ts` lines 22-26. Keep the change minimal.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 5: Run pnpm build (MANDATORY per [[instrumentation-edge-stub-required]])**

Run: `pnpm build`
Expected: 22+ routes compiled successfully.

- [ ] **Step 6: Run full test suite**

Run: `pnpm test`
Expected: 144/144 PASS (no test count change in Task 9).

- [ ] **Step 7: Run lint**

Run: `pnpm lint`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/speed-dial/speed-dial-grid.tsx apps/web/src/lib/livekit/use-livekit-room.ts apps/web/src/lib/livekit/use-meeting-room.ts
git commit -m "feat(speed-dial): wire useUsersInCall + LiveKit emit hooks (Phase 7 #14)

SpeedDialGrid now uses real in-call set (not empty placeholder).
Both useLiveKitRoom and useMeetingRoom invoke useEmitCallParticipation
so call:joined/call:left fire on Room.Connected/Disconnected.

End-to-end: caller initiates call → both browsers join LiveKit room →
both emit call:joined → server broadcasts call:active for both userIds
→ every Speed Dial Board in the org sees yellow dot on the bound
departments.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 10: Full 5-check validation

- [ ] **Step 1: pnpm test**

Run: `pnpm test`
Expected: 144/144 PASS, ~1.2s runtime.

- [ ] **Step 2: pnpm typecheck**

Run: `pnpm typecheck`
Expected: 0 errors across 8 packages.

- [ ] **Step 3: pnpm lint**

Run: `pnpm lint`
Expected: 0 errors (pre-existing 2 warnings unchanged).

- [ ] **Step 4: pnpm build**

Run: `pnpm build`
Expected: 22+ routes compiled successfully. PERMANENT gate per [[instrumentation-edge-stub-required]] — this catches Edge-runtime bundle failures that test/typecheck/lint miss.

- [ ] **Step 5: pnpm audit --audit-level=critical**

Run: `pnpm audit --audit-level=critical`
Expected: exit 0. Phase 7 #9 + #10 already locked the threshold; this just confirms no new critical CVEs slipped in via this ticket's changes (it added no new dependencies, but verify anyway).

If any of the 5 checks fail: STOP. Investigate. Do NOT proceed to Task 11.

---

## Task 11: Two-stage code review (Rule 25)

**Stage 1 — Spec compliance:**

Verify each locked decision from the spec is implemented in the diff:

- [ ] **D1** Client-emit trigger source — `useEmitCallParticipation` wires `RoomEvent.Connected/Disconnected` → `socket.emit("call:joined"/"call:left")`. ✓
- [ ] **D2** Twin-roster, twin-hook — `createInCallRoster()` + `useUsersInCall()` are separate from presence engine. ✓
- [ ] **D3** Precedence `in_call > online > offline` — encoded in `selectDepartmentPresence`. Test case "in_call (precedence wins)" proves it. ✓
- [ ] **D4** Multi-tab `{wasFirst}/{isLast}` semantics — proved by handler tests "no re-broadcast on second socket" + "disconnect cleanup isLast broadcast". ✓
- [ ] **D5** Channel `${orgId}:call:active` — proved by handler test "joins org-scoped room"; `joinOrgChannel` sources orgId from session. ✓
- [ ] **D6** Snapshot socket-direct on connect — proved by handler test "emits initial snapshot socket-direct". ✓
- [ ] **D7** `calls.end` NOT modified — git diff against `apps/web/src/server/trpc/routers/calls.ts` shows no changes. ✓
- [ ] **D8** Event names `call:active`/`call:active-snapshot`/`call:joined`/`call:left` — present in `lib/socket/types.ts`. ✓

If any item fails: fix the gap. Do not proceed.

**Stage 2 — Code quality:**

- [ ] **Q1** No `any` types introduced — `git diff` and grep for ` as any\b` and `: any\b` in added lines. ✓
- [ ] **Q2** Tests written BEFORE implementation — git log shows test commits preceding impl commits in each task. ✓
- [ ] **Q3** All new logic has test coverage — roster (5) + handler server (6) + handler client (5) + helper (4) = 20 new RED→GREEN cases. The hooks `useUsersInCall` and `useEmitCallParticipation` are thin React glue — handler tests + visual QA cover them. ✓
- [ ] **Q4** Only blast-radius files modified — `git diff --name-only main..HEAD` should show only files listed in this plan's File Structure. ✓
- [ ] **Q5** Conventional commit messages — `git log --oneline main..HEAD` should show `feat(...)`, `test(...)`, `types(...)` prefixes. ✓
- [ ] **Q6** No drift between event names — verify `call:active` (not `call:user`), `call:active-snapshot` (not `call:snapshot`), `call:joined`/`call:left` (not `call:start`/`call:end`) appear consistently across types.ts, in-call.ts (server), in-call-handler.ts (client), use-emit-call-participation.ts. ✓
- [ ] **Q7** Idiomatic React — `useEffect` cleanup returns disposer; `useState` initialised lazily for empty Set; no missing deps in `useEffect` dependency arrays. ✓
- [ ] **Q8** Edge-runtime safety — `pnpm build` passed (Task 10 Step 4); `instrumentation.ts` Edge stub still works because `in-call.ts` only imports server-side modules. ✓

If any quality item fails: fix inline before merge.

---

## Task 12: Squash-merge to main

- [ ] **Step 1: Confirm clean diff**

Run: `git diff main..HEAD --stat`
Expected: ~13 files changed, ~600 net lines added.

- [ ] **Step 2: Confirm commit list**

Run: `git log --oneline main..feat/in-call-state`
Expected: 9 commits — one per Task (1, 2, 3, 4, 5, 6, 7, 8, 9). No fixup/squash commits.

- [ ] **Step 3: Switch to main + squash-merge**

```bash
git checkout main
git merge --squash feat/in-call-state
git commit -m "feat(realtime): in-call state engine (Phase 7 #14)

Twin-roster + twin-hook parallel to Phase 7 #11 presence engine. Lights
up the yellow in_call dot on Speed Dial Board when a department's bound
default_user_id is currently inside a LiveKit room.

Trigger source: browser emits call:joined/call:left on LiveKit
Room.Connected/Room.Disconnected (useEmitCallParticipation invoked by
both useLiveKitRoom and useMeetingRoom). Server tracks per-org per-user
socket-set roster with {wasFirst}/{isLast} coalescing; broadcasts
call:active org-scoped via emitToOrg on transitions only.

selectDepartmentPresence(dept, online, inCall) overlays
in_call > online > offline. UI was already wired (PresenceState union
includes 'in_call', SpeedDialButton renders yellow dot + disabled
state); this ticket adds the missing data plane.

Files: 6 new + 7 modified. Test suite 124 → 144 (+20 new RED→GREEN).
Two-stage review (Rule 25) PASS. Validation green: test ✓, typecheck ✓,
lint ✓, build ✓ (22 routes), audit --audit-level=critical exit 0 ✓.

Closes the second deferred-scope item from Phase 7 #12.
Spec: docs/superpowers/specs/2026-05-17-in-call-state-design.md
Plan: docs/superpowers/plans/2026-05-18-in-call-state.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

- [ ] **Step 4: Delete the feature branch**

Run: `git branch -D feat/in-call-state`
Expected: `Deleted branch feat/in-call-state`

- [ ] **Step 5: Post-merge validation on main**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build && pnpm audit --audit-level=critical`
Expected: all green.

- [ ] **Step 6: Capture the squash SHA**

Run: `git rev-parse --short HEAD`
Save the SHA for the governance commit (Task 13).

---

## Task 13: Governance documentation

**Files:**
- Modify: `.cline/STATE.md`
- Modify: `docs/CHANGELOG_AI.md`
- Modify: `docs/IMPLEMENTATION_MAP.md`
- Modify: `.cline/memory/agent-log.md`
- Modify: `.whatsnext` — close `(in-call-state)`, promote remaining candidates

- [ ] **Step 1: Update STATE.md**

Rewrite the file with:
- `PHASE` line: `Phase 7 active — fourteenth Feature Update merged. Phase 7 #14 (in-call-state) squash-merged 2026-05-18 as <SHA>.`
- `LAST_DONE`: full paragraph describing the 13 files, 20 new tests, validation results, two-stage review, squash SHA. Mirror Phase 7 #13's LAST_DONE structure.
- `NEXT`: list the remaining `.whatsnext` candidates after promoting from #14's slot (likely `legacy-socket-retirement` as the new recommended-next since two of its dependencies are now done).
- `TIER_CLASSIFICATION`: keep Tier 2 confirmation with the score.
- `FILES_TOUCHED_THIS_SESSION`: list all 13 implementation files + the spec/plan docs + this governance commit's files.
- `LESSONS_ADDED`: likely 0 unless something novel emerged during execution. If a subagent thrashes or a new pattern emerges, write the lesson per [[pure-helper-extraction-pattern]] format.

- [ ] **Step 2: Update CHANGELOG_AI.md**

Add a new entry at the TOP of the reverse-chronological block, ABOVE the Phase 7 #13 entry. Use this template:

```markdown
## 2026-05-18 — Phase 7 #14 (in-call-state)
- Agent:               CLAUDE_CODE
- Why:                 Light up yellow in_call dot on Speed Dial Board (closes second deferred-scope from #12).
- Files added:         apps/web/src/server/socket/in-call.ts, in-call.test.ts; apps/web/src/lib/presence/in-call-handler.ts, in-call-handler.test.ts, use-users-in-call.ts; apps/web/src/lib/livekit/use-emit-call-participation.ts
- Files modified:      apps/web/src/lib/socket/types.ts, apps/web/src/server/socket/server.ts, apps/web/src/components/speed-dial/department-presence.ts + .test.ts, apps/web/src/components/speed-dial/speed-dial-grid.tsx, apps/web/src/lib/livekit/use-livekit-room.ts, apps/web/src/lib/livekit/use-meeting-room.ts
- Files deleted:       none
- Schema/migrations:   none
- Errors encountered:  [list any actual errors encountered during execution]
- Errors resolved:     [matching resolutions, or "none"]
- Squash SHA:          <SHA>
- Spec:                docs/superpowers/specs/2026-05-17-in-call-state-design.md
- Plan:                docs/superpowers/plans/2026-05-18-in-call-state.md
```

- [ ] **Step 3: Update IMPLEMENTATION_MAP.md**

Add a new "Phase 7 #14 (in-call-state)" paragraph at the top of the "Built So Far" block, ABOVE the Phase 7 #13 paragraph. Demote #13 by one position. The paragraph should:
- Name the new server module + handler
- Name the new client hook
- Reference the helper signature change
- Reference the LiveKit emit hook
- Reference the test count delta (124→144)

- [ ] **Step 4: Update agent-log.md**

Append: `2026-05-18 | CLAUDE_CODE | Phase 7 #14 (in-call-state) squash-merged as <SHA>. End-to-end yellow in_call dot active on Speed Dial Board.`

- [ ] **Step 5: Update .whatsnext**

Remove the `(in-call-state)` candidate entry (it's done). Add a closing paragraph for Phase 7 #14 at the top, modelled on the Phase 7 #13 closing paragraph. Update the "Recommended next" line at the bottom — likely promote `(legacy-socket-retirement)` since the orphaned `presence:update` event is now joined by 4 new socket events that exist purely on the new auth-gated server, making the parallel-servers situation even more obvious.

Add a new "Pending Rule 16 follow-up" smoke-test bullet for Phase 7 #14: "open two browser tabs as different users in same org → tab A initiates a call to tab B's bound dept → both join LiveKit room → both browsers should now show every department whose default_user is in the call as YELLOW + disabled. Hang up → both return to GREEN (still socket-online). Sign out of one tab → that user's dots return to GRAY."

- [ ] **Step 6: Commit governance**

```bash
git add .cline/STATE.md docs/CHANGELOG_AI.md docs/IMPLEMENTATION_MAP.md .cline/memory/agent-log.md .whatsnext
git commit -m "chore(governance): record Phase 7 #14 squash SHA — <SHA>

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Summary

13 tasks, each producing a self-contained commit. Test suite delta: 124 → 144 (+20 RED→GREEN). 6 new files + 7 modified across 4 modules. Single Opus 4.7 controller session (~50-60K context). No new dependencies. No schema/migration changes. Two-stage review (Rule 25) self-verifies before squash-merge.

**Risk hotspots:**
- Task 9 Step 3 may require a small refactor in `use-meeting-room.ts` if the Room instance isn't already in useState. Keep the change minimal — add only what's needed.
- The `useEmitCallParticipation` hook has no unit test by design; verify it visually during Rule 16 smoke test follow-up.
- Edge-runtime build (Task 4 Step 4 + Task 9 Step 5) is the catchpoint for any accidental Node-only import — heed [[instrumentation-edge-stub-required]].
