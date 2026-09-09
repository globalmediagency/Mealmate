"use client";

import { useEffect } from "react";

/** Registers the service worker in production builds only. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Offline support is a progressive enhancement; ignore failures.
    });
  }, []);
  return null;
}
