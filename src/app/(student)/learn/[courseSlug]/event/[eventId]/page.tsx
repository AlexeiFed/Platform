import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMarathonEventDate } from "@/lib/marathon-progress";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { tokens } from "@/lib/design-tokens";
import { CalendarDays, CheckCircle2, Clock3, PlayCircle } from "lucide-react";
import { MarathonEventCompletionToggle } from "./completion-toggle";

type ContentBlock = {
  id: string;
  type: "text" | "video" | "image";
  content: string;
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
      lesson: {
        select: {
          id: true,
          slug: true,
          title: true,
          published: true,
          homeworkEnabled: true,
          submissions: {
            where: { userId: session.user.id },
            select: { status: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!event) notFound();

  const eventDate = product.startDate ? getMarathonEventDate(product.startDate, event.dayOffset) : null;
  const accessible = eventDate ? new Date() >= eventDate : true;

  if (!accessible) {
    redirect(`/learn/${courseSlug}`);
  }

  const completedFromMark = enrollment.eventCompletions.length > 0;
  const completedFromHomework = event.lesson?.submissions.some((submission) => submission.status === "APPROVED") ?? false;
  const isCompleted = completedFromMark || completedFromHomework;
  const blocks = (event.blocks as ContentBlock[] | null) ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Событие марафона</Badge>
          <Badge variant="outline">{event.type}</Badge>
          <Badge variant="outline">{event.track}</Badge>
          {event.weekNumber && <Badge variant="outline">Неделя {event.weekNumber}</Badge>}
          {eventDate && (
            <Badge variant="outline">
              <CalendarDays className="h-3.5 w-3.5 mr-1" />
              {new Intl.DateTimeFormat("ru-RU").format(eventDate)}
            </Badge>
          )}
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
                Для материалов без домашки используй ручную отметку. Для материалов с домашкой событие закроется после принятия задания.
              </div>
            </div>
          </div>
          <MarathonEventCompletionToggle eventId={event.id} completed={completedFromMark} />
        </CardContent>
      </Card>

      {event.lesson?.published ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Материал события</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border p-4">
              <div className="font-medium">{event.lesson.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {event.lesson.homeworkEnabled
                  ? "У этого материала есть домашнее задание."
                  : "Обычный материал без домашнего задания."}
              </div>
            </div>
            <Button asChild>
              <Link href={`/learn/${courseSlug}/${event.lesson.slug}`}>
                <PlayCircle className="h-4 w-4 mr-1" />
                Открыть материал
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Контент события</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {blocks.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Для этого события пока не прикреплён отдельный урок или контентный блок.
              </div>
            ) : (
              blocks.map((block) => {
                if (block.type === "video" && block.content) {
                  return (
                    <div key={block.id} className="aspect-video w-full overflow-hidden rounded-xl bg-black">
                      <video src={block.content} controls className="h-full w-full" controlsList="nodownload" />
                    </div>
                  );
                }

                if (block.type === "image" && block.content) {
                  return (
                    <div key={block.id} className="overflow-hidden rounded-xl border bg-muted">
                      <img src={block.content} alt="" className="h-auto w-full" loading="lazy" />
                    </div>
                  );
                }

                if (block.type === "text" && block.content) {
                  return (
                    <Card key={block.id}>
                      <CardContent className="prose prose-neutral max-w-none p-6 dark:prose-invert">
                        <div dangerouslySetInnerHTML={{ __html: block.content }} />
                      </CardContent>
                    </Card>
                  );
                }

                return null;
              })
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
