import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateMarathonProgress } from "@/lib/marathon-progress";
import { redirect, notFound } from "next/navigation";
import { tokens } from "@/lib/design-tokens";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

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
            },
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
      tariff: { select: { price: true } },
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

  const higherTariffs = await prisma.productTariff.count({
    where: {
      productId: product.id,
      published: true,
      deletedAt: null,
      price: { gt: enrollment.tariff.price },
    },
  });

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

      {higherTariffs > 0 ? (
        <Card>
          <CardContent className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${tokens.spacing.card}`}>
            <p className={`${tokens.typography.small} text-muted-foreground`}>
              Доступен апгрейд тарифа — откройте больше возможностей.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/learn/${courseSlug}/upgrade`}>Апгрейд тарифа</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

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

          <p className={tokens.typography.small}>
            Уроки, процедуры и календарь событий — в левом меню под названием марафона.
          </p>
        </>
      ) : (
        <p className={tokens.typography.small}>
          Список уроков — в левом меню под названием курса. Заблокированные дни отмечены замочком.
        </p>
      )}
    </div>
  );
}
