import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { tokens } from "@/lib/design-tokens";
import { formatDate } from "@/lib/utils";
import { calculateMarathonProgress } from "@/lib/marathon-progress";
import { BookOpen, GraduationCap } from "lucide-react";
import { LiveReviewThread } from "./live-review-thread";
import { HomeworkStudentBodyMetrics } from "./homework-student-body-metrics";
import { HomeworkStudentProgressPhotos } from "./homework-student-progress-photos";
import { HomeworkPageAutoRefresh } from "@/components/shared/homework-page-auto-refresh";
import { markStaffHomeworkThreadRead } from "./homework-unread-actions";

export default async function AdminHomeworkPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; userId?: string; lessonId?: string }>;
}) {
  const session = await auth();
  const { productId, userId, lessonId } = await searchParams;

  const allowedProductIds = session?.user.role === "CURATOR"
    ? (await prisma.productCurator.findMany({
        where: { curatorId: session.user.id },
        select: { productId: true },
      })).map((item) => item.productId)
    : null;

  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      ...(allowedProductIds ? { id: { in: allowedProductIds } } : {}),
    },
    select: { id: true, title: true, type: true, startDate: true },
    orderBy: { title: "asc" },
  });

  const lessonToProduct = await prisma.lesson.findMany({
    select: { id: true, productId: true },
  });
  const lessonMap = new Map(lessonToProduct.map((l) => [l.id, l.productId]));

  const pendingByLessonUser = await prisma.homeworkSubmission.groupBy({
    by: ["lessonId", "userId"],
    where: { status: { in: ["PENDING", "IN_REVIEW"] } },
    _count: { _all: true },
  });

  const productPending = new Map<string, number>();
  for (const row of pendingByLessonUser) {
    const pid = lessonMap.get(row.lessonId);
    if (!pid) continue;
    productPending.set(pid, (productPending.get(pid) ?? 0) + row._count._all);
  }

  const selectedProductId = productId ?? (products[0]?.id ?? null);

  const studentsRaw = selectedProductId
    ? await prisma.homeworkSubmission.findMany({
        where: {
          lesson: { productId: selectedProductId },
        },
        distinct: ["userId"],
        select: { user: { select: { id: true, name: true, email: true } }, userId: true },
        orderBy: { userId: "asc" },
      })
    : [];
  const students = studentsRaw;

  const studentPendingCounts = selectedProductId
    ? await prisma.homeworkSubmission.groupBy({
        by: ["userId"],
        where: {
          lesson: { productId: selectedProductId },
          status: { in: ["PENDING", "IN_REVIEW"] },
        },
        _count: { _all: true },
      })
    : [];
  const userPending = new Map(studentPendingCounts.map((r) => [r.userId, r._count._all]));

  const selectedUserId = userId ?? (students[0]?.userId ?? null);

  const allowedStudentIds = new Set(students.map((s) => s.userId));
  const studentBodyUserId = selectedUserId && allowedStudentIds.has(selectedUserId) ? selectedUserId : null;

  const studentBody = studentBodyUserId
    ? await prisma.user.findUnique({
        where: { id: studentBodyUserId },
        select: {
          height: true,
          weight: true,
          measurements: { orderBy: { date: "asc" }, take: 120 },
          progressPhotos: {
            orderBy: [{ type: "asc" }, { position: "asc" }],
            select: { type: true, url: true, position: true },
          },
        },
      })
    : null;

  const allForStudent = selectedProductId && selectedUserId
    ? await prisma.homeworkSubmission.findMany({
        where: { lesson: { productId: selectedProductId }, userId: selectedUserId },
        include: {
          lesson: { select: { id: true, title: true, order: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { createdAt: "asc" },
        take: 300,
      })
    : [];

  // последняя сдача по уроку; порядок в списке — по дате первой сдачи (сверху самое раннее)
  const latestByLesson = new Map<string, (typeof allForStudent)[number]>();
  const firstSubmittedAtByLesson = new Map<string, Date>();
  for (const s of allForStudent) {
    const lessonId = s.lesson.id;
    const prevFirst = firstSubmittedAtByLesson.get(lessonId);
    if (!prevFirst || s.createdAt < prevFirst) {
      firstSubmittedAtByLesson.set(lessonId, s.createdAt);
    }
    const prevLatest = latestByLesson.get(lessonId);
    if (!prevLatest || s.updatedAt > prevLatest.updatedAt) {
      latestByLesson.set(lessonId, s);
    }
  }
  const lessonThreads = [...latestByLesson.values()].sort((a, b) => {
    const aTime = firstSubmittedAtByLesson.get(a.lesson.id)?.getTime() ?? 0;
    const bTime = firstSubmittedAtByLesson.get(b.lesson.id)?.getTime() ?? 0;
    return aTime - bTime;
  });

  const selectedLessonId = lessonId ?? (lessonThreads[0]?.lesson.id ?? null);

  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? null;

  const marathonEventData =
    selectedProduct?.type === "MARATHON" && selectedProductId && selectedUserId
      ? await prisma.marathonEvent.findMany({
          where: { productId: selectedProductId, published: true },
          orderBy: [{ dayOffset: "asc" }, { position: "asc" }],
          select: {
            id: true,
            dayOffset: true,
            title: true,
            eventLessons: {
              orderBy: { position: "asc" },
              select: {
                lessonId: true,
                lesson: {
                  select: {
                    submissions: {
                      where: { userId: selectedUserId },
                      select: { status: true },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        })
      : [];

  const enrollmentForMarathon =
    selectedProduct?.type === "MARATHON" && selectedProductId && selectedUserId
      ? await prisma.enrollment.findUnique({
          where: { userId_productId: { userId: selectedUserId, productId: selectedProductId } },
          select: {
            id: true,
            procedures: { select: { completedAt: true } },
            eventCompletions: { select: { eventId: true } },
          },
        })
      : null;

  const marathonCompletionEventIds = new Set(enrollmentForMarathon?.eventCompletions.map((c) => c.eventId) ?? []);

  const lessonToMarathonDay = new Map<string, number>();
  for (const event of marathonEventData) {
    for (const el of event.eventLessons) {
      // если урок прикреплён к нескольким событиям — показываем самый ранний день
      const prev = lessonToMarathonDay.get(el.lessonId);
      if (prev === undefined || event.dayOffset < prev) {
        lessonToMarathonDay.set(el.lessonId, event.dayOffset);
      }
    }
  }

  const marathonEventStates =
    selectedProduct?.type === "MARATHON"
      ? marathonEventData.map((event) => {
          const manuallyCompleted = marathonCompletionEventIds.has(event.id);
          const statuses = event.eventLessons
            .map((el) => el.lesson.submissions[0]?.status ?? null)
            .filter((x): x is "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED" => Boolean(x));

          const approved = statuses.includes("APPROVED");
          const completed = manuallyCompleted || approved;
          const pending = statuses.includes("PENDING") || statuses.includes("IN_REVIEW");
          const rejected = statuses.includes("REJECTED");

          return {
            id: event.id,
            dayOffset: event.dayOffset,
            title: event.title,
            completed,
            pending: !completed && pending,
            rejected: !completed && !pending && rejected,
          };
        })
      : [];

  const marathonStats =
    selectedProduct?.type === "MARATHON" && enrollmentForMarathon
      ? (() => {
          const totalEvents = marathonEventStates.length;
          const completedEvents = marathonEventStates.filter((e) => e.completed).length;
          const inReviewEvents = marathonEventStates.filter((e) => e.pending).length;
          const rejectedEvents = marathonEventStates.filter((e) => e.rejected).length;
          const notStartedEvents = Math.max(0, totalEvents - completedEvents - inReviewEvents - rejectedEvents);

          const progress = calculateMarathonProgress({
            events: marathonEventData.map((e) => ({
              id: e.id,
              lessons: e.eventLessons.map((el) => ({ submissions: el.lesson.submissions })),
              completions: marathonCompletionEventIds.has(e.id) ? [{ id: "done" }] : [],
            })),
            procedures: enrollmentForMarathon.procedures,
          });

          const nextEvent = marathonEventStates.find((e) => !e.completed) ?? null;

          return {
            totalEvents,
            completedEvents,
            inReviewEvents,
            rejectedEvents,
            notStartedEvents,
            progressValue: progress.value,
            nextDayOffset: nextEvent?.dayOffset ?? null,
          };
        })()
      : null;

  if (selectedProductId && selectedUserId && selectedLessonId) {
    await markStaffHomeworkThreadRead({
      productId: selectedProductId,
      userId: selectedUserId,
      lessonId: selectedLessonId,
    });
  }

  const selectedSubmission = selectedProductId && selectedUserId && selectedLessonId
    ? await prisma.homeworkSubmission.findFirst({
        where: {
          userId: selectedUserId,
          lessonId: selectedLessonId,
          lesson: { productId: selectedProductId },
        },
        include: {
          user: { select: { name: true, email: true } },
          lesson: { select: { id: true, title: true, order: true } },
          messages: {
            orderBy: { createdAt: "asc" },
            include: { user: { select: { name: true, email: true, role: true } } },
          },
        },
        orderBy: { updatedAt: "desc" },
      })
    : null;

  const statusLabels: Record<string, string> = {
    PENDING: "Ожидает",
    IN_REVIEW: "На проверке",
    APPROVED: "Принято",
    REJECTED: "Отклонено",
  };

  const statusVariants: Record<string, "warning" | "secondary" | "success" | "destructive"> = {
    PENDING: "warning",
    IN_REVIEW: "secondary",
    APPROVED: "success",
    REJECTED: "destructive",
  };

  const selectedStudentEntry = students.find((s) => s.userId === selectedUserId);
  const selectedStudentLabel =
    selectedStudentEntry?.user.name ?? selectedStudentEntry?.user.email ?? "Студент";

  return (
    <div className="space-y-6">
      <HomeworkPageAutoRefresh />
      <h1 className={tokens.typography.h2}>Домашние задания</h1>

      <div className="grid min-w-0 w-full gap-4 lg:grid-cols-[340px_280px_1fr]">
        <Card className="h-fit min-w-0 w-full">
          <CardHeader>
            <CardTitle className="text-base">Фильтры</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Курс / марафон</div>
              <div className="space-y-1">
                {products.map((p) => {
                  const pending = productPending.get(p.id) ?? 0;
                  const active = p.id === selectedProductId;
                  return (
                    <Link
                      key={p.id}
                      href={`/admin/homework?productId=${p.id}`}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-accent transition-colors ${active ? "bg-primary/10 border-primary/60 ring-2 ring-primary/40" : ""}`}
                    >
                      <span className="truncate">
                        {p.title}
                      </span>
                      <span className="flex items-center gap-2">
                        {pending > 0 && (
                          <Badge variant="warning" className="text-xs">{pending}</Badge>
                        )}
                        <Badge variant={p.type === "COURSE" ? "default" : "secondary"} className="text-[10px]">
                          {p.type === "COURSE" ? "Курс" : "Марафон"}
                        </Badge>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {selectedProductId && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Студент</div>
                <div className="space-y-1 max-h-[min(38vh,360px)] overflow-auto pr-1 lg:max-h-[360px]">
                  {students.map((s) => {
                    const active = s.userId === selectedUserId;
                    const pending = userPending.get(s.userId) ?? 0;
                    const label = s.user.name ?? s.user.email;
                    return (
                      <Link
                        key={s.userId}
                        href={`/admin/homework?productId=${selectedProductId}&userId=${s.userId}`}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-accent transition-colors ${active ? "bg-primary/10 border-primary/60 ring-2 ring-primary/40" : ""}`}
                      >
                        <span className="truncate">{label}</span>
                        {pending > 0 && <Badge variant="destructive" className="text-xs">{pending}</Badge>}
                      </Link>
                    );
                  })}
                  {students.length === 0 && (
                    <div className="text-sm text-muted-foreground">
                      Нет работ от студентов (или отправок ещё не было).
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit min-w-0 w-full">
          <CardHeader>
            <CardTitle className="text-base">Уроки</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 max-h-[min(45vh,520px)] overflow-auto pr-1 lg:max-h-[520px]">
            {lessonThreads.map((t) => {
              const active = t.lesson.id === selectedLessonId;
              const pending = t.status === "PENDING" || t.status === "IN_REVIEW";
              const marathonDay =
                selectedProduct?.type === "MARATHON"
                  ? (lessonToMarathonDay.get(t.lesson.id) ?? null)
                  : null;
              return (
                <Link
                  key={t.lesson.id}
                  href={`/admin/homework?productId=${selectedProductId}&userId=${selectedUserId}&lessonId=${t.lesson.id}`}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-accent transition-colors ${active ? "bg-primary/10 border-primary/60 ring-2 ring-primary/40" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {t.lesson.order ? `${t.lesson.order}. ` : ""}
                      {t.lesson.title}
                    </span>
                    {marathonDay != null && (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        Добавлен к событию дня {marathonDay}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {pending && <Badge variant="destructive" className="text-xs">!</Badge>}
                    <Badge variant={statusVariants[t.status]} className="text-[10px]">{statusLabels[t.status]}</Badge>
                    {t._count.messages > 0 && <Badge variant="outline" className="text-[10px]">{t._count.messages}</Badge>}
                  </span>
                </Link>
              );
            })}
            {lessonThreads.length === 0 && (
              <div className="text-sm text-muted-foreground">Нет ДЗ по урокам</div>
            )}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-3">
          {selectedProduct && (
            <div className="flex items-center gap-2">
              {selectedProduct.type === "COURSE" ? (
                <BookOpen className="h-5 w-5 text-primary" />
              ) : (
                <GraduationCap className="h-5 w-5 text-primary" />
              )}
              <h2 className={tokens.typography.h4}>{selectedProduct.title}</h2>
            </div>
          )}

          {!selectedSubmission ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Выберите урок слева.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{selectedSubmission.lesson.title}</CardTitle>
                    <div className="text-xs text-muted-foreground mt-1">
                      {selectedSubmission.user.name ?? selectedSubmission.user.email} • {formatDate(selectedSubmission.updatedAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariants[selectedSubmission.status]}>{statusLabels[selectedSubmission.status]}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <LiveReviewThread
                  productId={selectedProductId!}
                  userId={selectedUserId!}
                  lessonId={selectedLessonId!}
                  initialSubmission={{
                    id: selectedSubmission.id,
                    status: selectedSubmission.status,
                    content: selectedSubmission.content,
                    fileUrl: selectedSubmission.fileUrl,
                    fileUrls: selectedSubmission.fileUrls,
                    createdAt: selectedSubmission.createdAt.toISOString(),
                    updatedAt: selectedSubmission.updatedAt.toISOString(),
                    user: {
                      name: selectedSubmission.user.name,
                      email: selectedSubmission.user.email,
                      role: "USER",
                    },
                  }}
                  initialMessages={selectedSubmission.messages.map((m) => ({
                    id: m.id,
                    content: m.content,
                    createdAt: m.createdAt.toISOString(),
                    fileUrl: m.fileUrl,
                    fileUrls: m.fileUrls,
                    replyToId: m.replyToId,
                    user: {
                      name: m.user.name,
                      email: m.user.email,
                      role: m.user.role,
                    },
                  }))}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {studentBody ? (
        <div className="min-w-0 w-full space-y-4">
          {marathonStats ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Статистика выполнения по событиям</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    Прогресс: {Math.round(marathonStats.progressValue * 100)}%
                  </Badge>
                  <Badge variant="success">
                    Выполнено: {marathonStats.completedEvents}/{marathonStats.totalEvents}
                  </Badge>
                  <Badge variant="secondary">
                    На проверке: {marathonStats.inReviewEvents}
                  </Badge>
                  <Badge variant="destructive">
                    Доработать: {marathonStats.rejectedEvents}
                  </Badge>
                  <Badge variant="warning">
                    Не начато: {marathonStats.notStartedEvents}
                  </Badge>
                </div>

                {marathonStats.nextDayOffset != null && (
                  <div className="text-sm text-muted-foreground">
                    Текущая стадия: ближайшее незавершённое событие — день {marathonStats.nextDayOffset}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
          <HomeworkStudentBodyMetrics
            studentLabel={selectedStudentLabel}
            heightCm={studentBody.height}
            weightKg={studentBody.weight}
            measurements={studentBody.measurements}
          />
          <HomeworkStudentProgressPhotos
            beforePhotos={studentBody.progressPhotos
              .filter((p) => p.type === "BEFORE")
              .map(({ url, position }) => ({ url, position }))}
            afterPhotos={studentBody.progressPhotos
              .filter((p) => p.type === "AFTER")
              .map(({ url, position }) => ({ url, position }))}
          />
        </div>
      ) : null}
    </div>
  );
}
