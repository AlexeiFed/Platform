"use server";

import { auth } from "@/lib/auth";
import {
  countStudentHomeworkUnread,
  type HomeworkUnreadRow,
} from "@/lib/homework-unread";
import { prisma } from "@/lib/prisma";

export async function getStudentHomeworkUnreadCount(courseSlug: string) {
  const session = await auth();
  if (!session) return { count: 0 };

  try {
    const product = await prisma.product.findFirst({
      where: { slug: courseSlug, deletedAt: null },
      select: { id: true },
    });
    if (!product) return { count: 0 };

    const rows: HomeworkUnreadRow[] = await prisma.homeworkSubmission.findMany({
      where: {
        userId: session.user.id,
        lesson: { productId: product.id },
      },
      select: {
        status: true,
        updatedAt: true,
        staffReadAt: true,
        studentReadAt: true,
        lessonId: true,
        userId: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            createdAt: true,
            user: { select: { role: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });

    return { count: countStudentHomeworkUnread(rows) };
  } catch {
    return { count: 0 };
  }
}

export async function markStudentHomeworkThreadRead(lessonId: string) {
  const session = await auth();
  if (!session) return { error: "Нет доступа" } as const;

  try {
    await prisma.homeworkSubmission.updateMany({
      where: { lessonId, userId: session.user.id },
      data: { studentReadAt: new Date() },
    });
    return { success: true } as const;
  } catch {
    return { error: "Ошибка" } as const;
  }
}
