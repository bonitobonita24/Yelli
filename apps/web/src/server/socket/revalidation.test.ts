/**
 * Phase 7 #8(e)-2 — 60s session revalidation loop.
 *
 * Per security.md §Realtime Connection Safety + AUTH DEFAULTS item 6, every
 * 60s we walk all connected sockets, fetch each user's current state from
 * the DB, and disconnect sockets whose session has been invalidated:
 *   - user.status changed to inactive / suspended / deactivated
 *   - user.organization.suspended_at !== null
 *   - user.security_version bumped (role change, password reset, etc.)
 *   - user no longer exists
 * The pure function `revalidateConnectedSockets` is fully tested here; the
 * setInterval wrapper `startSessionRevalidationLoop` is wiring covered by
 * future integration smoke (no logic to assert beyond clearInterval).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { revalidateConnectedSockets } from "@/server/socket/revalidation";

import type { SocketSession } from "@/server/socket/auth";
import type { Server as IOServer } from "socket.io";


vi.mock("@yelli/db", () => ({
  platformPrisma: {
    user: { findMany: vi.fn() },
  },
}));

function makeSocket(session: SocketSession | null) {
  const emit = vi.fn();
  const disconnect = vi.fn();
  return {
    data: { session },
    emit,
    disconnect,
  };
}

function makeIo(sockets: ReturnType<typeof makeSocket>[]) {
  return {
    fetchSockets: vi.fn().mockResolvedValue(sockets),
  } as unknown as IOServer;
}

const VALID_SESSION: SocketSession = {
  userId: "user-1",
  organizationId: "org-1",
  organizationSlug: "acme",
  role: "tenant_admin",
  isSuperAdmin: false,
  securityVersion: 1,
};

const VALID_DB_USER = {
  id: "user-1",
  status: "active",
  security_version: 1,
  organization: { suspended_at: null },
};

describe("revalidateConnectedSockets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns {checkedCount:0} when there are no connected sockets", async () => {
    const io = makeIo([]);
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { user: { findMany } } as never;
    const result = await revalidateConnectedSockets({ io, prisma });
    expect(result).toEqual({ disconnectedUserIds: [], checkedCount: 0 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("does NOT disconnect when DB confirms session is still valid", async () => {
    const socket = makeSocket(VALID_SESSION);
    const io = makeIo([socket]);
    const prisma = {
      user: { findMany: vi.fn().mockResolvedValue([VALID_DB_USER]) },
    } as never;

    const result = await revalidateConnectedSockets({ io, prisma });
    expect(result.disconnectedUserIds).toEqual([]);
    expect(result.checkedCount).toBe(1);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it("disconnects + emits session:invalidated when security_version bumps", async () => {
    const socket = makeSocket(VALID_SESSION);
    const io = makeIo([socket]);
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([
          { ...VALID_DB_USER, security_version: 2 },
        ]),
      },
    } as never;

    const result = await revalidateConnectedSockets({ io, prisma });
    expect(result.disconnectedUserIds).toEqual(["user-1"]);
    expect(socket.emit).toHaveBeenCalledWith("session:invalidated");
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it("disconnects when user.status is no longer active", async () => {
    const socket = makeSocket(VALID_SESSION);
    const io = makeIo([socket]);
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([
          { ...VALID_DB_USER, status: "suspended" },
        ]),
      },
    } as never;

    await revalidateConnectedSockets({ io, prisma });
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it("disconnects when user.organization is suspended", async () => {
    const socket = makeSocket(VALID_SESSION);
    const io = makeIo([socket]);
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([
          { ...VALID_DB_USER, organization: { suspended_at: new Date() } },
        ]),
      },
    } as never;

    await revalidateConnectedSockets({ io, prisma });
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it("disconnects when the user row no longer exists in the DB", async () => {
    const socket = makeSocket(VALID_SESSION);
    const io = makeIo([socket]);
    const prisma = {
      user: { findMany: vi.fn().mockResolvedValue([]) },
    } as never;

    await revalidateConnectedSockets({ io, prisma });
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it("disconnects sockets that lost their session attachment (defensive)", async () => {
    const socket = makeSocket(null);
    const io = makeIo([socket]);
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { user: { findMany } } as never;

    await revalidateConnectedSockets({ io, prisma });
    expect(socket.disconnect).toHaveBeenCalled();
    // findMany should NOT be called because the only socket has no userId
    expect(findMany).not.toHaveBeenCalled();
  });

  it("deduplicates user lookups when multiple sockets share a user", async () => {
    const s1 = makeSocket(VALID_SESSION);
    const s2 = makeSocket(VALID_SESSION);
    const io = makeIo([s1, s2]);
    const findMany = vi.fn().mockResolvedValue([VALID_DB_USER]);
    const prisma = { user: { findMany } } as never;

    const result = await revalidateConnectedSockets({ io, prisma });
    expect(result.checkedCount).toBe(2);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { id: { in: ["user-1"] } },
      include: { organization: { select: { suspended_at: true } } },
    });
    expect(s1.disconnect).not.toHaveBeenCalled();
    expect(s2.disconnect).not.toHaveBeenCalled();
  });

  it("disconnects the right subset when some users are valid and others are not", async () => {
    const goodSession = { ...VALID_SESSION, userId: "good", organizationId: "org-good" };
    const badSession = { ...VALID_SESSION, userId: "bad", securityVersion: 1 };
    const sGood = makeSocket(goodSession);
    const sBad = makeSocket(badSession);
    const io = makeIo([sGood, sBad]);
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([
          { ...VALID_DB_USER, id: "good" },
          { ...VALID_DB_USER, id: "bad", security_version: 99 }, // bumped
        ]),
      },
    } as never;

    const result = await revalidateConnectedSockets({ io, prisma });
    expect(result.disconnectedUserIds).toEqual(["bad"]);
    expect(sGood.disconnect).not.toHaveBeenCalled();
    expect(sBad.disconnect).toHaveBeenCalled();
  });
});
