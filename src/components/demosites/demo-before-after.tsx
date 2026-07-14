"use client";

/**
 * Before/after slider for the presentation mode: the customer's current
 * site (thum.io screenshot) vs. the new demo. Drag the handle to reveal —
 * the single strongest "wow" moment in a physical sales meeting.
 */
import { useCallback, useRef, useState } from "react";
import { ChevronsLeftRight } from "lucide-react";

type DemoBeforeAfterProps = {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
};

export function DemoBeforeAfter({ beforeUrl, afterUrl, beforeLabel = "I dag", afterLabel = "Med DemoSites" }: DemoBeforeAfterProps) {
  const [position, setPosition] = useState(52);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(96, Math.max(4, pct)));
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full cursor-col-resize touch-none select-none overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
      style={{ aspectRatio: "16 / 10" }}
      onPointerDown={(e) => {
        draggingRef.current = true;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        updateFromClientX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) updateFromClientX(e.clientX);
      }}
      onPointerUp={() => {
        draggingRef.current = false;
      }}
    >
      {/* After (new demo) — full background */}
      <img src={afterUrl} alt={afterLabel} className="absolute inset-0 h-full w-full object-cover object-top" draggable={false} />

      {/* Before (old site) — clipped overlay */}
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
        <img
          src={beforeUrl}
          alt={beforeLabel}
          className="absolute inset-0 h-full object-cover object-top grayscale-[35%]"
          style={{ width: containerRef.current ? containerRef.current.getBoundingClientRect().width : "100vw", maxWidth: "none" }}
          draggable={false}
        />
      </div>

      {/* Handle */}
      <div className="absolute inset-y-0 z-10 flex w-0.5 items-center bg-white/90" style={{ left: `${position}%` }}>
        <span className="absolute left-1/2 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-900 shadow-xl">
          <ChevronsLeftRight className="h-5 w-5" />
        </span>
      </div>

      {/* Labels */}
      <span className="absolute left-3 top-3 rounded-md bg-black/70 px-2.5 py-1 text-xs font-semibold text-white">{beforeLabel}</span>
      <span className="absolute right-3 top-3 rounded-md bg-emerald-500 px-2.5 py-1 text-xs font-bold text-slate-950">{afterLabel}</span>
    </div>
  );
}
