/**
 * feedback-unread-badge.tsx
 * Клиентский компонент: polling каждые 15с для отображения
 * количества непрочитанных сообщений обратной связи в сайдбаре.
 */
"use client";

import { useEffect, useState } from "react";
import { getAdminUnreadCount } from "@/app/(admin)/admin/feedback/actions";

export function FeedbackUnreadBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      const result = await getAdminUnreadCount();
      if (!cancelled) setCount(result.count);
    }

    void fetchCount();
    const id = setInterval(() => void fetchCount(), 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (count === 0) return null;

  return (
    <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}
