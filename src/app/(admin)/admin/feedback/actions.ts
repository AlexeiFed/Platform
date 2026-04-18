/**
 * actions.ts — admin feedback
 * Server actions для admin-чата обратной связи: список тредов, сообщения, отправка, прочтение.
 */
"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { sendEmail, sendTelegram } from "@/lib/notifications";

async function assertAdminOrCurator() {
  const session = await auth();
  if (!session) return null;
  if (session.user.role !== "ADMIN" && session.user.role !== "CURATOR") return null;
  return session;
}

// === Список тредов (студенты с сообщениями) ===

export async function getAdminFeedbackThreads() {
  const session = await assertAdminOrCurator();
  if (!session) return { error: "Нет доступа" };

  try {
    // Получаем все enrollments у которых есть хотя бы одно сообщение
    const threads = await prisma.enrollment.findMany({
      where: { feedbackMessages: { some: {} } },
      select: {
        id: true,
        userId: true,
        user: { select: { id: true, name: true, email: true } },
        product: { select: { id: true, title: true } },
        feedbackMessages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, createdAt: true, userId: true },
        },
      },
    });

    // Считаем непрочитанные для каждого треда отдельным запросом
    const threadsWithUnread = await Promise.all(
      threads.map(async (t) => {
        const unreadCount = await prisma.curatorFeedbackMessage.count({
          where: {
            enrollmentId: t.id,
            userId: t.userId, // сообщения именно от студента
            readAt: null,
          },
        });
        const last = t.feedbackMessages[0];
        return {
          enrollmentId: t.id,
          user: t.user,
          product: t.product,
          lastMessage: last
            ? {
                content: last.content.slice(0, 80),
                createdAt: last.createdAt.toISOString(),
                fromStudent: last.userId === t.userId,
              }
            : null,
          unreadCount,
        };
      })
    );

    // Сортируем: сначала с непрочитанными, потом по дате последнего сообщения
    threadsWithUnread.sort((a, b) => {
      if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
      const aDate = a.lastMessage?.createdAt ?? "";
      const bDate = b.lastMessage?.createdAt ?? "";
      return bDate.localeCompare(aDate);
    });

    return { success: true, data: threadsWithUnread };
  } catch (err) {
    console.error("[getAdminFeedbackThreads]", err);
    return { error: "Ошибка загрузки" };
  }
}

// === Сообщения треда ===

export async function getThreadMessages(enrollmentId: string) {
  const session = await assertAdminOrCurator();
  if (!session) return { error: "Нет доступа" };

  try {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { userId: true },
    });
    if (!enrollment) return { error: "Тред не найден" };

    const messages = await prisma.curatorFeedbackMessage.findMany({
      where: { enrollmentId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { name: true, email: true } } },
    });

    return {
      success: true,
      data: {
        studentUserId: enrollment.userId,
        messages: messages.map((m) => ({
          id: m.id,
          userId: m.userId,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
          readAt: m.readAt?.toISOString() ?? null,
          senderName: m.user.name ?? m.user.email,
          fromStudent: m.userId === enrollment.userId,
        })),
      },
    };
  } catch (err) {
    console.error("[getThreadMessages]", err);
    return { error: "Ошибка загрузки" };
  }
}

// === Получить только новые сообщения после метки (polling) ===

export async function pollThreadMessages(enrollmentId: string, since: string) {
  const session = await assertAdminOrCurator();
  if (!session) return { error: "Нет доступа" };

  try {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { userId: true },
    });
    if (!enrollment) return { error: "Тред не найден" };

    const messages = await prisma.curatorFeedbackMessage.findMany({
      where: {
        enrollmentId,
        createdAt: { gt: new Date(since) },
      },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { name: true, email: true } } },
    });

    return {
      success: true,
      data: messages.map((m) => ({
        id: m.id,
        userId: m.userId,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        readAt: m.readAt?.toISOString() ?? null,
        senderName: m.user.name ?? m.user.email,
        fromStudent: m.userId === enrollment.userId,
      })),
    };
  } catch (err) {
    console.error("[pollThreadMessages]", err);
    return { error: "Ошибка" };
  }
}

// === Отправить сообщение от имени куратора/админа ===

const sendSchema = z.object({
  enrollmentId: z.string().uuid(),
  content: z.string().min(1).max(8000),
});

export async function sendAdminFeedbackMessage(
  input: z.infer<typeof sendSchema>
) {
  const session = await assertAdminOrCurator();
  if (!session) return { error: "Нет доступа" };

  try {
    const data = sendSchema.parse(input);

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: data.enrollmentId },
      select: {
        id: true,
        userId: true,
        user: { select: { email: true, name: true } },
        product: { select: { slug: true, title: true } },
      },
    });
    if (!enrollment) return { error: "Тред не найден" };

    const message = await prisma.curatorFeedbackMessage.create({
      data: {
        enrollmentId: data.enrollmentId,
        userId: session.user.id,
        content: data.content,
      },
      select: {
        id: true,
        userId: true,
        content: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    });

    revalidatePath(`/learn/${enrollment.product.slug}/feedback`);

    // === Уведомление студенту по Email ===
    const studentEmail = enrollment.user.email;
    const studentName = enrollment.user.name ?? studentEmail;
    const siteUrl = process.env.AUTH_URL ?? "https://thebesteducation.ru";
    const feedbackUrl = `${siteUrl}/learn/${enrollment.product.slug}/feedback`;

    await sendEmail({
      to: studentEmail,
      subject: `Новое сообщение от куратора — ${enrollment.product.title}`,
      html: `
        <p>Привет, ${studentName}!</p>
        <p>Куратор ответил вам по курсу <strong>${enrollment.product.title}</strong>:</p>
        <blockquote style="border-left:3px solid #f97316;padding:8px 16px;margin:12px 0;color:#555">
          ${data.content.replace(/\n/g, "<br/>")}
        </blockquote>
        <p><a href="${feedbackUrl}" style="color:#f97316">Открыть чат</a></p>
      `,
    });

    return {
      success: true,
      data: {
        id: message.id,
        userId: message.userId,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        readAt: null,
        senderName: message.user.name ?? message.user.email,
        fromStudent: false,
      },
    };
  } catch (err) {
    if (err instanceof z.ZodError) return { error: "Некорректные данные" };
    console.error("[sendAdminFeedbackMessage]", err);
    return { error: "Ошибка отправки" };
  }
}

// === Пометить все сообщения студента в треде как прочитанные ===

export async function markThreadRead(enrollmentId: string) {
  const session = await assertAdminOrCurator();
  if (!session) return { error: "Нет доступа" };

  try {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { userId: true },
    });
    if (!enrollment) return { success: true }; // тихо

    await prisma.curatorFeedbackMessage.updateMany({
      where: {
        enrollmentId,
        userId: enrollment.userId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return { success: true };
  } catch (err) {
    console.error("[markThreadRead]", err);
    return { error: "Ошибка" };
  }
}

// === Суммарное количество непрочитанных для badge ===

export async function getAdminUnreadCount() {
  const session = await assertAdminOrCurator();
  if (!session) return { count: 0 };

  try {
    const count = await prisma.curatorFeedbackMessage.count({
      where: {
        readAt: null,
        user: { role: "USER" }, // только от студентов (роль USER)
      },
    });
    return { count };
  } catch {
    return { count: 0 };
  }
}

// === Уведомить кураторов/админов при сообщении от студента ===

export async function notifyAdminsOnStudentMessage(opts: {
  studentName: string;
  productTitle: string;
  messageContent: string;
  enrollmentId: string;
}) {
  const siteUrl = process.env.AUTH_URL ?? "https://thebesteducation.ru";
  const feedbackUrl = `${siteUrl}/admin/feedback?enrollment=${opts.enrollmentId}`;

  // Email всем ADMIN и CURATOR пользователям
  try {
    const admins = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "CURATOR"] } },
      select: { email: true },
    });

    await Promise.all(
      admins.map((admin) =>
        sendEmail({
          to: admin.email,
          subject: `Новое сообщение от студента — ${opts.productTitle}`,
          html: `
            <p>Студент <strong>${opts.studentName}</strong> написал в чат обратной связи по курсу <strong>${opts.productTitle}</strong>:</p>
            <blockquote style="border-left:3px solid #f97316;padding:8px 16px;margin:12px 0;color:#555">
              ${opts.messageContent.replace(/\n/g, "<br/>")}
            </blockquote>
            <p><a href="${feedbackUrl}" style="color:#f97316">Открыть чат</a></p>
          `,
        })
      )
    );
  } catch (err) {
    console.error("[notifyAdminsOnStudentMessage:email]", err);
  }

  // Telegram
  const telegramText =
    `💬 <b>Новое сообщение</b>\n` +
    `👤 Студент: ${opts.studentName}\n` +
    `📚 Курс: ${opts.productTitle}\n\n` +
    `${opts.messageContent.slice(0, 300)}${opts.messageContent.length > 300 ? "…" : ""}\n\n` +
    `<a href="${feedbackUrl}">Открыть чат</a>`;

  await sendTelegram(telegramText);
}
