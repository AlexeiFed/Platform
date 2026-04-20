// Страница обзора курса/марафона для студента.
// Содержит hero-блок с прогрессом, сетку статистики (для марафона),
// карточку «Продолжить с того же места» и грид уроков (для курсов).
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateMarathonProgress, getMarathonEventDate } from "@/lib/marathon-progress";
import { redirect, notFound } from "next/navigation";
import { tokens } from "@/lib/design-tokens";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LessonCard, type LessonCardStatus } from "@/components/shared/lesson-card";
import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ClipboardList,
  PlayCircle,
  Sparkles,
  Target,
} from "lucide-react";

type Props = {
  params: Promise<{ courseSlug: string }>;
};

// Круговая диаграмма прогресса на чистом SVG — без внешних зависимостей.
function ProgressRing({ value, size = 72 }: { value: number; size?: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  const offset = c * (1 - pct);
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          className="stroke-muted"
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="stroke-primary transition-[stroke-dashoffset] duration-700"
          fill="none"
        />
      </svg>
      <span className="absolute text-sm font-semibold tabular-nums">
        {Math.round(pct * 100)}%
      </span>
    </div>
  );
}

// Плашка статистики: иконка + метка + значение + подпись.
function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums text-foreground">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

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
              submissions: {
                where: { userId: session.user.id },
                select: { status: true },
                take: 1,
              },
            },
          },
          completions: {
            where: { enrollment: { userId: session.user.id } },
            select: { id: true },
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
      tariff: { select: { sortOrder: true, name: true } },
      procedures: {
        include: { procedureType: { select: { id: true, title: true } } },
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
      sortOrder: { gt: enrollment.tariff.sortOrder },
    },
  });

  const marathonProgress =
    product.type === "MARATHON"
      ? calculateMarathonProgress({
          events: product.marathonEvents,
          procedures: enrollment.procedures,
        })
      : null;

  const progressValue =
    product.type === "MARATHON"
      ? marathonProgress?.value ?? enrollment.progress
      : enrollment.progress;

  const isCourse = product.type === "COURSE";
  const typeLabel = isCourse ? "Курс" : "Марафон";

  // Следующий урок/событие для CTA «Продолжить».
  const nextLesson = isCourse
    ? product.lessons.find(
        (l) => !l.submissions.some((s) => s.status === "APPROVED")
      )
    : null;

  const now = new Date();
  const nextEvent =
    !isCourse && product.startDate
      ? product.marathonEvents.find((e) => {
          const date = getMarathonEventDate(product.startDate!, e.dayOffset);
          const done =
            e.completions.length > 0 ||
            (e.lesson?.submissions.some((s) => s.status === "APPROVED") ?? false);
          return !done && date <= now;
        }) ??
        product.marathonEvents.find((e) => {
          const date = getMarathonEventDate(product.startDate!, e.dayOffset);
          return date > now;
        })
      : null;

  const completedLessons = isCourse
    ? product.lessons.filter((l) =>
        l.submissions.some((s) => s.status === "APPROVED")
      ).length
    : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 via-primary/5 to-background shadow-sm">
        <div className="relative z-10 flex flex-col gap-6 p-6 sm:p-8 md:flex-row md:items-center">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={isCourse ? "default" : "secondary"}
                className="uppercase tracking-wide"
              >
                {typeLabel}
              </Badge>
              {enrollment.tariff.name && (
                <Badge variant="outline" className="border-primary/30 text-primary">
                  Тариф: {enrollment.tariff.name}
                </Badge>
              )}
            </div>
            <h1 className={`${tokens.typography.h1} text-balance`}>{product.title}</h1>
            {product.description && (
              <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground sm:text-base">
                {product.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {(nextLesson || nextEvent) && (
                <Button asChild size="lg" className="gap-2">
                  <Link
                    href={
                      nextLesson
                        ? `/learn/${courseSlug}/${nextLesson.slug}`
                        : `/learn/${courseSlug}/event/${nextEvent!.id}`
                    }
                  >
                    <PlayCircle className="h-4 w-4" />
                    {progressValue > 0 ? "Продолжить обучение" : "Начать"}
                  </Link>
                </Button>
              )}
              {higherTariffs > 0 && (
                <Button asChild variant="outline" size="lg" className="gap-2">
                  <Link href={`/learn/${courseSlug}/upgrade`}>
                    <Sparkles className="h-4 w-4" />
                    Апгрейд тарифа
                  </Link>
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-xl border bg-background/60 p-4 backdrop-blur-sm md:w-auto">
            <ProgressRing value={progressValue} />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Ваш прогресс
              </div>
              <div className="mt-0.5 text-sm font-medium text-foreground">
                {isCourse
                  ? `${completedLessons} из ${product.lessons.length} уроков`
                  : marathonProgress
                  ? `${marathonProgress.completedEvents + marathonProgress.completedProcedures} из ${
                      marathonProgress.totalEvents + marathonProgress.totalProcedures
                    } задач`
                  : ""}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS (только для марафона) */}
      {!isCourse && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={Calendar}
            label="Старт"
            value={
              product.startDate
                ? new Intl.DateTimeFormat("ru-RU").format(product.startDate)
                : "—"
            }
            hint={product.durationDays ? `${product.durationDays} дн.` : "без ограничений"}
          />
          <StatTile
            icon={Target}
            label="События"
            value={
              marathonProgress
                ? `${marathonProgress.completedEvents}/${marathonProgress.totalEvents}`
                : `${product.marathonEvents.length}`
            }
            hint="выполнено"
          />
          <StatTile
            icon={ClipboardList}
            label="Процедуры"
            value={
              marathonProgress
                ? `${marathonProgress.completedProcedures}/${marathonProgress.totalProcedures}`
                : `${enrollment.procedures.length}`
            }
            hint="выполнено"
          />
          <StatTile
            icon={CheckCircle2}
            label="Прогресс"
            value={`${Math.round(progressValue * 100)}%`}
          />
        </section>
      )}

      {/* CONTINUE */}
      {(nextLesson || nextEvent) && (
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Продолжить с того же места
          </h2>
          <Link
            href={
              nextLesson
                ? `/learn/${courseSlug}/${nextLesson.slug}`
                : `/learn/${courseSlug}/event/${nextEvent!.id}`
            }
            className={`group flex items-center gap-4 rounded-xl border bg-card p-4 ${tokens.animation.fast} hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md`}
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PlayCircle className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                {nextLesson ? "Следующий урок" : `Событие · ${nextEvent!.type}`}
              </div>
              <div className="truncate text-[15px] font-semibold text-foreground">
                {nextLesson ? nextLesson.title : nextEvent!.title}
              </div>
              {nextEvent && product.startDate && (
                <div className="text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat("ru-RU", {
                    day: "numeric",
                    month: "long",
                  }).format(getMarathonEventDate(product.startDate, nextEvent.dayOffset))}
                </div>
              )}
            </div>
            <ArrowUpRight
              className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </section>
      )}

      {/* LESSONS GRID (только для курсов) */}
      {isCourse && product.lessons.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Программа курса
            </h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {completedLessons} / {product.lessons.length}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {product.lessons.map((lesson, idx) => {
              const sub = lesson.submissions[0];
              let status: LessonCardStatus = "available";
              let meta = "Открыть урок";
              if (sub?.status === "APPROVED") {
                status = "completed";
                meta = "Зачёт получен";
              } else if (sub?.status === "IN_REVIEW" || sub?.status === "PENDING") {
                status = "review";
                meta = "На проверке у куратора";
              } else if (sub?.status === "REJECTED") {
                status = "in_progress";
                meta = "Нужна доработка";
              }

              return (
                <LessonCard
                  key={lesson.id}
                  href={`/learn/${courseSlug}/${lesson.slug}`}
                  eyebrow={`День ${idx + 1}`}
                  kind="Урок"
                  title={lesson.title}
                  status={status}
                  meta={meta}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* MARATHON HINT */}
      {!isCourse && (
        <p className={`${tokens.typography.small} rounded-lg border border-dashed bg-muted/30 p-3`}>
          Уроки, процедуры и календарь событий — в левом меню под названием марафона.
        </p>
      )}
    </div>
  );
}
