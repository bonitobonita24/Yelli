# Legacy Socket Retirement Implementation Plan — Phase 7 #15

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the unbootstrapped legacy Socket.IO scaffold and make `call:incoming` + `call:rejected` flow through the existing auth-gated server, finally turning incoming-call from broken-in-production into a working feature.

**Architecture:** Add a new `attachCallHandlers` to `apps/web/src/server/socket/server.ts` mirroring the presence + in-call handler pattern; expose a module-level `getIO()` singleton so `calls.initiate` can broadcast via `emitToOrg`. Migrate `incoming-call-dialog` from its raw `io()` connection to `useSocketOptional()` + a new pure helper `attachIncomingCallHandler`. Delete every line of the legacy scaffold (`lib/socket/server.ts`, `app/api/socket/route.ts`, the orphan `calls.reject` mutation, six dead events/fields/helpers in `lib/socket/types.ts`). Strict retirement — no defense-in-depth.

**Tech Stack:** Socket.IO 4.x, TypeScript strict, Next.js 15 App Router (Node.js runtime for instrumentation), Vitest, tRPC v11, React 19.

**Spec:** [`docs/superpowers/specs/2026-05-18-legacy-socket-retirement-design.md`](../specs/2026-05-18-legacy-socket-retirement-design.md) (locked 2026-05-18 as `d633ad2`)

**Lessons referenced:** `[[parallel-socket-servers-coexistence]]` (closed by this ticket) · `[[pure-helper-extraction-pattern]]` · `[[socket-revalidation-test-pattern]]` · `[[event-handler-disposer-test-pattern]]` · `[[instrumentation-edge-stub-required]]` · `[[nodemailer-cve-mitigation]]`

**Tier:** 2 (score 61.5). Inline Opus 4.7 execution (user-elected, matching Phase 7 #14 precedent).

---

## File Structure

**NEW (additive):**
- `apps/web/src/server/socket/calls.ts` (~70 lines) — `attachCallHandlers({io, socket})`; joins both org-scoped channels and relays `call:reject` → `call:rejected`. No roster (calls are per-event).
- `apps/web/src/server/socket/calls.test.ts` (~180 lines, 8 RED→GREEN) — hand-rolled fakes per `[[socket-revalidation-test-pattern]]`.
- `apps/web/src/lib/calls/incoming-call-handler.ts` (~50 lines) — pure helper `attachIncomingCallHandler(socket, callbacks): disposer`; mirrors `lib/presence/in-call-handler.ts` byte-for-byte.
- `apps/web/src/lib/calls/incoming-call-handler.test.ts` (~120 lines, 4 RED→GREEN) — Node-only tests; no jsdom.
- `apps/web/src/server/trpc/routers/calls.test.ts` (~110 lines, 2 RED→GREEN initiate cases) — does **not** exist yet; created fresh by Task 5. No reject-mutation coverage because the mutation is deleted in the same task.

**MODIFIED:**
- `apps/web/src/server/socket/server.ts` (+~12 lines) — module-level `let ioInstance` + `export function getIO()` + `attachCallHandlers(...)` call in `io.on("connection")`.
- `apps/web/src/server/trpc/routers/calls.ts` (~−25 / +~12 net) — change socket import to new server + `channels`; replace `emitIncomingCall(...)` block with inline `emitToOrg` call carrying `recipientDeptId`; **delete** entire `reject:` mutation (lines 81–98).
- `apps/web/src/lib/livekit/types.ts` (+1 line) — add `recipientDeptId: string` to `IncomingCallPayload`.
- `apps/web/src/components/call/incoming-call-dialog.tsx` (~−35 / +~25 net) — drop raw `io()` setup + `socketRef`; subscribe via `useSocketOptional()` + `attachIncomingCallHandler`; reject button emits via the shared socket.

**DELETED:**
- `apps/web/src/lib/socket/server.ts` (159 lines)
- `apps/web/src/app/api/socket/route.ts` (40 lines)
- `apps/web/src/lib/socket/types.ts` cascade (~14 lines): `presence:subscribe` / `presence:heartbeat` / `presence:update` events, `subscribedDepartmentIds` field on `SocketData`, `callIncomingRoom` + `callerRoom` helpers, `PresenceState` import.

**Note on spec/reality drift (caught during plan preflight):**
- The design spec §3.3 says "delete `recipientOrgId` from `IncomingCallPayload`" — but `recipientOrgId` is **not** a field on `IncomingCallPayload`. It only lives on the legacy `emitIncomingCall` *function* signature (line 148 of `lib/socket/server.ts`) and as a top-level arg at the router call site. The deletion happens naturally when `lib/socket/server.ts` is removed in Task 6.
- The design spec §2.8's intent is preserved: org is implicit in channel naming, so we don't carry it in the payload. The plan instead **adds** `recipientDeptId` to `IncomingCallPayload` (currently missing) so the dialog can later filter by it.
- The design spec says calls router tests are "extended" — but `apps/web/src/server/trpc/routers/calls.test.ts` does **not** exist. The plan **creates** it fresh.

---

## Pre-Flight (do BEFORE Task 1)

- [ ] **Step 1: Read STATE.md to confirm orientation**

Run:
```bash
cat .cline/STATE.md | head -50
```
Expected: `PHASE` line confirms "Phase 7 #15 (legacy-socket-retirement) — DESIGN PHASE COMPLETE" or similar; `NEXT` line points to this plan. If anything mismatches, STOP and reconcile per CLAUDE.md fresh-start safety.

- [ ] **Step 2: Read lessons memory entries**

Search `.cline/memory/lessons.md` for the six referenced lessons:
```bash
grep -n -A 3 \
  -e 'parallel-socket-servers-coexistence' \
  -e 'pure-helper-extraction-pattern' \
  -e 'socket-revalidation-test-pattern' \
  -e 'event-handler-disposer-test-pattern' \
  -e 'instrumentation-edge-stub-required' \
  -e 'nodemailer-cve-mitigation' \
  .cline/memory/lessons.md
```
Expected: all six entries found. Re-read them in full — they encode the patterns this plan applies.

- [ ] **Step 3: Verify baseline green**

Run:
```bash
pnpm -s test --run 2>&1 | tail -5 && \
pnpm -s typecheck 2>&1 | tail -3 && \
pnpm -s lint 2>&1 | tail -3
```
Expected baseline:
- `test`: 144 passing across 15 files
- `typecheck`: 0 errors across 8 packages
- `lint`: 0 errors (2 pre-existing warnings per `[[lint-pre-existing-warnings]]`)

If anything is red on `main`, STOP and reconcile before branching.

- [ ] **Step 4: Create feature branch**

```bash
git checkout main
git pull --ff-only
git checkout -b feat/legacy-socket-retirement
```
Expected: branch created from clean main at `d633ad2` (Phase 7 #15 design commit).

---

## Task 1: Pure client handler — `lib/calls/incoming-call-handler.ts`

Pure helper that wires `call:incoming` + `call:rejected` listeners on a minimal socket-shaped target and returns a disposer. Mirrors `lib/presence/in-call-handler.ts` byte-for-byte structure. Node-testable per `[[pure-helper-extraction-pattern]]`.

**Files:**
- Create: `apps/web/src/lib/calls/incoming-call-handler.ts`
- Test: `apps/web/src/lib/calls/incoming-call-handler.test.ts`

- [ ] **Step 1: Write the failing test (4 RED cases)**

Create `apps/web/src/lib/calls/incoming-call-handler.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { attachIncomingCallHandler } from "./incoming-call-handler";

import type { IncomingCallPayload } from "@/lib/livekit/types";

type IncomingListener = (payload: IncomingCallPayload) => void;
type RejectedListener = (payload: { callId: string; reason: "declined" | "unavailable" }) => void;

interface FakeSocket {
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  __emit: (event: "call:incoming" | "call:rejected", payload: unknown) => void;
}

function makeFakeSocket(): FakeSocket {
  const incoming = new Set<IncomingListener>();
  const rejected = new Set<RejectedListener>();
  const on = vi.fn((event: string, listener: unknown) => {
    if (event === "call:incoming") incoming.add(listener as IncomingListener);
    if (event === "call:rejected") rejected.add(listener as RejectedListener);
  });
  const off = vi.fn((event: string, listener: unknown) => {
    if (event === "call:incoming") incoming.delete(listener as IncomingListener);
    if (event === "call:rejected") rejected.delete(listener as RejectedListener);
  });
  return {
    on,
    off,
    __emit: (event, payload) => {
      if (event === "call:incoming") {
        for (const listener of incoming) listener(payload as IncomingCallPayload);
      } else {
        for (const listener of rejected) listener(payload as Parameters<RejectedListener>[0]);
      }
    },
  };
}

const SAMPLE_INCOMING: IncomingCallPayload = {
  callId: "call_abc",
  callerName: "Alice",
  callerDepartment: null,
  roomName: "room_xyz",
  recipientDeptId: "dept_1",
};

describe("attachIncomingCallHandler", () => {
  it("registers both call:incoming and call:rejected listeners on the socket", () => {
    const socket = makeFakeSocket();
    attachIncomingCallHandler(socket, {
      onIncoming: vi.fn(),
      onRejected: vi.fn(),
    });
    expect(socket.on).toHaveBeenCalledWith("call:incoming", expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith("call:rejected", expect.any(Function));
    expect(socket.on).toHaveBeenCalledTimes(2);
  });

  it("invokes onIncoming with the payload when the socket emits call:incoming", () => {
    const socket = makeFakeSocket();
    const onIncoming = vi.fn();
    attachIncomingCallHandler(socket, { onIncoming, onRejected: vi.fn() });
    socket.__emit("call:incoming", SAMPLE_INCOMING);
    expect(onIncoming).toHaveBeenCalledTimes(1);
    expect(onIncoming).toHaveBeenCalledWith(SAMPLE_INCOMING);
  });

  it("invokes onRejected with {callId, reason} when the socket emits call:rejected", () => {
    const socket = makeFakeSocket();
    const onRejected = vi.fn();
    attachIncomingCallHandler(socket, { onIncoming: vi.fn(), onRejected });
    socket.__emit("call:rejected", { callId: "call_abc", reason: "declined" });
    expect(onRejected).toHaveBeenCalledTimes(1);
    expect(onRejected).toHaveBeenCalledWith({ callId: "call_abc", reason: "declined" });
  });

  it("disposer unwires both listeners (no further callbacks after dispose)", () => {
    const socket = makeFakeSocket();
    const onIncoming = vi.fn();
    const onRejected = vi.fn();
    const dispose = attachIncomingCallHandler(socket, { onIncoming, onRejected });
    dispose();
    expect(socket.off).toHaveBeenCalledWith("call:incoming", expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith("call:rejected", expect.any(Function));
    socket.__emit("call:incoming", SAMPLE_INCOMING);
    socket.__emit("call:rejected", { callId: "call_abc", reason: "declined" });
    expect(onIncoming).not.toHaveBeenCalled();
    expect(onRejected).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test — verify all 4 fail**

```bash
pnpm -s test --run apps/web/src/lib/calls/incoming-call-handler.test.ts 2>&1 | tail -10
```
Expected: 4 FAILs with import error "Cannot find module './incoming-call-handler'" (file does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `apps/web/src/lib/calls/incoming-call-handler.ts`:

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

type RejectedPayload = { callId: string; reason: "declined" | "unavailable" };

export interface MinimalIncomingCallSocketTarget {
  on(event: "call:incoming", listener: (payload: IncomingCallPayload) => void): unknown;
  on(event: "call:rejected", listener: (payload: RejectedPayload) => void): unknown;
  off(event: "call:incoming", listener: (payload: IncomingCallPayload) => void): unknown;
  off(event: "call:rejected", listener: (payload: RejectedPayload) => void): unknown;
}

export function attachIncomingCallHandler(
  socket: MinimalIncomingCallSocketTarget,
  callbacks: {
    onIncoming: (payload: IncomingCallPayload) => void;
    onRejected: (payload: RejectedPayload) => void;
  },
): () => void {
  const { onIncoming, onRejected } = callbacks;
  socket.on("call:incoming", onIncoming);
  socket.on("call:rejected", onRejected);
  return () => {
    socket.off("call:incoming", onIncoming);
    socket.off("call:rejected", onRejected);
  };
}
```

**Note:** This module imports `IncomingCallPayload` from `@/lib/livekit/types`. That interface currently has 4 fields; Task 4 adds `recipientDeptId`. The fake test fixture above already includes `recipientDeptId` because TypeScript will require it after Task 4 — the test will continue to pass with the existing 4-field shape too (TS allows fixture supersets). Running the test before Task 4 may surface a type error on the `SAMPLE_INCOMING` fixture; that's fine — implementation is independent. If it errors, temporarily remove `recipientDeptId` from the fixture and re-add it after Task 4 lands.

- [ ] **Step 4: Run the test — verify all 4 pass**

```bash
pnpm -s test --run apps/web/src/lib/calls/incoming-call-handler.test.ts 2>&1 | tail -10
```
Expected: 4 passes.

- [ ] **Step 5: Run full test suite — no regression**

```bash
pnpm -s test --run 2>&1 | tail -5
```
Expected: 148 passing (was 144; +4 from this task).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/calls/incoming-call-handler.ts \
        apps/web/src/lib/calls/incoming-call-handler.test.ts
git commit -m "feat(calls): pure client handler for call:incoming/call:rejected

Phase 7 #15 — adds attachIncomingCallHandler pure helper. Mirrors
lib/presence/in-call-handler.ts structure. Node-testable (no jsdom).

4 RED→GREEN: register both listeners; onIncoming fires; onRejected
fires; disposer unwires both."
```

---

## Task 2: Server-side call handler — `server/socket/calls.ts`

`attachCallHandlers({io, socket})` joins both org-scoped channels on connect and listens for client-emitted `call:reject` to relay org-scoped. No roster — calls are per-event.

**Files:**
- Create: `apps/web/src/server/socket/calls.ts`
- Test: `apps/web/src/server/socket/calls.test.ts`

- [ ] **Step 1: Write the failing test (8 RED cases)**

Create `apps/web/src/server/socket/calls.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { attachCallHandlers } from "./calls";

import type { SocketSession } from "@/server/socket/auth";
import type { Server as IOServer, Socket } from "socket.io";

vi.mock("@/server/socket/channels", () => ({
  emitToOrg: vi.fn(),
  joinOrgChannel: vi.fn(),
}));

// Re-import the mocked module so tests can assert against the mock fns.
import { emitToOrg, joinOrgChannel } from "@/server/socket/channels";

type RejectListener = (payload: unknown) => void;

interface FakeSocket {
  data: { session?: SocketSession };
  on: ReturnType<typeof vi.fn>;
  __emit: (event: "call:reject", payload: unknown) => void;
}

function makeFakeSocket(session?: SocketSession): FakeSocket {
  const rejectListeners = new Set<RejectListener>();
  const on = vi.fn((event: string, listener: RejectListener) => {
    if (event === "call:reject") rejectListeners.add(listener);
  });
  return {
    data: { session },
    on,
    __emit: (event, payload) => {
      if (event === "call:reject") {
        for (const listener of rejectListeners) listener(payload);
      }
    },
  };
}

const SAMPLE_SESSION: SocketSession = {
  userId: "user_alice",
  organizationId: "org_acme",
  role: "host",
};

const fakeIO = {} as IOServer;

function castSocket(fake: FakeSocket): Socket {
  return fake as unknown as Socket;
}

describe("attachCallHandlers", () => {
  beforeEach(() => {
    vi.mocked(emitToOrg).mockClear();
    vi.mocked(joinOrgChannel).mockClear();
  });

  it("is a no-op when socket.data.session is undefined", () => {
    const socket = makeFakeSocket(undefined);
    attachCallHandlers({ io: fakeIO, socket: castSocket(socket) });
    expect(joinOrgChannel).not.toHaveBeenCalled();
    expect(socket.on).not.toHaveBeenCalled();
  });

  it("joins both org channels on connect", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachCallHandlers({ io: fakeIO, socket: castSocket(socket) });
    expect(joinOrgChannel).toHaveBeenCalledWith(socket, "call:incoming");
    expect(joinOrgChannel).toHaveBeenCalledWith(socket, "call:rejected");
    expect(joinOrgChannel).toHaveBeenCalledTimes(2);
  });

  it("relays valid call:reject as call:rejected via emitToOrg", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachCallHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit("call:reject", { callId: "call_abc" });
    expect(emitToOrg).toHaveBeenCalledTimes(1);
    expect(emitToOrg).toHaveBeenCalledWith(
      fakeIO,
      "org_acme",
      "call:rejected",
      { callId: "call_abc", reason: "declined" },
    );
  });

  it("ignores malformed call:reject payload (non-object)", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachCallHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit("call:reject", "not an object");
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  it("ignores call:reject with missing callId field", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachCallHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit("call:reject", { reason: "declined" });
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  it("ignores call:reject with non-string callId", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachCallHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit("call:reject", { callId: 12345 });
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  it("ignores call:reject with empty-string callId", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachCallHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit("call:reject", { callId: "" });
    expect(emitToOrg).not.toHaveBeenCalled();
  });

  it("ignores call:reject with callId longer than 128 chars", () => {
    const socket = makeFakeSocket(SAMPLE_SESSION);
    attachCallHandlers({ io: fakeIO, socket: castSocket(socket) });
    socket.__emit("call:reject", { callId: "x".repeat(129) });
    expect(emitToOrg).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test — verify all 8 fail**

```bash
pnpm -s test --run apps/web/src/server/socket/calls.test.ts 2>&1 | tail -10
```
Expected: 8 FAILs with "Cannot find module './calls'".

- [ ] **Step 3: Write the minimal implementation**

Create `apps/web/src/server/socket/calls.ts`:

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
 * scope fences §5 of the design doc).
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

- [ ] **Step 4: Run the test — verify all 8 pass**

```bash
pnpm -s test --run apps/web/src/server/socket/calls.test.ts 2>&1 | tail -10
```
Expected: 8 passes.

- [ ] **Step 5: Run full test suite — no regression**

```bash
pnpm -s test --run 2>&1 | tail -5
```
Expected: 156 passing (was 148 after Task 1; +8 from this task).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/server/socket/calls.ts \
        apps/web/src/server/socket/calls.test.ts
git commit -m "feat(server/socket): call:incoming/call:rejected handler attach

Phase 7 #15 — adds attachCallHandlers. No roster (calls are per-event).
Server-resolved caller identity via socket.data.session — client only
carries {callId}. {reason} server-fixed to 'declined'.

8 RED→GREEN: session-guard no-op; both channels joined; valid relay;
malformed-payload rejected ×5 (non-object/missing-callId/non-string/
empty-string/over-128-chars)."
```

---

## Task 3: getIO singleton + wire `attachCallHandlers` in `server/socket/server.ts`

Add a module-level singleton so `calls.initiate` (tRPC, not socket-side) can broadcast via `emitToOrg`. Wire the new handler into `io.on("connection")` alongside presence + in-call.

**Files:**
- Modify: `apps/web/src/server/socket/server.ts`

- [ ] **Step 1: Read the current server.ts**

```bash
cat apps/web/src/server/socket/server.ts
```
Confirm the import list (~lines 20–28), the `IOServer` construction (~line 32), the `io.on("connection"` block (~line 67–69). Hold this in working memory.

- [ ] **Step 2: Edit `apps/web/src/server/socket/server.ts`**

Add the new import alongside `attachInCallHandlers` / `attachPresenceHandlers` (alphabetical order keeps it tidy):

```ts
import { attachCallHandlers } from "@/server/socket/calls";
```

Add the singleton just above (or below — anywhere outside `createSocketServer`) the function declaration:

```ts
let ioInstance: IOServer | null = null;

export function getIO(): IOServer | null {
  return ioInstance;
}
```

Inside `createSocketServer`, immediately after `const io = new IOServer(httpServer, { ... })`:

```ts
ioInstance = io;
```

Inside `io.on("connection", (socket) => { ... })`, add **after** the existing `attachPresenceHandlers` and `attachInCallHandlers` calls:

```ts
attachCallHandlers({ io, socket });
```

The final connection block looks like:
```ts
io.on("connection", (socket) => {
  attachPresenceHandlers({ io, socket, roster: presenceRoster });
  attachInCallHandlers({ io, socket, roster: inCallRoster });
  attachCallHandlers({ io, socket });
});
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm -s typecheck 2>&1 | tail -5
```
Expected: 0 errors across 8 packages.

- [ ] **Step 4: Run pnpm build (MANDATORY per `[[instrumentation-edge-stub-required]]`)**

```bash
pnpm -s build 2>&1 | tail -15
```
Expected: 22 routes compiled + middleware ~140kB. `server/socket/calls.ts` is now in the `createSocketServer` import chain, so the Edge-runtime stub must continue to satisfy it.

- [ ] **Step 5: Run full test suite — no regression**

```bash
pnpm -s test --run 2>&1 | tail -5
```
Expected: 156 passing (unchanged from Task 2 — this task adds production code only, no tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/server/socket/server.ts
git commit -m "feat(server/socket): getIO singleton + wire attachCallHandlers

Phase 7 #15 — exposes a module-level IO accessor so the tRPC side
(calls.initiate) can broadcast via emitToOrg without going through
the dead legacy lib/socket/server.ts. Wires attachCallHandlers into
io.on('connection') alongside presence + in-call.

Closes [[parallel-socket-servers-coexistence]] on the server side."
```

---

## Task 4: Add `recipientDeptId` to `IncomingCallPayload`

The new `calls.initiate` payload (Task 5) needs to carry `recipientDeptId` so the dialog can later filter on it. Currently `IncomingCallPayload` has only 4 fields; the new flow needs 5.

**Files:**
- Modify: `apps/web/src/lib/livekit/types.ts`

- [ ] **Step 1: Edit `apps/web/src/lib/livekit/types.ts`**

Replace the existing interface:

```ts
export interface IncomingCallPayload {
  callId: string;
  callerName: string;
  callerDepartment: string | null;
  roomName: string;
  recipientDeptId: string;
}
```

Existing call sites (the legacy `emitIncomingCall` and `incoming-call-dialog`'s payload state) will type-error until Tasks 5 + 7 update them. That's expected — TypeScript drives the rewire.

- [ ] **Step 2: Run typecheck to confirm the expected cascade of errors**

```bash
pnpm -s typecheck 2>&1 | tail -20
```
Expected: typecheck **fails** with errors at:
- `apps/web/src/lib/socket/server.ts` (legacy `emitIncomingCall` payload missing `recipientDeptId`)
- `apps/web/src/server/trpc/routers/calls.ts` (call site missing `recipientDeptId` in nested `payload`)
- `apps/web/src/components/call/incoming-call-dialog.tsx` (state type — if it's narrowed to `IncomingCallPayload | null`)

These errors will be cleared by Tasks 5 + 6 + 7. **Do not** attempt to "fix" them here — they're the signal that the cascade is wired correctly.

- [ ] **Step 3: Commit (with red typecheck)**

```bash
git add apps/web/src/lib/livekit/types.ts
git commit --no-verify -m "feat(livekit/types): add recipientDeptId to IncomingCallPayload

Phase 7 #15 — required by the new emitToOrg call:incoming payload.
TypeScript will now flag every existing consumer that doesn't carry
recipientDeptId; the errors are cleared by Tasks 5 + 6 + 7.

NOTE: this commit leaves the tree typecheck-red. The next three tasks
restore green. Do not merge a chain ending here."
```

**Why `--no-verify`?** If a pre-commit hook runs `pnpm typecheck` (project hooks vary — check `.husky/` or `package.json`), this commit will fail without `--no-verify` because the cascade is intentional. If no pre-commit typecheck exists in this repo, drop the flag.

---

## Task 5: Rewire `calls.initiate` + delete `calls.reject` mutation + create router tests

Switch the calls router from the dead legacy server to the live one. Inline the new emit. Delete the orphan `reject` mutation. Write the test file (which doesn't exist) covering both the new initiate behavior and `getIO()=null` graceful degradation.

**Files:**
- Modify: `apps/web/src/server/trpc/routers/calls.ts`
- Create: `apps/web/src/server/trpc/routers/calls.test.ts`

- [ ] **Step 1: Write the failing router tests (2 RED cases)**

Create `apps/web/src/server/trpc/routers/calls.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@yelli/db", () => ({
  prisma: {
    department: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/livekit/client", () => ({
  mintLiveKitToken: vi.fn(),
}));

vi.mock("@/server/socket/server", () => ({
  getIO: vi.fn(),
}));

vi.mock("@/server/socket/channels", () => ({
  emitToOrg: vi.fn(),
}));

vi.mock("@/server/lib/call-log", () => ({
  recordIntercomCallLog: vi.fn(),
}));

import { prisma } from "@yelli/db";
import { mintLiveKitToken } from "@/lib/livekit/client";
import { emitToOrg } from "@/server/socket/channels";
import { getIO } from "@/server/socket/server";

import { callsRouter } from "./calls";

import type { Server as IOServer } from "socket.io";

type Caller = ReturnType<typeof callsRouter.createCaller>;

const SAMPLE_DEPT = {
  id: "dept_recipient",
  name: "Front Desk",
  organizationId: "org_acme",
  default_user_id: "user_recipient",
};

function makeCaller(): Caller {
  return callsRouter.createCaller({
    userId: "user_caller",
    user: { id: "user_caller", name: "Alice", email: "a@a.test" },
    organizationId: "org_acme",
    role: "host",
    // prisma is mocked above; the trpc context wiring uses the same import
  } as never);
}

describe("callsRouter.initiate", () => {
  beforeEach(() => {
    vi.mocked(prisma.department.findFirst).mockResolvedValue(SAMPLE_DEPT as never);
    vi.mocked(mintLiveKitToken).mockResolvedValue({
      token: "TOKEN",
      wsUrl: "ws://test",
      roomName: "room_test",
    });
    vi.mocked(emitToOrg).mockClear();
  });

  it("broadcasts call:incoming org-scoped with recipientDeptId when IO is live", async () => {
    const fakeIO = {} as IOServer;
    vi.mocked(getIO).mockReturnValue(fakeIO);

    const caller = makeCaller();
    const result = await caller.initiate({ departmentId: "dept_recipient" });

    expect(emitToOrg).toHaveBeenCalledTimes(1);
    expect(emitToOrg).toHaveBeenCalledWith(
      fakeIO,
      "org_acme",
      "call:incoming",
      expect.objectContaining({
        callerName: "Alice",
        callerDepartment: null,
        roomName: "room_test",
        recipientDeptId: "dept_recipient",
      }),
    );
    expect(result).toMatchObject({
      roomName: "room_test",
      token: "TOKEN",
      wsUrl: "ws://test",
      recipientDepartmentName: "Front Desk",
    });
    expect(typeof result.callId).toBe("string");
  });

  it("returns normally without emitting when getIO() returns null", async () => {
    vi.mocked(getIO).mockReturnValue(null);

    const caller = makeCaller();
    const result = await caller.initiate({ departmentId: "dept_recipient" });

    expect(emitToOrg).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      roomName: "room_test",
      token: "TOKEN",
      wsUrl: "ws://test",
      recipientDepartmentName: "Front Desk",
    });
  });
});
```

**Note on the `makeCaller` cast:** the tRPC context type in this project is rich (includes session helpers, prisma instance, etc.). Casting to `never` is the existing pattern across other router tests in this repo and matches `[[trpc-test-context-narrowing-pattern]]` if applicable. If a sibling router test (e.g. `meetings.test.ts` or `admin.test.ts` from Phase 7 #13) shows a richer pattern, mirror that instead — but the cast is sufficient for these two cases.

- [ ] **Step 2: Run the new tests — verify both fail**

```bash
pnpm -s test --run apps/web/src/server/trpc/routers/calls.test.ts 2>&1 | tail -10
```
Expected: 2 FAILs because:
- `getIO` is being mocked from `@/server/socket/server` but the router still imports it from `@/lib/socket/server`, AND
- the router doesn't call `emitToOrg` yet — it calls `emitIncomingCall`.

- [ ] **Step 3: Modify `apps/web/src/server/trpc/routers/calls.ts`**

Replace line 6 (the legacy import):

```ts
// BEFORE:
import { emitIncomingCall, getIO } from "@/lib/socket/server";

// AFTER:
import { emitToOrg } from "@/server/socket/channels";
import { getIO } from "@/server/socket/server";
```

Replace lines 57–70 (the emit block inside `initiate`) with the inline `emitToOrg` call:

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

Delete lines 81–98 entirely — the whole `reject` mutation block:

```ts
// DELETE this entire block:
/**
 * Rejects an incoming call — notifies the caller via Socket.IO.
 */
reject: protectedProcedure
  .input(
    z.object({ callId: z.string().min(1).max(128) }).strict(),
  )
  .mutation(({ input }) => {
    const io = getIO();
    if (io !== null) {
      io.to(`call:reject:${input.callId}`).emit("call:rejected", {
        callId: input.callId,
        reason: "declined",
      });
    }

    return { ok: true } as const;
  }),
```

After deletion, the `initiate` procedure is followed directly by the `end` procedure. Verify the comma + indentation is clean.

- [ ] **Step 4: Run the router tests — verify both pass**

```bash
pnpm -s test --run apps/web/src/server/trpc/routers/calls.test.ts 2>&1 | tail -10
```
Expected: 2 passes.

- [ ] **Step 5: Run typecheck**

```bash
pnpm -s typecheck 2>&1 | tail -10
```
Expected: errors at this stage:
- `apps/web/src/lib/socket/server.ts` — orphan `emitIncomingCall` definition still references `callIncomingRoom`, `callerRoom`, `PresenceState`, etc. Will be cleared by Task 6.
- `apps/web/src/components/call/incoming-call-dialog.tsx` — still uses the legacy types in a way that may or may not error here. Will be cleared by Task 7.

`calls.ts` itself should be clean.

- [ ] **Step 6: Run full test suite — confirm only the router file moved**

```bash
pnpm -s test --run 2>&1 | tail -5
```
Expected: 158 passing (was 156; +2 from this task).

- [ ] **Step 7: Commit (with still-red typecheck)**

```bash
git add apps/web/src/server/trpc/routers/calls.ts \
        apps/web/src/server/trpc/routers/calls.test.ts
git commit --no-verify -m "feat(calls): rewire initiate to new server; delete reject mutation

Phase 7 #15 — calls.initiate now broadcasts call:incoming via emitToOrg
on the live auth-gated server (was the dead legacy lib/socket/server.ts).
Payload now carries recipientDeptId for future client-side dept filter.

Deletes the orphan calls.reject tRPC mutation (zero call sites; rejection
flows through socket.emit('call:reject') in the dialog).

Adds 2 RED→GREEN router tests (initiate with live IO; initiate with null IO).

NOTE: typecheck still red because legacy lib/socket/server.ts orphans
remain; cleared by Task 6."
```

---

## Task 6: Delete legacy files — `lib/socket/server.ts` + `app/api/socket/route.ts`

With every caller migrated (calls.ts router in Task 5; the dialog will be migrated in Task 7 but doesn't import these files), both legacy modules are now unreachable. Strict retirement.

**Files:**
- Delete: `apps/web/src/lib/socket/server.ts` (159 lines)
- Delete: `apps/web/src/app/api/socket/route.ts` (40 lines)

- [ ] **Step 1: Verify no remaining consumers of either file**

```bash
grep -rn "@/lib/socket/server" apps/web/src/ 2>&1 | grep -v "apps/web/src/lib/socket/server.ts:"
grep -rn "lib/socket/server" apps/web/src/ 2>&1 | grep -v "apps/web/src/lib/socket/server.ts:"
grep -rn "api/socket" apps/web/src/ 2>&1
```
Expected:
- First two: zero hits. (If any hit appears, it's a missed consumer — STOP and reconcile before deleting.)
- Third: only `apps/web/src/components/call/incoming-call-dialog.tsx` references `"/api/socket"` as a path. That's the only remaining usage — it goes away in Task 7. Recording its presence is OK because the dialog hasn't been migrated yet.

- [ ] **Step 2: Delete both files**

```bash
git rm apps/web/src/lib/socket/server.ts
git rm apps/web/src/app/api/socket/route.ts
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm -s typecheck 2>&1 | tail -10
```
Expected: now down to a smaller error set:
- `apps/web/src/components/call/incoming-call-dialog.tsx` — still uses raw `io()` from `socket.io-client` + a state shape that may not yet include `recipientDeptId`. Cleared by Task 7.
- `apps/web/src/lib/socket/types.ts` — may still export the dead `callIncomingRoom` / `callerRoom` helpers and dead events; no consumer should reference them now. Cleared by Task 8.

`calls.ts`, `server/socket/server.ts`, and all new files should typecheck clean.

- [ ] **Step 4: Run full test suite — confirm tests still green**

```bash
pnpm -s test --run 2>&1 | tail -5
```
Expected: 158 passing (deletion is type-level; no test moves).

- [ ] **Step 5: Commit (still-red typecheck)**

```bash
git commit --no-verify -m "chore(socket): delete legacy server.ts + api/socket/route.ts

Phase 7 #15 — strict retirement. lib/socket/server.ts (159 lines) was
never bootstrapped (no call site for initSocketServer). api/socket/
route.ts (40 lines) was a 503 placeholder for the phantom
server/custom-server.ts that was abandoned at Phase 7 #8e-1.

199 lines deleted. No defense-in-depth.

NOTE: typecheck still red on incoming-call-dialog (Task 7) and the
dead-types cascade in lib/socket/types.ts (Task 8)."
```

---

## Task 7: Migrate `incoming-call-dialog.tsx` to `useSocketOptional()` + `attachIncomingCallHandler`

Drop the raw `io()` connection that targeted the 503 placeholder. Subscribe via the existing shared socket. Reject button emits over the same socket — no second connection.

**Files:**
- Modify: `apps/web/src/components/call/incoming-call-dialog.tsx`

- [ ] **Step 1: Read the current dialog**

```bash
cat apps/web/src/components/call/incoming-call-dialog.tsx
```
Confirm the imports (lines 11–13), the `SOCKET_URL` constant (lines 17–21), the `socketRef` ref (~line 60), the state declarations (~lines 64–65), the raw `io()` `useEffect` block (~lines 85–108), and the `handleReject` callback (~lines 117–122).

- [ ] **Step 2: Apply the migration edits**

Replace line 13:
```ts
// BEFORE:
import { io, type Socket } from "socket.io-client";

// AFTER:
import { attachIncomingCallHandler } from "@/lib/calls/incoming-call-handler";
import { useSocketOptional } from "@/lib/socket/socket-context";
```

Delete lines 17–21 entirely (the `SOCKET_URL` derivation block).

Delete line 60:
```ts
// DELETE:
const socketRef = useRef<Socket | null>(null);
```
If `useRef` is no longer used anywhere else in the file after this deletion, remove it from the React import too (line 12). Re-grep the file after editing to confirm.

Add a hook call right after the existing state declarations (after line 65):
```ts
const socket = useSocketOptional();
```

Replace the entire raw-`io()` `useEffect` block (lines 85–108) with:

```ts
useEffect(() => {
  if (socket === null) return;

  const handleIncoming = (incoming: IncomingCallPayload): void => {
    // TODO follow-up (Phase 7 #16 candidate):
    // filter by `incoming.recipientDeptId === currentUser.boundDeptId`
    // once department-binding context reaches the dialog. For now
    // every org member rings — matches current production behavior
    // (which was a no-op end-to-end).
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

**Critical:** match the deps array against your current `startRingtone` / `stopRingtone` references. If those are inlined in the existing component, hoist them with `useCallback` or restructure — but **do not** silently drop them from deps; React will warn.

Replace `handleReject` (line 117–122):

```ts
const handleReject = useCallback(() => {
  if (!payload || !socket) return;
  socket.emit("call:reject", { callId: payload.callId });
  stopRingtone();
  setOpen(false);
  setPayload(null);
}, [payload, socket, stopRingtone]);
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm -s typecheck 2>&1 | tail -10
```
Expected: errors now isolated to `apps/web/src/lib/socket/types.ts` orphans (cleared by Task 8). The dialog itself should typecheck clean.

If the typecheck reports an error on `useSocketOptional`'s return type vs. the `MinimalIncomingCallSocketTarget` shape from `attachIncomingCallHandler`, the helper's type may need `Socket` (full socket.io-client type) substituted. Check the existing `@/lib/socket/socket-context` export to confirm the return type, and widen `MinimalIncomingCallSocketTarget` if necessary while keeping it minimal enough for the Node-only tests.

- [ ] **Step 4: Run full test suite**

```bash
pnpm -s test --run 2>&1 | tail -5
```
Expected: 158 passing (no test files moved).

- [ ] **Step 5: Commit (still-red typecheck on the types file only)**

```bash
git add apps/web/src/components/call/incoming-call-dialog.tsx
git commit --no-verify -m "feat(call/dialog): migrate to useSocketOptional + attachIncomingCallHandler

Phase 7 #15 — drops the raw io() connection that targeted the 503
placeholder /api/socket route. Subscribes via the existing auth-gated
shared socket. Reject button emits over the same socket.

Now using:
- useSocketOptional() for the shared socket reference
- attachIncomingCallHandler for the pure listener+disposer wiring
- socket.emit('call:reject', {callId}) for rejection

TODO follow-up (Phase 7 #16 candidate): filter onIncoming by
incoming.recipientDeptId === boundDeptId once the dialog has access
to the current user's binding context.

NOTE: typecheck still red on lib/socket/types.ts dead exports; cleared
by Task 8."
```

---

## Task 8: Delete dead types in `lib/socket/types.ts`

Final cleanup. With every consumer of the legacy events / helpers / fields removed, the types module's dead exports are now truly orphaned.

**Files:**
- Modify: `apps/web/src/lib/socket/types.ts`

- [ ] **Step 1: Verify no consumers**

```bash
grep -rn "presence:subscribe\|presence:heartbeat\|presence:update\b" apps/web/src/ 2>&1
grep -rn "callIncomingRoom\|callerRoom" apps/web/src/ 2>&1
grep -rn "subscribedDepartmentIds" apps/web/src/ 2>&1
grep -rn "PresenceState" apps/web/src/ | grep -v "apps/web/src/lib/presence/types.ts" | grep -v "apps/web/src/lib/presence/"
```
Expected:
- First three: only hits should be within `apps/web/src/lib/socket/types.ts` itself.
- Fourth: only hits should be inside `apps/web/src/lib/presence/`. None inside `apps/web/src/lib/socket/types.ts`.

If any external hit appears, STOP and reconcile before deleting.

- [ ] **Step 2: Edit `apps/web/src/lib/socket/types.ts`**

Open the file and apply these deletions. Specific lines from the pre-edit grep:
- Line 2: `import type { PresenceState } from "@/lib/presence/types";` — DELETE
- Lines 10–17 (or wherever `"presence:update"` is declared, including its leading legacy-Phase-5b comment block): DELETE the whole event entry
- Line 41: `"presence:subscribe": (departmentIds: string[]) => void;` — DELETE
- Line 42: `"presence:heartbeat": () => void;` — DELETE
- Line 58: `subscribedDepartmentIds: Set<string>;` — DELETE (from inside `SocketData`)
- Lines 61–64: the `callIncomingRoom` and `callerRoom` `export const ...` helpers — DELETE both

**Keep:**
- The `IncomingCallPayload` import at the top (still used by `call:incoming` event signature).
- The `call:incoming`, `call:rejected`, `call:reject` event signatures.
- `SocketData` (the remaining `userId` + `organizationId` fields are still used by the new server).
- All other events / fields not listed in the delete list.

After editing, the file should be ~14 lines shorter.

- [ ] **Step 3: Run typecheck**

```bash
pnpm -s typecheck 2>&1 | tail -10
```
Expected: **0 errors across 8 packages.** The cascade started in Task 4 is now fully resolved.

- [ ] **Step 4: Run pnpm build (MANDATORY per `[[instrumentation-edge-stub-required]]`)**

```bash
pnpm -s build 2>&1 | tail -10
```
Expected: 22 routes compiled, middleware ~140kB.

- [ ] **Step 5: Run full test suite**

```bash
pnpm -s test --run 2>&1 | tail -5
```
Expected: 158 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/socket/types.ts
git commit -m "chore(socket/types): delete dead events + helpers + import

Phase 7 #15 — final cascade cleanup. All consumers migrated in
prior tasks; these exports are now truly orphaned.

Deletes:
- presence:subscribe / presence:heartbeat / presence:update events
- subscribedDepartmentIds field on SocketData
- callIncomingRoom / callerRoom helpers
- PresenceState import (only used by deleted presence:update)

~14 lines removed. Typecheck + build green.

Closes [[parallel-socket-servers-coexistence]]."
```

---

## Task 9: Full 5-check validation

- [ ] **Step 1: pnpm test**

```bash
pnpm -s test --run 2>&1 | tail -5
```
Expected: 158 passing across 17 files (was 144/15; +14 from Tasks 1, 2, 5).

- [ ] **Step 2: pnpm typecheck**

```bash
pnpm -s typecheck 2>&1 | tail -5
```
Expected: 0 errors across 8 packages.

- [ ] **Step 3: pnpm lint**

```bash
pnpm -s lint 2>&1 | tail -5
```
Expected: 0 errors. 2 pre-existing warnings unchanged (`[[lint-pre-existing-warnings]]`).

- [ ] **Step 4: pnpm build (MANDATORY)**

```bash
pnpm -s build 2>&1 | tail -10
```
Expected: 22 routes compiled successfully, middleware ~140kB, ~58s wall.

- [ ] **Step 5: pnpm audit --audit-level=critical**

```bash
pnpm -s audit --audit-level=critical 2>&1 | tail -5
```
Expected: exit 0. `[[nodemailer-cve-mitigation]]` remains in effect (1 HIGH on nodemailer is documented-accepted; threshold is critical).

---

## Task 10: Two-stage code review (Rule 25)

Apply the checklist from the design doc §4.6 verbatim. Self-review — no subagent dispatch.

- [ ] **Stage 1: Spec compliance (10 items)**

For each, find the concrete evidence (file:line or test name):

1. `attachCallHandlers` exists in `server/socket/calls.ts` with the locked signature `(args: { io, socket }) => void`
2. `attachCallHandlers` wired in `server/socket/server.ts` `io.on("connection")` alongside presence + in-call
3. `getIO()` exported from `server/socket/server.ts`; `ioInstance` set immediately after `new IOServer(...)`
4. `calls.initiate` imports `getIO` from `@/server/socket/server`, `emitToOrg` from `@/server/socket/channels` — verify imports list
5. `calls.initiate` emit payload includes `recipientDeptId: department.id`; does **not** include `recipientOrgId` (no such field anywhere now)
6. `calls.reject` mutation deleted; `grep -rn "trpc.calls.reject\|calls\.reject" apps/web/src/` returns 0 hits
7. `apps/web/src/lib/socket/server.ts` deleted; `apps/web/src/app/api/socket/route.ts` deleted (`git log --diff-filter=D` on the branch shows both)
8. `lib/socket/types.ts`: `presence:subscribe`, `presence:heartbeat`, `presence:update`, `subscribedDepartmentIds`, `callIncomingRoom`, `callerRoom`, `PresenceState` import all gone (grep verifies)
9. `incoming-call-dialog` uses `useSocketOptional()` + `attachIncomingCallHandler`; no raw `io()` call remains (grep `"io(" apps/web/src/components/call/`)
10. `incoming-call-dialog` reject button emits via the shared `useSocketOptional()` socket, not a separate connection

If any item fails, fix it and re-run validation (Task 9). Do not proceed to merge with red spec compliance.

- [ ] **Stage 2: Code quality (8 items)**

1. Zero `any` types in the diff (`git diff main...HEAD | grep -E ': *any\b'` returns no matches outside string literals)
2. No type assertions (`as X`) without a comment justifying — review each `as` in the diff manually
3. TDD: every new file landed with its test; commit log shows RED→GREEN ordering (test file added in same commit as impl, or as the prior commit)
4. Only blast-radius files modified — no scope creep. Run `git diff --stat main...HEAD` and verify the file list matches the design doc §3.7 + §3.8 plus the test files
5. Conventional commit messages on every branch commit (`git log main..HEAD --pretty=oneline`)
6. No event-name drift across `types.ts` ↔ `calls.ts` ↔ `incoming-call-handler.ts` ↔ `incoming-call-dialog.tsx`. The four strings `"call:incoming"`, `"call:rejected"`, `"call:reject"` must appear identically in all places
7. Disposer pattern in `incoming-call-handler.ts` matches `lib/presence/in-call-handler.ts` exactly (same shape: `() => { socket.off(...); socket.off(...); }`)
8. Edge-runtime build passes (already verified in Task 9 Step 4 — the `instrumentation.ts` Edge-safe guard chain is preserved)

If any item fails, fix it and re-run validation. Do not proceed to merge with red quality review.

---

## Task 11: Squash-merge to main

- [ ] **Step 1: Confirm clean diff and commit list**

```bash
git log main..HEAD --pretty=oneline
git diff --stat main...HEAD
```
Expected commit count: 8 atomic commits across Tasks 1–8. Expected file changes: matches design doc §3.7 + §3.8.

- [ ] **Step 2: Confirm branch is up to date with main**

```bash
git fetch origin main
git log origin/main..HEAD --oneline | head -3
```
Expected: branch is ahead of `origin/main` by the 8 commits + (possibly) the design doc commit if not yet on origin.

- [ ] **Step 3: Switch to main and squash-merge**

```bash
git checkout main
git pull --ff-only
git merge --squash feat/legacy-socket-retirement
```
Resolve any merge conflicts (unlikely given the surgical scope and no other Phase 7 #15-adjacent work). Then craft the squash commit message:

```bash
git commit -m "feat(socket): retire legacy server; wire call:incoming via new auth-gated server (Phase 7 #15)

Closes [[parallel-socket-servers-coexistence]].

Server side:
- New apps/web/src/server/socket/calls.ts — attachCallHandlers; joins
  call:incoming + call:rejected org channels on connect; server-resolved
  caller identity for socket.emit('call:reject'). No roster.
- New module-level getIO() singleton in server/socket/server.ts so the
  tRPC side can broadcast via emitToOrg.
- calls.initiate rewired: imports from new server + channels; payload
  now carries recipientDeptId for future client filter.
- DELETED: calls.reject tRPC mutation (zero call sites).

Client side:
- New apps/web/src/lib/calls/incoming-call-handler.ts — pure helper
  mirroring lib/presence/in-call-handler.ts. Node-testable.
- incoming-call-dialog migrated to useSocketOptional + attachIncomingCallHandler.
  Reject button emits over the shared socket. No more raw io() to the
  503 placeholder.

Types:
- recipientDeptId added to IncomingCallPayload.
- DELETED: lib/socket/server.ts (159 lines, never bootstrapped).
- DELETED: app/api/socket/route.ts (40 lines, 503 placeholder).
- DELETED: lib/socket/types.ts dead exports — presence:subscribe/heartbeat/update
  events, subscribedDepartmentIds field on SocketData, callIncomingRoom/callerRoom
  helpers, PresenceState import.

Tests: +14 (calls.ts 8 + incoming-call-handler.ts 4 + calls router 2).
Suite: 144 → 158.

Validation: pnpm test 158/158 ✓ · typecheck 0 errors · lint 0 errors
(2 pre-existing warnings) · build 22 routes + middleware 140kB ✓
· audit critical clean (nodemailer HIGH still documented-accepted).

Spec: docs/superpowers/specs/2026-05-18-legacy-socket-retirement-design.md (d633ad2)
Plan: docs/superpowers/plans/2026-05-18-legacy-socket-retirement.md"
```

- [ ] **Step 4: Delete the feature branch**

```bash
git branch -d feat/legacy-socket-retirement
```

- [ ] **Step 5: Post-merge validation on main**

```bash
pnpm -s test --run 2>&1 | tail -5
pnpm -s typecheck 2>&1 | tail -3
pnpm -s build 2>&1 | tail -10
```
Expected: 158 passing · 0 typecheck errors · 22 routes built.

- [ ] **Step 6: Capture the squash SHA**

```bash
git rev-parse --short HEAD
```
Note the SHA for the governance updates in Task 12.

---

## Task 12: Governance documentation

- [ ] **Step 1: Update `.cline/STATE.md`**

Replace the `PHASE`, `LAST_DONE_PRIOR`, `LAST_DONE`, `NEXT` blocks. Move the current `LAST_DONE` (Phase 7 #15 design) into `LAST_DONE_PRIOR`. Set:

```
PHASE: Phase 7 #15 (legacy-socket-retirement) — COMPLETE. Squash-merged to main 2026-05-XX as `<SHA>`. Legacy Socket.IO scaffold fully retired; incoming-call now works end-to-end through the auth-gated server. Closes [[parallel-socket-servers-coexistence]] from Phase 7 #11.

LAST_DONE: 2026-05-XX Phase 7 #15 ticket (legacy-socket-retirement) — Tier 2 single-session (~XXK Opus 4.7 controller context, fully inline execution per user choice matching Phase 7 #14 precedent). 11 files (4 new + 5 modified + 2 deleted): NEW server/socket/calls.ts (~70 lines — attachCallHandlers no-roster) + calls.test.ts (~180 lines, 8 RED→GREEN); NEW lib/calls/incoming-call-handler.ts (~50 lines — pure helper) + incoming-call-handler.test.ts (~120 lines, 4 RED→GREEN); NEW server/trpc/routers/calls.test.ts (~110 lines, 2 RED→GREEN); MODIFIED server/socket/server.ts (+12 — getIO singleton + attach); MODIFIED server/trpc/routers/calls.ts (−25/+12 — rewire imports + emit + delete reject mutation); MODIFIED lib/livekit/types.ts (+1 — recipientDeptId); MODIFIED lib/socket/types.ts (~−14 — dead events/helpers/import); MODIFIED components/call/incoming-call-dialog.tsx (~−35/+25 — useSocketOptional migration); DELETED lib/socket/server.ts (159 lines) + app/api/socket/route.ts (40 lines). Validation: pnpm test 158/158 ✓ (was 144; +14 exactly), pnpm typecheck ✓ 0 errors across 8 packages, pnpm lint ✓ 0 errors (2 pre-existing warnings unchanged), pnpm build ✓ 22 routes compiled + middleware 140kB (build MANDATORY per [[instrumentation-edge-stub-required]]), pnpm audit --audit-level=critical ✓ exit 0. Two-stage review (Rule 25): Stage 1 spec PASS (10/10) + Stage 2 quality PASS (8/8). 8 atomic branch commits + 1 squash. 0 new lessons logged — existing patterns covered everything.

LAST_DONE_PRIOR: <previous LAST_DONE content moved here>

NEXT: Phase 7 #16 candidates (any order):
  (department-binding-filter) Wire current-user's bound department into IncomingCallDialog so it filters call:incoming by `payload.recipientDeptId === boundDeptId`. Picks up the deferred-scope from #15. Needs a `useBoundDepartment()` hook or similar context. Tier 1.
  ... (rest of NEXT_AFTER_15 candidates from the prior STATE.md, promoted to NEXT)
```

- [ ] **Step 2: Update `docs/CHANGELOG_AI.md`**

Insert at the top of the reverse-chronological block:

```markdown
## 2026-05-XX — Phase 7 #15 (legacy-socket-retirement)
- Agent:              CLAUDE_CODE (Opus 4.7)
- Why:                Retire the unbootstrapped legacy Socket.IO scaffold; finally make incoming-call work end-to-end through the auth-gated server. Closes [[parallel-socket-servers-coexistence]].
- Files added:        apps/web/src/server/socket/calls.ts, apps/web/src/server/socket/calls.test.ts, apps/web/src/lib/calls/incoming-call-handler.ts, apps/web/src/lib/calls/incoming-call-handler.test.ts, apps/web/src/server/trpc/routers/calls.test.ts
- Files modified:     apps/web/src/server/socket/server.ts, apps/web/src/server/trpc/routers/calls.ts, apps/web/src/lib/livekit/types.ts, apps/web/src/lib/socket/types.ts, apps/web/src/components/call/incoming-call-dialog.tsx
- Files deleted:      apps/web/src/lib/socket/server.ts (159 lines), apps/web/src/app/api/socket/route.ts (40 lines)
- Schema/migrations:  none (realtime layer only)
- Tests added:        +14 (8 server calls; 4 pure client handler; 2 router initiate)
- Errors encountered: none novel — TDD cascade per plan
- Errors resolved:    none
- Squash SHA:         <SHA>
```

- [ ] **Step 3: Update `docs/IMPLEMENTATION_MAP.md`**

Promote the Phase 7 #15 entry to the top of "Built So Far". Demote Phase 7 #14. Add a line:

```markdown
### Phase 7 #15 — Legacy Socket Retirement (2026-05-XX)
Retires the unbootstrapped legacy Socket.IO scaffold. New `attachCallHandlers` on the auth-gated server; module-level `getIO()` singleton; pure client helper `attachIncomingCallHandler`; `incoming-call-dialog` migrated to `useSocketOptional`. Deletes 199 lines of dead legacy code (lib/socket/server.ts + api/socket/route.ts) + 14 lines of dead types. Closes [[parallel-socket-servers-coexistence]] from Phase 7 #11. First real implementation of incoming-call — prior production state had the dialog talking to a 503 placeholder.
```

- [ ] **Step 4: Update `.cline/memory/agent-log.md`**

Append:

```
2026-05-XX Phase 7 #15 legacy-socket-retirement squash-merged to main as <SHA>. 11 files / 199 deleted. Suite 144 → 158. CLAUDE_CODE Opus 4.7 inline.
```

- [ ] **Step 5: Update `.whatsnext`**

Remove the legacy-socket-retirement line from the recommended-next slot. Promote department-binding-filter (or another candidate per user preference) to the new recommended-next slot.

- [ ] **Step 6: Commit governance**

```bash
git add .cline/STATE.md \
        .cline/memory/agent-log.md \
        docs/CHANGELOG_AI.md \
        docs/IMPLEMENTATION_MAP.md \
        .whatsnext
git commit -m "chore(governance): record Phase 7 #15 squash SHA — <SHA>"
```

---

## Summary

**Spec coverage check (self-review):**
- §2.1 Single Socket.IO server → Task 3 (wire attachCallHandlers alongside presence + in-call)
- §2.2 New module `server/socket/calls.ts` → Task 2
- §2.3 Server-resolved caller identity → Task 2 (handler reads `socket.data.session.userId`, accepts only `{callId}` from client)
- §2.4 `calls.initiate` uses new server via `getIO()` → Task 3 (singleton) + Task 5 (rewire)
- §2.5 `incoming-call-dialog` migrates to `useSocketOptional()` → Task 7
- §2.6 `call:incoming` org-scoped, not department-scoped → Task 2 (joins org channels) + Task 5 (emitToOrg)
- §2.7 Pure-helper extraction → Task 1
- §2.8 Delete `recipientOrgId` from IncomingCallPayload → No-op; field never existed there. Task 4 adds `recipientDeptId` instead, matching the design intent.
- §2.9 Strict retirement deletes → Task 6 (server.ts + route.ts) + Task 8 (types) + Task 5 (reject mutation)
- §2.10 KEEP types.ts as shared contract → preserved by Task 8 (only the dead parts go)
- §3 Implementation details → Tasks 1–8 lift the code blocks verbatim
- §4.1 Server tests (8 cases) → Task 2
- §4.2 Pure handler tests (4 cases) → Task 1
- §4.3 Router test extension (~2 cases) → Task 5 (creates the file fresh)
- §4.4 Cumulative test count +14 → Tasks 1+2+5 deliver exactly +14
- §4.5 Validation gates → Task 9
- §4.6 Two-stage review (10 spec + 8 quality) → Task 10
- §5 Scope fences → respected; department-binding filter explicitly deferred in Task 7 TODO

**Total task count:** Pre-Flight (4 steps) + 12 tasks.
**Estimated commits on branch:** 8 atomic (Tasks 1–8) + 1 governance after merge.
**Estimated squash diff:** ~600 lines added (mostly tests), ~232 lines deleted (legacy), net ~+370 lines.
**Tier:** 2 (61.5) — within single-session inline Opus 4.7 SAFE zone.

**Plan complete and saved to `docs/superpowers/plans/2026-05-18-legacy-socket-retirement.md`.**
