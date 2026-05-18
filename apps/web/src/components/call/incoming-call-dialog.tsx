"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@yelli/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { attachIncomingCallHandler } from "@/lib/calls/incoming-call-handler";
import { selectIncomingCall } from "@/lib/calls/select-incoming-call";
import { useSocketOptional } from "@/lib/socket/socket-context";
import { trpc } from "@/lib/trpc/react";

import type { IncomingCallPayload } from "@/lib/livekit/types";

function createRingtone(audioCtx: AudioContext): () => void {
  // Alternates between 440 Hz (A4) and 523 Hz (C5) every 600 ms
  const frequencies = [440, 523];
  let index = 0;
  let oscillator: OscillatorNode | null = null;
  let gainNode: GainNode | null = null;

  function playTone() {
    oscillator?.stop();
    oscillator?.disconnect();

    gainNode = audioCtx.createGain();
    gainNode.gain.value = 0.3;
    gainNode.connect(audioCtx.destination);

    oscillator = audioCtx.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = frequencies[index % frequencies.length] ?? 440;
    oscillator.connect(gainNode);
    oscillator.start();

    index++;
  }

  playTone();
  const intervalId = setInterval(playTone, 600);

  return function stop() {
    clearInterval(intervalId);
    oscillator?.stop();
    oscillator?.disconnect();
    gainNode?.disconnect();
  };
}

export function IncomingCallDialog() {
  const router = useRouter();
  const socket = useSocketOptional();
  const audioCtxRef = useRef<AudioContext | null>(null);
  const stopRingtoneRef = useRef<(() => void) | null>(null);

  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<IncomingCallPayload | null>(null);

  // Phase 7 #16: which department(s) is the current user bound to? Used to
  // filter call:incoming broadcasts to only those destined for this user.
  // useQuery refetches on window focus → admin re-bind via Phase 7 #13 UI is
  // picked up without bespoke socket invalidation. boundDeptIds === undefined
  // while loading; selectIncomingCall treats that as "do not ring".
  const { data: boundDeptIds } = trpc.departments.myBoundDepartmentIds.useQuery();

  const stopRingtone = useCallback(() => {
    stopRingtoneRef.current?.();
    stopRingtoneRef.current = null;
    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
  }, []);

  const startRingtone = useCallback(() => {
    // Lazily create AudioContext on first user-interaction-triggered call
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      stopRingtoneRef.current = createRingtone(ctx);
    } catch {
      // AudioContext unavailable (e.g., SSR guard or browser restriction) — silent
    }
  }, []);

  useEffect(() => {
    if (socket === null) return;

    const handleIncoming = (incoming: IncomingCallPayload): void => {
      if (!selectIncomingCall(incoming, boundDeptIds)) {
        // Not for this user's bound department(s) — silently drop. Covers
        // both the loading state (boundDeptIds === undefined) and the
        // no-binding state ([]) per Phase 7 #16 decisions 3 + 4.
        return;
      }
      setPayload(incoming);
      setOpen(true);
      startRingtone();
    };

    const handleRejected = ({ callId }: { callId: string; reason: "declined" | "unavailable" }): void => {
      setPayload((current) => {
        if (current === null || current.callId !== callId) return current;
        stopRingtone();
        setOpen(false);
        return null;
      });
    };

    const dispose = attachIncomingCallHandler(socket, {
      onIncoming: handleIncoming,
      onRejected: handleRejected,
    });

    return () => {
      dispose();
      stopRingtone();
    };
  }, [socket, boundDeptIds, startRingtone, stopRingtone]);

  const handleAccept = useCallback(() => {
    if (!payload) return;
    stopRingtone();
    setOpen(false);
    router.push(`/app/call/${payload.callId}`);
  }, [payload, router, stopRingtone]);

  const handleReject = useCallback(() => {
    if (!payload) return;
    socket?.emit("call:reject", { callId: payload.callId });
    stopRingtone();
    setOpen(false);
    setPayload(null);
  }, [payload, socket, stopRingtone]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        handleReject();
      }
    },
    [handleReject]
  );

  if (!payload) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Incoming Call</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-4">
          {/* Avatar placeholder */}
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-2xl font-semibold text-secondary-foreground"
            aria-hidden="true"
          >
            {payload.callerName.charAt(0).toUpperCase()}
          </div>

          <p className="text-lg font-semibold">{payload.callerName}</p>

          {payload.callerDepartment !== null && (
            <p className="text-sm text-muted-foreground">
              {payload.callerDepartment}
            </p>
          )}
        </div>

        <DialogFooter className="flex-row justify-center gap-4 sm:justify-center">
          {/* Reject */}
          <Button
            type="button"
            variant="destructive"
            className="flex h-11 w-11 rounded-full p-0"
            aria-label="Reject call"
            onClick={handleReject}
          >
            {/* Phone off icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.26 9.4a2 2 0 0 1 2-2.18h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L10.68 13.3Z" />
              <line x1="23" y1="1" x2="1" y2="23" />
            </svg>
          </Button>

          {/* Accept */}
          <Button
            type="button"
            className="flex h-11 w-11 rounded-full bg-green-600 p-0 hover:bg-green-700 focus-visible:ring-green-600"
            aria-label="Accept call"
            onClick={handleAccept}
          >
            {/* Phone icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.26 9.4a2 2 0 0 1 2-2.18h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L10.68 13.3a16 16 0 0 0 6.02 6.02l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z" />
            </svg>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
