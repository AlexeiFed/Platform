"use client";

import { useServiceWorker } from "@/hooks/use-service-worker";

export function SwRegister() {
  useServiceWorker();
  return null;
}
