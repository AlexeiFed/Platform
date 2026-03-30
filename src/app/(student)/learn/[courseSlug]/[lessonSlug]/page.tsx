import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { tokens } from "@/lib/design-tokens";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, ChevronRight, FileText, Paperclip, ClipboardList } from "lucide-react";
import { HomeworkForm } from "./homework-form";

type ContentBlock = {
  id: string;
  type: "text" | "video" | "image";
  content: string;
};

type Props = {
  params: Promise<{ courseSlug: string; lessonSlug: string }>;
};

export default async function LessonPage({ params }: Props) {
  const { courseSlug, lessonSlug } = await params;
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

  const lesson = await prisma.lesson.findUnique({
    where: { productId_slug: { productId: product.id, slug: lessonSlug } },
    include: { attachments: true },
  });

  if (!lesson || !lesson.published) notFound();

  const currentIndex = product.lessons.findIndex((l) => l.slug === lessonSlug);
  const prevLesson = currentIndex > 0 ? product.lessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < product.lessons.length - 1 ? product.lessons[currentIndex + 1] : null;

  const existingSubmission = lesson.homeworkEnabled
    ? await prisma.homeworkSubmission.findFirst({
        where: { lessonId: lesson.id, userId: session.user.id },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const blocks = (lesson.blocks as ContentBlock[] | null) ?? [];
  const hasBlocks = blocks.length > 0;
  const hwQuestions = (lesson.homeworkQuestions as string[] | null) ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/learn/${courseSlug}`} className="hover:text-foreground">
          {product.title}
        </Link>
        <span>/</span>
        <span className="text-foreground">{lesson.title}</span>
      </div>

      <div>
        <h1 className={tokens.typography.h2}>{lesson.title}</h1>
        <p className="text-sm text-muted-foreground">
          Урок {currentIndex + 1} из {product.lessons.length}
        </p>
      </div>

      {/* === BLOCK-BASED CONTENT === */}
      {hasBlocks ? (
        <div className="space-y-6">
          {blocks.map((block) => {
            if (block.type === "video" && block.content) {
              return (
                <div key={block.id} className="aspect-video w-full rounded-xl overflow-hidden bg-black">
                  <video src={block.content} controls className="h-full w-full" controlsList="nodownload" />
                </div>
              );
            }
            if (block.type === "image" && block.content) {
              return (
                <div key={block.id} className="rounded-xl overflow-hidden border bg-muted">
                  <img src={block.content} alt="" className="w-full h-auto" loading="lazy" />
                </div>
              );
            }
            if (block.type === "text" && block.content) {
              return (
                <Card key={block.id}>
                  <CardContent className="prose prose-neutral dark:prose-invert max-w-none p-6">
                    <div dangerouslySetInnerHTML={{ __html: block.content }} />
                  </CardContent>
                </Card>
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

      {/* === HOMEWORK (conditional) === */}
      {lesson.homeworkEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-orange-500" />
              Домашнее задание
            </CardTitle>
          </CardHeader>
          <CardContent>
            {existingSubmission ? (
              <div className="space-y-3">
                <Badge
                  variant={
                    existingSubmission.status === "APPROVED"
                      ? "success"
                      : existingSubmission.status === "REJECTED"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {existingSubmission.status === "PENDING" && "На проверке"}
                  {existingSubmission.status === "IN_REVIEW" && "Проверяется"}
                  {existingSubmission.status === "APPROVED" && "Принято"}
                  {existingSubmission.status === "REJECTED" && "Доработать"}
                </Badge>
              </div>
            ) : (
              <HomeworkForm
                lessonId={lesson.id}
                questions={hwQuestions.length > 0 ? hwQuestions : undefined}
              />
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        {prevLesson ? (
          <Button variant="outline" asChild>
            <Link href={`/learn/${courseSlug}/${prevLesson.slug}`}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              {prevLesson.title}
            </Link>
          </Button>
        ) : <div />}
        {nextLesson && (
          <Button asChild>
            <Link href={`/learn/${courseSlug}/${nextLesson.slug}`}>
              {nextLesson.title}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
