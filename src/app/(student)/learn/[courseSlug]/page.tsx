import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { tokens } from "@/lib/design-tokens";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Lock, PlayCircle } from "lucide-react";

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
          <span className="font-medium">{Math.round(enrollment.progress * 100)}%</span>
        </div>
        <Progress value={enrollment.progress * 100} />
      </div>

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
    </div>
  );
}
