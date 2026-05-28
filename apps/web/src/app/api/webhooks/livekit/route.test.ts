import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

import type { NextRequest } from "next/server";

const hoisted = vi.hoisted(() => ({
  add: vi.fn().mockResolvedValue(undefined),
  verify: vi.fn(),
  env: {
    LIVEKIT_API_KEY: "test-key" as string | undefined,
    LIVEKIT_API_SECRET: "test-secret" as string | undefined,
  },
}));

vi.mock("@yelli/jobs", () => ({
  livekitEgressWebhookQueue: { add: hoisted.add },
}));

vi.mock("@/lib/livekit/webhook-verify", () => ({
  verifyLiveKitWebhook: hoisted.verify,
}));

vi.mock("@/env", () => ({
  env: hoisted.env,
}));

function mkRequest(body: string, auth: string | null = "Bearer good-jwt") {
  const headers: Record<string, string> = { "x-forwarded-for": "127.0.0.1" };
  if (auth !== null) headers["Authorization"] = auth;
  return new Request("http://localhost/api/webhooks/livekit", {
    method: "POST",
    body,
    headers,
  }) as unknown as NextRequest;
}

describe("POST /api/webhooks/livekit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.env.LIVEKIT_API_KEY = "test-key";
    hoisted.env.LIVEKIT_API_SECRET = "test-secret";
  });

  it("503 when LIVEKIT_API_KEY is unset", async () => {
    hoisted.env.LIVEKIT_API_KEY = undefined;
    const res = await POST(mkRequest("{}"));
    expect(res.status).toBe(503);
  });

  it("401 when WebhookReceiver returns null (bad signature, missing auth, etc.)", async () => {
    hoisted.verify.mockResolvedValueOnce(null);
    const res = await POST(mkRequest("{}", null));
    expect(res.status).toBe(401);
    expect(hoisted.add).not.toHaveBeenCalled();
  });

  it("200 + enqueues envelope on valid egress_ended event", async () => {
    hoisted.verify.mockResolvedValueOnce({
      id: "EV_123",
      event: "egress_ended",
      egressInfo: {
        egressId: "EG_abc",
        roomName: "room-1",
        status: 2,
        fileResults: [
          { size: BigInt(1024 * 1024), duration: BigInt(60_000_000_000) },
        ],
      },
    });
    const res = await POST(mkRequest("{}"));
    expect(res.status).toBe(200);
    expect(hoisted.add).toHaveBeenCalledOnce();
    const [name, data, opts] = hoisted.add.mock.calls[0]!;
    expect(name).toBe("livekit-egress:EV_123");
    expect(data).toMatchObject({
      event_id: "EV_123",
      event_type: "egress_ended",
      egress_id: "EG_abc",
      room_name: "room-1",
      file_size_bytes: "1048576",
      duration_seconds: 60,
    });
    expect(opts).toEqual({ jobId: "livekit-egress-EV_123" });
  });

  it("200 + ignores events without egressInfo (e.g. room_started)", async () => {
    hoisted.verify.mockResolvedValueOnce({
      id: "EV_999",
      event: "room_started",
    });
    const res = await POST(mkRequest("{}"));
    expect(res.status).toBe(200);
    expect(hoisted.add).not.toHaveBeenCalled();
  });

  it("falls back to composite jobId when event.id is missing", async () => {
    hoisted.verify.mockResolvedValueOnce({
      event: "egress_started",
      egressInfo: { egressId: "EG_xyz", roomName: "r", status: 0 },
    });
    const res = await POST(mkRequest("{}"));
    expect(res.status).toBe(200);
    const [, , opts] = hoisted.add.mock.calls[0]!;
    expect(opts).toEqual({ jobId: "livekit-egress-egress_started:EG_xyz" });
  });

  it("500 when queue enqueue throws (so LiveKit retries per its backoff)", async () => {
    hoisted.verify.mockResolvedValueOnce({
      id: "EV_err",
      event: "egress_ended",
      egressInfo: { egressId: "EG_err", roomName: "r", status: 2 },
    });
    hoisted.add.mockRejectedValueOnce(new Error("redis down"));
    const res = await POST(mkRequest("{}"));
    expect(res.status).toBe(500);
  });
});
