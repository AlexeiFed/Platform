"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { notifyAdminsOnStudentMessage } from "@/app/(admin)/admin/feedback/actions";
import { enrollmentHasCriterion, loadEnrollmentForCriteria } from "@/lib/enrollment-criteria";

const attachmentSchema = z.object({
  url: z.string().url(),
  type: z.enum(["image", "video", "file"]),
  name: z.string().max(512).optional(),
  size: z.number().int().nonnegative().optional(),
});

const messageSchema = z.object({
  enrollmentId: z.string().uuid(),
  content: z.string().max(8000),
  attachments: z.array(attachmentSchema).max(10).optional().default([]),
}).refine((d) => d.content.trim().length > 0 || d.attachments.length > 0, {
  message: "Требуется текст или вложение",
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

    const created = await prisma.curatorFeedbackMessage.create({
      data: {
        enrollmentId: enrollment.id,
        userId: session.user.id,
        content: data.content,
        attachments: data.attachments.length ? data.attachments : undefined,
      },
      include: { user: { select: { name: true, email: true, role: true } } },
    });

    revalidatePath(`/learn/${enrollment.product.slug}/feedback`);

    // Уведомляем кураторов/админов (email + Telegram) — не блокируем ответ
    void notifyAdminsOnStudentMessage({
      studentName: session.user.name ?? session.user.email ?? "Студент",
      productTitle: enrollment.product.title,
      messageContent: data.content || (data.attachments.length ? `Вложение (${data.attachments.length})` : ""),
      enrollmentId: enrollment.id,
    });

    return {
      success: true,
      data: {
        id: created.id,
        userId: created.userId,
        content: created.content,
        attachments: (created.attachments as unknown) ?? null,
        createdAt: created.createdAt,
        user: {
          name: created.user.name,
          email: created.user.email,
          role: created.user.role,
        },
      },
    };
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
