"use client";

import React, { useRef, useState, useEffect } from "react";
import { PenTool, RotateCcw, Check } from "lucide-react";
import { useTranslations } from "next-intl";

interface SignatureCanvasProps {
  onSave: (dataUrl: string) => void;
  onClear?: () => void;
}

export function SignatureCanvas({ onSave, onClear }: SignatureCanvasProps) {
  const t = useTranslations("checkin");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [typedName, setTypedName] = useState("");

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

    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);

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
    setTypedName("");
    if (onClear) onClear();
  };

  const saveTypedSignature = () => {
    const canvas = canvasRef.current;
    const name = typedName.trim();
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !name) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#818cf8";
    ctx.font = "italic 34px cursive";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name.slice(0, 40), canvas.width / 2, canvas.height / 2, canvas.width - 32);
    setHasSignature(true);
    onSave(canvas.toDataURL("image/png"));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-xl border border-surface-border bg-surface shadow-inner">
        <canvas
          ref={canvasRef}
          width={420}
          height={160}
          aria-label="Draw the visitor's signature here"
          aria-describedby="signature-instructions"
          onMouseDown={startDrawing}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onMouseMove={draw}
          onTouchStart={startDrawing}
          onTouchEnd={stopDrawing}
          onTouchMove={draw}
          className="h-36 w-full touch-none cursor-crosshair focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        />
        {!hasSignature && (
          <div id="signature-instructions" className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 text-xs text-text-muted/70">
            <PenTool className="w-4 h-4" />
            {t("signHere")}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="text-xs text-text-muted">{t("digitalAcknowledgment")}</span>
        <button
          type="button"
          onClick={clearCanvas}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm text-text-muted transition-colors hover:text-rose-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          {t("clear")}
        </button>
      </div>
      <div className="space-y-2 border-t border-surface-border pt-3">
        <label htmlFor="typed-visitor-signature" className="block text-sm font-medium text-text">
          Or type the visitor’s full name
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="typed-visitor-signature"
            autoComplete="name"
            maxLength={100}
            value={typedName}
            onChange={(event) => setTypedName(event.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-surface-border bg-surface px-3 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          />
          <button
            type="button"
            onClick={saveTypedSignature}
            disabled={!typedName.trim()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-brand/40 bg-brand/15 px-3 text-sm font-semibold text-brand-200 hover:bg-brand/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check aria-hidden="true" className="h-4 w-4" />
            Use typed signature
          </button>
        </div>
      </div>
    </div>
  );
}
