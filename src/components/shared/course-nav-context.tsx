"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CourseNavPayload } from "@/lib/course-nav-types";

type CourseNavContextValue = {
  payload: CourseNavPayload | null;
  setPayload: (value: CourseNavPayload | null) => void;
};

const CourseNavContext = createContext<CourseNavContextValue | null>(null);

export function CourseNavProvider({ children }: { children: React.ReactNode }) {
  const [payload, setPayload] = useState<CourseNavPayload | null>(null);
  const value = useMemo(() => ({ payload, setPayload }), [payload]);
  return <CourseNavContext.Provider value={value}>{children}</CourseNavContext.Provider>;
}

export function useCourseNavPayload() {
  const ctx = useContext(CourseNavContext);
  if (!ctx) {
    throw new Error("useCourseNavPayload must be used within CourseNavProvider");
  }
  return ctx.payload;
}

export function useSetCourseNavPayload() {
  const ctx = useContext(CourseNavContext);
  if (!ctx) {
    throw new Error("useSetCourseNavPayload must be used within CourseNavProvider");
  }
  return ctx.setPayload;
}

/** Синхронизирует данные боковой навигации курса с серверным layout (очистка при уходе со страницы). */
export function CourseNavSync({ payload }: { payload: CourseNavPayload }) {
  const setPayload = useSetCourseNavPayload();
  const stableSet = useCallback(
    (next: CourseNavPayload | null) => {
      setPayload(next);
    },
    [setPayload]
  );

  useEffect(() => {
    stableSet(payload);
    return () => stableSet(null);
  }, [payload, stableSet]);

  return null;
}
