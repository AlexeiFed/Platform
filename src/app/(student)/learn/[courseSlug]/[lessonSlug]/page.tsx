import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { tokens } from "@/lib/design-tokens";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FileText, Paperclip, ClipboardList } from "lucide-react";
import { PdfPages } from "@/components/shared/pdf-pages";
import { HomeworkForm } from "./homework-form";
import { HomeworkThread } from "./homework-thread";
import { enrollmentHasCriterion, loadEnrollmentForCriteriaByUserProduct } from "@/lib/enrollment-criteria";

type ContentBlock = {
  id: string;
  type: "text" | "video" | "image" | "pdf";
  content: string;
  /** Ширина блока (только для image): full = полная, half = ½, third = ⅓ */
  size?: "full" | "half" | "third";
  /** Для pdf: готовые страницы (URL картинок) */
  pages?: string[];
};

type Props = {
  params: Promise<{ courseSlug: string; lessonSlug: string }>;
  searchParams: Promise<{ event?: string }>;
};

export default async function LessonPage({ params, searchParams }: Props) {
  const { courseSlug, lessonSlug } = await params;
  const { event: eventQuery } = await searchParams;
  const session = await auth();
  if (!session) redirect("/login");

  const product = await prisma.product.findUnique({
    where: { slug: courseSlug },
    include: {
      lessons: {
        where: { published: true },
        orderBy: { order: "asc" },
        select: { id: true, slug: true, title: true, order: true },
      },
    },
  });

  if (!product) notFound();

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_productId: { userId: session.user.id, productId: product.id } },
  });

  if (!enrollment) redirect("/catalog");

  const crit = await loadEnrollmentForCriteriaByUserProduct(session.user.id, product.id);
  const canTasks = Boolean(crit && enrollmentHasCriterion(crit, "TASKS"));

  const lesson = await prisma.lesson.findUnique({
    where: { productId_slug: { productId: product.id, slug: lessonSlug } },
    include: {
      attachments: true,
      marathonEvents: {
        where: { published: true },
        select: {
          id: true,
          dayOffset: true,
          title: true,
        },
        orderBy: [{ dayOffset: "asc" }, { position: "asc" }],
      },
    },
  });

  if (!lesson || !lesson.published) notFound();

  if (product.type === "MARATHON" && eventQuery) {
    const scopedEvent = await prisma.marathonEvent.findFirst({
      where: {
        id: eventQuery,
        productId: product.id,
        published: true,
        lessonId: lesson.id,
      },
      select: { id: true },
    });
    if (!scopedEvent) {
      redirect(`/learn/${courseSlug}`);
    }
  }

  if (product.type === "MARATHON" && product.startDate && lesson.marathonEvents.length > 0) {
    const startDate = new Date(product.startDate);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const firstEventDate = new Date(startDate);
    firstEventDate.setHours(0, 0, 0, 0);
    firstEventDate.setDate(firstEventDate.getDate() + lesson.marathonEvents[0].dayOffset);

    if (startOfToday < firstEventDate) {
      redirect(`/learn/${courseSlug}`);
    }
  }

  const currentIndex = product.lessons.findIndex((l) => l.slug === lessonSlug);

  const existingSubmission = lesson.homeworkEnabled
    ? await prisma.homeworkSubmission.findFirst({
        where: { lessonId: lesson.id, userId: session.user.id },
        orderBy: { createdAt: "desc" },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            include: { user: { select: { name: true, email: true, role: true } } },
          },
        },
      })
    : null;

  const blocks = (lesson.blocks as ContentBlock[] | null) ?? [];
  const hasBlocks = blocks.length > 0;
  const hwQuestions = (lesson.homeworkQuestions as string[] | null) ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className={tokens.typography.h2}>{lesson.title}</h1>
        <p className="text-sm text-muted-foreground">
          Урок {currentIndex + 1} из {product.lessons.length}
        </p>
      </div>

      {/* === BLOCK-BASED CONTENT === */}
      {hasBlocks ? (
        // flex-wrap: half/third изображения встают в ряд на широких экранах (галерея)
        <div className="flex flex-wrap gap-4">
          {blocks.map((block) => {
            if (block.type === "video" && block.content) {
              return (
                <div key={block.id} className="w-full aspect-video rounded-xl overflow-hidden bg-black">
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
                <div key={block.id} className={`${sizeClass} rounded-xl overflow-hidden border bg-muted`}>
                  <img src={block.content} alt="" className="w-full h-auto" loading="lazy" />
                </div>
              );
            }
            if (block.type === "pdf" && block.content) {
              return (
                <div key={block.id} className="w-full">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FileText className="h-4 w-4" />
                        PDF
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {block.pages && block.pages.length > 0 ? (
                        <div className="space-y-3">
                          {block.pages.map((p, idx) => (
                            <div key={p} className="overflow-hidden rounded-lg border bg-background">
                              <img
                                src={p}
                                alt={`PDF page ${idx + 1}`}
                                className="block h-auto w-full"
                                loading="lazy"
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
                    <CardContent className="prose prose-neutral dark:prose-invert max-w-none p-6">
                      <div dangerouslySetInnerHTML={{ __html: block.content }} />
                    </CardContent>
                  </Card>
                </div>
              );
            }
            return null;
          })}
        </div>
      ) : (
        <>
          {/* Legacy rendering */}
          {lesson.videoUrl && (
            <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
              <video src={lesson.videoUrl} controls className="h-full w-full" controlsList="nodownload" />
            </div>
          )}
          {lesson.content && (
            <Card>
              <CardContent className="prose prose-neutral dark:prose-invert max-w-none p-6">
                <div dangerouslySetInnerHTML={{ __html: lesson.content }} />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Attachments (non-image, legacy) */}
      {lesson.attachments.filter((a) => a.type !== "image").length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Paperclip className="h-4 w-4" />
              Материалы
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {lesson.attachments
              .filter((a) => a.type !== "image")
              .map((att) => (
                <a
                  key={att.id}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent text-sm"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {att.name}
                </a>
              ))}
          </CardContent>
        </Card>
      )}

      <Separator />

      {lesson.homeworkEnabled && !canTasks ? (
        <Card>
          <CardContent className={`${tokens.typography.small} p-4 text-muted-foreground`}>
            Домашнее задание у урока есть, но в вашем тарифе нет доступа к заданиям.
          </CardContent>
        </Card>
      ) : null}

      {/* === HOMEWORK (conditional) === */}
      {lesson.homeworkEnabled && canTasks && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-orange-500" />
              Домашнее задание
            </CardTitle>
          </CardHeader>
          <CardContent>
            {existingSubmission ? (
              <HomeworkThread
                lessonId={lesson.id}
                questions={hwQuestions.length > 0 ? hwQuestions : undefined}
                submission={{
                  id: existingSubmission.id,
                  status: existingSubmission.status,
                  fileUrl: existingSubmission.fileUrl,
                  fileUrls: existingSubmission.fileUrls,
                  content: existingSubmission.content ?? null,
                  createdAt: existingSubmission.createdAt.toISOString(),
                  updatedAt: existingSubmission.updatedAt.toISOString(),
                  user: {
                    name: session.user.name ?? null,
                    email: session.user.email ?? "",
                    role: session.user.role,
                  },
                }}
                messages={existingSubmission.messages.map((m) => ({
                  id: m.id,
                  content: m.content,
                  createdAt: m.createdAt.toISOString(),
                  fileUrl: m.fileUrl,
                  fileUrls: m.fileUrls,
                  replyToId: m.replyToId,
                  user: { name: m.user.name, email: m.user.email, role: m.user.role },
                }))}
              />
            ) : (
              <HomeworkForm
                lessonId={lesson.id}
                questions={hwQuestions.length > 0 ? hwQuestions : undefined}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
