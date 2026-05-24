"use client";

import { useEffect, useState } from "react";
import { getAdminHomeworkUnreadCount } from "@/app/(admin)/admin/homework/homework-unread-actions";

export function HomeworkUnreadBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      const result = await getAdminHomeworkUnreadCount();
      if (!cancelled) setCount(result.count);
    }

    const refresh = () => void fetchCount();

    void refresh();
    const id = setInterval(refresh, 15000);
    window.addEventListener("homework-unread-changed", refresh);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("homework-unread-changed", refresh);
    };
  }, []);

  if (count === 0) return null;

  return (
    <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}
