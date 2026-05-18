"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 30_000;

/**
 * Обновляет списки ДЗ (фильтры, уроки) без ручного F5.
 * SSE — при любом событии homework; polling — запасной канал.
 */
export function HomeworkPageAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const es = new EventSource("/api/realtime/homework");
    es.onmessage = () => {
      setTimeout(() => router.refresh(), 0);
    };
    es.onerror = () => {
      /* браузер переподключается */
    };

    const pollId = setInterval(() => router.refresh(), POLL_MS);

    return () => {
      es.close();
      clearInterval(pollId);
    };
  }, [router]);

  return null;
}
