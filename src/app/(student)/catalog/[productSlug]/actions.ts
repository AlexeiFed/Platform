"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function enrollToProduct(productId: string) {
  const session = await auth();
  if (!session) return { error: "Необходимо войти в аккаунт" };

  try {
    await prisma.enrollment.upsert({
      where: { userId_productId: { userId: session.user.id, productId } },
      create: { userId: session.user.id, productId },
      update: {},
    });

    revalidatePath("/catalog");
    return { success: true };
  } catch (error) {
    console.error("[enrollToProduct]", error);
    return { error: "Произошла ошибка" };
  }
}

