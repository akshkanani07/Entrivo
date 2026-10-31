"use client";

import React, { useRef, useState, useEffect } from "react";
import { PenTool, RotateCcw, Check } from "lucide-react";

interface SignatureCanvasProps {
  onSave: (dataUrl: string) => void;
  onClear?: () => void;
}

export function SignatureCanvas({ onSave, onClear }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.strokeStyle = "#818cf8";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.beginPath();
      setHasSignature(true);
      onSave(canvas.toDataURL("image/png"));
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    setHasSignature(false);
    if (onClear) onClear();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative border border-slate-700/80 rounded-xl bg-slate-950/60 overflow-hidden shadow-inner">
        <canvas
          ref={canvasRef}
          width={420}
          height={160}
          onMouseDown={startDrawing}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onMouseMove={draw}
          onTouchStart={startDrawing}
          onTouchEnd={stopDrawing}
          onTouchMove={draw}
          className="w-full h-36 cursor-crosshair touch-none"
        />
        {!hasSignature && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-500/60 text-xs gap-1.5">
            <PenTool className="w-4 h-4" />
            Sign here with touch or mouse
          </div>
        )}
      </div>

      <div className="flex justify-between items-center px-1">
        <span className="text-[11px] text-slate-400">Digital Acknowledgment</span>
        <button
          type="button"
          onClick={clearCanvas}
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-rose-400 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          Clear
        </button>
      </div>
    </div>
  );
}
