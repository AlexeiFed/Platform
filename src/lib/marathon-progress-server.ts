import { prisma } from "@/lib/prisma";
import { calculateMarathonProgress } from "@/lib/marathon-progress";

export async function syncMarathonEnrollmentProgress(enrollmentId: string) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      userId: true,
      product: {
        select: {
          id: true,
          type: true,
        },
      },
      procedures: {
        select: {
          completedAt: true,
        },
      },
      eventCompletions: {
        select: {
          id: true,
          eventId: true,
        },
      },
    },
  });

  if (!enrollment || enrollment.product.type !== "MARATHON") {
    return null;
  }

  const events = await prisma.marathonEvent.findMany({
    where: {
      productId: enrollment.product.id,
      published: true,
    },
    orderBy: [{ dayOffset: "asc" }, { position: "asc" }],
    select: {
      id: true,
      lesson: {
        select: {
          submissions: {
            where: { userId: enrollment.userId },
            select: { status: true },
            take: 1,
          },
        },
      },
    },
  });

  const progress = calculateMarathonProgress({
    events: events.map((event) => ({
      ...event,
      completions: enrollment.eventCompletions.filter((completion) => completion.eventId === event.id),
    })),
    procedures: enrollment.procedures,
  });

  await prisma.enrollment.update({
    where: { id: enrollmentId },
    data: {
      progress: progress.value,
    },
  });

  return progress;
}

export async function syncMarathonProductEnrollmentsProgress(productId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      productId,
      product: {
        type: "MARATHON",
      },
    },
    select: {
      id: true,
    },
  });

  for (const enrollment of enrollments) {
    await syncMarathonEnrollmentProgress(enrollment.id);
  }
}
