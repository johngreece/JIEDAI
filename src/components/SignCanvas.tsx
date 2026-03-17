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

    function getPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
      const r = canvas.getBoundingClientRect();
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
      const r = canvas.getBoundingClientRect();
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
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      start = pos;
    }
    function up(e?: MouseEvent | TouchEvent) {
      if (e && "changedTouches" in e) {
        const pos = getPosEnd(e as TouchEvent);
        if (start) {
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
        }
      }
      start = null;
      onDataUrl(canvas.toDataURL("image/png"));
    }

    canvas.addEventListener("mousedown", down);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", up);
    canvas.addEventListener("mouseleave", up);
    canvas.addEventListener("touchstart", down, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", up, { passive: false });

    return () => {
      canvas.removeEventListener("mousedown", down);
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseup", up);
      canvas.removeEventListener("mouseleave", up);
      canvas.removeEventListener("touchstart", down);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", up);
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
