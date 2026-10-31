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
  User,
  ShieldCheck,
  SwitchCamera,
  Loader2,
  CheckCircle2,
} from "lucide-react";

interface CameraCaptureProps {
  onCapture: (imageDataUrl: string) => void;
  onClear?: () => void;
  initialImage?: string | null;
  autoStart?: boolean;
}

const PRESET_PORTRAITS = [
  {
    id: "p1",
    label: "Corporate Executive",
    url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
  },
  {
    id: "p2",
    label: "Tech Lead",
    url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80",
  },
  {
    id: "p3",
    label: "Product Specialist",
    url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80",
  },
  {
    id: "p4",
    label: "Operations Lead",
    url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80",
  },
  {
    id: "p5",
    label: "Enterprise Guest",
    url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80",
  },
  {
    id: "p6",
    label: "Consultant",
    url: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80",
  },
];

export function CameraCapture({
  onCapture,
  onClear,
  initialImage,
  autoStart = true,
}: CameraCaptureProps) {
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
      startCamera();
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
        throw new Error("Camera API is not supported in this browser environment.");
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
      let errorMsg = "Unable to access camera.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        errorMsg = "Camera permission was denied. Please allow camera access in your browser address bar.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        errorMsg = "No webcam detected on this device. You can upload a photo or choose a preset portrait below.";
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        errorMsg = "Camera is currently used by another application (e.g. Zoom or Teams).";
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
    startCamera(nextFacing);
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
      startCamera();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setCameraError("Please select a valid image file (JPEG, PNG, WebP).");
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
    <div className="w-full flex flex-col items-center">
      {/* Mode Switcher Tabs (when not captured yet) */}
      {!capturedImage && (
        <div className="flex p-1 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-semibold mb-4 w-full max-w-xs">
          <button
            type="button"
            onClick={() => {
              setActiveTab("CAMERA");
              startCamera();
            }}
            className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "CAMERA"
                ? "bg-indigo-600 text-white shadow-glow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            Live Camera
          </button>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab("UPLOAD");
            }}
            className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "UPLOAD"
                ? "bg-indigo-600 text-white shadow-glow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            Upload File
          </button>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab("PRESET");
            }}
            className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "PRESET"
                ? "bg-indigo-600 text-white shadow-glow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Portraits
          </button>
        </div>
      )}

      {/* Main Viewport Container */}
      <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-3xl overflow-hidden bg-slate-950 border-2 border-indigo-500/30 flex items-center justify-center shadow-2xl group">
        {/* Shutter Flash Animation Overlay */}
        {isFlashing && (
          <div className="absolute inset-0 bg-white z-40 animate-out fade-out duration-300" />
        )}

        {/* 1. Captured State */}
        {capturedImage ? (
          <div className="relative w-full h-full">
            <img
              src={capturedImage}
              alt="Visitor Portrait"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />
            <div className="absolute top-3 left-3 bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 backdrop-blur-md shadow-lg">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Photo Verified
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
                <span className="text-xs text-slate-300 font-medium">Initializing Camera...</span>
              </div>
            )}

            {/* Camera Inactive / Permission Needed Overlay */}
            {!isCameraActive && !isStartingCamera && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950 z-10 space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-indigo-950/80 border border-indigo-700/50 flex items-center justify-center text-indigo-400">
                  <Camera className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Camera Access Required</h4>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-[200px]">
                    Click below to enable your camera for badge photo identification.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => startCamera()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-glow-sm"
                >
                  Enable Camera
                </button>
              </div>
            )}

            {/* Live Face Frame Guide (Subtle Oval Framing) */}
            {isCameraActive && (
              <>
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                  <div className="w-44 h-56 rounded-[50%] border-2 border-dashed border-indigo-400/50 shadow-[0_0_20px_rgba(99,102,241,0.25)] flex items-center justify-center">
                    <span className="text-[10px] font-semibold text-indigo-300/80 bg-slate-950/70 px-2 py-0.5 rounded-full backdrop-blur-sm -translate-y-24">
                      Align Face Here
                    </span>
                  </div>
                </div>

                {/* Flip camera button */}
                <button
                  type="button"
                  onClick={toggleCameraFacing}
                  className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700 flex items-center justify-center backdrop-blur-md transition-colors"
                  title="Switch Camera (Front / Back)"
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
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-full flex flex-col items-center justify-center p-6 text-center cursor-pointer hover:bg-slate-900/60 transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            <div className="w-14 h-14 rounded-2xl bg-indigo-950/80 border border-indigo-700/50 flex items-center justify-center text-indigo-400 mb-3 group-hover:scale-105 transition-transform">
              <Upload className="w-7 h-7" />
            </div>
            <h4 className="text-xs font-bold text-white">Click to Upload Photo</h4>
            <p className="text-[11px] text-slate-400 mt-1">JPEG, PNG or WebP image from your device</p>
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
                title={preset.label}
              >
                <img
                  src={preset.url}
                  alt={preset.label}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-colors" />
                <span className="absolute bottom-1 left-1 right-1 text-[8px] font-bold text-white bg-slate-950/80 rounded py-0.5 px-1 truncate text-center">
                  {preset.label}
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
              Retake / Change Photo
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
              Snap Photo Now
            </button>

            <button
              type="button"
              onClick={() => setCountdown(3)}
              disabled={countdown !== null}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-glow-sm disabled:opacity-50"
              title="3-Second Timer with Countdown"
            >
              <Timer className="w-3.5 h-3.5" />
              3s Timer
            </button>

            <button
              type="button"
              onClick={stopCamera}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-medium transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          </div>
        ) : null}
      </div>

      {/* Error / Fallback Banner */}
      {cameraError && (
        <div className="mt-3 p-3 bg-amber-950/70 border border-amber-600/40 text-amber-200 text-xs rounded-xl max-w-sm flex items-start gap-2 text-left">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-white">Camera Notice</p>
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
                Upload Photo File
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
                Select Preset Portrait
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
