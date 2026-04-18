"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { notifyAdminsOnStudentMessage } from "@/app/(admin)/admin/feedback/actions";
import { enrollmentHasCriterion, loadEnrollmentForCriteria } from "@/lib/enrollment-criteria";

const messageSchema = z.object({
  enrollmentId: z.string().uuid(),
  content: z.string().min(1).max(8000),
});

export async function submitCuratorFeedbackMessage(input: z.infer<typeof messageSchema>) {
  const session = await auth();
  if (!session) return { error: "Необходимо войти" };

  try {
    const data = messageSchema.parse(input);
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: data.enrollmentId, userId: session.user.id },
      select: {
        id: true,
        productId: true,
        product: { select: { slug: true, title: true } },
      },
    });
    if (!enrollment) return { error: "Запись не найдена" };

    const crit = await loadEnrollmentForCriteria(enrollment.id);
    if (!crit || !enrollmentHasCriterion(crit, "CURATOR_FEEDBACK")) {
      return { error: "В тарифе нет канала обратной связи" };
    }

    await prisma.curatorFeedbackMessage.create({
      data: {
        enrollmentId: enrollment.id,
        userId: session.user.id,
        content: data.content,
      },
    });

    revalidatePath(`/learn/${enrollment.product.slug}/feedback`);

    // Уведомляем кураторов/админов (email + Telegram) — не блокируем ответ
    void notifyAdminsOnStudentMessage({
      studentName: session.user.name ?? session.user.email ?? "Студент",
      productTitle: enrollment.product.title,
      messageContent: data.content,
      enrollmentId: enrollment.id,
    });

    return { success: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { error: "Некорректные данные" };
    console.error("[submitCuratorFeedbackMessage]", e);
    return { error: "Ошибка" };
  }
}

// Polling новых сообщений для студента (после метки since)
export async function pollStudentFeedbackMessages(enrollmentId: string, since: string) {
  const session = await auth();
  if (!session) return { error: "Не авторизован" };

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId, userId: session.user.id },
    select: { id: true },
  });
  if (!enrollment) return { error: "Нет доступа" };

  try {
    const messages = await prisma.curatorFeedbackMessage.findMany({
      where: { enrollmentId, createdAt: { gt: new Date(since) } },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { name: true, email: true, role: true } } },
    });
    return { success: true, data: messages };
  } catch {
    return { error: "Ошибка" };
  }
}
