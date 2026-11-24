"use client";

import { useEffect, useRef, useState } from "react";

type DetectedBarcode = { rawValue?: string };
type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

export function SelfCheckinPassScanner({ onScan }: { onScan: (value: string) => void }) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const detectingRef = useRef(false);
  const completeRef = useRef(false);

  const stop = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  };

  useEffect(() => stop, []);

  const start = async () => {
    setError("");
    completeRef.current = false;
    const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    if (!Detector) {
      setError("QR scanning is not supported by this browser. Enter the pass code instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new Detector({ formats: ["qr_code"] });
      timerRef.current = window.setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2 || detectingRef.current || completeRef.current) return;
        detectingRef.current = true;
        try {
          const codes = await detector.detect(videoRef.current);
          const value = codes[0]?.rawValue?.trim();
          if (value) {
            completeRef.current = true;
            stop();
            onScan(value);
          }
        } catch {
          setError("Could not read the QR code. Hold it steady and try again.");
        } finally {
          detectingRef.current = false;
        }
      }, 350);
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "NotAllowedError"
        ? "Camera access was denied. Enter the pass code instead."
        : "Unable to open the camera. Enter the pass code instead.");
      stop();
    }
  };

  return (
    <div className="space-y-2">
      {active ? (
        <div className="space-y-2">
          <video ref={videoRef} playsInline muted className="max-h-64 w-full rounded-xl bg-slate-950 object-cover" aria-label="Pass QR camera" />
          <button type="button" className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm" onClick={stop}>Stop camera</button>
        </div>
      ) : (
        <button type="button" className="w-full rounded-xl border border-indigo-300 px-4 py-2 font-medium text-indigo-700" onClick={() => void start()}>
          Scan personal pass QR
        </button>
      )}
      {error && <p role="status" className="text-sm text-amber-800">{error}</p>}
    </div>
  );
}
