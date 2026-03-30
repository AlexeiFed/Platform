"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const homeworkSchema = z.object({
  lessonId: z.string().uuid(),
  content: z.string().min(1),
  fileUrl: z.string().url().optional(),
});

export async function submitHomework(input: {
  lessonId: string;
  content: string;
  fileUrl?: string;
}) {
  try {
    const session = await auth();
    if (!session) return { error: "Необходимо войти в аккаунт" };

    const data = homeworkSchema.parse(input);

    const lesson = await prisma.lesson.findUnique({
      where: { id: data.lessonId },
      select: { productId: true, slug: true, product: { select: { slug: true } } },
    });

    if (!lesson) return { error: "Урок не найден" };

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_productId: { userId: session.user.id, productId: lesson.productId },
      },
    });

    if (!enrollment) return { error: "Нет доступа к курсу" };

    await prisma.homeworkSubmission.create({
      data: {
        lessonId: data.lessonId,
        userId: session.user.id,
        content: data.content,
        fileUrl: data.fileUrl ?? null,
        status: "PENDING",
      },
    });

    revalidatePath(`/learn/${lesson.product.slug}/${lesson.slug}`);
    return { success: true };
  } catch (error) {
    console.error("[submitHomework]", error);
    if (error instanceof z.ZodError) return { error: "Некорректные данные" };
    return { error: "Произошла ошибка" };
  }
}
