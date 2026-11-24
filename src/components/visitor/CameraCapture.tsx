"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  Camera,
  RefreshCw,
  Check,
  AlertCircle,
  X,
  Upload,
  Sparkles,
  Timer,
  SwitchCamera,
  Loader2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusPill } from "@/components/ui/StatusPill";

interface CameraCaptureProps {
  onCapture: (imageDataUrl: string) => void;
  onClear?: () => void;
  initialImage?: string | null;
  autoStart?: boolean;
}

const PRESET_PORTRAITS = [
  {
    id: "p1",
    labelKey: "portraitExecutive",
    url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
  },
  {
    id: "p2",
    labelKey: "portraitTechLead",
    url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80",
  },
  {
    id: "p3",
    labelKey: "portraitProductSpecialist",
    url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80",
  },
  {
    id: "p4",
    labelKey: "portraitOperationsLead",
    url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80",
  },
  {
    id: "p5",
    labelKey: "portraitEnterpriseGuest",
    url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80",
  },
  {
    id: "p6",
    labelKey: "portraitConsultant",
    url: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80",
  },
];

export function CameraCapture({
  onCapture,
  onClear,
  initialImage,
  autoStart = true,
}: CameraCaptureProps) {
  const t = useTranslations("checkin");
  const portraitLabels: Record<string, string> = {
    p1: t("portraitExecutive"),
    p2: t("portraitTechLead"),
    p3: t("portraitProductSpecialist"),
    p4: t("portraitOperationsLead"),
    p5: t("portraitEnterpriseGuest"),
    p6: t("portraitConsultant"),
  };
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<"CAMERA" | "UPLOAD" | "PRESET">("CAMERA");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(initialImage || null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isStartingCamera, setIsStartingCamera] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);

  // Auto-start camera when activeTab is CAMERA
  useEffect(() => {
    if (autoStart && !capturedImage && activeTab === "CAMERA" && !isCameraActive && !isStartingCamera) {
      void startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [activeTab, autoStart]);

  // Ensure stream is bound to video element whenever stream changes or component re-renders
  useEffect(() => {
    if (isCameraActive && stream && videoRef.current) {
      const video = videoRef.current;
      video.srcObject = stream;
      video.onloadedmetadata = () => {
        video.play().catch((e) => console.warn("Video play error:", e));
      };
    }
  }, [isCameraActive, stream]);

  // Countdown timer effect
  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      takeSnapshot();
      setCountdown(null);
    }
  }, [countdown]);

  const startCamera = async (facing: "user" | "environment" = facingMode) => {
    setIsStartingCamera(true);
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(t("cameraUnsupported"));
      }

      // Stop any existing stream
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      setStream(mediaStream);
      setIsCameraActive(true);
      setFacingMode(facing);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch((err) => console.warn("Play error:", err));
        };
      }
    } catch (err: any) {
      console.warn("Camera access error:", err);
      let errorMsg = t("cameraUnavailable");
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        errorMsg = t("cameraPermissionDenied");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        errorMsg = t("cameraNotFound");
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        errorMsg = t("cameraInUse");
      }
      setCameraError(errorMsg);
      setIsCameraActive(false);
    } finally {
      setIsStartingCamera(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsCameraActive(false);
  };

  const toggleCameraFacing = () => {
    const nextFacing = facingMode === "user" ? "environment" : "user";
    void startCamera(nextFacing);
  };

  const takeSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Trigger visual camera shutter flash
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 250);

    const videoWidth = video.videoWidth || 640;
    const videoHeight = video.videoHeight || 480;

    // High quality 1:1 square face crop centered
    const minDim = Math.min(videoWidth, videoHeight);
    const startX = (videoWidth - minDim) / 2;
    const startY = (videoHeight - minDim) / 2;

    const outputSize = 480;
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      // Mirror horizontally if front-facing selfie
      if (facingMode === "user") {
        ctx.translate(outputSize, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(video, startX, startY, minDim, minDim, 0, 0, outputSize, outputSize);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      setCapturedImage(dataUrl);
      onCapture(dataUrl);
      stopCamera();
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    if (onClear) onClear();
    if (activeTab === "CAMERA") {
      void startCamera();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setCameraError(t("invalidImageFile"));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setCapturedImage(dataUrl);
        onCapture(dataUrl);
        stopCamera();
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSelectPreset = (url: string) => {
    setCapturedImage(url);
    onCapture(url);
    stopCamera();
  };

  return (
    <div className="flex w-full flex-col items-center">
      {/* Mode Switcher Tabs (when not captured yet) */}
      {!capturedImage && (
        <div className="mb-4 flex w-full max-w-xs rounded-xl border border-surface-border bg-surface p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setActiveTab("CAMERA");
              void startCamera();
            }}
            className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "CAMERA"
                ? "bg-brand text-white shadow-glow-sm"
                : "text-text-muted hover:text-text"
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            {t("liveCamera")}
          </button>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab("UPLOAD");
            }}
            className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "UPLOAD"
                ? "bg-brand text-white shadow-glow-sm"
                : "text-text-muted hover:text-text"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            {t("uploadFile")}
          </button>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab("PRESET");
            }}
            className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "PRESET"
                ? "bg-brand text-white shadow-glow-sm"
                : "text-text-muted hover:text-text"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {t("portraits")}
          </button>
        </div>
      )}

      {/* Main Viewport Container */}
      <div className="group relative flex h-64 w-64 items-center justify-center overflow-hidden rounded-3xl border-2 border-brand/30 bg-surface shadow-card sm:h-72 sm:w-72">
        {/* Shutter Flash Animation Overlay */}
        {isFlashing && (
          <div className="absolute inset-0 bg-white z-40 animate-out fade-out duration-300" />
        )}

        {/* 1. Captured State */}
        {capturedImage ? (
          <div className="relative w-full h-full">
            <img
              src={capturedImage}
              alt={t("visitorPortrait")}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />
            <div className="absolute left-3 top-3">
              <StatusPill tone="success">{t("photoVerified")}</StatusPill>
            </div>
          </div>
        ) : activeTab === "CAMERA" ? (
          /* 2. Live Camera Viewport */
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            {/* Always keep video mounted so ref is stable */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${
                facingMode === "user" ? "scale-x-[-1]" : ""
              } ${isCameraActive ? "opacity-100" : "opacity-0"}`}
            />

            {/* Loading / Starting Camera Overlay */}
            {isStartingCamera && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/90 z-20">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                <span className="text-xs text-slate-300 font-medium">{t("initializingCamera")}</span>
              </div>
            )}

            {/* Camera Inactive / Permission Needed Overlay */}
            {!isCameraActive && !isStartingCamera && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950 z-10 space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-indigo-950/80 border border-indigo-700/50 flex items-center justify-center text-indigo-400">
                  <Camera className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">{t("cameraAccessRequired")}</h4>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-[200px]">
                    {t("cameraEnableDescription")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => startCamera()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-glow-sm"
                >
                  {t("enableCamera")}
                </button>
              </div>
            )}

            {/* Live Face Frame Guide (Subtle Oval Framing) */}
            {isCameraActive && (
              <>
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                  <div className="w-44 h-56 rounded-[50%] border-2 border-dashed border-indigo-400/50 shadow-[0_0_20px_rgba(99,102,241,0.25)] flex items-center justify-center">
                    <span className="text-[10px] font-semibold text-indigo-300/80 bg-slate-950/70 px-2 py-0.5 rounded-full backdrop-blur-sm -translate-y-24">
                      {t("alignFace")}
                    </span>
                  </div>
                </div>

                {/* Flip camera button */}
                <button
                  type="button"
                  onClick={toggleCameraFacing}
                  className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700 flex items-center justify-center backdrop-blur-md transition-colors"
                  title={t("switchCamera")}
                >
                  <SwitchCamera className="w-4 h-4" />
                </button>
              </>
            )}

            {/* Countdown Overlay */}
            {countdown !== null && countdown > 0 && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-xs">
                <div className="w-20 h-20 rounded-full bg-indigo-600/90 text-white font-black text-4xl flex items-center justify-center animate-ping">
                  {countdown}
                </div>
              </div>
            )}
          </div>
        ) : activeTab === "UPLOAD" ? (
          /* 3. Upload File Mode */
          <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label={t("uploadPhoto")}
              onChange={handleFileUpload}
            />
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-brand/40 bg-brand/15 text-brand-300">
              <Upload className="w-7 h-7" />
            </div>
            <h4 className="text-xs font-bold text-white">{t("uploadPhoto")}</h4>
            <p className="text-[11px] text-slate-400 mt-1">{t("supportedImageTypes")}</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
            >
              Choose a photo
            </button>
          </div>
        ) : (
          /* 4. Preset Portraits Mode */
          <div className="w-full h-full p-3 overflow-y-auto grid grid-cols-3 gap-2 bg-slate-950">
            {PRESET_PORTRAITS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset.url)}
                className="group relative rounded-xl overflow-hidden aspect-square border border-slate-800 hover:border-indigo-500 transition-all hover:scale-105"
                title={portraitLabels[preset.id]}
              >
                <img
                  src={preset.url}
                  alt={portraitLabels[preset.id]}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-colors" />
                <span className="absolute bottom-1 left-1 right-1 text-[8px] font-bold text-white bg-slate-950/80 rounded py-0.5 px-1 truncate text-center">
                  {portraitLabels[preset.id]}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Hidden Canvas for High-Resolution Capture */}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Control Buttons */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {capturedImage ? (
          /* Retake / Change Photo */
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRetake}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-all shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t("retakePhoto")}
            </button>
          </div>
        ) : activeTab === "CAMERA" && isCameraActive ? (
          /* Snap Photo Buttons */
          <div className="flex gap-2">
            <button
              type="button"
              onClick={takeSnapshot}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-950/50"
            >
              <Check className="w-4 h-4" />
              {t("snapPhoto")}
            </button>

            <button
              type="button"
              onClick={() => setCountdown(3)}
              disabled={countdown !== null}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-glow-sm disabled:opacity-50"
              title={t("timerTitle")}
            >
              <Timer className="w-3.5 h-3.5" />
              {t("timerLabel")}
            </button>

            <button
              type="button"
              onClick={stopCamera}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-medium transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              {t("cancel")}
            </button>
          </div>
        ) : null}
      </div>

      {/* Error / Fallback Banner */}
      {cameraError && (
        <div className="mt-3 p-3 bg-amber-950/70 border border-amber-600/40 text-amber-200 text-xs rounded-xl max-w-sm flex items-start gap-2 text-left">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-white">{t("cameraNotice")}</p>
            <p className="text-[11px] text-amber-300/90 leading-relaxed">{cameraError}</p>
            <div className="pt-1 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setCameraError(null);
                  setActiveTab("UPLOAD");
                }}
                className="text-[11px] underline text-cyan-300 font-bold"
              >
                {t("uploadPhotoFile")}
              </button>
              <span className="text-slate-500">•</span>
              <button
                type="button"
                onClick={() => {
                  setCameraError(null);
                  setActiveTab("PRESET");
                }}
                className="text-[11px] underline text-cyan-300 font-bold"
              >
                {t("selectPresetPortrait")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
