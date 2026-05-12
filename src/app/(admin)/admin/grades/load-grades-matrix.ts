import { prisma } from "@/lib/prisma";

export type RatingRef = { lessonId: string; blockId: string };

export type GradeColumn =
  | {
      kind: "marathon_training";
      eventId: string;
      dayOffset: number;
      title: string;
      refs: RatingRef[];
    }
  | {
      kind: "course_lesson";
      lessonId: string;
      lessonTitle: string;
      refs: RatingRef[];
    };

export type GradeRow = {
  enrollmentId: string;
  userId: string;
  surname: string;
  fullName: string;
};

const EXCLUDED_STUDENT_EMAILS = ["23alex08@gmail.com"];

function ratingRefsFromBlocks(lessonId: string, blocks: unknown): RatingRef[] {
  const arr = blocks as { id: string; type: string }[] | null;
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((b) => b.type === "rating" && typeof b.id === "string" && b.id.length > 0)
    .map((b) => ({ lessonId, blockId: b.id }));
}

export function surnameFromUser(name: string | null, email: string): string {
  const n = name?.trim();
  if (!n) return email.split("@")[0] ?? email;
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1] ?? n;
  return n;
}

export function ratingKey(enrollmentId: string, lessonId: string, blockId: string) {
  return `${enrollmentId}:${lessonId}:${blockId}`;
}

export function formatRatingsForRefs(
  refs: RatingRef[],
  enrollmentId: string,
  ratingMap: Map<string, number>,
): string {
  if (refs.length === 0) return "—";
  const values: number[] = [];
  for (const ref of refs) {
    const v = ratingMap.get(ratingKey(enrollmentId, ref.lessonId, ref.blockId));
    if (v != null) values.push(v);
  }
  if (values.length === 0) return "—";
  return values.join(" · ");
}

export async function loadGradesMatrix(productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { id: true, title: true, type: true },
  });
  if (!product) return null;

  const enrollments = await prisma.enrollment.findMany({
    where: {
      productId,
      user: {
        role: "USER",
        email: { notIn: EXCLUDED_STUDENT_EMAILS },
      },
    },
    select: {
      id: true,
      user: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const columns: GradeColumn[] = [];

  if (product.type === "MARATHON") {
    const events = await prisma.marathonEvent.findMany({
      where: { productId, type: "TRAINING" },
      orderBy: [{ dayOffset: "asc" }, { position: "asc" }],
      select: {
        id: true,
        title: true,
        dayOffset: true,
        eventLessons: {
          orderBy: { position: "asc" },
          select: { lesson: { select: { id: true, blocks: true } } },
        },
      },
    });

    for (const ev of events) {
      const refs: RatingRef[] = [];
      for (const el of ev.eventLessons) {
        refs.push(...ratingRefsFromBlocks(el.lesson.id, el.lesson.blocks));
      }
      columns.push({
        kind: "marathon_training",
        eventId: ev.id,
        dayOffset: ev.dayOffset,
        title: ev.title,
        refs,
      });
    }
  } else {
    const lessons = await prisma.lesson.findMany({
      where: { productId },
      orderBy: { order: "asc" },
      select: { id: true, title: true, blocks: true },
    });
    for (const lesson of lessons) {
      const refs = ratingRefsFromBlocks(lesson.id, lesson.blocks);
      if (refs.length === 0) continue;
      columns.push({
        kind: "course_lesson",
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        refs,
      });
    }
  }

  const allLessonIds = new Set<string>();
  for (const c of columns) {
    for (const r of c.refs) allLessonIds.add(r.lessonId);
  }

  const enrollmentIds = enrollments.map((e) => e.id);
  const ratings =
    enrollmentIds.length > 0 && allLessonIds.size > 0
      ? await prisma.lessonBlockRating.findMany({
          where: {
            enrollmentId: { in: enrollmentIds },
            lessonId: { in: [...allLessonIds] },
          },
          select: { enrollmentId: true, lessonId: true, blockId: true, rating: true },
        })
      : [];

  const ratingMap = new Map<string, number>();
  for (const row of ratings) {
    ratingMap.set(ratingKey(row.enrollmentId, row.lessonId, row.blockId), row.rating);
  }

  const rows: GradeRow[] = enrollments.map((e) => ({
    enrollmentId: e.id,
    userId: e.user.id,
    surname: surnameFromUser(e.user.name, e.user.email),
    fullName: e.user.name?.trim() || e.user.email,
  }));

  rows.sort((a, b) => a.surname.localeCompare(b.surname, "ru"));

  return {
    product,
    columns,
    rows,
    ratingMap,
  };
}
