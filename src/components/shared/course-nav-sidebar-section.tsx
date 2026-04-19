// Секция сайдбара с навигацией по активному курсу/марафону студента.
// Содержит карточку текущего курса с прогрессом, ссылки на описание/правила/обратную связь
// и сворачиваемые блоки уроков/расписания/процедур.
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  FileText,
  Lock,
  MessageCircle,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { tokens } from "@/lib/design-tokens";
import { useCourseNavPayload } from "@/components/shared/course-nav-context";
import { MarathonProcedureToggle } from "@/app/(student)/learn/[courseSlug]/marathon-procedure-toggle";
import { Badge } from "@/components/ui/badge";
import type {
  CourseNavMarathonWeek,
  CourseNavPayload,
  CourseNavProcedure,
} from "@/lib/course-nav-types";

// Оставляем в расписании только указанное событие (контекст карточки события).
function filterMarathonWeeksForEvent(
  weeks: CourseNavMarathonWeek[],
  eventId: string
): CourseNavMarathonWeek[] {
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

// Нормализуем название курса: убираем кавычки-«ёлочки» и принудительный UPPERCASE.
// Показываем в Title Case — читается ощутимо легче.
function normalizeCourseTitle(raw: string): string {
  const trimmed = raw.trim().replace(/^[«"“”']+|[»"“”']+$/g, "");
  // Если весь заголовок написан в UPPERCASE (кириллица/латиница) — приведём к «предложению».
  const letters = trimmed.replace(/[^\p{L}]/gu, "");
  const isAllUpper = letters.length > 0 && letters === letters.toUpperCase();
  if (!isAllUpper) return trimmed;
  return trimmed
    .toLocaleLowerCase("ru-RU")
    .replace(/(^|[\s:.,—–-])(\p{L})/gu, (_, p1, p2) => `${p1}${p2.toLocaleUpperCase("ru-RU")}`);
}

// Универсальный расчёт прогресса по данным навигации.
function computeNavProgress(payload: CourseNavPayload): {
  value: number;
  completed: number;
  total: number;
  subtitle: string;
} {
  if (payload.productType === "COURSE" && payload.lessons?.length) {
    const total = payload.lessons.length;
    const completed = payload.lessons.filter((l) => l.completed).length;
    return {
      value: total ? completed / total : 0,
      completed,
      total,
      subtitle: `Урок ${Math.min(completed + 1, total)} из ${total}`,
    };
  }
  if (payload.productType === "MARATHON") {
    const events = payload.marathonWeeks?.flatMap((w) => w.days.flatMap((d) => d.events)) ?? [];
    const procedures = payload.procedures ?? [];
    const total = events.length + procedures.length;
    const completed =
      events.filter((e) => e.completed).length +
      procedures.filter((p) => p.completed).length;
    return {
      value: total ? completed / total : 0,
      completed,
      total,
      subtitle: total ? `Выполнено ${completed} из ${total}` : "Расписание скоро появится",
    };
  }
  return { value: 0, completed: 0, total: 0, subtitle: "" };
}

// Стиль строки навигации. Вариант compact — без горизонтальной подложки, для вложенных списков.
const navItemClass = (active: boolean, compact = false) =>
  cn(
    "group flex items-center gap-2.5 rounded-lg text-sm",
    compact ? "px-2 py-1.5" : "px-2.5 py-2",
    tokens.animation.fast,
    active
      ? "bg-primary/10 font-semibold text-primary"
      : "text-foreground/70 hover:bg-accent hover:text-foreground"
  );

const lockedRowClass =
  "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground/70";

// Заголовок группы в сайдбаре (uppercase-капс).
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
      {children}
    </p>
  );
}

// Карточка текущего курса: бейдж типа, название, прогресс-линия, подпись.
function CurrentCourseCard({
  payload,
  progress,
}: {
  payload: CourseNavPayload;
  progress: ReturnType<typeof computeNavProgress>;
}) {
  const typeLabel = payload.productType === "COURSE" ? "Курс" : "Марафон";
  const title = normalizeCourseTitle(payload.title);
  const percent = Math.round(progress.value * 100);

  return (
    <Link
      href={`/learn/${payload.courseSlug}`}
      className={cn(
        "relative block overflow-hidden rounded-xl border border-primary/20 p-3",
        "bg-gradient-to-br from-primary/10 via-primary/5 to-transparent",
        tokens.animation.fast,
        "hover:border-primary/40 hover:shadow-sm"
      )}
      aria-label={`К обзору: ${title}`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
        <Sparkles className="h-3 w-3" aria-hidden />
        <span>Сейчас · {typeLabel}</span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">
        {title}
      </p>
      {progress.total > 0 ? (
        <>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-primary/15">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{progress.subtitle}</span>
            <span className="font-semibold text-foreground">{percent}%</span>
          </div>
        </>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground">{progress.subtitle}</p>
      )}
    </Link>
  );
}

// Сворачиваемый блок процедур марафона.
function MarathonProcedureSidebarDetails({ procedures }: { procedures: CourseNavProcedure[] }) {
  const [open, setOpen] = useState(true);
  const done = procedures.filter((p) => p.completed).length;
  return (
    <details
      className="group rounded-lg"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-foreground/80",
          "hover:bg-accent",
          "[&::-webkit-details-marker]:hidden"
        )}
        aria-label="Процедуры: развернуть или свернуть список"
      >
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden
        />
        <span className="flex-1">Процедуры</span>
        <span className="text-[11px] font-medium text-muted-foreground">
          {done}/{procedures.length}
        </span>
      </summary>
      <ul className="space-y-1.5 pb-1 pl-5 pr-1 pt-1">
        {procedures.map((p) => (
          <li
            key={p.id}
            className="rounded-lg border border-border/60 bg-card/40 px-2 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="line-clamp-2 text-xs font-medium leading-snug">
                  {p.title}
                </span>
                <Badge
                  variant={p.completed ? "success" : "warning"}
                  className="mt-1 text-[10px]"
                >
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

  const progress = useMemo(
    () => (payload ? computeNavProgress(payload) : null),
    [payload]
  );

  if (!payload || !progress) return null;

  const base = `/learn/${payload.courseSlug}`;
  const overviewActive = pathname === base;
  const rulesActive = pathname === `${base}/rules`;
  const feedbackActive = pathname === `${base}/feedback`;
  const eventActive = scopeEventId ? pathname === `${base}/event/${scopeEventId}` : false;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      <div className="space-y-1 border-t border-border pt-3">
        <CurrentCourseCard payload={payload} progress={progress} />

        <GroupLabel>Материалы</GroupLabel>

        <Link
          href={base}
          onClick={() => onNavigate?.()}
          className={navItemClass(overviewActive)}
          aria-current={overviewActive ? "page" : undefined}
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">Описание и прогресс</span>
        </Link>

        {payload.rules ? (
          <Link
            href={`${base}/rules`}
            onClick={() => onNavigate?.()}
            className={navItemClass(rulesActive)}
            aria-current={rulesActive ? "page" : undefined}
          >
            <ScrollText className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">Правила</span>
          </Link>
        ) : null}

        {payload.curatorFeedback ? (
          <Link
            href={`${base}/feedback`}
            onClick={() => onNavigate?.()}
            className={navItemClass(feedbackActive)}
            aria-current={feedbackActive ? "page" : undefined}
          >
            <MessageCircle className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">Обратная связь</span>
          </Link>
        ) : null}

        {payload.productType === "MARATHON" && scopeEventId ? (
          <Link
            href={`${base}/event/${scopeEventId}`}
            onClick={() => onNavigate?.()}
            className={navItemClass(eventActive)}
            aria-current={eventActive ? "page" : undefined}
          >
            <ChevronRight className="h-4 w-4 shrink-0 rotate-180 opacity-70" aria-hidden />
            <span className="min-w-0 flex-1">К карточке события</span>
          </Link>
        ) : null}

        {payload.productType === "COURSE" && payload.lessons && (
          <>
            <GroupLabel>Дни / уроки</GroupLabel>
            <ul className="space-y-0.5">
              {payload.lessons.map((lesson) => {
                const href = `${base}/${lesson.slug}`;
                const active = pathname === href;
                if (!lesson.accessible) {
                  return (
                    <li key={lesson.slug}>
                      <div className={lockedRowClass} title="Урок пока закрыт">
                        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">
                          <span className="tabular-nums">{lesson.index + 1}.</span>{" "}
                          {lesson.title}
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
                      className={navItemClass(active, true)}
                      aria-current={active ? "page" : undefined}
                    >
                      {lesson.completed ? (
                        <CheckCircle2
                          className="h-4 w-4 shrink-0 text-success"
                          aria-hidden
                        />
                      ) : (
                        <Circle
                          className="h-4 w-4 shrink-0 text-muted-foreground/50"
                          aria-hidden
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        <span className="tabular-nums text-muted-foreground">
                          {lesson.index + 1}.
                        </span>{" "}
                        {lesson.title}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {payload.productType === "MARATHON" && (
          <>
            {payload.procedures && payload.procedures.length > 0 && (
              <>
                <GroupLabel>Процедуры</GroupLabel>
                <MarathonProcedureSidebarDetails procedures={payload.procedures} />
              </>
            )}

            {marathonWeeksDisplay && marathonWeeksDisplay.length > 0 && (
              <>
                <GroupLabel>{scopeEventId ? "Событие" : "Расписание"}</GroupLabel>
                <div className="space-y-0.5">
                  {marathonWeeksDisplay.map((week) => {
                    const allEvents = week.days.flatMap((d) => d.events);
                    const doneInWeek = allEvents.filter((e) => e.completed).length;
                    return (
                      <details
                        key={week.weekNumber}
                        className="group rounded-lg"
                        open={week.weekNumber === 0}
                      >
                        <summary
                          className={cn(
                            "flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-foreground/80",
                            "hover:bg-accent",
                            "[&::-webkit-details-marker]:hidden"
                          )}
                        >
                          <ChevronRight
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                            aria-hidden
                          />
                          <span className="flex-1">{week.weekLabel}</span>
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {doneInWeek}/{allEvents.length}
                          </span>
                        </summary>
                        <div className="space-y-2 pb-2 pl-5 pr-1 pt-1">
                          {week.days.map((day) => (
                            <div key={day.dayOffset}>
                              <p className="px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
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
                                          <Lock
                                            className="h-3.5 w-3.5 shrink-0"
                                            aria-hidden
                                          />
                                          <span className="min-w-0 flex-1 truncate text-xs">
                                            {event.title}
                                          </span>
                                          <Badge
                                            variant="outline"
                                            className="shrink-0 px-1 py-0 text-[9px]"
                                          >
                                            {event.type}
                                          </Badge>
                                        </div>
                                      </li>
                                    );
                                  }
                                  if (event.lockedByTariff) {
                                    return (
                                      <li key={event.id}>
                                        <div
                                          className={lockedRowClass}
                                          title="Недоступно в вашем тарифе"
                                        >
                                          <Lock
                                            className="h-3.5 w-3.5 shrink-0"
                                            aria-hidden
                                          />
                                          <span className="min-w-0 flex-1 truncate text-xs">
                                            {event.title}
                                          </span>
                                          <Badge
                                            variant="secondary"
                                            className="shrink-0 px-1 py-0 text-[9px]"
                                          >
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
                                        className={navItemClass(active, true)}
                                        aria-current={active ? "page" : undefined}
                                      >
                                        {event.completed ? (
                                          <CheckCircle2
                                            className="h-3.5 w-3.5 shrink-0 text-success"
                                            aria-hidden
                                          />
                                        ) : (
                                          <Circle
                                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50"
                                            aria-hidden
                                          />
                                        )}
                                        <span className="min-w-0 flex-1 truncate text-xs leading-snug">
                                          {event.title}
                                        </span>
                                        <Badge
                                          variant="outline"
                                          className="shrink-0 px-1 py-0 text-[9px]"
                                        >
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
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
