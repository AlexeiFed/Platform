import { randomBytes } from "crypto";
import type { NotificationChannelType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NOTIFICATION_LINK_TTL_MINUTES } from "@/lib/notification-channels/constants";

function generateToken(): string {
  return randomBytes(18).toString("base64url");
}

export async function createNotificationLinkToken(
  userId: string,
  type: NotificationChannelType
): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + NOTIFICATION_LINK_TTL_MINUTES * 60 * 1000);
  const token = generateToken();

  await prisma.notificationLinkToken.create({
    data: { userId, type, token, expiresAt },
  });

  return { token, expiresAt };
}

export function buildTelegramDeepLink(token: string): string | null {
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  if (!username) return null;
  return `https://t.me/${username}?start=${encodeURIComponent(token)}`;
}

export function buildMaxDeepLink(token: string): string | null {
  const nick = process.env.MAX_BOT_USERNAME?.trim().replace(/^@/, "");
  if (nick) {
    return `https://max.ru/${nick}?start=${encodeURIComponent(token)}`;
  }
  const base = process.env.MAX_BOT_LINK_BASE?.trim();
  if (!base) return null;
  const normalized = base.replace(/\/$/, "");
  const sep = normalized.includes("?") ? "&" : "?";
  return `${normalized}${sep}start=${encodeURIComponent(token)}`;
}

export async function linkNotificationChannelByToken(
  type: NotificationChannelType,
  externalId: string,
  token: string
): Promise<{ ok: boolean; userId?: string }> {
  const row = await prisma.notificationLinkToken.findUnique({
    where: { token },
  });

  if (!row || row.type !== type || row.usedAt) return { ok: false };
  if (row.expiresAt < new Date()) return { ok: false };

  await prisma.$transaction([
    prisma.notificationLinkToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    prisma.notificationChannel.upsert({
      where: { userId_type: { userId: row.userId, type } },
      create: { userId: row.userId, type, externalId, isActive: true },
      update: { externalId, isActive: true, linkedAt: new Date() },
    }),
  ]);

  return { ok: true, userId: row.userId };
}
