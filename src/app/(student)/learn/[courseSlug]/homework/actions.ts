"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { emitHomeworkEvent } from "@/lib/realtime";
import { enrollmentHasCriterion, loadEnrollmentForCriteriaByUserProduct } from "@/lib/enrollment-criteria";

const sendSchema = z.object({
  submissionId: z.string().uuid(),
  content: z.string().min(1).max(20000),
  replyToId: z.string().uuid().optional().nullable(),
});

export async function sendStudentHomeworkChatMessage(
  submissionId: string,
  content: string,
  replyToId?: string | null
) {
  try {
    const session = await auth();
    if (!session) return { error: "Необходимо войти в аккаунт" } as const;

    const data = sendSchema.parse({ submissionId, content, replyToId });

    const sub = await prisma.homeworkSubmission.findUnique({
      where: { id: data.submissionId },
      select: {
        userId: true,
        lessonId: true,
        lesson: { select: { productId: true, product: { select: { slug: true } }, slug: true } },
      },
    });
    if (!sub || sub.userId !== session.user.id) {
      return { error: "Работа не найдена" } as const;
    }

    const crit = await loadEnrollmentForCriteriaByUserProduct(session.user.id, sub.lesson.productId);
    if (!crit || !enrollmentHasCriterion(crit, "TASKS")) {
      return { error: "Нет доступа к заданиям" } as const;
    }
    const canMessage =
      enrollmentHasCriterion(crit, "HOMEWORK_REVIEW") || enrollmentHasCriterion(crit, "COMMUNITY_CHAT");
    if (!canMessage) {
      return { error: "Переписка по этому тарифу недоступна" } as const;
    }

    if (data.replyToId) {
      const replyTarget = await prisma.chatMessage.findFirst({
        where: { id: data.replyToId, submissionId: data.submissionId },
        select: { id: true },
      });
      if (!replyTarget) return { error: "Сообщение для ответа не найдено" } as const;
    }

    await prisma.chatMessage.create({
      data: {
        submissionId: data.submissionId,
        userId: session.user.id,
        content: data.content,
        replyToId: data.replyToId ?? null,
      },
    });

    const slug = sub.lesson.product.slug;
    revalidatePath(`/learn/${slug}/homework`);
    revalidatePath(`/learn/${slug}/${sub.lesson.slug}`);
    emitHomeworkEvent({
      submissionId: data.submissionId,
      lessonId: sub.lessonId,
      userId: session.user.id,
    });
    return { success: true } as const;
  } catch (e) {
    if (e instanceof z.ZodError) return { error: "Некорректные данные" } as const;
    return { error: "Произошла ошибка" } as const;
  }
}
