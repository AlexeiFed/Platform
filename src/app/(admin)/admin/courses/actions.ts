"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { slugify } from "@/lib/utils";

const productSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["COURSE", "MARATHON"]),
  description: z.string().optional(),
  price: z.coerce.number().min(0).optional(),
  currency: z.string().optional().default("RUB"),
  published: z.boolean().default(false),
  startDate: z.string().optional(),
  coverUrl: z.string().optional(),
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

    const product = await prisma.product.create({
      data: {
        ...data,
        slug: finalSlug,
        startDate: data.startDate ? new Date(data.startDate) : null,
        price: data.price ?? null,
      },
      select: { id: true },
    });

    revalidatePath("/admin/courses");
    return { success: true, data: { id: product.id } };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: "Некорректные данные" };
    return { error: "Произошла ошибка" };
  }
}

export async function updateProduct(id: string, input: z.infer<typeof productSchema>) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Нет доступа" };

  try {
    const data = productSchema.parse(input);

    await prisma.product.update({
      where: { id },
      data: {
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : null,
        price: data.price ?? null,
      },
    });

    revalidatePath("/admin/courses");
    revalidatePath(`/admin/courses/${id}`);
    return { success: true };
  } catch (error) {
    console.error("[updateProduct]", error);
    if (error instanceof z.ZodError) return { error: "Некорректные данные" };
    return { error: "Произошла ошибка" };
  }
}

const contentBlockSchema = z.object({
  id: z.string(),
  type: z.enum(["text", "video", "image"]),
  content: z.string(),
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
