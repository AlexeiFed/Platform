"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { slugify } from "@/lib/utils";
import { ALL_PRODUCT_CRITERIA } from "@/lib/product-criteria";
import type { LandingBlock } from "@/types/landing";

export type { LandingBlock } from "@/types/landing";

const productSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["COURSE", "MARATHON"]),
  description: z.string().optional(),
  rules: z.string().optional(),
  price: z.coerce.number().min(0).optional(),
  currency: z.string().optional().default("RUB"),
  published: z.boolean().default(false),
  startDate: z.string().optional(),
  durationDays: z.coerce.number().int().min(1, "Длительность должна быть не меньше 1 дня").optional(),
  coverUrl: z.string().optional(),
  paymentFormUrl: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.type === "MARATHON" && !data.startDate?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["startDate"],
      message: "Для марафона укажите дату старта",
    });
  }

  if (data.type === "MARATHON" && !data.durationDays) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["durationDays"],
      message: "Для марафона укажите длительность в днях",
    });
  }

  const price = data.price ?? 0;
  const yoomoneyReceiver = process.env.YOOMONEY_WALLET_RECEIVER?.trim();
  if (data.published && price > 0) {
    const form = data.paymentFormUrl?.trim();
    if (!form && !yoomoneyReceiver) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paymentFormUrl"],
        message:
          "Для платного продукта укажите ссылку на форму оплаты или настройте на сервере переменную YOOMONEY_WALLET_RECEIVER",
      });
    } else if (form && !URL.canParse(form)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paymentFormUrl"],
        message: "Некорректный URL формы оплаты",
      });
    }
  }
});

export async function createProduct(input: z.infer<typeof productSchema>) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Нет доступа" };

  try {
    const data = productSchema.parse(input);
    const baseSlug = slugify(data.title);
    const slug = baseSlug || `product-${Date.now()}`;

    const existing = await prisma.product.findUnique({ where: { slug } });
    const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          ...data,
          slug: finalSlug,
          startDate: data.type === "MARATHON" && data.startDate ? new Date(data.startDate) : null,
          durationDays: data.type === "MARATHON" ? data.durationDays ?? null : null,
          price: data.price ?? null,
          paymentFormUrl: data.paymentFormUrl?.trim() || null,
          enabledCriteria: ALL_PRODUCT_CRITERIA,
        },
        select: { id: true },
      });
      await tx.productTariff.create({
        data: {
          productId: p.id,
          name: "Базовый",
          price: data.price ?? 0,
          currency: data.currency ?? "RUB",
          sortOrder: 0,
          published: true,
          criteria: ALL_PRODUCT_CRITERIA,
        },
      });
      return p;
    });

    revalidatePath("/admin/courses");
    revalidatePath("/catalog");
    return { success: true, data: { id: product.id } };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Некорректные данные" };
    return { error: "Произошла ошибка" };
  }
}

export async function updateProduct(id: string, input: z.infer<typeof productSchema>) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Нет доступа" };

  try {
    const data = productSchema.parse(input);

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          ...data,
          startDate: data.type === "MARATHON" && data.startDate ? new Date(data.startDate) : null,
          durationDays: data.type === "MARATHON" ? data.durationDays ?? null : null,
          price: data.price ?? null,
          paymentFormUrl: data.paymentFormUrl?.trim() || null,
          rules: data.rules?.trim() || null,
        },
      });
      const baseTariff = await tx.productTariff.findFirst({
        where: { productId: id, deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      if (baseTariff) {
        await tx.productTariff.update({
          where: { id: baseTariff.id },
          data: { price: data.price ?? 0, currency: data.currency ?? "RUB" },
        });
      }
    });

    revalidatePath("/admin/courses");
    revalidatePath(`/admin/courses/${id}`);
    revalidatePath("/catalog");
    revalidatePath("/learn", "layout");
    return { success: true };
  } catch (error) {
    console.error("[updateProduct]", error);
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Некорректные данные" };
    return { error: "Произошла ошибка" };
  }
}

const contentBlockSchema = z.object({
  id: z.string(),
  type: z.enum(["text", "video", "image"]),
  content: z.string(),
  /** Ширина блока изображения на странице студента */
  size: z.enum(["full", "half", "third"]).optional(),
});

const lessonSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
  videoUrl: z.string().optional(),
  blocks: z.array(contentBlockSchema).optional(),
  homeworkEnabled: z.boolean().default(false),
  homeworkQuestions: z.array(z.string()).optional(),
  unlockRule: z.enum(["IMMEDIATELY", "AFTER_HOMEWORK_APPROVAL", "SPECIFIC_DATE"]).default("IMMEDIATELY"),
  unlockDate: z.string().optional(),
  unlockDay: z.coerce.number().optional(),
  published: z.boolean().default(false),
});

export async function createLesson(productId: string, input: z.infer<typeof lessonSchema>) {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    return { error: "Нет доступа" };
  }

  try {
    const data = lessonSchema.parse(input);

    const maxOrder = await prisma.lesson.aggregate({
      where: { productId },
      _max: { order: true },
    });

    const baseSlug = slugify(data.title);
    const slug = baseSlug || `lesson-${Date.now()}`;
    const existing = await prisma.lesson.findUnique({
      where: { productId_slug: { productId, slug } },
    });
    const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

    const lesson = await prisma.lesson.create({
      data: {
        title: data.title,
        content: data.content,
        videoUrl: data.videoUrl,
        blocks: data.blocks ?? undefined,
        homeworkEnabled: data.homeworkEnabled,
        homeworkQuestions: data.homeworkQuestions ?? undefined,
        unlockRule: data.unlockRule,
        unlockDay: data.unlockDay,
        published: data.published,
        productId,
        slug: finalSlug,
        order: (maxOrder._max.order ?? 0) + 1,
        unlockDate: data.unlockDate ? new Date(data.unlockDate) : null,
      },
    });

    revalidatePath(`/admin/courses/${productId}`);
    return { success: true, data: lesson };
  } catch (error) {
    console.error("[createLesson]", error);
    if (error instanceof z.ZodError) return { error: "Некорректные данные" };
    return { error: "Произошла ошибка" };
  }
}

export async function updateLesson(lessonId: string, input: z.infer<typeof lessonSchema>) {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    return { error: "Нет доступа" };
  }

  try {
    const data = lessonSchema.parse(input);
    const current = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { slug: true, productId: true },
    });
    if (!current) return { error: "Урок не найден" };

    let slugUpdate: string | undefined;
    if (!current.slug) {
      const baseSlug = slugify(data.title);
      const candidate = baseSlug || `lesson-${Date.now()}`;
      const existing = await prisma.lesson.findUnique({
        where: { productId_slug: { productId: current.productId, slug: candidate } },
      });
      slugUpdate = existing ? `${candidate}-${Date.now()}` : candidate;
    }

    const lesson = await prisma.lesson.update({
      where: { id: lessonId },
      data: {
        title: data.title,
        content: data.content,
        videoUrl: data.videoUrl,
        blocks: data.blocks ?? undefined,
        homeworkEnabled: data.homeworkEnabled,
        homeworkQuestions: data.homeworkQuestions ?? undefined,
        unlockRule: data.unlockRule,
        unlockDate: data.unlockDate ? new Date(data.unlockDate) : null,
        unlockDay: data.unlockDay,
        published: data.published,
        ...(slugUpdate ? { slug: slugUpdate } : {}),
      },
      select: { productId: true },
    });

    revalidatePath(`/admin/courses/${lesson.productId}`);
    return { success: true };
  } catch (error) {
    console.error("[updateLesson]", error);
    if (error instanceof z.ZodError) return { error: "Некорректные данные" };
    return { error: "Произошла ошибка" };
  }
}

export async function deleteLesson(lessonId: string) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Нет доступа" };

  try {
    const lesson = await prisma.lesson.delete({
      where: { id: lessonId },
      select: { productId: true },
    });

    revalidatePath(`/admin/courses/${lesson.productId}`);
    return { success: true };
  } catch {
    return { error: "Произошла ошибка" };
  }
}

export async function addLessonAttachment(
  lessonId: string,
  input: { name: string; url: string; type: string; size?: number }
) {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    return { error: "Нет доступа" };
  }

  try {
    const attachment = await prisma.lessonAttachment.create({
      data: { lessonId, ...input },
      select: { id: true, name: true, url: true, type: true, size: true },
    });

    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { productId: true } });
    if (lesson) revalidatePath(`/admin/courses/${lesson.productId}`);
    return { success: true, data: attachment };
  } catch {
    return { error: "Произошла ошибка" };
  }
}

export async function removeLessonAttachment(attachmentId: string) {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    return { error: "Нет доступа" };
  }

  try {
    const attachment = await prisma.lessonAttachment.delete({
      where: { id: attachmentId },
      select: { lesson: { select: { productId: true } } },
    });

    revalidatePath(`/admin/courses/${attachment.lesson.productId}`);
    return { success: true };
  } catch {
    return { error: "Произошла ошибка" };
  }
}

// === Landing Blocks ===

const landingBlockSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string(), type: z.literal("hero"), title: z.string(), subtitle: z.string(), imageUrl: z.string() }),
  z.object({ id: z.string(), type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3)]), text: z.string() }),
  z.object({ id: z.string(), type: z.literal("text"), content: z.string() }),
  z.object({ id: z.string(), type: z.literal("features"), title: z.string(), items: z.array(z.string()) }),
  z.object({ id: z.string(), type: z.literal("image"), url: z.string(), caption: z.string(), fullWidth: z.boolean() }),
  z.object({ id: z.string(), type: z.literal("video"), url: z.string(), title: z.string() }),
  z.object({ id: z.string(), type: z.literal("divider") }),
]);

export async function updateProductLanding(productId: string, blocks: LandingBlock[]) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Нет доступа" };

  try {
    const parsed = z.array(landingBlockSchema).parse(blocks);
    await prisma.product.update({
      where: { id: productId },
      data: { landingBlocks: parsed },
    });
    revalidatePath(`/admin/courses/${productId}`);
    revalidatePath(`/catalog`);
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Некорректные данные" };
    return { error: "Произошла ошибка" };
  }
}

export async function reorderLessons(productId: string, lessonIds: string[]) {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    return { error: "Нет доступа" };
  }

  try {
    await prisma.$transaction(
      lessonIds.map((id, index) =>
        prisma.lesson.update({ where: { id }, data: { order: index + 1 } })
      )
    );

    revalidatePath(`/admin/courses/${productId}`);
    return { success: true };
  } catch {
    return { error: "Произошла ошибка" };
  }
}

// === Дублирование курса/марафона ===

export async function duplicateProduct(id: string): Promise<{ success: true; newId: string } | { error: string }> {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Нет доступа" };

  try {
    const original = await prisma.product.findUnique({
      where: { id },
      include: {
        lessons: {
          include: { attachments: { orderBy: { createdAt: "asc" } } },
          orderBy: { order: "asc" },
        },
        marathonEvents: { orderBy: [{ dayOffset: "asc" }, { position: "asc" }] },
        tariffs: { where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    });

    if (!original) return { error: "Продукт не найден" };

    const newSlug = `${original.slug}-copy-${Date.now()}`;

    const newProduct = await prisma.$transaction(async (tx) => {
      // Создаём копию продукта
      const p = await tx.product.create({
        data: {
          type: original.type,
          title: `${original.title} (Копия)`,
          slug: newSlug,
          description: original.description,
          rules: original.rules,
          coverUrl: original.coverUrl,
          price: original.price,
          currency: original.currency,
          paymentFormUrl: original.paymentFormUrl,
          durationDays: original.durationDays,
          landingBlocks: original.landingBlocks ?? undefined,
          enabledCriteria: original.enabledCriteria,
          published: false,
          startDate: null,
        },
      });

      // Копируем уроки с вложениями
      for (const lesson of original.lessons) {
        const newLesson = await tx.lesson.create({
          data: {
            productId: p.id,
            title: lesson.title,
            slug: lesson.slug,
            order: lesson.order,
            content: lesson.content,
            videoUrl: lesson.videoUrl,
            blocks: lesson.blocks ?? undefined,
            homeworkEnabled: lesson.homeworkEnabled,
            homeworkQuestions: lesson.homeworkQuestions ?? undefined,
            unlockRule: lesson.unlockRule,
            unlockDate: lesson.unlockDate,
            unlockDay: lesson.unlockDay,
            published: lesson.published,
          },
        });
        for (const att of lesson.attachments) {
          await tx.lessonAttachment.create({
            data: {
              lessonId: newLesson.id,
              name: att.name,
              url: att.url,
              type: att.type,
              size: att.size,
            },
          });
        }
      }

      // Копируем события марафона
      for (const event of original.marathonEvents) {
        await tx.marathonEvent.create({
          data: {
            productId: p.id,
            title: event.title,
            description: event.description,
            type: event.type,
            track: event.track,
            dayOffset: event.dayOffset,
            weekNumber: event.weekNumber,
            position: event.position,
            lessonId: event.lessonId,
            blocks: event.blocks ?? undefined,
            published: event.published,
          },
        });
      }

      // Копируем тарифы
      for (const tariff of original.tariffs) {
        await tx.productTariff.create({
          data: {
            productId: p.id,
            name: tariff.name,
            price: tariff.price,
            currency: tariff.currency,
            sortOrder: tariff.sortOrder,
            published: tariff.published,
            criteria: tariff.criteria,
          },
        });
      }

      return p;
    });

    revalidatePath("/admin/courses");
    return { success: true, newId: newProduct.id };
  } catch (error) {
    console.error("[duplicateProduct]", error);
    return { error: "Ошибка при копировании" };
  }
}

/** Мягкое удаление продукта: скрытие из админки и каталога, связи в БД сохраняются. */
export async function softDeleteProduct(productId: string): Promise<{ success: true } | { error: string }> {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Нет доступа" };

  try {
    const result = await prisma.product.updateMany({
      where: { id: productId, deletedAt: null },
      data: { deletedAt: new Date(), published: false },
    });
    if (result.count === 0) return { error: "Продукт не найден или уже удалён" };

    revalidatePath("/admin/courses");
    revalidatePath("/catalog");
    revalidatePath(`/admin/courses/${productId}`);
    revalidatePath("/learn", "layout");
    return { success: true };
  } catch (error) {
    console.error("[softDeleteProduct]", error);
    return { error: "Не удалось удалить продукт" };
  }
}
