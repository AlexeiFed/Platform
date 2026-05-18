"use server";

import { auth } from "@/lib/auth";
import {
  countStaffHomeworkUnread,
  type HomeworkUnreadRow,
} from "@/lib/homework-unread";
import { prisma } from "@/lib/prisma";

async function staffAllowedProductIds(staffId: string, role: string): Promise<string[] | null> {
  if (role === "ADMIN") return null;
  const rows = await prisma.productCurator.findMany({
    where: { curatorId: staffId },
    select: { productId: true },
  });
  return rows.map((r) => r.productId);
}

async function loadStaffUnreadRows(productIds: string[] | null): Promise<HomeworkUnreadRow[]> {
  return prisma.homeworkSubmission.findMany({
    where: {
      lesson: productIds ? { productId: { in: productIds } } : undefined,
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
    take: 5000,
  });
}

export async function getAdminHomeworkUnreadCount() {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    return { count: 0 };
  }

  try {
    const productIds = await staffAllowedProductIds(session.user.id, session.user.role);
    if (productIds?.length === 0) return { count: 0 };

    const rows = await loadStaffUnreadRows(productIds);
    return { count: countStaffHomeworkUnread(rows) };
  } catch {
    return { count: 0 };
  }
}

export async function markStaffHomeworkThreadRead(input: {
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
      if (!assignment) return { error: "Нет доступа" } as const;
    }

    await prisma.homeworkSubmission.updateMany({
      where: {
        userId: input.userId,
        lessonId: input.lessonId,
        lesson: { productId: input.productId },
      },
      data: { staffReadAt: new Date() },
    });

    return { success: true } as const;
  } catch {
    return { error: "Ошибка" } as const;
  }
}
