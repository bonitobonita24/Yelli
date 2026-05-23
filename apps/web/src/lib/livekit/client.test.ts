/**
 * (livekit-url-host-reachability) — pickClientLivekitWsUrl helper tests.
 *
 * Server-side LiveKit token minter returns a `wsUrl` to the browser in the
 * API response. The wsUrl MUST be browser-reachable. In containerized dev,
 * env.LIVEKIT_URL points at the docker-internal hostname (e.g.
 * `ws://yelli_dev_livekit:7880`) which the browser cannot resolve. The
 * NEXT_PUBLIC_LIVEKIT_URL takes precedence when set — it's the host-mapped
 * URL (e.g. `ws://localhost:43532` in dev, `wss://prod-domain` in prod).
 * Server-to-LiveKit calls (if ever added) continue using env.LIVEKIT_URL.
 *
 * Fallback order:
 *   1. env.NEXT_PUBLIC_LIVEKIT_URL (browser-reachable)
 *   2. env.LIVEKIT_URL (server-reachable; only correct if both server and
 *      browser share the same network — e.g. host pnpm dev)
 *   3. undefined → caller must throw "LiveKit not configured"
 */
import { describe, expect, it } from "vitest";

import { pickClientLivekitWsUrl } from "@/lib/livekit/client";

describe("pickClientLivekitWsUrl", () => {
  it("prefers NEXT_PUBLIC_LIVEKIT_URL when both are set", () => {
    expect(
      pickClientLivekitWsUrl({
        NEXT_PUBLIC_LIVEKIT_URL: "ws://localhost:43532",
        LIVEKIT_URL: "ws://yelli_dev_livekit:7880",
      }),
    ).toBe("ws://localhost:43532");
  });

  it("falls back to LIVEKIT_URL when NEXT_PUBLIC is undefined", () => {
    expect(
      pickClientLivekitWsUrl({
        NEXT_PUBLIC_LIVEKIT_URL: undefined,
        LIVEKIT_URL: "ws://yelli_dev_livekit:7880",
      }),
    ).toBe("ws://yelli_dev_livekit:7880");
  });

  it("returns undefined when neither is set", () => {
    expect(
      pickClientLivekitWsUrl({
        NEXT_PUBLIC_LIVEKIT_URL: undefined,
        LIVEKIT_URL: undefined,
      }),
    ).toBeUndefined();
  });

  it("treats empty string as unset (falls back to LIVEKIT_URL)", () => {
    expect(
      pickClientLivekitWsUrl({
        NEXT_PUBLIC_LIVEKIT_URL: "",
        LIVEKIT_URL: "ws://yelli_dev_livekit:7880",
      }),
    ).toBe("ws://yelli_dev_livekit:7880");
  });
});
