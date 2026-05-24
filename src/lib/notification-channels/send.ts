import type { NotificationChannelType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/notifications";
import { sendTelegramMessage } from "@/lib/notification-channels/telegram-client";
import { sendMaxMessage } from "@/lib/notification-channels/max-client";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function messengerText(payload: { title: string; body: string; url?: string }): string {
  const lines = [`<b>${escapeHtml(payload.title)}</b>`, escapeHtml(payload.body)];
  if (payload.url) {
    lines.push(`<a href="${escapeHtml(payload.url)}">Открыть</a>`);
  }
  return lines.join("\n");
}

async function deactivateChannel(channelId: string) {
  await prisma.notificationChannel.update({
    where: { id: channelId },
    data: { isActive: false },
  });
}

async function sendToChannel(
  channel: { id: string; type: NotificationChannelType; externalId: string },
  text: string
) {
  if (channel.type === "TELEGRAM") {
    const result = await sendTelegramMessage(channel.externalId, text);
    if (result.blocked) await deactivateChannel(channel.id);
    return;
  }
  if (channel.type === "MAX") {
    const result = await sendMaxMessage(channel.externalId, text);
    if (result.blocked) await deactivateChannel(channel.id);
  }
}

export async function sendNotificationToUsers(
  userIds: string[],
  payload: {
    title: string;
    body: string;
    url?: string;
    email?: { subject: string; html: string };
  }
): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return;

  const text = messengerText(payload);

  const [channels, preferences, users] = await Promise.all([
    prisma.notificationChannel.findMany({
      where: { userId: { in: unique }, isActive: true },
      select: { id: true, userId: true, type: true, externalId: true },
    }),
    prisma.userNotificationPreference.findMany({
      where: { userId: { in: unique }, emailEnabled: true },
      select: { userId: true },
    }),
    payload.email
      ? prisma.user.findMany({
          where: { id: { in: unique } },
          select: { id: true, email: true },
        })
      : Promise.resolve([]),
  ]);

  await Promise.allSettled(channels.map((ch) => sendToChannel(ch, text)));

  if (payload.email) {
    const emailEnabledIds = new Set(preferences.map((p) => p.userId));
    await Promise.allSettled(
      users
        .filter((u) => emailEnabledIds.has(u.id))
        .map((u) =>
          sendEmail({
            to: u.email,
            subject: payload.email!.subject,
            html: payload.email!.html,
          })
        )
    );
  }
}

export function appOrigin(): string {
  const fromEnv = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
