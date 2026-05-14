"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@yelli/ui";
import { Eraser } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface InCallWhiteboardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 420;
const STROKE_STYLE = "#2563eb"; // tailwind blue-600 — readable on white in both themes
const STROKE_WIDTH = 3;

/**
 * Local-only whiteboard overlay. Drawing strokes are NOT broadcast to other
 * participants yet — that requires a Socket.IO subscription on a dedicated
 * `meeting:{id}:whiteboard` room which is a follow-up. The current scope is
 * a personal scratchpad host/guest can use to sketch during the call.
 */
export function InCallWhiteboard({ open, onOpenChange }: InCallWhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Initialise with white background so dark-mode rendering is consistent.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = STROKE_STYLE;
    ctx.lineWidth = STROKE_WIDTH;
  }, [open]);

  function pointerCoords(
    canvas: HTMLCanvasElement,
    e: React.PointerEvent<HTMLCanvasElement>,
  ): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointerCoords(canvas, e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointerCoords(canvas, e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function handlePointerUp() {
    setIsDrawing(false);
  }

  function handleClear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Whiteboard</DialogTitle>
          <DialogDescription>
            Sketch notes during the call. Local only — strokes are not shared.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="max-w-full touch-none rounded border border-border bg-white"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
            aria-label="Whiteboard drawing area"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClear}>
            <Eraser className="mr-1 size-4" aria-hidden />
            Clear
          </Button>
          <Button
            type="button"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
