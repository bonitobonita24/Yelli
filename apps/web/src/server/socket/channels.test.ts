/**
 * Phase 7 #8(e)-2 — channel naming + org-scoped subscription helpers.
 *
 * The DECISIONS_LOG.md (line 173) locks channel naming as
 * `${tenantId}:${eventType}` — tenant = organization in Yelli's schema, so
 * we expose `orgChannelName(organizationId, eventType)`. Sockets can only
 * subscribe to rooms scoped to their own session.organizationId; the
 * subscribe-time check is the cross-org protection (an attacker who
 * crafted a payload trying to subscribe to another org's room would be
 * silently no-op'd because the helper uses session.organizationId).
 *
 * Super-admin gets a parallel `platform:${eventType}` channel reachable
 * only via `joinPlatformChannel` which checks `isSuperAdmin`.
 */
import { describe, expect, it, vi } from "vitest";

import {
  emitToOrg,
  emitToPlatform,
  joinOrgChannel,
  joinPlatformChannel,
  orgChannelName,
  platformChannelName,
} from "@/server/socket/channels";

import type { SocketSession } from "@/server/socket/auth";
import type { Socket, Server as IOServer } from "socket.io";


const SESSION_ACME: SocketSession = {
  userId: "user-1",
  organizationId: "org-acme",
  organizationSlug: "acme",
  role: "tenant_admin",
  isSuperAdmin: false,
  securityVersion: 1,
};

const SESSION_SUPERADMIN: SocketSession = {
  userId: "user-platform",
  organizationId: "org-platform",
  organizationSlug: "platform-org",
  role: "tenant_admin",
  isSuperAdmin: true,
  securityVersion: 1,
};

function makeSocket(session: SocketSession | null) {
  const join = vi.fn();
  return {
    join,
    data: { session },
  } as unknown as Socket & { join: ReturnType<typeof vi.fn> };
}

function makeIo() {
  const emit = vi.fn();
  const to = vi.fn(() => ({ emit }));
  return { io: { to } as unknown as IOServer, to, emit };
}

describe("orgChannelName", () => {
  it("composes ${organizationId}:${eventType}", () => {
    expect(orgChannelName("org-1", "presence")).toBe("org-1:presence");
  });

  it("does not URL-encode the inputs (caller's responsibility to use safe IDs)", () => {
    expect(orgChannelName("a:b", "c:d")).toBe("a:b:c:d");
  });
});

describe("platformChannelName", () => {
  it("composes platform:${eventType} regardless of org", () => {
    expect(platformChannelName("tenant.disabled")).toBe("platform:tenant.disabled");
  });
});

describe("joinOrgChannel", () => {
  it("joins ${session.organizationId}:${eventType} for an authenticated socket", () => {
    const socket = makeSocket(SESSION_ACME);
    expect(joinOrgChannel(socket, "presence")).toBe(true);
    expect(socket.join).toHaveBeenCalledWith("org-acme:presence");
  });

  it("returns false and does not join when socket has no session", () => {
    const socket = makeSocket(null);
    expect(joinOrgChannel(socket, "presence")).toBe(false);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it("CANNOT be coerced to join another org — always uses session.organizationId", () => {
    // No way to express "join org-evil:presence" through this API — the
    // session is the only source of the org id. Cross-org subscription
    // attack surface is the absence of a slug-override parameter.
    const socket = makeSocket(SESSION_ACME);
    joinOrgChannel(socket, "presence");
    expect(socket.join).toHaveBeenCalledWith("org-acme:presence");
    expect(socket.join).not.toHaveBeenCalledWith(
      expect.stringContaining("org-evil"),
    );
  });
});

describe("joinPlatformChannel", () => {
  it("joins platform:${eventType} for super-admin sockets", () => {
    const socket = makeSocket(SESSION_SUPERADMIN);
    expect(joinPlatformChannel(socket, "tenant.disabled")).toBe(true);
    expect(socket.join).toHaveBeenCalledWith("platform:tenant.disabled");
  });

  it("returns false and does not join when socket is not super-admin", () => {
    const socket = makeSocket(SESSION_ACME);
    expect(joinPlatformChannel(socket, "tenant.disabled")).toBe(false);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it("returns false and does not join when socket has no session", () => {
    const socket = makeSocket(null);
    expect(joinPlatformChannel(socket, "tenant.disabled")).toBe(false);
    expect(socket.join).not.toHaveBeenCalled();
  });
});

describe("emitToOrg", () => {
  it("emits to the org-scoped room", () => {
    const { io, to, emit } = makeIo();
    emitToOrg(io, "org-acme", "presence:update", { userId: "u1", online: true });
    expect(to).toHaveBeenCalledWith("org-acme:presence:update");
    expect(emit).toHaveBeenCalledWith("presence:update", {
      userId: "u1",
      online: true,
    });
  });
});

describe("emitToPlatform", () => {
  it("emits to the platform-wide channel", () => {
    const { io, to, emit } = makeIo();
    emitToPlatform(io, "tenant.disabled", { organizationId: "org-evil" });
    expect(to).toHaveBeenCalledWith("platform:tenant.disabled");
    expect(emit).toHaveBeenCalledWith("tenant.disabled", {
      organizationId: "org-evil",
    });
  });
});
