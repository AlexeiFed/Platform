"use client";

import { useEffect } from "react";

type IdleWindow = Window & typeof globalThis & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function useServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const idleWindow = window as IdleWindow;
    let isCancelled = false;
    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;

    const register = () => {
      if (isCancelled) return;

      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW registration failed silently
      });
    };

    const scheduleRegistration = () => {
      if (idleWindow.requestIdleCallback) {
        idleHandle = idleWindow.requestIdleCallback(() => register(), { timeout: 3000 });
        return;
      }

      timeoutHandle = window.setTimeout(register, 1200);
    };

    if (document.readyState === "complete") {
      scheduleRegistration();
    } else {
      window.addEventListener("load", scheduleRegistration, { once: true });
    }

    return () => {
      isCancelled = true;
      window.removeEventListener("load", scheduleRegistration);

      if (idleHandle !== null && idleWindow.cancelIdleCallback) {
        idleWindow.cancelIdleCallback(idleHandle);
      }

      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, []);
}
