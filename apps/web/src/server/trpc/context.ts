import { auth } from "@/server/auth";

import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { Session } from "next-auth";

export async function createTRPCContext(
  opts: FetchCreateContextFnOptions,
): Promise<{ session: Session | null; req: Request }> {
  const session = await auth();
  return { session, req: opts.req };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;
