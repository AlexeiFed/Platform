import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateMarathonProgress, getMarathonEventDate } from "@/lib/marathon-progress";
import { redirect, notFound } from "next/navigation";
import { tokens } from "@/lib/design-tokens";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock3, Lock, PlayCircle } from "lucide-react";
import { MarathonCalendarScrollRestore } from "./marathon-calendar-scroll-restore";
import { MarathonProceduresCollapsible } from "./marathon-procedures-collapsible";
import { MarathonProcedureToggle } from "./marathon-procedure-toggle";

type Props = {
  params: Promise<{ courseSlug: string }>;
};

export default async function CoursePage({ params }: Props) {
  const { courseSlug } = await params;
  const session = await auth();
  if (!session) redirect("/login");

  const product = await prisma.product.findUnique({
    where: { slug: courseSlug },
    include: {
      marathonEvents: {
        where: { published: true },
        orderBy: [{ dayOffset: "asc" }, { position: "asc" }],
        include: {
          lesson: {
            select: {
              id: true,
              slug: true,
              title: true,
              published: true,
              submissions: {
                where: { userId: session.user.id },
                select: { status: true },
                take: 1,
              },
            },
          },
          completions: {
            where: {
              enrollment: {
                userId: session.user.id,
              },
            },
            select: {
              id: true,
              enrollmentId: true,
            },
            take: 1,
          },
        },
      },
      lessons: {
        where: { published: true },
        orderBy: { order: "asc" },
        include: {
          submissions: {
            where: { userId: session.user.id },
            select: { status: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!product) notFound();

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_productId: { userId: session.user.id, productId: product.id } },
    include: {
      procedures: {
        include: {
          procedureType: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!enrollment) redirect("/catalog");

  const courseData = product;

  function isLessonAccessible(lesson: (typeof courseData)["lessons"][number], index: number): boolean {
    if (lesson.unlockRule === "IMMEDIATELY") return true;

    if (lesson.unlockRule === "SPECIFIC_DATE") {
      if (courseData.type === "MARATHON" && courseData.startDate && lesson.unlockDay) {
        const unlockDate = new Date(courseData.startDate);
        unlockDate.setDate(unlockDate.getDate() + lesson.unlockDay - 1);
        return new Date() >= unlockDate;
      }
      return lesson.unlockDate ? new Date() >= new Date(lesson.unlockDate) : true;
    }

    if (lesson.unlockRule === "AFTER_HOMEWORK_APPROVAL" && index > 0) {
      const prevLesson = courseData.lessons[index - 1];
      return prevLesson.submissions.some((s) => s.status === "APPROVED");
    }

    return true;
  }

  const marathonProgress = product.type === "MARATHON"
    ? calculateMarathonProgress({
        events: product.marathonEvents,
        procedures: enrollment.procedures,
      })
    : null;
  const progressValue = product.type === "MARATHON"
    ? marathonProgress?.value ?? enrollment.progress
    : enrollment.progress;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Badge variant={product.type === "COURSE" ? "default" : "secondary"}>
          {product.type === "COURSE" ? "Курс" : "Марафон"}
        </Badge>
        <h1 className={`${tokens.typography.h2} mt-2`}>{product.title}</h1>
        {product.description && (
          <p className={`${tokens.typography.body} mt-2`}>{product.description}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Прогресс</span>
          <span className="font-medium">{Math.round(progressValue * 100)}%</span>
        </div>
        <Progress value={progressValue * 100} />
      </div>

      {product.type === "MARATHON" ? (
        <>
          <Card>
            <CardContent className="grid gap-4 p-4 md:grid-cols-3">
              <div>
                <div className="text-sm text-muted-foreground">Старт</div>
                <div className="font-medium">
                  {product.startDate ? new Intl.DateTimeFormat("ru-RU").format(product.startDate) : "Не задан"}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Длительность</div>
                <div className="font-medium">
                  {product.durationDays ? `${product.durationDays} дн.` : "Не ограничено"}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Событий</div>
                <div className="font-medium">{product.marathonEvents.length}</div>
              </div>
            </CardContent>
          </Card>

          {marathonProgress && (
            <Card>
              <CardContent className="grid gap-4 p-4 md:grid-cols-2">
                <div>
                  <div className="text-sm text-muted-foreground">События марафона</div>
                  <div className="font-medium">
                    {marathonProgress.completedEvents} из {marathonProgress.totalEvents}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Процедуры</div>
                  <div className="font-medium">
                    {marathonProgress.completedProcedures} из {marathonProgress.totalProcedures}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <MarathonProceduresCollapsible
            subtitle={
              enrollment.procedures.length === 0 ? (
                <>
                  Отдельный учёт визитов (не путать с типом события «Процедуры» в расписании — тот показывается в
                  календаре по дням).
                </>
              ) : (
                <>
                  Назначено {enrollment.procedures.length}, завершено{" "}
                  {enrollment.procedures.filter((procedure) => procedure.completedAt).length}
                </>
              )
            }
            defaultOpen
          >
            {enrollment.procedures.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Персональный график процедур пока не назначен. Его добавит администратор или куратор.
              </p>
            ) : (
              <div className="space-y-2">
                {enrollment.procedures.map((procedure) => (
                  <div key={procedure.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{procedure.procedureType.title}</span>
                      <Badge variant={procedure.completedAt ? "success" : "warning"}>
                        {procedure.completedAt ? "Завершена" : "Запланирована"}
                      </Badge>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {procedure.scheduledAt && (
                        <div>План: {new Intl.DateTimeFormat("ru-RU").format(procedure.scheduledAt)}</div>
                      )}
                      {procedure.completedAt && (
                        <div>Факт: {new Intl.DateTimeFormat("ru-RU").format(procedure.completedAt)}</div>
                      )}
                      {procedure.notes && <div>{procedure.notes}</div>}
                    </div>
                    <MarathonProcedureToggle procedureId={procedure.id} completed={Boolean(procedure.completedAt)} />
                  </div>
                ))}
              </div>
            )}
          </MarathonProceduresCollapsible>

          <MarathonCalendarScrollRestore />

          <div className="space-y-4">
            {(() => {
              const weekMap = new Map<number, typeof product.marathonEvents>();

              for (const event of product.marathonEvents) {
                const weekNumber =
                  event.dayOffset <= 0
                    ? 0
                    : (event.weekNumber ?? Math.ceil(event.dayOffset / 7));
                const bucket = weekMap.get(weekNumber) ?? [];
                bucket.push(event);
                weekMap.set(weekNumber, bucket);
              }

              const sortedWeeks = [...weekMap.entries()].sort((a, b) => a[0] - b[0]);

              return sortedWeeks.map(([weekNumber, events]) => (
                <section key={weekNumber} className="space-y-3">
                  <div>
                    <h2 className={tokens.typography.h4}>
                      {weekNumber === 0 ? "Подготовительный этап" : `Неделя ${weekNumber}`}
                    </h2>
                    <p className={tokens.typography.small}>
                      {weekNumber === 0 ? "Организация и старт марафона" : "Календарь активностей по дням"}
                    </p>
                  </div>

                  <div className="space-y-3">
                    {events.map((event) => {
                      const eventDate = product.startDate
                        ? getMarathonEventDate(product.startDate, event.dayOffset)
                        : null;
                      const accessible = eventDate ? new Date() >= eventDate : true;
                      const linkedLesson = event.lesson;
                      const lessonCompleted = linkedLesson?.submissions.some((submission) => submission.status === "APPROVED");
                      const manuallyCompleted = (event.completions?.length ?? 0) > 0;
                      const eventCompleted = Boolean(manuallyCompleted || lessonCompleted);

                      return (
                        <Card
                          key={event.id}
                          id={`marathon-event-${event.id}`}
                          className={`scroll-mt-24 ${!accessible ? "opacity-70" : ""}`}
                        >
                          <CardContent className="space-y-3 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">
                                {event.dayOffset === 0 ? "День 0" : `День ${event.dayOffset}`}
                              </Badge>
                              <Badge variant="secondary">{event.type}</Badge>
                              <Badge variant="outline">{event.track}</Badge>
                              {eventDate && (
                                <Badge variant="outline">
                                  {new Intl.DateTimeFormat("ru-RU").format(eventDate)}
                                </Badge>
                              )}
                              {accessible ? (
                                eventCompleted ? (
                                  <Badge variant="success">Выполнено</Badge>
                                ) : (
                                  <Badge variant="success">Доступно</Badge>
                                )
                              ) : (
                                <Badge variant="warning">Откроется позже</Badge>
                              )}
                            </div>

                            <div className="flex items-start gap-3">
                              {accessible ? (
                                eventCompleted ? (
                                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                                ) : (
                                  <PlayCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                                )
                              ) : (
                                <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                              )}

                              <div className="min-w-0 flex-1">
                                <div className="font-medium">{event.title}</div>
                                {event.description && (
                                  <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
                                )}
                                {linkedLesson?.published && (
                                  <div className="mt-2 text-sm text-muted-foreground">
                                    Материал: {linkedLesson.title}
                                  </div>
                                )}
                              </div>
                            </div>

                            {accessible && (
                              <div>
                                <Link href={`/learn/${courseSlug}/event/${event.id}`}>
                                  <Card className="transition-colors hover:bg-accent/50">
                                    <CardContent className="flex items-center gap-2 p-3 text-sm">
                                      <PlayCircle className="h-4 w-4 text-primary" />
                                      {linkedLesson?.published ? "Открыть событие и материал" : "Открыть событие"}
                                    </CardContent>
                                  </Card>
                                </Link>
                              </div>
                            )}

                            {!accessible && eventDate && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Clock3 className="h-4 w-4" />
                                Доступ откроется {new Intl.DateTimeFormat("ru-RU").format(eventDate)}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              ));
            })()}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          {product.lessons.map((lesson, idx) => {
            const accessible = isLessonAccessible(lesson, idx);
            const completed = lesson.submissions.some((s) => s.status === "APPROVED");

            return accessible ? (
              <Link key={lesson.id} href={`/learn/${courseSlug}/${lesson.slug}`}>
                <Card className="hover:bg-accent/50 transition-colors">
                  <CardContent className="flex items-center gap-3 p-4">
                    {completed ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    ) : (
                      <PlayCircle className="h-5 w-5 text-primary shrink-0" />
                    )}
                    <span className="text-sm text-muted-foreground w-8">{idx + 1}</span>
                    <span className="font-medium text-sm flex-1">{lesson.title}</span>
                  </CardContent>
                </Card>
              </Link>
            ) : (
              <Card key={lesson.id} className="opacity-50">
                <CardContent className="flex items-center gap-3 p-4">
                  <Lock className="h-5 w-5 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground w-8">{idx + 1}</span>
                  <span className="font-medium text-sm flex-1 text-muted-foreground">{lesson.title}</span>
                  <Badge variant="outline" className="text-xs">Заблокирован</Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
