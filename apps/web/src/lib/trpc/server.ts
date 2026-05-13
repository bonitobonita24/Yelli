import { cache } from "react";

import { auth } from "@/server/auth";
import { appRouter } from "@/server/trpc/router";

import type { Context } from "@/server/trpc/context";

/**
 * Creates a server-side tRPC caller for use in React Server Components.
 * Wraps context creation with React's `cache` so the session is fetched
 * at most once per request across all RSC usages.
 *
 * Usage:
 *   const caller = await createServerCaller();
 *   const departments = await caller.departments.list();
 */
const getContext = cache(async (): Promise<Context> => {
  const session = await auth();
  return { session, req: new Request("http://localhost") };
});

export async function createServerCaller() {
  const ctx = await getContext();
  return appRouter.createCaller(ctx);
}
