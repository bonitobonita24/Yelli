// Non-tRPC: manual auth required (security.md §AGENT PROHIBITIONS item 11)
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { mintLiveKitToken } from "@/lib/livekit/client";
import { auth } from "@/server/auth";
import { rateLimiters } from "@/server/lib/rate-limit";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    callId: z.string().min(1).max(128),
  })
  .strict();

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    rateLimiters.api.check(session.user.id);
  } catch {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { callId } = parsed.data;
  const roomName = `call-${callId}`;
  const identity = session.user.id;
  const displayName =
    session.user.name ?? session.user.email ?? "User";

  try {
    const { token, wsUrl } = mintLiveKitToken({
      identity,
      displayName,
      roomName,
      canPublish: true,
    });

    return NextResponse.json({ token, wsUrl, roomName });
  } catch (err) {
    if (err instanceof Error && err.message === "LiveKit not configured") {
      return NextResponse.json(
        { error: "Video calling is not available in this environment." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Failed to generate call token." },
      { status: 500 }
    );
  }
}
