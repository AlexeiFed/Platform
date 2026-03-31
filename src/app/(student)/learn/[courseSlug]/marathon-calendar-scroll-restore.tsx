"use client";

import { useEffect } from "react";

const HASH_PREFIX = "marathon-event-";

/**
 * После возврата с страницы события (#marathon-event-…) прокручиваем к той же карточке.
 */
export function MarathonCalendarScrollRestore() {
  useEffect(() => {
    const raw = window.location.hash.replace(/^#/, "");
    if (!raw.startsWith(HASH_PREFIX)) return;

    const scroll = () => {
      const el = document.getElementById(raw);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    requestAnimationFrame(() => {
      scroll();
      setTimeout(scroll, 100);
    });
  }, []);

  return null;
}
