"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CheckCircle2, ChevronRight, FileText, Lock, MessageCircle, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import { tokens } from "@/lib/design-tokens";
import { useCourseNavPayload } from "@/components/shared/course-nav-context";
import { MarathonProcedureToggle } from "@/app/(student)/learn/[courseSlug]/marathon-procedure-toggle";
import { Badge } from "@/components/ui/badge";
import type { CourseNavMarathonWeek, CourseNavProcedure } from "@/lib/course-nav-types";

function filterMarathonWeeksForEvent(weeks: CourseNavMarathonWeek[], eventId: string): CourseNavMarathonWeek[] {
  return weeks
    .map((week) => ({
      ...week,
      days: week.days
        .map((day) => ({
          ...day,
          events: day.events.filter((e) => e.id === eventId),
        }))
        .filter((day) => day.events.length > 0),
    }))
    .filter((week) => week.days.length > 0);
}

const navItemClass = (active: boolean) =>
  cn(
    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
    tokens.animation.fast,
    active
      ? "bg-primary/10 font-medium text-primary"
      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
  );

const lockedRowClass = "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground opacity-60";

function MarathonProcedureSidebarDetails({ procedures }: { procedures: CourseNavProcedure[] }) {
  const [open, setOpen] = useState(true);
  return (
    <details
      className="group rounded-md border border-transparent open:border-border open:bg-muted/20"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary
        className={cn(
          "cursor-pointer list-none px-1 py-1.5 text-sm font-medium text-foreground",
          "[&::-webkit-details-marker]:hidden"
        )}
        aria-label="Процедуры: развернуть или свернуть список"
      >
        <span className="flex w-full min-w-0 items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
          <span className="min-w-0 flex-1 text-left">Процедуры</span>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {procedures.length}
          </Badge>
        </span>
      </summary>
      <ul className="space-y-2 pb-1 pt-1">
        {procedures.map((p) => (
          <li key={p.id} className="rounded-md border border-border/80 bg-muted/30 px-2 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="line-clamp-2 text-xs font-medium leading-snug">{p.title}</span>
                <Badge variant={p.completed ? "success" : "warning"} className="mt-1 text-[10px]">
                  {p.completed ? "Сделано" : "План"}
                </Badge>
                {p.scheduledAt && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {new Intl.DateTimeFormat("ru-RU").format(new Date(p.scheduledAt))}
                  </p>
                )}
              </div>
              <MarathonProcedureToggle procedureId={p.id} completed={p.completed} compact />
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function CourseNavSidebarSection({ onNavigate }: { onNavigate?: () => void }) {
  const payload = useCourseNavPayload();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scopeEventId = searchParams.get("event");

  const marathonWeeksDisplay = useMemo(() => {
    if (!payload?.marathonWeeks || payload.productType !== "MARATHON" || !scopeEventId) {
      return payload?.marathonWeeks ?? [];
    }
    const filtered = filterMarathonWeeksForEvent(payload.marathonWeeks, scopeEventId);
    return filtered.length > 0 ? filtered : payload.marathonWeeks;
  }, [payload, scopeEventId]);

  if (!payload) return null;

  const base = `/learn/${payload.courseSlug}`;
  const overviewActive = pathname === base;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      <div className="space-y-3 border-t border-border pt-3">
      <div>
        <p className={cn(tokens.typography.label, "line-clamp-2 px-1 text-xs uppercase tracking-wide text-muted-foreground")}>
          Сейчас
        </p>
        <p className={cn(tokens.typography.label, "mt-0.5 line-clamp-3 px-1 text-sm leading-snug")}>{payload.title}</p>
      </div>

      <Link
        href={base}
        onClick={() => onNavigate?.()}
        className={navItemClass(overviewActive)}
        aria-current={overviewActive ? "page" : undefined}
      >
        <FileText className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">Описание и прогресс</span>
        <ChevronRight className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
      </Link>

      {/* Правила — показываем только если они заданы администратором */}
      {payload.rules ? (
        <Link
          href={`${base}/rules`}
          onClick={() => onNavigate?.()}
          className={navItemClass(pathname === `${base}/rules`)}
          aria-current={pathname === `${base}/rules` ? "page" : undefined}
        >
          <ScrollText className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">Правила</span>
          <ChevronRight className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Link>
      ) : null}

      {payload.productType === "MARATHON" && scopeEventId ? (
        <Link
          href={`${base}/event/${scopeEventId}`}
          onClick={() => onNavigate?.()}
          className={navItemClass(pathname === `${base}/event/${scopeEventId}`)}
          aria-current={pathname === `${base}/event/${scopeEventId}` ? "page" : undefined}
        >
          <ChevronRight className="h-4 w-4 shrink-0 rotate-180 opacity-70" aria-hidden />
          <span className="min-w-0 flex-1 text-sm">К карточке события</span>
        </Link>
      ) : null}

      {payload.productType === "COURSE" && payload.lessons && (
        <div className="space-y-0.5">
          <p className={cn(tokens.typography.small, "px-1 font-medium text-foreground")}>Дни (уроки)</p>
          <ul className="space-y-0.5">
            {payload.lessons.map((lesson) => {
              const href = `${base}/${lesson.slug}`;
              const active = pathname === href;
              if (!lesson.accessible) {
                return (
                  <li key={lesson.slug}>
                    <div className={lockedRowClass}>
                      <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">
                        {lesson.index + 1}. {lesson.title}
                      </span>
                    </div>
                  </li>
                );
              }
              return (
                <li key={lesson.slug}>
                  <Link
                    href={href}
                    onClick={() => onNavigate?.()}
                    className={navItemClass(active)}
                    aria-current={active ? "page" : undefined}
                  >
                    {lesson.completed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden />
                    ) : (
                      <span className="w-3.5 shrink-0 text-center text-xs text-muted-foreground">{lesson.index + 1}</span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {payload.productType === "COURSE" && payload.curatorFeedback ? (
        <div className="px-1 pb-1">
          <Link
            href={`${base}/feedback`}
            onClick={() => onNavigate?.()}
            className={navItemClass(pathname === `${base}/feedback`)}
            aria-current={pathname === `${base}/feedback` ? "page" : undefined}
          >
            <MessageCircle className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm">Обратная связь</span>
          </Link>
        </div>
      ) : null}

      {payload.productType === "MARATHON" && (
        <>
          {payload.curatorFeedback ? (
            <div className="px-1 pb-2">
              <Link
                href={`${base}/feedback`}
                onClick={() => onNavigate?.()}
                className={navItemClass(pathname === `${base}/feedback`)}
                aria-current={pathname === `${base}/feedback` ? "page" : undefined}
              >
                <MessageCircle className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm">Обратная связь</span>
              </Link>
            </div>
          ) : null}
          {payload.procedures && payload.procedures.length > 0 && (
            <MarathonProcedureSidebarDetails procedures={payload.procedures} />
          )}

          {marathonWeeksDisplay && marathonWeeksDisplay.length > 0 && (
            <div className="space-y-1">
              <p className={cn(tokens.typography.small, "px-1 font-medium text-foreground")}>
                {scopeEventId ? "Событие" : "Расписание"}
              </p>
              {marathonWeeksDisplay.map((week) => (
                <details key={week.weekNumber} className="group rounded-md border border-transparent open:border-border open:bg-muted/20">
                  <summary
                    className={cn(
                      "cursor-pointer list-none px-2 py-1.5 text-xs font-semibold text-foreground",
                      "[&::-webkit-details-marker]:hidden"
                    )}
                  >
                    <span className="flex items-center gap-1">
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
                      {week.weekLabel}
                    </span>
                  </summary>
                  <div className="space-y-2 pb-2 pl-1">
                    {week.days.map((day) => (
                      <div key={day.dayOffset}>
                        <p className={cn(tokens.typography.small, "px-2 py-0.5 text-[11px] font-medium text-muted-foreground")}>
                          {day.dayLabel}
                        </p>
                        <ul className="space-y-0.5">
                          {day.events.map((event) => {
                            const href = `${base}/event/${event.id}`;
                            const active = pathname === href;
                            if (!event.accessible) {
                              return (
                                <li key={event.id}>
                                  <div className={lockedRowClass}>
                                    <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    <span className="min-w-0 flex-1 truncate text-xs">{event.title}</span>
                                    <Badge variant="outline" className="shrink-0 text-[9px] px-1 py-0">
                                      {event.type}
                                    </Badge>
                                  </div>
                                </li>
                              );
                            }
                            if (event.lockedByTariff) {
                              return (
                                <li key={event.id}>
                                  <div className={lockedRowClass} title="Недоступно в вашем тарифе">
                                    <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    <span className="min-w-0 flex-1 truncate text-xs">{event.title}</span>
                                    <Badge variant="secondary" className="shrink-0 text-[9px] px-1 py-0">
                                      тариф
                                    </Badge>
                                  </div>
                                </li>
                              );
                            }
                            return (
                              <li key={event.id}>
                                <Link
                                  href={href}
                                  onClick={() => onNavigate?.()}
                                  className={navItemClass(active)}
                                  aria-current={active ? "page" : undefined}
                                >
                                  {event.completed ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden />
                                  ) : (
                                    <span className="w-3.5 shrink-0" aria-hidden />
                                  )}
                                  <span className="min-w-0 flex-1 truncate text-xs leading-snug">{event.title}</span>
                                  <Badge variant="outline" className="shrink-0 text-[9px] px-1 py-0">
                                    {event.type}
                                  </Badge>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
