"use client";

import { useEffect, useState } from "react";

type Point = { id: string; name: string; office: { name: string } };

export function DeskDisplayClient({ point }: { point: Point }) {
  const [qr, setQr] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const updateOffline = () => setOffline(!navigator.onLine);
    updateOffline();
    window.addEventListener("online", updateOffline);
    window.addEventListener("offline", updateOffline);
    return () => {
      window.removeEventListener("online", updateOffline);
      window.removeEventListener("offline", updateOffline);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!navigator.onLine) return;
      try {
        const response = await fetch(`/api/self-checkin/points/${encodeURIComponent(point.id)}/qr`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || "Could not refresh QR.");
        if (!active) return;
        setQr(result.data.qrDataUrl);
        setExpiresAt(result.data.expiresAt);
        setError("");
      } catch {
        if (active) setError("QR refresh failed. Check this kiosk connection.");
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [point.id]);

  const secondsLeft = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-5 py-8 text-center text-white">
      <p className="text-sm font-bold uppercase tracking-[0.3em] text-indigo-300">Entrivo reception</p>
      <h1 className="mt-3 text-3xl font-bold">{point.name}</h1>
      <p className="mt-1 text-slate-400">{point.office.name}</p>
      {offline && <p role="status" className="mt-5 rounded-lg bg-amber-950 px-4 py-2 text-amber-200">Offline — the displayed QR may expire.</p>}
      {error && <p role="alert" className="mt-5 text-rose-300">{error}</p>}
      {qr ? <img src={qr} alt="Rotating self check-in QR code" className="mt-7 h-80 w-80 rounded-2xl bg-white p-3" /> : <div className="mt-7 h-80 w-80 animate-pulse rounded-2xl bg-slate-800" />}
      <p className="mt-5 text-lg font-semibold">Scan to check in</p>
      {expiresAt > 0 && <p className="mt-2 text-sm text-slate-400">QR refreshes automatically · expires in about {secondsLeft}s</p>}
      <p className="mt-5 max-w-md text-xs text-slate-500">Use only while physically present at this reception desk.</p>
    </main>
  );
}
