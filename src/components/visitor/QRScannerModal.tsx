"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  QrCode,
  Search,
  CheckCircle2,
  AlertTriangle,
  X,
  ShieldAlert,
  ArrowRight,
  Loader2,
  Camera,
  CameraOff,
  RefreshCw,
} from "lucide-react";

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: (data: any) => void;
}

export function QRScannerModal({ isOpen, onClose, onVerified }: QRScannerModalProps) {
  const [tokenInput, setTokenInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifiedData, setVerifiedData] = useState<any | null>(null);

  // Camera scanner state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasBarcodeSupport, setHasBarcodeSupport] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      setHasBarcodeSupport(true);
    }
  }, []);

  // Cleanup camera stream when modal closes or unmounts
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setCameraLoading(false);
  };

  const startCamera = async () => {
    setCameraLoading(true);
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera API is not supported in this browser environment.");
      }

      // Stop existing stream if any
      stopCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      streamRef.current = stream;
      setIsCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      // If BarcodeDetector is available, initiate barcode scanning loop
      if ("BarcodeDetector" in window) {
        try {
          const barcodeDetector = new (window as any).BarcodeDetector({
            formats: ["qr_code", "code_128", "code_39", "ean_13"],
          });

          scanIntervalRef.current = setInterval(async () => {
            if (!videoRef.current || videoRef.current.readyState < 2) return;
            try {
              const barcodes = await barcodeDetector.detect(videoRef.current);
              if (barcodes && barcodes.length > 0) {
                const rawValue = barcodes[0].rawValue;
                if (rawValue) {
                  // Vibrate if supported
                  if ("vibrate" in navigator) {
                    try {
                      navigator.vibrate(100);
                    } catch {}
                  }
                  stopCamera();
                  setTokenInput(rawValue);
                  handleVerify(rawValue);
                }
              }
            } catch {
              // Ignore per-frame detection hiccups
            }
          }, 350);
        } catch {
          // Barcode detector failed to initialize; camera will stay visible for manual capture
        }
      }
    } catch (err: any) {
      let msg = "Unable to access camera.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        msg = "Camera permission was denied. Please allow camera permissions in your browser address bar to scan passes directly.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        msg = "No camera was detected on this device. You can type or paste the visitor token below.";
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        msg = "The camera is currently in use by another application. Please close other video apps and retry.";
      } else if (err.message) {
        msg = err.message;
      }
      setCameraError(msg);
      stopCamera();
    } finally {
      setCameraLoading(false);
    }
  };

  const handleModalClose = () => {
    stopCamera();
    onClose();
  };

  if (!isOpen) return null;

  const handleVerify = async (tokenToTest?: string) => {
    const token = tokenToTest || tokenInput.trim();
    if (!token) {
      setError("Please enter a visitor QR token or scan code");
      return;
    }

    setLoading(true);
    setError(null);
    setVerifiedData(null);

    try {
      const res = await fetch("/api/invitations/verify-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Invalid or unrecognized QR token");
      }

      setVerifiedData(data.data);
    } catch (err: any) {
      setError(err.message || "Failed to verify pass");
    } finally {
      setLoading(false);
    }
  };

  const handleProceed = () => {
    if (verifiedData) {
      onVerified(verifiedData);
      onClose();
    }
  };

  const testCodes = [
    { label: "Apex Client (Rajesh Sharma)", code: "ENTRIVO-INV-APEX-101" },
    { label: "Candidate (Pooja Mehta)", code: "ENTRIVO-INV-CAND-202" },
    { label: "VIP (Anita Desai)", code: "ENTRIVO-INV-VIP-303" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Scan Visitor QR Pass</h3>
              <p className="text-xs text-slate-400">Security Gate & Reception Fast Scanner</p>
            </div>
          </div>
          <button
            onClick={handleModalClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Scanner Viewfinder / Camera Feed */}
          <div className="relative w-full h-52 rounded-xl bg-slate-950 border border-indigo-500/40 flex flex-col items-center justify-center overflow-hidden group">
            {isCameraActive ? (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5 bg-indigo-500 shadow-[0_0_12px_#6366f1] animate-pulse"></div>
                <div className="absolute w-36 h-36 border-2 border-indigo-400/80 rounded-xl pointer-events-none flex items-center justify-center">
                  <div className="w-full h-full border border-dashed border-white/40 rounded-lg animate-pulse" />
                </div>
                <div className="absolute bottom-3 inset-x-4 flex items-center justify-between">
                  <span className="text-[11px] bg-slate-900/80 backdrop-blur px-2 py-0.5 rounded text-emerald-400 border border-emerald-500/30 font-mono">
                    Camera Scanning...
                  </span>
                  <button
                    onClick={stopCamera}
                    type="button"
                    className="text-xs bg-slate-900/90 text-rose-300 hover:text-white hover:bg-rose-600 px-2.5 py-1 rounded-lg border border-rose-500/40 flex items-center gap-1 transition-colors"
                  >
                    <CameraOff className="w-3.5 h-3.5" /> Stop
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-24 h-24 border-2 border-dashed border-indigo-400/40 rounded-xl flex items-center justify-center">
                  <QrCode className="w-10 h-10 text-indigo-400/60" />
                </div>
                <span className="mt-3 text-xs text-slate-400 font-mono tracking-wide">
                  ALIGN BARCODE OR QR IN VIEWFINDER
                </span>
                <button
                  onClick={startCamera}
                  disabled={cameraLoading}
                  type="button"
                  className="mt-2 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
                >
                  {cameraLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5" />
                  )}
                  {cameraLoading ? "Activating Camera..." : "Scan with Device Camera"}
                </button>
              </>
            )}
          </div>

          {/* Camera Permission Error Notice */}
          {cameraError && (
            <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-800/80 text-amber-200 text-xs flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <strong className="block font-semibold">Camera Access Notice:</strong>
                  <span>{cameraError}</span>
                </div>
              </div>
              <button
                onClick={startCamera}
                type="button"
                className="text-[11px] underline font-semibold flex items-center gap-1 flex-shrink-0 hover:text-white"
              >
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            </div>
          )}

          {/* Quick Test Token Chips */}
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Quick Test Passes:
            </span>
            <div className="flex flex-wrap gap-2">
              {testCodes.map((tc) => (
                <button
                  key={tc.code}
                  type="button"
                  onClick={() => {
                    setTokenInput(tc.code);
                    handleVerify(tc.code);
                  }}
                  className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-indigo-950 hover:border-indigo-500 text-slate-300 border border-slate-700 transition-colors text-left"
                >
                  {tc.label}
                </button>
              ))}
            </div>
          </div>

          {/* Manual Input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Enter Pass Token (e.g. ENTRIVO-INV-APEX-101)..."
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              onClick={() => handleVerify()}
              disabled={loading}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Verification Result Card */}
          {verifiedData && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              {verifiedData.visitor.isBlacklisted ? (
                <div className="p-3 bg-rose-950/80 border border-rose-600 rounded-lg text-rose-200 text-xs flex items-start gap-2">
                  <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0" />
                  <div>
                    <strong className="block font-bold">SECURITY ALERT: VISITOR BLACKLISTED</strong>
                    {verifiedData.visitor.blacklistReason || "Unauthorized entry flagged."}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-bold">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">{verifiedData.visitor.name}</h4>
                      <p className="text-xs text-slate-400">
                        {verifiedData.visitor.company} • Host: {verifiedData.host.name}
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded text-white uppercase"
                    style={{ backgroundColor: verifiedData.visitor.badgeColor }}
                  >
                    {verifiedData.visitor.visitorTypeName}
                  </span>
                </div>
              )}

              <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center text-xs">
                <span className="text-slate-400 font-mono">
                  Room: {verifiedData.meetingRoom || "Executive Suite"}
                </span>
                <button
                  onClick={handleProceed}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 transition-colors"
                >
                  Proceed to Check-in
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
