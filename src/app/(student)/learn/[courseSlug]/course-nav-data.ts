import { prisma } from "@/lib/prisma";
import { isMarathonEventAccessible } from "@/lib/marathon-progress";
import type { ProductCriterion } from "@prisma/client";
import { criterionForMarathonEventType } from "@/lib/product-criteria";
import { effectiveCriteriaSet, enrollmentHasCriterion } from "@/lib/enrollment-criteria";
import {
  buildMarathonScheduleNavSections,
  marathonWeekCountFromDuration,
  parseMarathonScheduleSections,
} from "@/lib/marathon-schedule-sections";
import type {
  CourseNavLesson,
  CourseNavMarathonDay,
  CourseNavMarathonWeek,
  CourseNavPayload,
  CourseNavProcedure,
} from "@/lib/course-nav-types";
import type { MarathonScheduleSections } from "@/types/marathon-schedule";
import type { Lesson, MarathonEvent, Product } from "@prisma/client";

type LessonWithSubs = Lesson & {
  submissions: Array<{ status: string }>;
};

function isLessonAccessible(
  product: Pick<Product, "type" | "startDate">,
  lessons: LessonWithSubs[],
  lesson: LessonWithSubs,
  index: number
): boolean {
  if (lesson.unlockRule === "IMMEDIATELY") return true;

  if (lesson.unlockRule === "SPECIFIC_DATE") {
    if (product.type === "MARATHON" && product.startDate && lesson.unlockDay) {
      const unlockDate = new Date(product.startDate);
      unlockDate.setDate(unlockDate.getDate() + lesson.unlockDay - 1);
      return new Date() >= unlockDate;
    }
    return lesson.unlockDate ? new Date() >= new Date(lesson.unlockDate) : true;
  }

  if (lesson.unlockRule === "AFTER_HOMEWORK_APPROVAL" && index > 0) {
    const prevLesson = lessons[index - 1];
    return prevLesson.submissions.some((s) => s.status === "APPROVED");
  }

  return true;
}

type MarathonEventLoaded = MarathonEvent & {
  eventLessons: Array<{
    lesson: {
      id: string;
      slug: string;
      title: string;
      published: boolean;
      submissions: Array<{ status: string }>;
    };
  }>;
  completions: Array<{ id: string }>;
};

function buildMarathonWeeks(
  product: Pick<Product, "startDate">,
  events: MarathonEventLoaded[],
  criteria: Set<ProductCriterion>
): CourseNavMarathonWeek[] {
  const weekMap = new Map<number, MarathonEventLoaded[]>();

  for (const event of events) {
    const weekNumber =
      event.dayOffset <= 0 ? 0 : (event.weekNumber ?? Math.ceil(event.dayOffset / 7));
    const bucket = weekMap.get(weekNumber) ?? [];
    bucket.push(event);
    weekMap.set(weekNumber, bucket);
  }

  const sortedWeeks = [...weekMap.entries()].sort((a, b) => a[0] - b[0]);

  return sortedWeeks.map(([weekNumber, weekEvents]) => {
    const dayMap = new Map<number, MarathonEventLoaded[]>();
    for (const event of weekEvents) {
      const bucket = dayMap.get(event.dayOffset) ?? [];
      bucket.push(event);
      dayMap.set(event.dayOffset, bucket);
    }
    const sortedDays = [...dayMap.entries()].sort((a, b) => a[0] - b[0]);

    const days: CourseNavMarathonDay[] = sortedDays.map(([dayOffset, dayEvents]) => ({
      dayOffset,
      dayLabel: dayOffset === 0 ? "День 0" : `День ${dayOffset}`,
      events: dayEvents
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((event) => {
          const accessible = product.startDate
            ? isMarathonEventAccessible({ startDate: product.startDate, dayOffset: event.dayOffset })
            : true;
          const lessonCompleted = event.eventLessons.some((el) =>
            el.lesson.submissions.some((s) => s.status === "APPROVED")
          );
          const manuallyCompleted = event.completions.length > 0;
          const required = criterionForMarathonEventType(event.type);
          const lockedByTariff = required != null && !criteria.has(required);
          return {
            id: event.id,
            title: event.title,
            accessible,
            lockedByTariff,
            completed: manuallyCompleted || lessonCompleted,
            type: event.type,
          };
        }),
    }));

    return {
      weekNumber,
      weekLabel: weekNumber === 0 ? "Подготовка" : `Неделя ${weekNumber}`,
      days,
    };
  });
}

export async function getCourseNavPayload(
  courseSlug: string,
  userId: string
): Promise<CourseNavPayload | null> {
  const product = await prisma.product.findUnique({
    where: { slug: courseSlug },
    include: {
      marathonEvents: {
        where: { published: true },
        orderBy: [{ dayOffset: "asc" }, { position: "asc" }],
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
                  submissions: {
                    where: { userId },
                    select: { status: true },
                    take: 1,
                  },
                },
              },
            },
          },
          completions: {
            where: {
              enrollment: { userId },
            },
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
            where: { userId },
            select: { status: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!product) return null;

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_productId: { userId, productId: product.id } },
    include: {
      procedures: {
        include: {
          procedureType: { select: { id: true, title: true } },
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
      tariff: { select: { criteria: true } },
      product: { select: { enabledCriteria: true } },
    },
  });

  if (!enrollment) return null;

  const criteriaSet = effectiveCriteriaSet(enrollment);

  // Марафон: 30 дней после окончания — доступ истекает
  const accessExpired =
    product.type === "MARATHON" &&
    !!product.startDate &&
    !!product.durationDays &&
    (() => {
      const expiry = new Date(product.startDate!);
      expiry.setDate(expiry.getDate() + product.durationDays! + 30);
      return new Date() > expiry;
    })();

  const base: CourseNavPayload = {
    courseSlug: product.slug,
    title: product.title,
    productType: product.type,
    curatorFeedback: enrollmentHasCriterion(enrollment, "CURATOR_FEEDBACK"),
    rules: product.rules ?? null,
    accessExpired,
  };

  if (product.type === "COURSE") {
    const lessons: CourseNavLesson[] = product.lessons.map((lesson, idx) => ({
      slug: lesson.slug,
      title: lesson.title,
      index: idx,
      accessible: isLessonAccessible(product, product.lessons, lesson, idx),
      completed: lesson.submissions.some((s) => s.status === "APPROVED"),
    }));
    return { ...base, lessons };
  }

  const procedures: CourseNavProcedure[] = enrollment.procedures.map((p) => ({
    id: p.id,
    title: p.procedureType.title,
    completed: Boolean(p.completedAt),
    scheduledAt: p.scheduledAt?.toISOString() ?? null,
    notes: p.notes,
  }));

  const marathonWeeks = buildMarathonWeeks(product, product.marathonEvents, criteriaSet);

  const weekCount = marathonWeekCountFromDuration(product.durationDays);
  const scheduleSections = parseMarathonScheduleSections(
    product.marathonScheduleSections as MarathonScheduleSections | null,
    weekCount
  );
  const marathonScheduleNav = buildMarathonScheduleNavSections(scheduleSections, weekCount).map((s) => ({
    id: s.id,
    label: s.label,
    hasContent: s.blocks.length > 0,
  }));

  return { ...base, procedures, marathonWeeks, marathonScheduleNav };
}
