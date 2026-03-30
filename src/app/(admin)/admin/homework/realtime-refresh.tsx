"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function RealtimeRefresh() {
  const router = useRouter();
  const sp = useSearchParams();
  const lessonId = sp.get("lessonId");
  const userId = sp.get("userId");

  useEffect(() => {
    if (!lessonId) return;
    const url = `/api/realtime/homework?lessonId=${encodeURIComponent(lessonId)}${userId ? `&userId=${encodeURIComponent(userId)}` : ""}`;
    const es = new EventSource(url);
    es.onmessage = () => {
      // Defer refresh to avoid "Router action dispatched before initialization" in dev.
      setTimeout(() => router.refresh(), 0);
    };
    es.onerror = () => {
      // Browser will auto-retry; keep quiet.
    };
    return () => es.close();
  }, [lessonId, userId, router]);

  return null;
}

