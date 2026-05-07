"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  lessonId: z.string().uuid(),
  blockId: z.string().min(1),
  productId: z.string().uuid(),
  courseSlug: z.string().min(1),
  lessonSlug: z.string().min(1),
  rating: z.number().int().min(0).max(10),
});

export type SaveLessonBlockRatingResult =
  | { success: true }
  | { success: false; error: string };

export const saveLessonBlockRating = async (
  input: unknown
): Promise<SaveLessonBlockRatingResult> => {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Некорректные данные" };
  }

  const { lessonId, blockId, productId, courseSlug, lessonSlug, rating } = parsed.data;

  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Нужна авторизация" };
  }

  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, productId },
    select: { blocks: true },
  });
  if (!lesson) {
    return { success: false, error: "Урок не найден" };
  }

  const blocks = lesson.blocks as { id: string; type: string }[] | null;
  const valid = blocks?.some((b) => b.id === blockId && b.type === "rating");
  if (!valid) {
    return { success: false, error: "Блок оценки не найден в уроке" };
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_productId: { userId: session.user.id, productId } },
    select: { id: true },
  });
  if (!enrollment) {
    return { success: false, error: "Нет доступа к продукту" };
  }

  await prisma.lessonBlockRating.upsert({
    where: {
      enrollmentId_lessonId_blockId: {
        enrollmentId: enrollment.id,
        lessonId,
        blockId,
      },
    },
    create: {
      enrollmentId: enrollment.id,
      lessonId,
      blockId,
      rating,
    },
    update: { rating },
  });

  revalidatePath(`/learn/${courseSlug}/${lessonSlug}`);
  revalidatePath(`/admin/users/${session.user.id}`);

  return { success: true };
};
