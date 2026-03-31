"use server";

import { auth } from "@/lib/auth";
import { syncMarathonEnrollmentProgress } from "@/lib/marathon-progress-server";
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

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_productId: {
          userId: submission.userId,
          productId: submission.lesson.productId,
        },
      },
      select: {
        id: true,
        product: {
          select: {
            type: true,
            _count: { select: { lessons: true } },
          },
        },
      },
    });

    if (enrollment?.product.type === "MARATHON") {
      await syncMarathonEnrollmentProgress(enrollment.id);
    } else if (enrollment) {
      const totalLessons = enrollment.product._count.lessons;
      const approvedCount = await prisma.homeworkSubmission.count({
        where: {
          userId: submission.userId,
          lesson: { productId: submission.lesson.productId },
          status: "APPROVED",
        },
      });

      await prisma.enrollment.update({
        where: { id: enrollment.id },
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

export async function getHomeworkReviewThread(input: {
  productId: string;
  userId: string;
  lessonId: string;
}) {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    return { error: "Нет доступа" } as const;
  }

  try {
    if (session.user.role === "CURATOR") {
      const assignment = await prisma.productCurator.findUnique({
        where: {
          productId_curatorId: {
            productId: input.productId,
            curatorId: session.user.id,
          },
        },
        select: { id: true },
      });

      if (!assignment) {
        return { error: "Нет доступа" } as const;
      }
    }

    const submission = await prisma.homeworkSubmission.findFirst({
      where: {
        userId: input.userId,
        lessonId: input.lessonId,
        lesson: { productId: input.productId },
      },
      include: {
        user: { select: { name: true, email: true } },
        lesson: { select: { id: true, title: true, order: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: { name: true, email: true, role: true } } },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!submission) {
      return { success: true, data: null } as const;
    }

    return {
      success: true,
      data: {
        id: submission.id,
        status: submission.status,
        content: submission.content,
        fileUrl: submission.fileUrl,
        fileUrls: submission.fileUrls,
        createdAt: submission.createdAt.toISOString(),
        updatedAt: submission.updatedAt.toISOString(),
        user: {
          name: submission.user.name,
          email: submission.user.email,
          role: "USER" as const,
        },
        lesson: {
          id: submission.lesson.id,
          title: submission.lesson.title,
          order: submission.lesson.order,
        },
        messages: submission.messages.map((message) => ({
          id: message.id,
          content: message.content,
          createdAt: message.createdAt.toISOString(),
          fileUrl: message.fileUrl,
          fileUrls: message.fileUrls,
          replyToId: message.replyToId,
          user: {
            name: message.user.name,
            email: message.user.email,
            role: message.user.role,
          },
        })),
      },
    } as const;
  } catch {
    return { error: "Произошла ошибка" } as const;
  }
}

export async function sendChatMessage(
  submissionId: string,
  content: string,
  replyToId?: string | null
) {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    return { error: "Нет доступа" };
  }

  try {
    if (replyToId) {
      const replyTarget = await prisma.chatMessage.findFirst({
        where: { id: replyToId, submissionId },
        select: { id: true },
      });

      if (!replyTarget) {
        return { error: "Сообщение для ответа не найдено" };
      }
    }

    await prisma.chatMessage.create({
      data: {
        submissionId,
        userId: session.user.id,
        content,
        replyToId: replyToId ?? null,
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
