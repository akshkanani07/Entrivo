"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("[Service Worker] Registered with scope:", registration.scope);
        })
        .catch((error) => {
          console.error("[Service Worker] Registration failed:", error);
        });
    }
  }, []);

  return null;
}
