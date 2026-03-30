"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { emitHomeworkEvent } from "@/lib/realtime";

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

    const latest = await prisma.homeworkSubmission.findFirst({
      where: { lessonId: data.lessonId, userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });

    // One thread per lesson: if not approved yet — update same submission (keeps chat history)
    if (latest && latest.status !== "APPROVED") {
      await prisma.homeworkSubmission.update({
        where: { id: latest.id },
        data: {
          content: data.content,
          fileUrl: data.fileUrl ?? null,
          status: "PENDING",
        },
      });

      await prisma.chatMessage.create({
        data: {
          submissionId: latest.id,
          userId: session.user.id,
          content: data.content,
        },
      });

      emitHomeworkEvent({ submissionId: latest.id, lessonId: data.lessonId, userId: session.user.id });
    } else {
      const created = await prisma.homeworkSubmission.create({
        data: {
          lessonId: data.lessonId,
          userId: session.user.id,
          content: data.content,
          fileUrl: data.fileUrl ?? null,
          status: "PENDING",
        },
        select: { id: true },
      });

      await prisma.chatMessage.create({
        data: {
          submissionId: created.id,
          userId: session.user.id,
          content: data.content,
        },
      });

      emitHomeworkEvent({ submissionId: created.id, lessonId: data.lessonId, userId: session.user.id });
    }

    revalidatePath(`/learn/${lesson.product.slug}/${lesson.slug}`);
    return { success: true };
  } catch (error) {
    console.error("[submitHomework]", error);
    if (error instanceof z.ZodError) return { error: "Некорректные данные" };
    return { error: "Произошла ошибка" };
  }
}

export async function getHomeworkThread(lessonId: string) {
  const session = await auth();
  if (!session) return { error: "Необходимо войти в аккаунт" } as const;

  try {
    const submission = await prisma.homeworkSubmission.findFirst({
      where: { lessonId, userId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: { name: true, email: true, role: true } } },
        },
      },
    });

    if (!submission) return { success: true, data: null } as const;

    return {
      success: true,
      data: {
        id: submission.id,
        status: submission.status,
        fileUrl: submission.fileUrl,
        content: submission.content,
        messages: submission.messages.map((m) => ({
          id: m.id,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
          user: { name: m.user.name, email: m.user.email, role: m.user.role },
        })),
      },
    } as const;
  } catch (error) {
    console.error("[getHomeworkThread]", error);
    return { error: "Произошла ошибка" } as const;
  }
}
