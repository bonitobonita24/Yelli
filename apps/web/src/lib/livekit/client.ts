// NOTE: server-only — do not import in client components
// (server-only package not installed; enforce via code review and naming convention)
import { createHmac } from "crypto";

import { env } from "@/env";

interface MintOptions {
  identity: string;
  displayName: string;
  roomName: string;
  canPublish?: boolean;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function mintLiveKitToken(options: MintOptions): {
  token: string;
  wsUrl: string;
} {
  const apiKey = env.LIVEKIT_API_KEY;
  const apiSecret = env.LIVEKIT_API_SECRET;
  const wsUrl = env.LIVEKIT_WS_URL;

  if (!apiKey || !apiSecret || !wsUrl) {
    throw new Error("LiveKit not configured");
  }

  const { identity, displayName, roomName, canPublish = true } = options;

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 6 * 60 * 60; // 6 hours

  const header = { alg: "HS256", typ: "JWT" };
  const grant = {
    room: roomName,
    roomJoin: true,
    canPublish,
    canSubscribe: true,
    canPublishData: true,
  };
  const payload = {
    iss: apiKey,
    sub: identity,
    name: displayName,
    video: grant,
    nbf: now,
    exp,
    jti: `${identity}-${now}`,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", apiSecret)
    .update(signingInput)
    .digest();
  const encodedSignature = base64url(signature);

  return {
    token: `${signingInput}.${encodedSignature}`,
    wsUrl,
  };
}
