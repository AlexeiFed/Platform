"use server";

import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTariffForProduct } from "@/lib/product-tariff-pricing";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const createCuratorSchema = z.object({
  name: z.string().min(2, "Укажите имя"),
  email: z.string().email("Некорректный email"),
  password: z.string().min(8, "Пароль должен быть не короче 8 символов"),
});

export async function grantAccess(userId: string, productId: string, tariffId?: string) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Нет доступа" };

  try {
    // Если админ явно указал тариф — проверяем, что он принадлежит продукту и не удалён.
    let resolvedTariffId: string | null = null;
    if (tariffId) {
      const chosen = await prisma.productTariff.findFirst({
        where: { id: tariffId, productId, deletedAt: null },
        select: { id: true },
      });
      if (!chosen) return { error: "Тариф не найден или не принадлежит продукту" };
      resolvedTariffId = chosen.id;
    } else {
      // Фолбэк: первый опубликованный → первый любой не удалённый.
      const tariff =
        (await getDefaultTariffForProduct(productId)) ??
        (await prisma.productTariff.findFirst({
          where: { productId, deletedAt: null },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true },
        }));
      if (!tariff) {
        return { error: "У продукта нет тарифа — создайте тариф в админке курса" };
      }
      resolvedTariffId = tariff.id;
    }

    await prisma.enrollment.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId, tariffId: resolvedTariffId },
      update: { tariffId: resolvedTariffId },
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

export async function toggleCuratorProduct(userId: string, productId: string) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Нет доступа" };

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user || user.role !== "CURATOR") {
      return { error: "Назначение доступно только для кураторов" };
    }

    const existing = await prisma.productCurator.findUnique({
      where: {
        productId_curatorId: {
          productId,
          curatorId: userId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.productCurator.delete({ where: { id: existing.id } });
    } else {
      await prisma.productCurator.create({
        data: {
          productId,
          curatorId: userId,
        },
      });
    }

    revalidatePath("/admin/users");
    revalidatePath("/admin/homework");
    return { success: true };
  } catch {
    return { error: "Произошла ошибка" };
  }
}

export async function createCurator(input: z.infer<typeof createCuratorSchema>) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Нет доступа" };

  try {
    const data = createCuratorSchema.parse(input);
    const email = data.email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return { error: "Пользователь с таким email уже существует" };
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    await prisma.user.create({
      data: {
        name: data.name.trim(),
        email,
        passwordHash,
        role: "CURATOR",
      },
    });

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? "Некорректные данные" };
    }

    return { error: "Произошла ошибка" };
  }
}
