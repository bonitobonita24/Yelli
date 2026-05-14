"use client";

/**
 * Client-only loader for MeetingRoom.
 *
 * MeetingRoom imports @livekit/components-styles as a JS side-effect; that
 * package's default export is a raw .css file which Node can't require()
 * during Next's "Collecting page data" SSR step. Wrapping it in
 * `dynamic({ ssr: false })` keeps the entire LiveKit subtree out of the
 * server bundle — it's only evaluated client-side, where the browser handles
 * the CSS via Next's runtime CSS injection.
 *
 * Page components import this loader instead of the underlying MeetingRoom.
 */
import dynamic from "next/dynamic";

import type { MeetingRoom as MeetingRoomImpl } from "./meeting-room";
import type { ComponentProps } from "react";

type MeetingRoomProps = ComponentProps<typeof MeetingRoomImpl>;

export const MeetingRoom = dynamic<MeetingRoomProps>(
  () => import("./meeting-room").then((m) => m.MeetingRoom),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        Loading meeting room…
      </div>
    ),
  },
);
