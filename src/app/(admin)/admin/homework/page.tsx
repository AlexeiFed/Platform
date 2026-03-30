import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { tokens } from "@/lib/design-tokens";
import { formatDate } from "@/lib/utils";
import { HomeworkActions } from "./homework-actions";
import { BookOpen, GraduationCap } from "lucide-react";
import { RealtimeRefresh } from "./realtime-refresh";

type QA = { question: string; answer: string };

function parseHomeworkContent(content: string | null): { type: "qa"; data: QA[] } | { type: "text"; data: string } {
  if (!content) return { type: "text", data: "" };
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0 && "question" in parsed[0]) {
      return { type: "qa", data: parsed as QA[] };
    }
  } catch {
    /* not JSON */
  }
  return { type: "text", data: content };
}

export default async function AdminHomeworkPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; userId?: string; lessonId?: string }>;
}) {
  const { productId, userId, lessonId } = await searchParams;

  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { id: true, title: true, type: true },
    orderBy: { title: "asc" },
  });

  const pendingCounts = await prisma.homeworkSubmission.groupBy({
    by: ["lessonId"],
    _count: { _all: true },
    where: { status: { in: ["PENDING", "IN_REVIEW"] } },
  });

  // product -> pending submissions count
  const lessonToProduct = await prisma.lesson.findMany({
    select: { id: true, productId: true },
  });
  const productPending = new Map<string, number>();
  const lessonMap = new Map(lessonToProduct.map((l) => [l.id, l.productId]));
  for (const row of pendingCounts) {
    const pid = lessonMap.get(row.lessonId);
    if (!pid) continue;
    productPending.set(pid, (productPending.get(pid) ?? 0) + row._count._all);
  }

  const selectedProductId = productId ?? (products[0]?.id ?? null);

  const students = selectedProductId
    ? await prisma.homeworkSubmission.findMany({
        where: { lesson: { productId: selectedProductId } },
        distinct: ["userId"],
        select: { user: { select: { id: true, name: true, email: true } }, userId: true },
        orderBy: { userId: "asc" },
      })
    : [];

  const studentPendingCounts = selectedProductId
    ? await prisma.homeworkSubmission.groupBy({
        by: ["userId"],
        where: { lesson: { productId: selectedProductId }, status: { in: ["PENDING", "IN_REVIEW"] } },
        _count: { _all: true },
      })
    : [];
  const userPending = new Map(studentPendingCounts.map((r) => [r.userId, r._count._all]));

  const selectedUserId = userId ?? (students[0]?.userId ?? null);

  const allForStudent = selectedProductId && selectedUserId
    ? await prisma.homeworkSubmission.findMany({
        where: { lesson: { productId: selectedProductId }, userId: selectedUserId },
        include: {
          lesson: { select: { id: true, title: true, order: true } },
          _count: { select: { messages: true } },
        },
        orderBy: [{ lesson: { order: "asc" } }, { updatedAt: "desc" }],
        take: 300,
      })
    : [];

  // latest submission per lesson
  const latestByLesson = new Map<string, (typeof allForStudent)[number]>();
  for (const s of allForStudent) {
    if (!latestByLesson.has(s.lesson.id)) latestByLesson.set(s.lesson.id, s);
  }
  const lessonThreads = [...latestByLesson.values()].sort((a, b) => (a.lesson.order ?? 0) - (b.lesson.order ?? 0));

  const selectedLessonId = lessonId ?? (lessonThreads[0]?.lesson.id ?? null);

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

  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? null;

  return (
    <div className="space-y-6">
      <RealtimeRefresh />
      <h1 className={tokens.typography.h2}>Домашние задания</h1>

      <div className="grid gap-4 lg:grid-cols-[340px_280px_1fr]">
        <Card className="h-fit">
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
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-accent transition-colors ${active ? "bg-primary/10 border-primary/60 outline outline-2 outline-primary/50 outline-offset-2 shadow-[0_0_0_1px_rgba(108,60,245,0.35)]" : ""}`}
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
                <div className="space-y-1 max-h-[360px] overflow-auto pr-1">
                  {students.map((s) => {
                    const active = s.userId === selectedUserId;
                    const pending = userPending.get(s.userId) ?? 0;
                    const label = s.user.name ?? s.user.email;
                    return (
                      <Link
                        key={s.userId}
                        href={`/admin/homework?productId=${selectedProductId}&userId=${s.userId}`}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-accent transition-colors ${active ? "bg-primary/10 border-primary/60 outline outline-2 outline-primary/50 outline-offset-2 shadow-[0_0_0_1px_rgba(108,60,245,0.35)]" : ""}`}
                      >
                        <span className="truncate">{label}</span>
                        {pending > 0 && <Badge variant="destructive" className="text-xs">{pending}</Badge>}
                      </Link>
                    );
                  })}
                  {students.length === 0 && (
                    <div className="text-sm text-muted-foreground">Пока нет отправленных ДЗ</div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Уроки</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 max-h-[520px] overflow-auto pr-1">
            {lessonThreads.map((t) => {
              const active = t.lesson.id === selectedLessonId;
              const pending = t.status === "PENDING" || t.status === "IN_REVIEW";
              return (
                <Link
                  key={t.lesson.id}
                  href={`/admin/homework?productId=${selectedProductId}&userId=${selectedUserId}&lessonId=${t.lesson.id}`}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-accent transition-colors ${active ? "bg-primary/10 border-primary/60 outline outline-2 outline-primary/50 outline-offset-2 shadow-[0_0_0_1px_rgba(108,60,245,0.35)]" : ""}`}
                >
                  <span className="truncate">{t.lesson.order ? `${t.lesson.order}. ` : ""}{t.lesson.title}</span>
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

        <div className="space-y-3">
          {selectedProduct && (
            <div className="flex items-center gap-2">
              {selectedProduct.type === "COURSE" ? (
                <BookOpen className="h-5 w-5 text-primary" />
              ) : (
                <GraduationCap className="h-5 w-5 text-purple-500" />
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
                {/* Answer preview */}
                {(() => {
                  const parsed = parseHomeworkContent(selectedSubmission.content);
                  if (!parsed.data) return null;
                  return parsed.type === "qa" ? (
                    <div className="space-y-2 bg-muted/50 rounded-lg p-3">
                      {parsed.data.map((qa, i) => (
                        <div key={i} className="space-y-0.5">
                          <div className="text-xs font-medium text-muted-foreground">{qa.question}</div>
                          <div className="text-sm whitespace-pre-wrap">{qa.answer || "—"}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm whitespace-pre-wrap bg-muted/50 rounded-lg p-3">{parsed.data}</div>
                  );
                })()}

                {selectedSubmission.fileUrl && (
                  <a href={selectedSubmission.fileUrl} target="_blank" rel="noopener noreferrer" className="block">
                    <img src={selectedSubmission.fileUrl} alt="Фото" className="max-h-64 rounded-lg border object-cover" />
                  </a>
                )}

                {/* Messages */}
                {selectedSubmission.messages.length > 0 ? (
                  <div className="space-y-2">
                    {selectedSubmission.messages.map((m) => (
                      <Card key={m.id} className="p-3">
                        <div className="text-xs text-muted-foreground mb-1">
                          {m.user.name ?? m.user.email} {m.user.role ? `(${m.user.role})` : ""}
                        </div>
                        <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Сообщений пока нет</div>
                )}

                <HomeworkActions submissionId={selectedSubmission.id} currentStatus={selectedSubmission.status} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
