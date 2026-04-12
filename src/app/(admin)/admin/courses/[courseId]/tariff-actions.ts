"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ProductCriterion } from "@prisma/client";
import { ALL_PRODUCT_CRITERIA, isSubsetOfEnabled } from "@/lib/product-criteria";

const criterionSchema = z.enum([
  "NUTRITION_CONTENT",
  "ONLINE_TRAINING",
  "TASKS",
  "COMMUNITY_CHAT",
  "HOMEWORK_REVIEW",
  "CURATOR_FEEDBACK",
  "MARATHON_LIVE",
]);

const updateCriteriaSchema = z.object({
  productId: z.string().uuid(),
  enabledCriteria: z.array(criterionSchema),
});

const tariffWriteSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().min(1),
  price: z.coerce.number().min(0),
  currency: z.string().min(1).default("RUB"),
  sortOrder: z.coerce.number().int().default(0),
  published: z.boolean().default(true),
  criteria: z.array(criterionSchema),
});

export async function updateProductEnabledCriteria(input: z.infer<typeof updateCriteriaSchema>) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Нет доступа" };

  try {
    const data = updateCriteriaSchema.parse(input);
    const criteria = data.enabledCriteria.length > 0 ? data.enabledCriteria : ALL_PRODUCT_CRITERIA;

    const tariffs = await prisma.productTariff.findMany({
      where: { productId: data.productId, deletedAt: null },
      select: { id: true, criteria: true, name: true },
    });
    for (const t of tariffs) {
      if (!isSubsetOfEnabled(t.criteria, criteria)) {
        return {
          error: `Тариф «${t.name}» содержит критерий вне нового набора продукта. Сначала упростите тарифы.`,
        };
      }
    }

    const product = await prisma.product.update({
      where: { id: data.productId },
      data: { enabledCriteria: criteria },
      select: { slug: true },
    });

    revalidatePath("/admin/courses");
    revalidatePath(`/admin/courses/${data.productId}`);
    revalidatePath("/catalog");
    revalidatePath(`/catalog/${product.slug}`);
    return { success: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Некорректные данные" };
    console.error("[updateProductEnabledCriteria]", e);
    return { error: "Произошла ошибка" };
  }
}

export async function createProductTariff(input: z.infer<typeof tariffWriteSchema>) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Нет доступа" };

  try {
    const data = tariffWriteSchema.parse(input);
    const product = await prisma.product.findUnique({
      where: { id: data.productId },
      select: { enabledCriteria: true, slug: true },
    });
    if (!product) return { error: "Продукт не найден" };
    const enabled = product.enabledCriteria.length > 0 ? product.enabledCriteria : ALL_PRODUCT_CRITERIA;
    if (!isSubsetOfEnabled(data.criteria, enabled)) {
      return { error: "Критерии тарифа должны входить в набор продукта" };
    }

    const t = await prisma.productTariff.create({
      data: {
        productId: data.productId,
        name: data.name,
        price: data.price,
        currency: data.currency,
        sortOrder: data.sortOrder,
        published: data.published,
        criteria: data.criteria as ProductCriterion[],
      },
      select: { id: true },
    });

    revalidatePath(`/admin/courses/${data.productId}`);
    revalidatePath("/catalog");
    revalidatePath(`/catalog/${product.slug}`);
    return { success: true, data: { id: t.id } };
  } catch (e) {
    if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Некорректные данные" };
    console.error("[createProductTariff]", e);
    return { error: "Произошла ошибка" };
  }
}

const updateTariffSchema = tariffWriteSchema.extend({
  tariffId: z.string().uuid(),
});

export async function updateProductTariff(input: z.infer<typeof updateTariffSchema>) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Нет доступа" };

  try {
    const data = updateTariffSchema.parse(input);
    const product = await prisma.product.findUnique({
      where: { id: data.productId },
      select: { enabledCriteria: true, slug: true },
    });
    if (!product) return { error: "Продукт не найден" };
    const enabled = product.enabledCriteria.length > 0 ? product.enabledCriteria : ALL_PRODUCT_CRITERIA;
    if (!isSubsetOfEnabled(data.criteria, enabled)) {
      return { error: "Критерии тарифа должны входить в набор продукта" };
    }

    await prisma.productTariff.update({
      where: { id: data.tariffId, productId: data.productId },
      data: {
        name: data.name,
        price: data.price,
        currency: data.currency,
        sortOrder: data.sortOrder,
        published: data.published,
        criteria: data.criteria as ProductCriterion[],
      },
    });

    revalidatePath(`/admin/courses/${data.productId}`);
    revalidatePath("/catalog");
    revalidatePath(`/catalog/${product.slug}`);
    return { success: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Некорректные данные" };
    console.error("[updateProductTariff]", e);
    return { error: "Произошла ошибка" };
  }
}

export async function softDeleteProductTariff(productId: string, tariffId: string) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Нет доступа" };

  try {
    const inUse = await prisma.enrollment.count({
      where: { tariffId },
    });
    if (inUse > 0) {
      return { error: "Нельзя удалить тариф с активными записями студентов" };
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { slug: true },
    });

    await prisma.productTariff.update({
      where: { id: tariffId, productId },
      data: { deletedAt: new Date(), published: false },
    });

    revalidatePath(`/admin/courses/${productId}`);
    if (product) {
      revalidatePath("/catalog");
      revalidatePath(`/catalog/${product.slug}`);
    }
    return { success: true };
  } catch (e) {
    console.error("[softDeleteProductTariff]", e);
    return { error: "Произошла ошибка" };
  }
}
