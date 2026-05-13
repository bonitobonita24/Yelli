"use client";


import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { loggerLink, httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { useState } from "react";
import superjson from "superjson";

import { clientEnv } from "@/env";

import type { AppRouter } from "@/server/trpc/router";

export const trpc = createTRPCReact<AppRouter>();

function getBaseUrl(): string {
  if (typeof window !== "undefined") return "";
  return clientEnv.NEXT_PUBLIC_APP_URL;
}

interface TRPCReactProviderProps {
  children: React.ReactNode;
  headers?: Record<string, string>;
}

export function TRPCReactProvider({
  children,
  headers,
}: TRPCReactProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === "development" ||
            (op.direction === "down" && op.result instanceof Error),
        }),
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
          headers: () => headers ?? {},
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        {children}
      </trpc.Provider>
    </QueryClientProvider>
  );
}
