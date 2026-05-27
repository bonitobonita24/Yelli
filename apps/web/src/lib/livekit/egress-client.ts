// NOTE: server-only — do not import in client components.
// Wraps livekit-server-sdk's EgressClient for RoomComposite recording with
// S3-compatible (MinIO) file output. Decision locked in DECISIONS_LOG.md:
// RoomCompositeEgress, MinIO storage, host-only initiation.
import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  EncodingOptionsPreset,
  S3Upload,
} from "livekit-server-sdk";

import { env } from "@/env";

export interface StartRecordingInput {
  /** LiveKit room name (Meeting.livekit_room_name) */
  roomName: string;
  /** Tenant-prefixed S3 object key (build via @yelli/storage buildStorageKey) */
  storageKey: string;
}

export interface StartRecordingOutput {
  egressId: string;
  roomName: string;
  status: string;
}

/**
 * LIVEKIT_URL is the WebSocket URL clients connect to (ws:// or wss://).
 * The Egress HTTP API lives at the equivalent http:// / https:// origin.
 * This mirrors what livekit-server-sdk does internally but doing it
 * explicitly makes the URL passed to EgressClient deterministic and
 * inspectable in tests.
 */
function toHttpOrigin(wsUrl: string): string {
  if (wsUrl.startsWith("wss://")) return "https://" + wsUrl.slice(6);
  if (wsUrl.startsWith("ws://")) return "http://" + wsUrl.slice(5);
  return wsUrl;
}

function requireLiveKitConfig(): {
  url: string;
  apiKey: string;
  apiSecret: string;
} {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    throw new Error(
      "LiveKit Egress not configured: LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET required",
    );
  }
  return {
    url: toHttpOrigin(LIVEKIT_URL),
    apiKey: LIVEKIT_API_KEY,
    apiSecret: LIVEKIT_API_SECRET,
  };
}

function requireStorageConfig(): {
  endpoint: string;
  accessKey: string;
  secret: string;
  bucket: string;
  region: string;
} {
  const {
    STORAGE_ENDPOINT,
    STORAGE_ACCESS_KEY,
    STORAGE_SECRET_KEY,
    STORAGE_BUCKET,
    STORAGE_REGION,
  } = env;
  if (
    !STORAGE_ENDPOINT ||
    !STORAGE_ACCESS_KEY ||
    !STORAGE_SECRET_KEY ||
    !STORAGE_BUCKET
  ) {
    throw new Error(
      "Storage not configured: STORAGE_ENDPOINT / STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY / STORAGE_BUCKET required",
    );
  }
  return {
    endpoint: STORAGE_ENDPOINT,
    accessKey: STORAGE_ACCESS_KEY,
    secret: STORAGE_SECRET_KEY,
    bucket: STORAGE_BUCKET,
    region: STORAGE_REGION,
  };
}

/**
 * Start a RoomComposite Egress recording that uploads directly to MinIO/S3.
 *
 * SECURITY: caller MUST verify host permission (host_user_id check) and
 * MUST build storageKey via @yelli/storage's buildStorageKey() so the
 * tenant prefix is enforced. Never accept storageKey from client input.
 */
export async function startRoomCompositeRecording(
  input: StartRecordingInput,
): Promise<StartRecordingOutput> {
  if (process.env.LIVEKIT_E2E_MOCK === "true") {
    return {
      egressId: `e2e-mock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      roomName: input.roomName,
      status: "EGRESS_ACTIVE",
    };
  }
  const lk = requireLiveKitConfig();
  const s3 = requireStorageConfig();

  const client = new EgressClient(lk.url, lk.apiKey, lk.apiSecret);

  const fileOutput = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: input.storageKey,
    output: {
      case: "s3",
      value: new S3Upload({
        accessKey: s3.accessKey,
        secret: s3.secret,
        bucket: s3.bucket,
        region: s3.region,
        endpoint: s3.endpoint,
        // Required for MinIO path-style URLs. AWS S3 ignores this setting.
        forcePathStyle: true,
      }),
    },
  });

  const info = await client.startRoomCompositeEgress(
    input.roomName,
    { file: fileOutput },
    { encodingOptions: EncodingOptionsPreset.H264_720P_30 },
  );

  return {
    egressId: info.egressId,
    roomName: info.roomName,
    status: String(info.status),
  };
}

/**
 * Stop an active Egress. The egressId comes from startRoomCompositeRecording().
 * Webhook (egress_ended) is what finalises the Recording row — this just
 * tells LiveKit to wrap up.
 */
export async function stopRoomEgress(egressId: string): Promise<void> {
  if (process.env.LIVEKIT_E2E_MOCK === "true") {
    return;
  }
  const lk = requireLiveKitConfig();
  const client = new EgressClient(lk.url, lk.apiKey, lk.apiSecret);
  await client.stopEgress(egressId);
}
