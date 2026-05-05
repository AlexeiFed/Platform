"use client";

// Назначение: хранит и показывает последнюю точку, где студент остановился в марафоне.
// Используется как трекер на страницах события/урока и как карточка на странице обзора марафона.
import Link from "next/link";
import { ArrowUpRight, PlayCircle } from "lucide-react";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { tokens } from "@/lib/design-tokens";

type MarathonResumePoint = {
  courseSlug: string;
  kind: "event" | "lesson";
  eventId: string | null;
  eventTitle: string | null;
  eventType: string | null;
  dayOffset: number | null;
  lessonSlug: string | null;
  lessonTitle: string | null;
  updatedAt: string;
};

type MarathonResumePointInput = Omit<MarathonResumePoint, "courseSlug" | "updatedAt">;

const MARATHON_RESUME_KEY_PREFIX = "marathon-resume:";
const MARATHON_RESUME_UPDATED_EVENT = "marathon-resume-updated";

const buildStorageKey = (courseSlug: string) => `${MARATHON_RESUME_KEY_PREFIX}${courseSlug}`;

const parsePoint = (raw: string | null): MarathonResumePoint | null => {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<MarathonResumePoint>;
    if (!parsed || parsed.kind == null || parsed.courseSlug == null) return null;
    if (parsed.kind !== "event" && parsed.kind !== "lesson") return null;

    return {
      courseSlug: parsed.courseSlug,
      kind: parsed.kind,
      eventId: parsed.eventId ?? null,
      eventTitle: parsed.eventTitle ?? null,
      eventType: parsed.eventType ?? null,
      dayOffset: parsed.dayOffset ?? null,
      lessonSlug: parsed.lessonSlug ?? null,
      lessonTitle: parsed.lessonTitle ?? null,
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
};

/** Стабильный снимок для useSyncExternalStore: один и тот же raw → та же ссылка (иначе React #185). */
const resumeSnapshotCache = new Map<
  string,
  { raw: string | null; point: MarathonResumePoint | null }
>();

const getMarathonResumeSnapshot = (courseSlug: string): MarathonResumePoint | null => {
  const raw =
    typeof window === "undefined" ? null : window.localStorage.getItem(buildStorageKey(courseSlug));
  const cached = resumeSnapshotCache.get(courseSlug);
  if (cached && cached.raw === raw) {
    return cached.point;
  }
  const parsed = parsePoint(raw);
  const point = parsed?.courseSlug === courseSlug ? parsed : null;
  resumeSnapshotCache.set(courseSlug, { raw, point });
  return point;
};

export function MarathonResumePointTracker({
  courseSlug,
  point,
}: {
  courseSlug: string;
  point: MarathonResumePointInput;
}) {
  const pointKey = JSON.stringify(point);

  useEffect(() => {
    // На каждое открытие урока/события перезаписываем точку продолжения для конкретного марафона.
    const payload: MarathonResumePoint = {
      courseSlug,
      updatedAt: new Date().toISOString(),
      ...JSON.parse(pointKey) as MarathonResumePointInput,
    };
    window.localStorage.setItem(buildStorageKey(courseSlug), JSON.stringify(payload));
    resumeSnapshotCache.delete(courseSlug);
    window.dispatchEvent(new CustomEvent(MARATHON_RESUME_UPDATED_EVENT, { detail: courseSlug }));
  }, [courseSlug, pointKey]);

  return null;
}

export function MarathonResumeCard({ courseSlug }: { courseSlug: string }) {
  const point = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      window.addEventListener(MARATHON_RESUME_UPDATED_EVENT, onStoreChange);

      return () => {
        window.removeEventListener("storage", onStoreChange);
        window.removeEventListener(MARATHON_RESUME_UPDATED_EVENT, onStoreChange);
      };
    },
    () => getMarathonResumeSnapshot(courseSlug),
    () => null
  );

  const href = useMemo(() => {
    if (!point) return null;

    if (point.kind === "lesson" && point.lessonSlug) {
      return point.eventId
        ? `/learn/${courseSlug}/${point.lessonSlug}?event=${encodeURIComponent(point.eventId)}`
        : `/learn/${courseSlug}/${point.lessonSlug}`;
    }

    if (point.eventId) {
      return `/learn/${courseSlug}/event/${encodeURIComponent(point.eventId)}`;
    }

    return null;
  }, [courseSlug, point]);

  if (!point || !href) return null;

  const title =
    point.kind === "lesson"
      ? point.lessonTitle ?? "Последний открытый материал"
      : point.eventTitle ?? "Последнее открытое событие";

  const subtitleParts = [
    point.eventType ? `Событие · ${point.eventType}` : null,
    point.dayOffset && point.dayOffset > 0 ? `День ${point.dayOffset}` : null,
  ].filter(Boolean);

  const updatedAtLabel = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(point.updatedAt));

  return (
    <section>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Где вы остановились
      </h2>
      <Link
        href={href}
        className={`group flex items-center gap-4 rounded-xl border bg-card p-4 ${tokens.animation.fast} hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md`}
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <PlayCircle className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">
            {point.kind === "lesson" ? "Последний открытый урок" : "Последнее открытое событие"}
          </div>
          <div className="truncate text-[15px] font-semibold text-foreground">{title}</div>
          {subtitleParts.length > 0 ? (
            <div className="text-xs text-muted-foreground">{subtitleParts.join(" · ")}</div>
          ) : null}
          <div className={`${tokens.typography.small} text-muted-foreground`}>
            Последний вход: {updatedAtLabel}
          </div>
        </div>
        <ArrowUpRight
          className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    </section>
  );
}
