"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncMarathonEnrollmentProgress } from "@/lib/marathon-progress-server";
import { revalidatePath } from "next/cache";

export async function toggleMarathonEventCompletion(eventId: string) {
  const session = await auth();
  if (!session) return { error: "Необходимо войти в аккаунт" };

  try {
    const event = await prisma.marathonEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        productId: true,
        product: {
          select: {
            slug: true,
            type: true,
          },
        },
      },
    });

    if (!event || event.product.type !== "MARATHON") {
      return { error: "Событие марафона не найдено" };
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_productId: {
          userId: session.user.id,
          productId: event.productId,
        },
      },
      select: { id: true },
    });

    if (!enrollment) {
      return { error: "Нет доступа к марафону" };
    }

    const existing = await prisma.marathonEventCompletion.findUnique({
      where: {
        enrollmentId_eventId: {
          enrollmentId: enrollment.id,
          eventId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.marathonEventCompletion.delete({
        where: { id: existing.id },
      });
    } else {
      await prisma.marathonEventCompletion.create({
        data: {
          enrollmentId: enrollment.id,
          eventId,
        },
      });
    }

    await syncMarathonEnrollmentProgress(enrollment.id);

    revalidatePath(`/learn/${event.product.slug}`);
    revalidatePath(`/learn/${event.product.slug}/event/${eventId}`);
    revalidatePath("/dashboard");

    return { success: true, data: { completed: !existing } };
  } catch (error) {
    console.error("[toggleMarathonEventCompletion]", error);
    return { error: "Произошла ошибка" };
  }
}
