/**
 * Email-уведомления по ДЗ: сдача студентом → админы и кураторы продукта;
 * ответ сотрудника в чате ДЗ → студент.
 */
import { prisma } from "@/lib/prisma";
import { sendEmail, sendTelegram } from "@/lib/notifications";
import { sendWebPushToUserIds } from "@/lib/push-send";

function appOrigin() {
  const fromEnv = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

async function staffHomeworkTargets(productId: string): Promise<{ emails: string[]; userIds: string[] }> {
  const [admins, assignments] = await Promise.all([
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, email: true } }),
    prisma.productCurator.findMany({
      where: { productId },
      select: { curator: { select: { id: true, email: true } } },
    }),
  ]);
  const emailSet = new Set<string>();
  const idSet = new Set<string>();
  for (const row of admins) {
    emailSet.add(row.email);
    idSet.add(row.id);
  }
  for (const row of assignments) {
    emailSet.add(row.curator.email);
    idSet.add(row.curator.id);
  }
  return { emails: [...emailSet], userIds: [...idSet] };
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
    const { emails: recipients, userIds: staffUserIds } = await staffHomeworkTargets(input.productId);
    if (recipients.length === 0 && staffUserIds.length === 0) return;

    const who = input.studentName?.trim() || input.studentEmail;
    const link = `${appOrigin()}/admin/homework?productId=${encodeURIComponent(input.productId)}&userId=${encodeURIComponent(input.studentId)}`;

    const subject = `ДЗ: ${who} — ${input.lessonTitle}`;
    const html = `
    <p><strong>${escapeHtml(who)}</strong> (${escapeHtml(input.studentEmail)}) сдал(а) домашнее задание.</p>
    <p>Курс: <strong>${escapeHtml(input.productTitle)}</strong><br/>
    Урок: <strong>${escapeHtml(input.lessonTitle)}</strong></p>
    <p><a href="${escapeHtml(link)}">Открыть в админке</a></p>
  `.trim();

    if (recipients.length > 0) {
      await Promise.all(
        recipients.map((to) =>
          sendEmail({
            to,
            subject,
            html,
          })
        )
      );
    }

    const tg = `📚 <b>Новое ДЗ</b>\n${escapeHtml(who)}\n${escapeHtml(input.productTitle)}\nУрок: ${escapeHtml(input.lessonTitle)}\n${escapeHtml(link)}`;
    await sendTelegram(tg);

    await sendWebPushToUserIds(staffUserIds, {
      title: "Новое ДЗ",
      body: `${who}: ${input.lessonTitle}`,
      url: link,
    });
  } catch (e) {
    console.error("[notifyStaffHomeworkSubmitted]", e);
  }
}

/** Админ или куратор написал в треде ДЗ — письмо студенту */
export async function notifyStudentHomeworkStaffMessage(input: {
  studentUserId: string;
  lessonId: string;
  lessonTitle: string;
  productTitle: string;
  productSlug: string;
  preview: string;
}) {
  try {
    const student = await prisma.user.findUnique({
      where: { id: input.studentUserId },
      select: { email: true, name: true },
    });
    if (!student) return;

    const learnUrl = `${appOrigin()}/learn/${encodeURIComponent(input.productSlug)}/homework?lessonId=${encodeURIComponent(input.lessonId)}`;
    const subject = `Ответ по ДЗ: ${input.lessonTitle}`;
    const trimmed = input.preview.replace(/\s+/g, " ").trim();
    const short = trimmed.length > 280 ? `${trimmed.slice(0, 280)}…` : trimmed;
    const html = `
    <p>По уроку <strong>${escapeHtml(input.lessonTitle)}</strong> (${escapeHtml(input.productTitle)}) есть новое сообщение от куратора или администратора.</p>
    <blockquote style="border-left:3px solid #ccc;padding-left:8px;margin:8px 0;">${escapeHtml(short)}</blockquote>
    <p><a href="${escapeHtml(learnUrl)}">Открыть переписку</a></p>
  `.trim();

    if (student.email) {
      await sendEmail({ to: student.email, subject, html });
    }

    await sendTelegram(
      `💬 <b>Ответ по ДЗ</b> для ${escapeHtml(student.name ?? student.email)}\n${escapeHtml(input.productTitle)}\n${escapeHtml(input.lessonTitle)}\n${escapeHtml(learnUrl)}`
    );

    await sendWebPushToUserIds([input.studentUserId], {
      title: "Ответ по ДЗ",
      body: `Сообщение по уроку «${input.lessonTitle}»`,
      url: learnUrl,
    });
  } catch (e) {
    console.error("[notifyStudentHomeworkStaffMessage]", e);
  }
}
