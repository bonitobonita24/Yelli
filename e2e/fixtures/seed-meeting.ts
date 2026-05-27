import type { APIRequestContext } from "@playwright/test";

export interface SeededMeeting {
  id: string;
  cleanup: () => Promise<void>;
}

/**
 * Creates a Meeting row via the tRPC `meetings.create` procedure.
 * The caller MUST be authenticated — pass an APIRequestContext that already
 * has the webmaster storageState cookie attached (Playwright auto-attaches
 * when the test uses `storageState: "playwright/.auth/host.json"`).
 *
 * Cleanup is a no-op because the meetings router has no delete procedure.
 * Webmaster's seeded meetings accumulate across runs but are isolated to
 * the webmaster organization and do not affect user-visible state in other tenants.
 */
export async function seedMeeting(
  request: APIRequestContext,
  overrides?: Partial<{
    title: string;
    description: string;
    recording_enabled: boolean;
    lobby_enabled: boolean;
  }>,
): Promise<SeededMeeting> {
  const payload = {
    title: overrides?.title ?? `E2E test meeting ${Date.now()}`,
    description: overrides?.description,
    recording_enabled: overrides?.recording_enabled ?? true,
    lobby_enabled: overrides?.lobby_enabled ?? false,
  };

  const response = await request.post("/api/trpc/meetings.create", {
    data: { json: payload },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `seedMeeting failed: HTTP ${response.status()} ${response.statusText()} — ${body.slice(0, 500)}`,
    );
  }

  const body = (await response.json()) as {
    result?: { data?: { json?: { id?: string }; id?: string } };
  };

  const id = body?.result?.data?.json?.id ?? body?.result?.data?.id;

  if (typeof id !== "string" || id.length === 0) {
    throw new Error(
      `seedMeeting: unable to extract meeting id from tRPC response: ${JSON.stringify(body).slice(0, 500)}`,
    );
  }

  return {
    id,
    cleanup: async () => {
      // No-op — meetings router has no delete/archive procedure.
      // Webmaster's e2e meetings are isolated to webmaster's organization.
    },
  };
}
