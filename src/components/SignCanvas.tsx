"use client";

import { useRef, useEffect } from "react";

export function SignCanvas({ onDataUrl }: { onDataUrl: (v: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = rect.width * scale;
    canvas.height = rect.height * scale;
    ctx.scale(scale, scale);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";

    let start: { x: number; y: number } | null = null;

    // Capture non-null references for closures
    const cvs = canvas;
    const c = ctx;

    function getPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
      const r = cvs.getBoundingClientRect();
      if ("touches" in e) {
        return {
          x: e.touches[0].clientX - r.left,
          y: e.touches[0].clientY - r.top,
        };
      }
      return {
        x: (e as MouseEvent).clientX - r.left,
        y: (e as MouseEvent).clientY - r.top,
      };
    }
    function getPosEnd(e: TouchEvent): { x: number; y: number } {
      const r = cvs.getBoundingClientRect();
      return {
        x: e.changedTouches[0].clientX - r.left,
        y: e.changedTouches[0].clientY - r.top,
      };
    }

    function down(e: MouseEvent | TouchEvent) {
      e.preventDefault();
      start = getPos(e);
    }
    function move(e: MouseEvent | TouchEvent) {
      if (!start) return;
      e.preventDefault();
      const pos = getPos(e);
      c.beginPath();
      c.moveTo(start.x, start.y);
      c.lineTo(pos.x, pos.y);
      c.stroke();
      start = pos;
    }
    function up(e?: MouseEvent | TouchEvent) {
      if (e && "changedTouches" in e) {
        const pos = getPosEnd(e as TouchEvent);
        if (start) {
          c.beginPath();
          c.moveTo(start.x, start.y);
          c.lineTo(pos.x, pos.y);
          c.stroke();
        }
      }
      start = null;
      onDataUrl(cvs.toDataURL("image/png"));
    }

    cvs.addEventListener("mousedown", down);
    cvs.addEventListener("mousemove", move);
    cvs.addEventListener("mouseup", up);
    cvs.addEventListener("mouseleave", up);
    cvs.addEventListener("touchstart", down, { passive: false });
    cvs.addEventListener("touchmove", move, { passive: false });
    cvs.addEventListener("touchend", up, { passive: false });

    return () => {
      cvs.removeEventListener("mousedown", down);
      cvs.removeEventListener("mousemove", move);
      cvs.removeEventListener("mouseup", up);
      cvs.removeEventListener("mouseleave", up);
      cvs.removeEventListener("touchstart", down);
      cvs.removeEventListener("touchmove", move);
      cvs.removeEventListener("touchend", up);
    };
  }, [onDataUrl]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-32 border border-slate-300 rounded bg-slate-50 touch-none block"
      style={{ maxWidth: "100%" }}
    />
  );
}
