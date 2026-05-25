import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const receive = vi.fn();
  const WebhookReceiverCtor = vi.fn(function (
    this: Record<string, unknown>,
  ) {
    this.receive = receive;
  });
  return { receive, WebhookReceiverCtor };
});

const { receive, WebhookReceiverCtor } = hoisted;

vi.mock("livekit-server-sdk", () => ({
  WebhookReceiver: hoisted.WebhookReceiverCtor,
}));

vi.mock("@/env", () => ({
  env: {
    LIVEKIT_API_KEY: "test-key",
    LIVEKIT_API_SECRET: "test-secret",
  },
}));

describe("verifyLiveKitWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("instantiates WebhookReceiver with API key + secret and returns the parsed event on success", async () => {
    receive.mockResolvedValueOnce({
      event: "egress_ended",
      egressInfo: {
        egressId: "EG_ok",
        roomName: "room-1",
        status: 2,
        fileResults: [{ size: BigInt(1024), duration: BigInt(60_000_000_000) }],
      },
    });

    const { verifyLiveKitWebhook } = await import("./webhook-verify");

    const event = await verifyLiveKitWebhook(
      "raw-body-string",
      "Bearer signed-jwt-from-livekit",
    );

    expect(WebhookReceiverCtor).toHaveBeenCalledWith("test-key", "test-secret");
    expect(receive).toHaveBeenCalledWith(
      "raw-body-string",
      "Bearer signed-jwt-from-livekit",
    );
    expect(event).not.toBeNull();
    expect(event?.event).toBe("egress_ended");
    expect(event?.egressInfo?.egressId).toBe("EG_ok");
  });

  it("returns null when the authorization header is missing", async () => {
    const { verifyLiveKitWebhook } = await import("./webhook-verify");
    const event = await verifyLiveKitWebhook("body", null);
    expect(event).toBeNull();
    expect(receive).not.toHaveBeenCalled();
  });

  it("returns null when WebhookReceiver throws (invalid signature, expired JWT, etc.)", async () => {
    receive.mockRejectedValueOnce(new Error("invalid signature"));
    const { verifyLiveKitWebhook } = await import("./webhook-verify");
    const event = await verifyLiveKitWebhook("body", "Bearer bad-jwt");
    expect(event).toBeNull();
  });

  it("throws when LiveKit credentials are missing (config gap, not auth failure)", async () => {
    vi.doMock("@/env", () => ({
      env: {
        LIVEKIT_API_KEY: undefined,
        LIVEKIT_API_SECRET: "s",
      },
    }));
    vi.resetModules();
    const { verifyLiveKitWebhook } = await import("./webhook-verify");
    await expect(verifyLiveKitWebhook("body", "Bearer x")).rejects.toThrow(
      /LiveKit webhook not configured/,
    );
    vi.doUnmock("@/env");
  });
});
