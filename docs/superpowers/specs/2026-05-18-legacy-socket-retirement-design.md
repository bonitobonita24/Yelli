# Phase 7 #15 — Legacy Socket Retirement: Design

**Status:** Locked  
**Author:** CLAUDE_CODE (Opus 4.7)  
**Date:** 2026-05-18  
**Closes:** `[[parallel-socket-servers-coexistence]]` (Phase 7 #11 decision)  
**Companion plan:** `docs/superpowers/plans/2026-05-18-legacy-socket-retirement.md` (to be authored)

---

## 1. Problem

### 1.1 The legacy server is not coexisting — it's dead code

Investigation of `apps/web/src/lib/socket/server.ts`, `apps/web/src/app/api/socket/route.ts`, and every import call site reveals that the legacy Socket.IO server has **never been bootstrapped in this codebase**:

- `initSocketServer(httpServer)` exists as an export but is never called anywhere.
- The phantom `server/custom-server.ts` referenced in `lib/socket/server.ts:7-8` and `app/api/socket/route.ts:7-8` does not exist. It was an earlier architectural plan abandoned at Phase 7 #8e-1 in favor of the **separate-SOCKET_PORT** bootstrap via `apps/web/src/instrumentation.ts`.
- The Next.js Route Handler at `/api/socket` is intentionally a 503 placeholder (Route Handlers cannot perform a WebSocket upgrade — Vercel's docs and Next.js's framework guarantees both rule it out).

Consequence: `getIO()` in `calls.ts:57` and `calls.ts:90` **always returns null**. The `if (io !== null)` branch is unreachable in production.

### 1.2 Incoming-call is broken end-to-end

| Symptom | Root cause |
|---|---|
| Recipient never sees `IncomingCallDialog` | `calls.initiate` → `getIO()` returns null → `emitIncomingCall` never runs |
| Reject button does nothing | `incoming-call-dialog` opens raw `io()` with `path:"/api/socket"` to `NEXT_PUBLIC_SOCKET_URL` (= SOCKET_PORT 43515); new server uses default `/socket.io` path → handshake fails. Even if path matched, raw `io()` skips auth → middleware rejects |
| `calls.reject` mutation has no caller | Strict-retirement dead code — rejection emits `call:reject` via socket, never via tRPC |

### 1.3 Current state diagram (as of `6d3b6f8`)

```
                 ┌─────────────────────────────────────────┐
  /api/socket    │ Route Handler returns 503 (placeholder) │  ← Hit by raw io() in
  (APP_PORT)     │ Never serves WebSocket upgrade          │     incoming-call-dialog
                 └─────────────────────────────────────────┘     → connection fails
                              ↑
                              X never called
                              ↓
                 ┌─────────────────────────────────────────┐
  lib/socket/    │ initSocketServer(httpServer) + getIO()  │  ← Imported by calls.ts
  server.ts      │ + emitIncomingCall + attach handlers    │     but getIO() == null
  (159 lines)    │ DEAD CODE — never bootstrapped          │     always
                 └─────────────────────────────────────────┘

                 ┌─────────────────────────────────────────┐
  SOCKET_PORT    │ createSocketServer() — LIVE             │  ← presence:user,
  (43515)        │ Auth middleware via JWE cookie          │     call:active*,
                 │ attachPresenceHandlers                  │     session:invalidated
                 │ attachInCallHandlers                    │
                 │ ← MISSING: attachCallHandlers           │
                 └─────────────────────────────────────────┘
```

### 1.4 Goal

Make `call:incoming` and `call:rejected` flow through the new auth-gated server, then delete every line of legacy code. **This is the first real implementation of incoming-call, not a migration of a working feature.**

---

## 2. Locked decisions

1. **Single Socket.IO server.** Add `attachCallHandlers` to `apps/web/src/server/socket/server.ts` mirroring the `presence` + `in-call` pattern. Closes `[[parallel-socket-servers-coexistence]]`.

2. **New module: `apps/web/src/server/socket/calls.ts`** — exports `attachCallHandlers({io, socket})`. On connect: `joinOrgChannel(socket, "call:incoming")` and `joinOrgChannel(socket, "call:rejected")`. Listens for `socket.on("call:reject", ...)` and broadcasts via `emitToOrg`. **No roster** — calls are per-event, not stateful (unlike presence/in-call).

3. **Server-resolved caller identity.** `call:reject` payload from client carries only `{callId}`. Server reads `socket.data.session.userId` and broadcasts `call:rejected` org-scoped. Client cannot impersonate. The `{reason}` field is server-fixed to `"declined"` — `"unavailable"` is reserved for future auto-timeout flows.

4. **`calls.initiate` uses new server via `getIO()` singleton.** Add a module-level `let ioInstance: IOServer | null = null` + `export function getIO(): IOServer | null` to `apps/web/src/server/socket/server.ts`. Set on `createSocketServer` return. Single boot site (instrumentation.ts) eliminates the globalThis pollution the legacy factory needed.

5. **`incoming-call-dialog` migrates to `useSocketOptional()`.** Delete the raw `io(SOCKET_URL, {path: "/api/socket"})` block. Subscribe to `socket.on("call:incoming", ...)` and `socket.on("call:rejected", ...)`. Emit `socket.emit("call:reject", {callId})` on reject. Graceful degradation when socket is null — matches `useUsersInCall` / `useUserPresence` precedent.

6. **`call:incoming` org-scoped, not department-scoped.** Recipients filter on `payload.recipientDeptId` matching their bound department in the client. Reason: org-scoped fits the existing `emitToOrg`/`joinOrgChannel` pattern with zero new infrastructure; per-department channels would require subscription churn on every binding change (Phase 7 #13 made bindings mutable via admin UI).

7. **Pure-helper extraction for the client.** New `apps/web/src/lib/calls/incoming-call-handler.ts` exports `attachIncomingCallHandler(socket, {onIncoming, onRejected}): () => void`. Mirrors `lib/presence/user-presence-handler.ts` and `lib/presence/in-call-handler.ts` byte-for-byte structure. Node-testable per `[[pure-helper-extraction-pattern]]`.

8. **Delete `recipientOrgId` from `IncomingCallPayload`.** Now redundant — org is implicit in the channel name. Aligns with locked decision #6.

9. **DELETE — strict retirement (no defense-in-depth):**
   - `apps/web/src/lib/socket/server.ts` (159 lines)
   - `apps/web/src/app/api/socket/route.ts` (40 lines)
   - `calls.reject` tRPC mutation in `apps/web/src/server/trpc/routers/calls.ts` (lines 81-98, ~18 lines) — zero call sites
   - Dead events in `apps/web/src/lib/socket/types.ts`: `presence:subscribe`, `presence:heartbeat`, `presence:update`
   - Dead helpers in `apps/web/src/lib/socket/types.ts`: `callIncomingRoom`, `callerRoom`
   - Dead field `subscribedDepartmentIds` on `SocketData`
   - Unused import `PresenceState` in `types.ts` (only used by deleted `presence:update`)
   - `recipientOrgId` field on `IncomingCallPayload` (per decision #8)

10. **KEEP — `apps/web/src/lib/socket/types.ts`** as the shared event-type contract. The `call:incoming`, `call:rejected`, and `call:reject` event types are already correctly declared; they were just orphaned by the unbootstrapped legacy server. No move/rename — just rewire the flows.

---

## 3. Implementation details

### 3.1 New server handler: `apps/web/src/server/socket/calls.ts`

```ts
/**
 * Phase 7 #15 — call:incoming / call:rejected handler attach.
 *
 * Unlike presence.ts and in-call.ts there is no roster — calls are
 * ephemeral per-event transmissions, not state machines. The handler
 * joins both org-scoped channels on connect and listens for client-emitted
 * call:reject events to relay org-scoped.
 *
 * Initiation flows IN from the tRPC side via emitToOrg in calls.initiate
 * (see server/socket/server.ts:getIO()). Rejection flows OUT from the
 * incoming-call-dialog via socket.emit("call:reject") → server resolves
 * caller identity from socket.data.session → emitToOrg("call:rejected").
 *
 * Server-resolved caller identity: the reject payload carries only callId.
 * The {reason} field is server-fixed to "declined" for now; "unavailable"
 * is reserved for future auto-timeout flows (not in this ticket — see
 * scope fences in §5).
 */
import { emitToOrg, joinOrgChannel } from "@/server/socket/channels";

import type { SocketSession } from "@/server/socket/auth";
import type { Server as IOServer, Socket } from "socket.io";

const CALL_INCOMING_EVENT = "call:incoming";
const CALL_REJECTED_EVENT = "call:rejected";

export function attachCallHandlers(args: {
  io: IOServer;
  socket: Socket;
}): void {
  const { io, socket } = args;
  const session = socket.data.session as SocketSession | undefined;
  if (!session) return;

  const { organizationId } = session;

  joinOrgChannel(socket, CALL_INCOMING_EVENT);
  joinOrgChannel(socket, CALL_REJECTED_EVENT);

  socket.on("call:reject", (payload: unknown) => {
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("callId" in payload) ||
      typeof (payload as { callId: unknown }).callId !== "string"
    ) {
      return;
    }
    const { callId } = payload as { callId: string };
    if (callId.length === 0 || callId.length > 128) return;

    emitToOrg(io, organizationId, CALL_REJECTED_EVENT, {
      callId,
      reason: "declined" as const,
    });
  });
}
```

### 3.2 Server factory changes: `apps/web/src/server/socket/server.ts`

Add module-level singleton + exported accessor + connection wiring:

```ts
import { attachCallHandlers } from "@/server/socket/calls";

let ioInstance: IOServer | null = null;

export function getIO(): IOServer | null {
  return ioInstance;
}

// Inside createSocketServer, after `const io = new IOServer(...)`:
ioInstance = io;

// Inside io.on("connection"):
attachCallHandlers({ io, socket });
```

### 3.3 Types cleanup: `apps/web/src/lib/socket/types.ts`

**Delete:**
- `"presence:update"` event declaration + its legacy-Phase-5b comment block (lines 10-17)
- `"presence:subscribe"` event declaration (line 41)
- `"presence:heartbeat"` event declaration (line 42)
- `subscribedDepartmentIds: Set<string>` field from `SocketData` (line 58)
- `callIncomingRoom` and `callerRoom` exports (lines 61-64)
- `PresenceState` import (line 2) — now unused

**Modify `IncomingCallPayload`** (in `apps/web/src/lib/livekit/types.ts`):
- Delete `recipientOrgId` field — org is implicit in channel naming.
- Keep `recipientDeptId` — used by future client-side dept filter (deferred to follow-up ticket).

**Keep:**
- `call:incoming`, `call:rejected`, `call:reject` event signatures (already correct)
- All new-server events
- `SocketData` interface with `userId` + `organizationId` (still used by new server)

### 3.4 tRPC router changes: `apps/web/src/server/trpc/routers/calls.ts`

**Delete:** `reject` mutation (lines 81-98, 18 lines). Zero call sites verified.

**Change import (line 6):**
```ts
// before:
import { emitIncomingCall, getIO } from "@/lib/socket/server";
// after:
import { getIO } from "@/server/socket/server";
import { emitToOrg } from "@/server/socket/channels";
```

**Inline the broadcast (replacing lines 57-70):**
```ts
const io = getIO();
if (io !== null) {
  emitToOrg(io, ctx.organizationId, "call:incoming", {
    callId,
    callerName: ctx.user.name ?? ctx.userId,
    callerDepartment: null,
    roomName,
    recipientDeptId: department.id,
  });
}
```

The legacy `emitIncomingCall` also did `socketsJoin('call:reject:${callId}')` — that per-call private-room pattern is dead. New design uses org-scoped channels exclusively. Caller's dialog (already subscribed to `call:rejected` org-scoped via §3.6) receives the rejection event and filters by `callId` client-side.

### 3.5 Pure client handler: `apps/web/src/lib/calls/incoming-call-handler.ts`

Mirrors `lib/presence/user-presence-handler.ts` and `lib/presence/in-call-handler.ts`:

```ts
/**
 * Phase 7 #15 — pure incoming-call event handler.
 *
 * Wires socket.on("call:incoming") and socket.on("call:rejected") to
 * caller-provided callbacks. Returns a disposer that unwires both.
 * Node-testable: takes a minimal socket interface, not React's TypedSocket
 * directly, so we can construct fakes in vitest without jsdom.
 *
 * Follows [[pure-helper-extraction-pattern]] (Phase 7 #11 + #14 precedent).
 */
import type { IncomingCallPayload } from "@/lib/livekit/types";

export interface MinimalIncomingCallSocketTarget {
  on(event: "call:incoming", listener: (payload: IncomingCallPayload) => void): unknown;
  on(event: "call:rejected", listener: (payload: { callId: string; reason: "declined" | "unavailable" }) => void): unknown;
  off(event: "call:incoming", listener: (payload: IncomingCallPayload) => void): unknown;
  off(event: "call:rejected", listener: (payload: { callId: string; reason: "declined" | "unavailable" }) => void): unknown;
}

export function attachIncomingCallHandler(
  socket: MinimalIncomingCallSocketTarget,
  callbacks: {
    onIncoming: (payload: IncomingCallPayload) => void;
    onRejected: (payload: { callId: string; reason: "declined" | "unavailable" }) => void;
  },
): () => void {
  socket.on("call:incoming", callbacks.onIncoming);
  socket.on("call:rejected", callbacks.onRejected);
  return () => {
    socket.off("call:incoming", callbacks.onIncoming);
    socket.off("call:rejected", callbacks.onRejected);
  };
}
```

### 3.6 Client wiring: `apps/web/src/components/call/incoming-call-dialog.tsx`

**Delete:**
- Line 13: `import { io, type Socket } from "socket.io-client";`
- Lines 17-21: `SOCKET_URL` derivation
- Line 60: `socketRef` ref
- Lines 85-108: the entire raw `io()` `useEffect` block
- Line 119: `socketRef.current?.emit(...)` (replaced below)

**Add:**
```ts
import { useSocketOptional } from "@/lib/socket/socket-context";
import { attachIncomingCallHandler } from "@/lib/calls/incoming-call-handler";

// inside the component:
const socket = useSocketOptional();

useEffect(() => {
  if (socket === null) return;

  const handleIncoming = (incoming: IncomingCallPayload): void => {
    // TODO follow-up: filter by `incoming.recipientDeptId === currentUser.boundDeptId`
    // once department-binding context reaches the dialog. For now every org
    // member rings — matches current production behavior, which was a no-op.
    setPayload(incoming);
    setOpen(true);
    startRingtone();
  };

  const handleRejected = ({ callId }: { callId: string; reason: "declined" | "unavailable" }): void => {
    setPayload((current) => {
      if (current === null || current.callId !== callId) return current;
      stopRingtone();
      setOpen(false);
      return null;
    });
  };

  return attachIncomingCallHandler(socket, {
    onIncoming: handleIncoming,
    onRejected: handleRejected,
  });
}, [socket, startRingtone, stopRingtone]);
```

**Change reject handler (line 117):**
```ts
const handleReject = useCallback(() => {
  if (!payload || !socket) return;
  socket.emit("call:reject", { callId: payload.callId });
  stopRingtone();
  setOpen(false);
  setPayload(null);
}, [payload, socket, stopRingtone]);
```

### 3.7 Files deleted

```
DELETE  apps/web/src/lib/socket/server.ts            (159 lines)
DELETE  apps/web/src/app/api/socket/route.ts         (40 lines)
DELETE  apps/web/src/server/trpc/routers/calls.ts    (lines 81-98: reject mutation, ~18 lines)
DELETE  apps/web/src/lib/socket/types.ts             (~14 lines: dead events + helpers + import)
DELETE  apps/web/src/lib/livekit/types.ts            (recipientOrgId field, ~1 line)
```

Total deleted: ~232 lines.

### 3.8 Files added / modified

```
NEW       apps/web/src/server/socket/calls.ts                       (~70 lines)
NEW       apps/web/src/server/socket/calls.test.ts                  (~180 lines, 8 RED→GREEN)
NEW       apps/web/src/lib/calls/incoming-call-handler.ts           (~50 lines)
NEW       apps/web/src/lib/calls/incoming-call-handler.test.ts      (~120 lines, 4 RED→GREEN)
MODIFIED  apps/web/src/server/socket/server.ts                       (+~10 lines)
MODIFIED  apps/web/src/server/trpc/routers/calls.ts                  (~10 lines diff in initiate)
MODIFIED  apps/web/src/server/trpc/routers/calls.test.ts             (+2 cases on initiate; -all reject cases)
MODIFIED  apps/web/src/components/call/incoming-call-dialog.tsx      (~35 lines diff)
```

---

## 4. Testing plan

### 4.1 Server: `apps/web/src/server/socket/calls.test.ts` (8 RED→GREEN cases)

Hand-rolled `MinimalSocket` + `IOServer` fakes per `[[socket-revalidation-test-pattern]]`. No real socket.io.

1. `attachCallHandlers` is a no-op when `socket.data.session` is undefined (defensive guard)
2. `attachCallHandlers` calls `joinOrgChannel` for both `"call:incoming"` and `"call:rejected"` on connect
3. `socket.on("call:reject")` with valid `{callId: "abc"}` calls `emitToOrg(io, orgId, "call:rejected", {callId: "abc", reason: "declined"})`
4. `socket.on("call:reject")` with malformed payload (non-object) → no emit
5. `socket.on("call:reject")` with missing `callId` field → no emit
6. `socket.on("call:reject")` with non-string `callId` → no emit
7. `socket.on("call:reject")` with empty-string `callId` → no emit
8. `socket.on("call:reject")` with `callId.length > 128` → no emit (matches old Zod ceiling)

### 4.2 Pure client handler: `apps/web/src/lib/calls/incoming-call-handler.test.ts` (4 RED→GREEN cases)

Hand-rolled fake matching `lib/presence/in-call-handler.test.ts` structure.

1. Registers both `"call:incoming"` and `"call:rejected"` listeners on the socket
2. `onIncoming` callback fires with the payload when the socket emits `call:incoming`
3. `onRejected` callback fires with `{callId, reason}` when the socket emits `call:rejected`
4. Disposer returned by `attachIncomingCallHandler` unwires both listeners (verified by emitting after dispose and asserting callbacks not called)

### 4.3 tRPC router test extension: `apps/web/src/server/trpc/routers/calls.test.ts`

Add to existing file (created in Phase 7 #13):
- 1 case: `initiate` with mocked `getIO` returning fake IO → asserts `emitToOrg` called once with `{organizationId: ctx.organizationId, event: "call:incoming", payload: {callId, callerName, callerDepartment, roomName, recipientDeptId}}`
- 1 case: `initiate` with `getIO()` returning null → still returns `{callId, roomName, token, wsUrl, recipientDepartmentName}` (graceful degradation; build/test contexts have no live IO)
- **Delete** all test cases targeting the deleted `reject` mutation (count from existing file, expected: 0–2 cases)

### 4.4 Cumulative test count

| Source | Δ cases |
|---|---|
| `calls.test.ts` (new) | +8 |
| `incoming-call-handler.test.ts` (new) | +4 |
| `calls` router tests | +2 (delete reject coverage if any) |
| **Total** | **~+14** |

Test suite: 144 → ~158.

### 4.5 Validation gates

- `pnpm test` — all suites green, ~+14 cases
- `pnpm typecheck` — clean across 8 packages. **Special attention:** the deletions cascade — verify nothing else imports `callIncomingRoom`, `callerRoom`, `PresenceState`-via-types.ts, `recipientOrgId`-field
- `pnpm lint` — clean (warnings unchanged; 2 pre-existing per `[[lint-pre-existing-warnings]]`)
- `pnpm build` — **MANDATORY** per `[[instrumentation-edge-stub-required]]`. `server/socket/calls.ts` joins the `createSocketServer` import chain
- `pnpm audit --audit-level=critical` — exit 0. No new dependencies. `[[nodemailer-cve-mitigation]]` remains in effect

### 4.6 Two-stage review checklist (Rule 25)

**Stage 1 — Spec compliance (10 items):**
1. `attachCallHandlers` exists in `server/socket/calls.ts` with the locked signature
2. `attachCallHandlers` wired in `server/socket/server.ts` `io.on("connection")` alongside presence + in-call
3. `getIO()` exported from `server/socket/server.ts`; ioInstance set on factory return
4. `calls.initiate` imports `getIO` from new server, `emitToOrg` from channels
5. `calls.initiate` payload includes `recipientDeptId`; does NOT include `recipientOrgId`
6. `calls.reject` mutation deleted; no `trpc.calls.reject` call sites remain
7. `lib/socket/server.ts` deleted; `app/api/socket/route.ts` deleted
8. `lib/socket/types.ts`: `presence:subscribe`, `presence:heartbeat`, `presence:update`, `subscribedDepartmentIds`, `callIncomingRoom`, `callerRoom`, `PresenceState` import all gone
9. `incoming-call-dialog` uses `useSocketOptional()` + `attachIncomingCallHandler`; no raw `io()` call remains
10. `incoming-call-dialog` reject button emits via `useSocketOptional()` socket, not a separate connection

**Stage 2 — Code quality (8 items):**
1. Zero `any` types in the diff
2. No type assertions (`as X`) without comment justifying
3. TDD: every new file landed with its test (RED→GREEN demonstrated in commit log)
4. Only blast-radius files modified — no scope creep
5. Conventional commit messages on every branch commit
6. No event-name drift across `types.ts` ↔ `calls.ts` ↔ `incoming-call-handler.ts` ↔ `incoming-call-dialog.tsx`
7. Disposer pattern in pure helper matches `lib/presence/in-call-handler.ts` exactly
8. Edge-runtime build passes (instrumentation Edge-safe guards preserved)

---

## 5. Scope fences

**NOT in #15:**
- Department-binding filter in `IncomingCallDialog` — deferred. The dialog currently rings every org member (matches the current production no-op state). Filter logic will be added in a follow-up ticket once the dialog grows awareness of the current user's bound department.
- Call timeout / missed-call cleanup — `"unavailable"` reason code reserved but not driven by any timer
- Visual QA browser smoke test — deferred to Rule 16 batch alongside #4 + #3 + #7c + #8e/#10 + #11 + #12 + #13 + #14
- Multi-tab "answered on another device" semantics — would need a roster + presence-like coalescing; out of scope
- LiveKit token mint flow changes in `calls.initiate`
- `CallLog` persistence changes in `calls.end`
- Socket auth middleware changes
- Caller's own dialog auto-close on RoomEvent.Disconnected of the recipient — separate signal; not addressed

**Locked deferral reasons:**

| Item | Why deferred |
|---|---|
| Department-binding filter | Needs `useCurrentUser` or bound-dept context plumbed to the dialog component. Mechanical work that doesn't belong in the retirement ticket. |
| Visual QA | Established framework pattern (`[[rule-16-batched-debt]]`) — accumulate smoke tests, run as a batch. |
| Multi-tab answer semantics | Requires roster design parallel to in-call's `{wasFirst}/{isLast}` coalescing. Substantial additional surface; warrants its own design ticket. |

---

## 6. Tier classification

Per `memory-governance.md §1`:

- File count: 4 new + 4 modified + ~5 deletion edits = **~13 file touches**
- Module count: server-socket, lib-calls, tRPC router, components/call = **4 modules**
- Dependency depth: types → server-handler → server-factory → router = **3**

**Score:** `(13 × 2.5) + (4 × 5) + (3 × 3) = 32.5 + 20 + 9 = 61.5`

Below the Tier 3 threshold of 80. **Tier 2 moderate.** Comfortably within the 80K Opus 4.7 SAFE zone for single-session inline execution. User-elected execution mode: **inline Opus 4.7** (matches Phase 7 #14 precedent after Phase 7 #13's Sonnet thrash).

---

## 7. Lessons referenced

- `[[parallel-socket-servers-coexistence]]` — Phase 7 #11. **Closed by this ticket.**
- `[[pure-helper-extraction-pattern]]` — Phase 7 #11. Applied to `incoming-call-handler.ts`.
- `[[socket-revalidation-test-pattern]]` — Phase 7 #8e-2. Applied to `calls.test.ts` fakes.
- `[[event-handler-disposer-test-pattern]]` — Phase 7 #11. Applied to `incoming-call-handler.test.ts`.
- `[[instrumentation-edge-stub-required]]` — Phase 7 #10. `pnpm build` mandatory before merge.
- `[[nodemailer-cve-mitigation]]` — Phase 7 #9/#10. Audit threshold unchanged.

---

## 8. Open follow-ups (deliberately deferred)

1. **Department-binding filter** in `IncomingCallDialog` — file as Phase 7 #16 candidate.
2. **Visual QA smoke test** — add to Rule 16 batch: two browser tabs as different users in same org; tab A initiates call to tab B's bound dept → both dialog renders; reject → caller dialog closes; both end states clean.
3. **Caller-side dialog cleanup on peer disconnect** — currently caller sees their own room close via LiveKit RoomEvent.Disconnected (Phase 7 #14 wiring). If the recipient rejects, the caller's `call:rejected` listener handles it via §3.6. If the recipient never picks up, no timeout fires — deferred to "missed call" ticket.
4. **Multi-tab semantics** — separate ticket if/when the product needs "answered on Device A silences Device B".
