"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  const lastJson = useRef<string | null>(null);

  useEffect(() => {
    let serialized: string;
    try {
      serialized = JSON.stringify(payload);
    } catch {
      serialized = "";
    }
    if (lastJson.current === serialized) {
      return;
    }
    lastJson.current = serialized;
    setPayload(payload);
  }, [payload, setPayload]);

  useEffect(() => {
    return () => {
      lastJson.current = null;
      setPayload(null);
    };
  }, [setPayload]);

  return null;
}
