import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const startRoomCompositeEgress = vi.fn();
  const stopEgress = vi.fn();
  const EgressClientCtor = vi.fn(function (
    this: Record<string, unknown>,
  ) {
    this.startRoomCompositeEgress = startRoomCompositeEgress;
    this.stopEgress = stopEgress;
  });
  const S3UploadCtor = vi.fn(function (
    this: Record<string, unknown>,
    args: Record<string, unknown>,
  ) {
    Object.assign(this, { __kind: "S3Upload" }, args);
  });
  const EncodedFileOutputCtor = vi.fn(function (
    this: Record<string, unknown>,
    args: Record<string, unknown>,
  ) {
    Object.assign(this, { __kind: "EncodedFileOutput" }, args);
  });
  return {
    startRoomCompositeEgress,
    stopEgress,
    EgressClientCtor,
    S3UploadCtor,
    EncodedFileOutputCtor,
  };
});

const {
  startRoomCompositeEgress,
  stopEgress,
  EgressClientCtor,
  S3UploadCtor,
  EncodedFileOutputCtor,
} = hoisted;

vi.mock("livekit-server-sdk", () => ({
  EgressClient: hoisted.EgressClientCtor,
  S3Upload: hoisted.S3UploadCtor,
  EncodedFileOutput: hoisted.EncodedFileOutputCtor,
  EncodedFileType: { MP4: 1 },
  EncodingOptionsPreset: { H264_720P_30: 4 },
}));

vi.mock("@/env", () => ({
  env: {
    LIVEKIT_URL: "ws://livekit.local:7880",
    LIVEKIT_API_KEY: "test-key",
    LIVEKIT_API_SECRET: "test-secret",
    STORAGE_ENDPOINT: "http://minio.local:9000",
    STORAGE_ACCESS_KEY: "minio-access",
    STORAGE_SECRET_KEY: "minio-secret",
    STORAGE_BUCKET: "yelli-dev",
    STORAGE_REGION: "us-east-1",
  },
}));

describe("egress-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("startRoomCompositeRecording", () => {
    it("starts a RoomComposite egress with MP4 file output to MinIO and returns normalised info", async () => {
      startRoomCompositeEgress.mockResolvedValueOnce({
        egressId: "EG_test123",
        roomName: "room-abc",
        status: 0,
      });

      const { startRoomCompositeRecording } = await import("./egress-client");

      const result = await startRoomCompositeRecording({
        roomName: "room-abc",
        storageKey: "org-1/recordings/abc123.mp4",
      });

      expect(EgressClientCtor).toHaveBeenCalledWith(
        // ws:// → http:// for the HTTP Egress API
        "http://livekit.local:7880",
        "test-key",
        "test-secret",
      );
      expect(S3UploadCtor).toHaveBeenCalledWith(
        expect.objectContaining({
          accessKey: "minio-access",
          secret: "minio-secret",
          bucket: "yelli-dev",
          endpoint: "http://minio.local:9000",
          forcePathStyle: true,
        }),
      );
      expect(EncodedFileOutputCtor).toHaveBeenCalledWith(
        expect.objectContaining({
          filepath: "org-1/recordings/abc123.mp4",
        }),
      );
      expect(startRoomCompositeEgress).toHaveBeenCalledWith(
        "room-abc",
        expect.objectContaining({ file: expect.any(Object) }),
        expect.any(Object),
      );
      expect(result).toEqual({
        egressId: "EG_test123",
        roomName: "room-abc",
        status: "0",
      });
    });

    it("throws SERVICE_UNAVAILABLE-style error when LIVEKIT_API_KEY is missing", async () => {
      vi.doMock("@/env", () => ({
        env: {
          LIVEKIT_URL: "ws://livekit.local:7880",
          LIVEKIT_API_KEY: undefined,
          LIVEKIT_API_SECRET: "test-secret",
          STORAGE_ENDPOINT: "http://minio.local:9000",
          STORAGE_ACCESS_KEY: "k",
          STORAGE_SECRET_KEY: "s",
          STORAGE_BUCKET: "b",
          STORAGE_REGION: "us-east-1",
        },
      }));
      vi.resetModules();
      const { startRoomCompositeRecording } = await import("./egress-client");

      await expect(
        startRoomCompositeRecording({
          roomName: "room-abc",
          storageKey: "org-1/recordings/abc.mp4",
        }),
      ).rejects.toThrow(/LiveKit Egress not configured/);
      vi.doUnmock("@/env");
    });

    it("throws when STORAGE_BUCKET is missing", async () => {
      vi.doMock("@/env", () => ({
        env: {
          LIVEKIT_URL: "ws://livekit.local:7880",
          LIVEKIT_API_KEY: "k",
          LIVEKIT_API_SECRET: "s",
          STORAGE_ENDPOINT: "http://minio.local:9000",
          STORAGE_ACCESS_KEY: "a",
          STORAGE_SECRET_KEY: "s",
          STORAGE_BUCKET: undefined,
          STORAGE_REGION: "us-east-1",
        },
      }));
      vi.resetModules();
      const { startRoomCompositeRecording } = await import("./egress-client");

      await expect(
        startRoomCompositeRecording({
          roomName: "room-abc",
          storageKey: "org-1/recordings/abc.mp4",
        }),
      ).rejects.toThrow(/Storage not configured/);
      vi.doUnmock("@/env");
    });

    it("normalises wss:// LIVEKIT_URL to https:// for the HTTP Egress API", async () => {
      vi.doMock("@/env", () => ({
        env: {
          LIVEKIT_URL: "wss://livekit.example.com",
          LIVEKIT_API_KEY: "k",
          LIVEKIT_API_SECRET: "s",
          STORAGE_ENDPOINT: "http://minio.local:9000",
          STORAGE_ACCESS_KEY: "a",
          STORAGE_SECRET_KEY: "s",
          STORAGE_BUCKET: "b",
          STORAGE_REGION: "us-east-1",
        },
      }));
      vi.resetModules();
      startRoomCompositeEgress.mockResolvedValueOnce({
        egressId: "EG_x",
        roomName: "r",
        status: 0,
      });
      const { startRoomCompositeRecording } = await import("./egress-client");
      await startRoomCompositeRecording({
        roomName: "r",
        storageKey: "o/recordings/k.mp4",
      });
      expect(EgressClientCtor).toHaveBeenCalledWith(
        "https://livekit.example.com",
        "k",
        "s",
      );
      vi.doUnmock("@/env");
    });
  });

  describe("stopRoomEgress", () => {
    it("calls EgressClient.stopEgress with the egressId", async () => {
      vi.doMock("@/env", () => ({
        env: {
          LIVEKIT_URL: "ws://livekit.local:7880",
          LIVEKIT_API_KEY: "k",
          LIVEKIT_API_SECRET: "s",
          STORAGE_ENDPOINT: "http://minio.local:9000",
          STORAGE_ACCESS_KEY: "a",
          STORAGE_SECRET_KEY: "s",
          STORAGE_BUCKET: "b",
          STORAGE_REGION: "us-east-1",
        },
      }));
      vi.resetModules();
      stopEgress.mockResolvedValueOnce(undefined);
      const { stopRoomEgress } = await import("./egress-client");

      await stopRoomEgress("EG_test123");

      expect(stopEgress).toHaveBeenCalledWith("EG_test123");
      vi.doUnmock("@/env");
    });

    it("throws when LIVEKIT credentials are missing", async () => {
      vi.doMock("@/env", () => ({
        env: {
          LIVEKIT_URL: "ws://livekit.local:7880",
          LIVEKIT_API_KEY: undefined,
          LIVEKIT_API_SECRET: "s",
          STORAGE_ENDPOINT: "http://minio.local:9000",
          STORAGE_ACCESS_KEY: "a",
          STORAGE_SECRET_KEY: "s",
          STORAGE_BUCKET: "b",
          STORAGE_REGION: "us-east-1",
        },
      }));
      vi.resetModules();
      const { stopRoomEgress } = await import("./egress-client");
      await expect(stopRoomEgress("EG_x")).rejects.toThrow(
        /LiveKit Egress not configured/,
      );
      vi.doUnmock("@/env");
    });
  });
});
