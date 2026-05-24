/**
 * Уведомления по ДЗ: мессенджеры (Telegram/MAX) + опциональный email.
 */
import { prisma } from "@/lib/prisma";
import {
  appOrigin,
  sendNotificationToUsers,
} from "@/lib/notification-channels/send";

async function staffHomeworkTargets(productId: string): Promise<{ userIds: string[] }> {
  const [admins, assignments] = await Promise.all([
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } }),
    prisma.productCurator.findMany({
      where: { productId },
      select: { curator: { select: { id: true } } },
    }),
  ]);
  const idSet = new Set<string>();
  for (const row of admins) idSet.add(row.id);
  for (const row of assignments) idSet.add(row.curator.id);
  return { userIds: [...idSet] };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Студент отправил / обновил работу по уроку */
export async function notifyStaffHomeworkSubmitted(input: {
  productId: string;
  productTitle: string;
  lessonTitle: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string;
}) {
  try {
    const { userIds: staffUserIds } = await staffHomeworkTargets(input.productId);
    if (staffUserIds.length === 0) return;

    const who = input.studentName?.trim() || input.studentEmail;
    const link = `${appOrigin()}/admin/homework?productId=${encodeURIComponent(input.productId)}&userId=${encodeURIComponent(input.studentId)}`;

    const subject = `ДЗ: ${who} — ${input.lessonTitle}`;
    const html = `
    <p><strong>${escapeHtml(who)}</strong> (${escapeHtml(input.studentEmail)}) сдал(а) домашнее задание.</p>
    <p>Курс: <strong>${escapeHtml(input.productTitle)}</strong><br/>
    Урок: <strong>${escapeHtml(input.lessonTitle)}</strong></p>
    <p><a href="${escapeHtml(link)}">Открыть в админке</a></p>
  `.trim();

    await sendNotificationToUsers(staffUserIds, {
      title: "Новое ДЗ",
      body: `${who}: ${input.lessonTitle}`,
      url: link,
      email: { subject, html },
    });
  } catch (e) {
    console.error("[notifyStaffHomeworkSubmitted]", e);
  }
}

/** Админ или куратор написал в треде ДЗ — уведомление студенту */
export async function notifyStudentHomeworkStaffMessage(input: {
  studentUserId: string;
  lessonId: string;
  lessonTitle: string;
  productTitle: string;
  productSlug: string;
  preview: string;
}) {
  try {
    const learnUrl = `${appOrigin()}/learn/${encodeURIComponent(input.productSlug)}/homework?lessonId=${encodeURIComponent(input.lessonId)}`;
    const subject = `Ответ по ДЗ: ${input.lessonTitle}`;
    const trimmed = input.preview.replace(/\s+/g, " ").trim();
    const short = trimmed.length > 280 ? `${trimmed.slice(0, 280)}…` : trimmed;
    const html = `
    <p>По уроку <strong>${escapeHtml(input.lessonTitle)}</strong> (${escapeHtml(input.productTitle)}) есть новое сообщение от куратора или администратора.</p>
    <blockquote style="border-left:3px solid #ccc;padding-left:8px;margin:8px 0;">${escapeHtml(short)}</blockquote>
    <p><a href="${escapeHtml(learnUrl)}">Открыть переписку</a></p>
  `.trim();

    await sendNotificationToUsers([input.studentUserId], {
      title: "Ответ по ДЗ",
      body: `Сообщение по уроку «${input.lessonTitle}»`,
      url: learnUrl,
      email: { subject, html },
    });
  } catch (e) {
    console.error("[notifyStudentHomeworkStaffMessage]", e);
  }
}

/** Студент написал сообщение в треде ДЗ */
export async function notifyStaffHomeworkChatMessage(input: {
  productId: string;
  productTitle: string;
  productSlug: string;
  lessonId: string;
  lessonTitle: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string;
  preview: string;
}) {
  try {
    const { userIds: staffUserIds } = await staffHomeworkTargets(input.productId);
    if (staffUserIds.length === 0) return;

    const who = input.studentName?.trim() || input.studentEmail;
    const link = `${appOrigin()}/admin/homework?productId=${encodeURIComponent(input.productId)}&userId=${encodeURIComponent(input.studentId)}`;
    const trimmed = input.preview.replace(/\s+/g, " ").trim();
    const short = trimmed.length > 280 ? `${trimmed.slice(0, 280)}…` : trimmed;

    const subject = `Сообщение по ДЗ: ${who} — ${input.lessonTitle}`;
    const html = `
    <p><strong>${escapeHtml(who)}</strong> (${escapeHtml(input.studentEmail)}) написал(а) сообщение в треде ДЗ.</p>
    <p>Курс: <strong>${escapeHtml(input.productTitle)}</strong><br/>
    Урок: <strong>${escapeHtml(input.lessonTitle)}</strong></p>
    <blockquote style="border-left:3px solid #ccc;padding-left:8px;margin:8px 0;">${escapeHtml(short)}</blockquote>
    <p><a href="${escapeHtml(link)}">Открыть в админке</a></p>
  `.trim();

    await sendNotificationToUsers(staffUserIds, {
      title: "Сообщение по ДЗ",
      body: `${who}: ${input.lessonTitle}`,
      url: link,
      email: { subject, html },
    });
  } catch (e) {
    console.error("[notifyStaffHomeworkChatMessage]", e);
  }
}

/** Куратор/админ принял или отклонил ДЗ */
export async function notifyStudentHomeworkReviewed(input: {
  studentUserId: string;
  lessonId: string;
  lessonTitle: string;
  productTitle: string;
  productSlug: string;
  status: "APPROVED" | "REJECTED";
}) {
  try {
    const learnUrl = `${appOrigin()}/learn/${encodeURIComponent(input.productSlug)}/homework?lessonId=${encodeURIComponent(input.lessonId)}`;
    const isApproved = input.status === "APPROVED";
    const verbRu = isApproved ? "принято" : "отправлено на доработку";
    const subject = `ДЗ ${verbRu}: ${input.lessonTitle}`;
    const html = `
    <p>Ваше домашнее задание по уроку <strong>${escapeHtml(input.lessonTitle)}</strong> (${escapeHtml(input.productTitle)}) ${escapeHtml(verbRu)}.</p>
    <p><a href="${escapeHtml(learnUrl)}">Открыть урок</a></p>
  `.trim();

    await sendNotificationToUsers([input.studentUserId], {
      title: isApproved ? "ДЗ принято" : "ДЗ на доработку",
      body: `Урок «${input.lessonTitle}»`,
      url: learnUrl,
      email: { subject, html },
    });
  } catch (e) {
    console.error("[notifyStudentHomeworkReviewed]", e);
  }
}
