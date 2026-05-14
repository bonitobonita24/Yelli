"use client";

/**
 * Client-only loader for IntercomCall — see meeting-room-loader.tsx for the
 * same pattern + rationale. Keeps @livekit/components-styles out of the
 * server bundle so SSR page-data collection doesn't ENOENT on the package's
 * raw .css default export.
 */
import dynamic from "next/dynamic";

import type { IntercomCall as IntercomCallImpl } from "./intercom-call";
import type { ComponentProps } from "react";

type IntercomCallProps = ComponentProps<typeof IntercomCallImpl>;

export const IntercomCall = dynamic<IntercomCallProps>(
  () => import("./intercom-call").then((m) => m.IntercomCall),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        Connecting call…
      </div>
    ),
  },
);
