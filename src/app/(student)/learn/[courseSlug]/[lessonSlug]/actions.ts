"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { emitHomeworkEvent } from "@/lib/realtime";
import { enrollmentHasCriterion, loadEnrollmentForCriteriaByUserProduct } from "@/lib/enrollment-criteria";
import { notifyStaffHomeworkSubmitted } from "@/lib/homework-notifications";

const homeworkSchema = z.object({
  lessonId: z.string().uuid(),
  content: z.string().min(1),
  fileUrl: z.string().url().optional(),
  fileUrls: z.array(z.string().url()).optional(),
});

export async function submitHomework(input: {
  lessonId: string;
  content: string;
  fileUrl?: string;
  fileUrls?: string[];
}) {
  try {
    const session = await auth();
    if (!session) return { error: "Необходимо войти в аккаунт" };

    const data = homeworkSchema.parse(input);

    const lesson = await prisma.lesson.findUnique({
      where: { id: data.lessonId },
      select: {
        productId: true,
        slug: true,
        title: true,
        product: { select: { slug: true, title: true } },
      },
    });

    if (!lesson) return { error: "Урок не найден" };

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_productId: { userId: session.user.id, productId: lesson.productId },
      },
    });

    if (!enrollment) return { error: "Нет доступа к курсу" };

    const enrollmentCrit = await loadEnrollmentForCriteriaByUserProduct(
      session.user.id,
      lesson.productId
    );
    if (!enrollmentCrit || !enrollmentHasCriterion(enrollmentCrit, "TASKS")) {
      return { error: "В вашем тарифе нет доступа к заданиям" };
    }

    const latest = await prisma.homeworkSubmission.findFirst({
      where: { lessonId: data.lessonId, userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });

    // One thread per lesson: student answer lives in submission itself,
    // chat is reserved for curator/admin comments to avoid duplicate messages.
    const allowChat = enrollmentHasCriterion(enrollmentCrit, "COMMUNITY_CHAT");
    const hasReview = enrollmentHasCriterion(enrollmentCrit, "HOMEWORK_REVIEW");
    const nextStatus = hasReview ? "PENDING" : "APPROVED";

    if (latest && latest.status !== "APPROVED") {
      await prisma.homeworkSubmission.update({
        where: { id: latest.id },
        data: {
          content: data.content,
          fileUrl: data.fileUrls?.[0] ?? data.fileUrl ?? null,
          fileUrls: data.fileUrls ?? [],
          status: nextStatus,
        },
      });

      if (allowChat) {
        await prisma.chatMessage.create({
          data: {
            submissionId: latest.id,
            userId: session.user.id,
            content: data.content,
            fileUrl: data.fileUrls?.[0] ?? data.fileUrl ?? null,
            fileUrls: data.fileUrls ?? [],
          },
        });
      }

      emitHomeworkEvent({ submissionId: latest.id, lessonId: data.lessonId, userId: session.user.id });
    } else {
      const created = await prisma.homeworkSubmission.create({
        data: {
          lessonId: data.lessonId,
          userId: session.user.id,
          content: data.content,
          fileUrl: data.fileUrls?.[0] ?? data.fileUrl ?? null,
          fileUrls: data.fileUrls ?? [],
          status: nextStatus,
        },
        select: { id: true },
      });

      if (allowChat) {
        await prisma.chatMessage.create({
          data: {
            submissionId: created.id,
            userId: session.user.id,
            content: data.content,
            fileUrl: data.fileUrls?.[0] ?? data.fileUrl ?? null,
            fileUrls: data.fileUrls ?? [],
          },
        });
      }

      emitHomeworkEvent({ submissionId: created.id, lessonId: data.lessonId, userId: session.user.id });
    }

    await notifyStaffHomeworkSubmitted({
      productId: lesson.productId,
      productTitle: lesson.product.title,
      lessonTitle: lesson.title,
      studentId: session.user.id,
      studentName: session.user.name ?? null,
      studentEmail: session.user.email ?? "",
    });

    revalidatePath(`/learn/${lesson.product.slug}/${lesson.slug}`);
    revalidatePath(`/learn/${lesson.product.slug}/homework`);
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
        fileUrls: submission.fileUrls,
        content: submission.content,
        createdAt: submission.createdAt.toISOString(),
        updatedAt: submission.updatedAt.toISOString(),
        messages: submission.messages.map((m) => ({
          id: m.id,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
          fileUrl: m.fileUrl,
          fileUrls: m.fileUrls,
          replyToId: m.replyToId,
          user: { name: m.user.name, email: m.user.email, role: m.user.role },
        })),
      },
    } as const;
  } catch (error) {
    console.error("[getHomeworkThread]", error);
    return { error: "Произошла ошибка" } as const;
  }
}

export async function markHomeworkCompleted(lessonId: string) {
  const session = await auth();
  if (!session) return { error: "Необходимо войти в аккаунт" } as const;

  try {
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, homeworkEnabled: true, productId: true, slug: true, product: { select: { slug: true } } },
    });
    if (!lesson) return { error: "Урок не найден" } as const;
    if (!lesson.homeworkEnabled) return { error: "У урока нет домашнего задания" } as const;

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_productId: { userId: session.user.id, productId: lesson.productId },
      },
      select: { id: true },
    });
    if (!enrollment) return { error: "Нет доступа к курсу" } as const;

    const enrollmentCrit = await loadEnrollmentForCriteriaByUserProduct(session.user.id, lesson.productId);
    if (!enrollmentCrit || !enrollmentHasCriterion(enrollmentCrit, "TASKS")) {
      return { error: "В вашем тарифе нет доступа к заданиям" } as const;
    }
    if (enrollmentHasCriterion(enrollmentCrit, "HOMEWORK_REVIEW")) {
      return { error: "В вашем тарифе предусмотрена проверка ДЗ — отметка доступна только без проверки" } as const;
    }

    const latest = await prisma.homeworkSubmission.findFirst({
      where: { lessonId: lesson.id, userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    const submissionId = latest?.id ?? null;
    if (submissionId) {
      await prisma.homeworkSubmission.update({
        where: { id: submissionId },
        data: { status: "APPROVED" },
      });
      emitHomeworkEvent({ submissionId, lessonId: lesson.id, userId: session.user.id });
    } else {
      const created = await prisma.homeworkSubmission.create({
        data: {
          lessonId: lesson.id,
          userId: session.user.id,
          content: null,
          fileUrl: null,
          fileUrls: [],
          status: "APPROVED",
        },
        select: { id: true },
      });
      emitHomeworkEvent({ submissionId: created.id, lessonId: lesson.id, userId: session.user.id });
    }

    revalidatePath(`/learn/${lesson.product.slug}/${lesson.slug}`);
    return { success: true } as const;
  } catch (error) {
    console.error("[markHomeworkCompleted]", error);
    return { error: "Произошла ошибка" } as const;
  }
}
