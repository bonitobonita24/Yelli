import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { createTRPCContext } from "@/server/trpc/context";
import { appRouter } from "@/server/trpc/router";

export const runtime = "nodejs";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createTRPCContext,
    ...(process.env.NODE_ENV === "development" && {
      onError: ({ path, error }: { path: string | undefined; error: Error }) =>
        console.error(`tRPC failed on ${path ?? "<no-path>"}`, error),
    }),
  });

export { handler as GET, handler as POST };
