import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMarathonEventDate } from "@/lib/marathon-progress";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { tokens } from "@/lib/design-tokens";
import { ArrowLeft, CheckCircle2, Clock3, PlayCircle } from "lucide-react";
import { PdfPages } from "@/components/shared/pdf-pages";
import { MarathonEventCompletionToggle } from "./completion-toggle";
import { criterionForMarathonEventType } from "@/lib/product-criteria";
import { enrollmentHasCriterion, loadEnrollmentForCriteriaByUserProduct } from "@/lib/enrollment-criteria";

type ContentBlock = {
  id: string;
  type: "text" | "video" | "image" | "pdf";
  content: string;
  /** Ширина блока (только для image): full = полная, half = ½, third = ⅓ */
  size?: "full" | "half" | "third";
  pages?: string[];
};

type Props = {
  params: Promise<{ courseSlug: string; eventId: string }>;
};

export default async function MarathonEventPage({ params }: Props) {
  const { courseSlug, eventId } = await params;
  const session = await auth();
  if (!session) redirect("/login");

  const product = await prisma.product.findUnique({
    where: { slug: courseSlug },
    select: {
      id: true,
      slug: true,
      title: true,
      type: true,
      startDate: true,
    },
  });

  if (!product || product.type !== "MARATHON") notFound();

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      userId_productId: {
        userId: session.user.id,
        productId: product.id,
      },
    },
    select: {
      id: true,
      eventCompletions: {
        where: { eventId },
        select: { id: true },
      },
    },
  });

  if (!enrollment) redirect("/catalog");

  const event = await prisma.marathonEvent.findFirst({
    where: {
      id: eventId,
      productId: product.id,
      published: true,
    },
    include: {
      eventLessons: {
        orderBy: { position: "asc" },
        include: {
          lesson: {
            select: {
              id: true,
              slug: true,
              title: true,
              published: true,
              homeworkEnabled: true,
              unlockRule: true,
              submissions: {
                where: { userId: session.user.id },
                select: { status: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!event) notFound();

  const critRow = await loadEnrollmentForCriteriaByUserProduct(session.user.id, product.id);
  const requiredCrit = criterionForMarathonEventType(event.type);
  const lockedByTariff = Boolean(
    requiredCrit && critRow && !enrollmentHasCriterion(critRow, requiredCrit)
  );

  const eventDate = product.startDate ? getMarathonEventDate(product.startDate, event.dayOffset) : null;
  const accessible = event.dayOffset === 0 ? true : eventDate ? new Date() >= eventDate : true;

  if (!accessible) {
    redirect(`/learn/${courseSlug}`);
  }

  const completedFromMark = enrollment.eventCompletions.length > 0;
  const completedFromHomework = event.eventLessons.some((row) =>
    row.lesson.submissions.some((submission) => submission.status === "APPROVED")
  );
  const isCompleted = completedFromMark || completedFromHomework;
  const hasHomeworkLessons = event.eventLessons.some((row) => row.lesson.homeworkEnabled);
  const hasHomeworkApprovalGate = event.eventLessons.some(
    (row) => row.lesson.homeworkEnabled && row.lesson.unlockRule === "AFTER_HOMEWORK_APPROVAL"
  );
  const completionHint = hasHomeworkApprovalGate
    ? "Для уроков с домашкой событие закроется после принятия задания. Для остальных материалов можно использовать ручную отметку."
    : hasHomeworkLessons
      ? "В этом событии есть домашка, но продвижение не ждёт её проверки. После выполнения уроков нажмите «Отметить выполненным» вручную."
      : "После выполнения материалов нажмите «Отметить выполненным» вручную.";
  const blocks = (event.blocks as ContentBlock[] | null) ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="md:hidden">
        <Button variant="outline" size="sm" className="w-full justify-center" asChild>
          <Link href={`/learn/${courseSlug}`} aria-label="Назад к обзору марафона">
            <ArrowLeft className="mr-2 h-4 w-4" />
            К обзору
          </Link>
        </Button>
      </div>
      <div className="space-y-3">
        {/* Только статус выполнения — технические мета-поля скрыты от студента */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isCompleted ? "success" : "warning"}>
            {isCompleted ? "Выполнено" : "Не завершено"}
          </Badge>
        </div>

        <div>
          <h1 className={tokens.typography.h2}>{event.title}</h1>
          {event.description && (
            <p className={`${tokens.typography.body} mt-2`}>{event.description}</p>
          )}
        </div>
      </div>

      {lockedByTariff ? (
        <Card>
          <CardContent className={`space-y-4 ${tokens.spacing.card}`}>
            <p className={tokens.typography.body}>
              Этот тип события не входит в ваш тариф (например эфир или тренировка). Оформите апгрейд тарифа, чтобы
              открыть доступ.
            </p>
            <Button asChild variant="default">
              <Link href={`/learn/${courseSlug}/upgrade`}>Апгрейд тарифа</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            {isCompleted ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
            ) : (
              <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            )}
            <div>
              <div className="font-medium">
                {isCompleted ? "Событие отмечено как выполненное" : "Событие ещё не завершено"}
              </div>
              <div className="text-sm text-muted-foreground">
                {completionHint}
              </div>
            </div>
          </div>
          <MarathonEventCompletionToggle eventId={event.id} completed={completedFromMark} />
        </CardContent>
      </Card>

      {event.eventLessons.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Материалы события</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {event.eventLessons.map((row) => (
              <div key={row.id} className="space-y-3 rounded-lg border p-4">
                <div>
                  <div className="font-medium">{row.lesson.title}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {row.lesson.homeworkEnabled
                      ? "У этого материала есть домашнее задание."
                      : "Обычный материал без домашнего задания."}
                  </div>
                </div>
                <Button asChild>
                  <Link href={`/learn/${courseSlug}/${row.lesson.slug}?event=${event.id}`}>
                    <PlayCircle className="h-4 w-4 mr-1" />
                    Открыть материал
                  </Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : blocks.length > 0 ? (
        // Нет урока, но есть контентные блоки — показываем
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Контент события</CardTitle>
          </CardHeader>
          {/* flex-wrap: half/third изображения встают в ряд на широких экранах */}
          <CardContent className="flex flex-wrap gap-4">
            {blocks.map((block) => {
              if (block.type === "video" && block.content) {
                return (
                  <div key={block.id} className="w-full aspect-video overflow-hidden rounded-xl bg-black">
                    <video src={block.content} controls className="h-full w-full" controlsList="nodownload" />
                  </div>
                );
              }

              if (block.type === "image" && block.content) {
                const imgSize = block.size ?? "full";
                const sizeClass =
                  imgSize === "half" ? "w-full md:w-[calc(50%-8px)]" :
                  imgSize === "third" ? "w-full md:w-[calc(33.333%-11px)]" :
                  "w-full";
                return (
                  <div key={block.id} className={`${sizeClass} overflow-hidden rounded-xl border bg-muted`}>
                    <Image
                      src={block.content}
                      alt="Изображение блока события"
                      width={1600}
                      height={900}
                      className="h-auto w-full"
                      loading="lazy"
                      unoptimized
                    />
                  </div>
                );
              }

              if (block.type === "pdf" && block.content) {
                return (
                  <div key={block.id} className="w-full">
                    <Card>
                      <CardContent className="space-y-3">
                        {block.pages && block.pages.length > 0 ? (
                          <div className="space-y-3">
                            {block.pages.map((p, idx) => (
                              <div key={p} className="overflow-hidden rounded-lg border bg-background">
                                <Image
                                  src={p}
                                  alt={`Страница PDF ${idx + 1}`}
                                  width={1600}
                                  height={2200}
                                  className="block h-auto w-full"
                                  loading={idx < 2 ? "eager" : "lazy"}
                                  fetchPriority={idx === 0 ? "high" : "auto"}
                                  unoptimized
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <PdfPages url={block.content} />
                        )}
                      </CardContent>
                    </Card>
                  </div>
                );
              }

              if (block.type === "text" && block.content) {
                return (
                  <div key={block.id} className="w-full">
                    <Card>
                      <CardContent className="prose prose-neutral max-w-none p-6 dark:prose-invert">
                        <div dangerouslySetInnerHTML={{ __html: block.content }} />
                      </CardContent>
                    </Card>
                  </div>
                );
              }

              return null;
            })}
          </CardContent>
        </Card>
      ) : null /* Нет ни урока, ни блоков — карточку не показываем */}
        </>
      )}
    </div>
  );
}
