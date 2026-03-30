"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { emitHomeworkEvent } from "@/lib/realtime";

export async function reviewHomework(
  submissionId: string,
  status: "APPROVED" | "REJECTED"
) {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    return { error: "Нет доступа" };
  }

  try {
    const submission = await prisma.homeworkSubmission.update({
      where: { id: submissionId },
      data: { status },
      include: {
        lesson: {
          select: {
            productId: true,
            product: { select: { _count: { select: { lessons: true } } } },
          },
        },
      },
    });

    if (status === "APPROVED") {
      const totalLessons = submission.lesson.product._count.lessons;
      const approvedCount = await prisma.homeworkSubmission.count({
        where: {
          userId: submission.userId,
          lesson: { productId: submission.lesson.productId },
          status: "APPROVED",
        },
      });

      await prisma.enrollment.updateMany({
        where: {
          userId: submission.userId,
          productId: submission.lesson.productId,
        },
        data: {
          progress: totalLessons > 0 ? approvedCount / totalLessons : 0,
        },
      });
    }

    revalidatePath("/admin/homework");
    emitHomeworkEvent({ submissionId, lessonId: submission.lessonId, userId: submission.userId });
    return { success: true };
  } catch {
    return { error: "Произошла ошибка" };
  }
}

export async function sendChatMessage(submissionId: string, content: string) {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    return { error: "Нет доступа" };
  }

  try {
    await prisma.chatMessage.create({
      data: {
        submissionId,
        userId: session.user.id,
        content,
      },
    });

    revalidatePath("/admin/homework");
    const sub = await prisma.homeworkSubmission.findUnique({ where: { id: submissionId }, select: { lessonId: true, userId: true } });
    if (sub) emitHomeworkEvent({ submissionId, lessonId: sub.lessonId, userId: sub.userId });
    return { success: true };
  } catch {
    return { error: "Произошла ошибка" };
  }
}
