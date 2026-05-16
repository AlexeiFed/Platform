import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { tokens } from "@/lib/design-tokens";
import { formatDate } from "@/lib/utils";
import {
  enrollmentHasCriterion,
  loadEnrollmentForCriteriaByUserProduct,
} from "@/lib/enrollment-criteria";
import { HomeworkForm } from "../[lessonSlug]/homework-form";
import { StudentLiveHomeworkThread } from "./student-live-homework-thread";

export const dynamic = "force-dynamic";

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

type Props = {
  params: Promise<{ courseSlug: string }>;
  searchParams: Promise<{ lessonId?: string }>;
};

export default async function StudentHomeworkPage({ params, searchParams }: Props) {
  const { courseSlug } = await params;
  const { lessonId: lessonIdParam } = await searchParams;
  const session = await auth();
  if (!session) redirect("/login");

  const product = await prisma.product.findFirst({
    where: { slug: courseSlug, deletedAt: null },
    select: { id: true, title: true, type: true, slug: true },
  });
  if (!product) notFound();

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_productId: { userId: session.user.id, productId: product.id } },
  });
  if (!enrollment) redirect("/catalog");

  const crit = await loadEnrollmentForCriteriaByUserProduct(session.user.id, product.id);
  const canTasks = Boolean(crit && enrollmentHasCriterion(crit, "TASKS"));

  if (!canTasks) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="md:hidden">
          <Button variant="outline" size="sm" className="w-full justify-center" asChild>
            <Link href={`/learn/${courseSlug}`} aria-label="Назад к обзору курса">
              <ArrowLeft className="mr-2 h-4 w-4" />
              К обзору
            </Link>
          </Button>
        </div>
        <h1 className={tokens.typography.h2}>Домашние задания</h1>
        <Card>
          <CardContent className={`${tokens.typography.small} p-6 text-muted-foreground`}>
            В вашем тарифе нет доступа к заданиям.
          </CardContent>
        </Card>
      </div>
    );
  }

  const allForStudent = await prisma.homeworkSubmission.findMany({
    where: { lesson: { productId: product.id }, userId: session.user.id },
    include: {
      lesson: { select: { id: true, title: true, order: true } },
      _count: { select: { messages: true } },
    },
    orderBy: [{ lesson: { order: "asc" } }, { updatedAt: "desc" }],
    take: 300,
  });

  const latestByLesson = new Map<string, (typeof allForStudent)[number]>();
  for (const s of allForStudent) {
    if (!latestByLesson.has(s.lesson.id)) latestByLesson.set(s.lesson.id, s);
  }
  const lessonThreads = [...latestByLesson.values()].sort(
    (a, b) => (a.lesson.order ?? 0) - (b.lesson.order ?? 0)
  );

  const validLessonIds = new Set(lessonThreads.map((t) => t.lesson.id));
  const selectedLessonId =
    lessonIdParam && validLessonIds.has(lessonIdParam)
      ? lessonIdParam
      : (lessonThreads[0]?.lesson.id ?? null);

  const selectedSubmission =
    selectedLessonId
      ? await prisma.homeworkSubmission.findFirst({
          where: {
            userId: session.user.id,
            lessonId: selectedLessonId,
            lesson: { productId: product.id },
          },
          include: {
            user: { select: { name: true, email: true } },
            lesson: {
              select: {
                id: true,
                title: true,
                order: true,
                slug: true,
                homeworkQuestions: true,
              },
            },
            messages: {
              orderBy: { createdAt: "asc" },
              include: { user: { select: { name: true, email: true, role: true } } },
            },
          },
          orderBy: { updatedAt: "desc" },
        })
      : null;

  const hwQuestions =
    (selectedSubmission?.lesson.homeworkQuestions as string[] | null) ?? [];
  const viewerUser = {
    name: session.user.name ?? null,
    email: session.user.email ?? "",
    role: session.user.role,
  };

  return (
    <div className="space-y-6">
      <div className="md:hidden">
        <Button variant="outline" size="sm" className="w-full justify-center" asChild>
          <Link href={`/learn/${courseSlug}`} aria-label="Назад к обзору курса">
            <ArrowLeft className="mr-2 h-4 w-4" />
            К обзору
          </Link>
        </Button>
      </div>

      <h1 className={tokens.typography.h2}>Домашние задания</h1>

      <div className="grid min-w-0 w-full gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit min-w-0 w-full">
          <CardHeader>
            <CardTitle className="text-base">Уроки</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 max-h-[min(45vh,520px)] overflow-auto pr-1 lg:max-h-[520px]">
            {lessonThreads.map((t) => {
              const active = t.lesson.id === selectedLessonId;
              const pending = t.status === "PENDING" || t.status === "IN_REVIEW";
              return (
                <Link
                  key={t.lesson.id}
                  href={`/learn/${courseSlug}/homework?lessonId=${t.lesson.id}`}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-accent transition-colors ${active ? "bg-primary/10 border-primary/60 ring-2 ring-primary/40" : ""}`}
                >
                  <span className="truncate">
                    {t.lesson.order ? `${t.lesson.order}. ` : ""}
                    {t.lesson.title}
                  </span>
                  <span className="flex items-center gap-2">
                    {pending && <Badge variant="destructive" className="text-xs">!</Badge>}
                    <Badge variant={statusVariants[t.status]} className="text-[10px]">
                      {statusLabels[t.status]}
                    </Badge>
                    {t._count.messages > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {t._count.messages}
                      </Badge>
                    )}
                  </span>
                </Link>
              );
            })}
            {lessonThreads.length === 0 && (
              <div className="text-sm text-muted-foreground">
                Пока нет отправленных работ по этому курсу. Сдайте ДЗ со страницы урока.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-3">
          <div className="flex items-center gap-2">
            {product.type === "COURSE" ? (
              <BookOpen className="h-5 w-5 text-primary" />
            ) : (
              <GraduationCap className="h-5 w-5 text-primary" />
            )}
            <h2 className={tokens.typography.h4}>{product.title}</h2>
          </div>

          {!selectedSubmission ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                {lessonThreads.length === 0
                  ? "Выберите урок в расписании и отправьте домашнее задание."
                  : "Выберите урок слева."}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">
                      {selectedSubmission.lesson.title}
                    </CardTitle>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {selectedSubmission.user.name ?? selectedSubmission.user.email} •{" "}
                      {formatDate(selectedSubmission.updatedAt)}
                    </div>
                  </div>
                  <Badge variant={statusVariants[selectedSubmission.status]}>
                    {statusLabels[selectedSubmission.status]}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <StudentLiveHomeworkThread
                  lessonId={selectedSubmission.lesson.id}
                  userId={session.user.id}
                  viewerUser={viewerUser}
                  initialSubmission={{
                    id: selectedSubmission.id,
                    status: selectedSubmission.status,
                    content: selectedSubmission.content,
                    fileUrl: selectedSubmission.fileUrl,
                    fileUrls: selectedSubmission.fileUrls,
                    createdAt: selectedSubmission.createdAt.toISOString(),
                    updatedAt: selectedSubmission.updatedAt.toISOString(),
                    user: viewerUser,
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
                {selectedSubmission.status === "REJECTED" && (
                  <div className="space-y-2 border-t pt-4">
                    <p className={tokens.typography.small}>
                      Куратор попросил доработку. Отправь исправленную работу здесь же — статус снова
                      станет «На проверке».
                    </p>
                    <HomeworkForm
                      lessonId={selectedSubmission.lesson.id}
                      questions={hwQuestions.length > 0 ? hwQuestions : undefined}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
