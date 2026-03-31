"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncMarathonEnrollmentProgress } from "@/lib/marathon-progress-server";
import { revalidatePath } from "next/cache";

export async function toggleMarathonProcedureCompletion(procedureId: string) {
  const session = await auth();
  if (!session) return { error: "Необходимо войти в аккаунт" };

  try {
    const row = await prisma.userMarathonProcedure.findUnique({
      where: { id: procedureId },
      select: {
        id: true,
        completedAt: true,
        enrollment: {
          select: {
            id: true,
            userId: true,
            productId: true,
            product: {
              select: { slug: true, type: true },
            },
          },
        },
      },
    });

    if (!row) {
      return { error: "Процедура не найдена" };
    }

    if (row.enrollment.userId !== session.user.id) {
      return { error: "Нет доступа" };
    }

    if (row.enrollment.product.type !== "MARATHON") {
      return { error: "Доступно только в марафоне" };
    }

    const slug = row.enrollment.product.slug;
    const nowCompleted = !row.completedAt;

    await prisma.userMarathonProcedure.update({
      where: { id: procedureId },
      data: {
        completedAt: nowCompleted ? new Date() : null,
      },
    });

    await syncMarathonEnrollmentProgress(row.enrollment.id);

    revalidatePath(`/learn/${slug}`);
    revalidatePath("/dashboard");
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${row.enrollment.userId}`);
    revalidatePath(`/admin/courses/${row.enrollment.productId}`);

    return { success: true, data: { completed: nowCompleted } };
  } catch (error) {
    console.error("[toggleMarathonProcedureCompletion]", error);
    return { error: "Произошла ошибка" };
  }
}
