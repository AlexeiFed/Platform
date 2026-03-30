"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function grantAccess(userId: string, productId: string) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Нет доступа" };

  try {
    await prisma.enrollment.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
    });

    revalidatePath("/admin/users");
    return { success: true };
  } catch {
    return { error: "Произошла ошибка" };
  }
}

export async function updateUserRole(userId: string, role: "ADMIN" | "CURATOR" | "USER") {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Нет доступа" };

  try {
    await prisma.user.update({ where: { id: userId }, data: { role } });
    revalidatePath("/admin/users");
    return { success: true };
  } catch {
    return { error: "Произошла ошибка" };
  }
}
