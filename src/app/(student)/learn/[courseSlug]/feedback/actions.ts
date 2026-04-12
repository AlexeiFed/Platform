"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
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
      select: { id: true, productId: true },
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

    const product = await prisma.product.findUnique({
      where: { id: enrollment.productId },
      select: { slug: true },
    });
    if (product) {
      revalidatePath(`/learn/${product.slug}/feedback`);
    }
    return { success: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { error: "Некорректные данные" };
    console.error("[submitCuratorFeedbackMessage]", e);
    return { error: "Ошибка" };
  }
}
