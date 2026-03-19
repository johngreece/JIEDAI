"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface DocumentScannerProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export function DocumentScanner({ onCapture, onClose }: DocumentScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [captured, setCaptured] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const startCamera = useCallback(async (facing: "environment" | "user") => {
    try {
      // Stop previous stream
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setError("");
    } catch {
      setError("无法访问摄像头，请检查权限设置");
    }
  }, [stream]);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    startCamera(next);
  };

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);

    // Apply slight contrast enhancement for document readability
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const contrast = 1.2;
    const intercept = 128 * (1 - contrast);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, data[i] * contrast + intercept));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * contrast + intercept));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * contrast + intercept));
    }
    ctx.putImageData(imageData, 0, 0);

    setCaptured(canvas.toDataURL("image/jpeg", 0.92));
  };

  const retake = () => {
    setCaptured(null);
  };

  const confirm = () => {
    if (!captured) return;
    // Convert data URL to File
    const arr = captured.split(",");
    const mime = arr[0].match(/:(.*?);/)?.[1] ?? "image/jpeg";
    const bstr = atob(arr[1]);
    const u8arr = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
    const file = new File([u8arr], `scan-${Date.now()}.jpg`, { type: mime });
    onCapture(file);
  };

  const handleClose = () => {
    stream?.getTracks().forEach((t) => t.stop());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between rounded-t-2xl bg-slate-900 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">证件扫描</h3>
          <div className="flex gap-2">
            <button
              onClick={switchCamera}
              className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
              title="切换摄像头"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={handleClose}
              className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Camera / Preview */}
        <div className="relative bg-black">
          {error ? (
            <div className="flex h-80 items-center justify-center text-center text-white">
              <div>
                <svg className="mx-auto h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <p className="mt-2 text-sm">{error}</p>
              </div>
            </div>
          ) : captured ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={captured} alt="扫描预览" className="w-full" />
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full"
              />
              {/* Document alignment guide overlay */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-6 border-2 border-white/40 rounded-xl">
                  {/* Corner marks */}
                  <div className="absolute -top-0.5 -left-0.5 h-6 w-6 border-t-3 border-l-3 border-cyan-400 rounded-tl-lg" />
                  <div className="absolute -top-0.5 -right-0.5 h-6 w-6 border-t-3 border-r-3 border-cyan-400 rounded-tr-lg" />
                  <div className="absolute -bottom-0.5 -left-0.5 h-6 w-6 border-b-3 border-l-3 border-cyan-400 rounded-bl-lg" />
                  <div className="absolute -bottom-0.5 -right-0.5 h-6 w-6 border-b-3 border-r-3 border-cyan-400 rounded-br-lg" />
                </div>
                <div className="absolute bottom-2 left-0 right-0 text-center">
                  <span className="rounded-full bg-black/50 px-3 py-1 text-xs text-white/80">
                    将证件对准框内，保持平整
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-4 rounded-b-2xl bg-slate-900 px-4 py-4">
          {captured ? (
            <>
              <button
                onClick={retake}
                className="rounded-lg border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/20"
              >
                重拍
              </button>
              <button
                onClick={confirm}
                className="rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-cyan-700"
              >
                使用此照片
              </button>
            </>
          ) : (
            <button
              onClick={capture}
              disabled={!!error}
              className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white/30 bg-white transition-transform hover:scale-105 active:scale-95 disabled:opacity-30"
              title="拍照"
            >
              <div className="h-12 w-12 rounded-full bg-white" />
            </button>
          )}
        </div>

        {/* Hidden canvas for capture */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
