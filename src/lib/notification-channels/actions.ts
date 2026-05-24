"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { NotificationChannelType } from "@prisma/client";
import {
  buildMaxDeepLink,
  buildTelegramDeepLink,
  createNotificationLinkToken,
} from "@/lib/notification-channels/link-token";
import { isMaxConfigured } from "@/lib/notification-channels/max-client";
import { isTelegramConfigured } from "@/lib/notification-channels/telegram-client";

const channelTypeSchema = z.enum(["TELEGRAM", "MAX"]);

export type NotificationSettings = {
  email: string;
  emailEnabled: boolean;
  telegram: { connected: boolean; configured: boolean };
  max: { connected: boolean; configured: boolean };
};

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function getNotificationSettings(): Promise<{
  success: boolean;
  data?: NotificationSettings;
  error?: string;
}> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: "Необходимо войти" };

  try {
    const [user, preference, channels] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      }),
      prisma.userNotificationPreference.findUnique({
        where: { userId },
        select: { emailEnabled: true },
      }),
      prisma.notificationChannel.findMany({
        where: { userId, isActive: true },
        select: { type: true },
      }),
    ]);

    if (!user) return { success: false, error: "Пользователь не найден" };

    const connected = new Set(channels.map((c) => c.type));

    return {
      success: true,
      data: {
        email: user.email,
        emailEnabled: preference?.emailEnabled ?? false,
        telegram: {
          connected: connected.has("TELEGRAM"),
          configured: isTelegramConfigured(),
        },
        max: {
          connected: connected.has("MAX"),
          configured: isMaxConfigured(),
        },
      },
    };
  } catch (e) {
    console.error("[getNotificationSettings]", e);
    return { success: false, error: "Не удалось загрузить настройки" };
  }
}

export async function setEmailNotificationsEnabled(enabled: boolean): Promise<{
  success: boolean;
  error?: string;
}> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: "Необходимо войти" };

  try {
    await prisma.userNotificationPreference.upsert({
      where: { userId },
      create: { userId, emailEnabled: enabled },
      update: { emailEnabled: enabled },
    });
    return { success: true };
  } catch (e) {
    console.error("[setEmailNotificationsEnabled]", e);
    return { success: false, error: "Не удалось сохранить настройку" };
  }
}

export async function createMessengerLink(type: NotificationChannelType): Promise<{
  success: boolean;
  data?: { url: string };
  error?: string;
}> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: "Необходимо войти" };

  const parsed = channelTypeSchema.safeParse(type);
  if (!parsed.success) return { success: false, error: "Некорректный канал" };

  if (parsed.data === "TELEGRAM" && !isTelegramConfigured()) {
    return { success: false, error: "Telegram-бот не настроен на сервере" };
  }
  if (parsed.data === "MAX" && !isMaxConfigured()) {
    return { success: false, error: "MAX-бот не настроен на сервере" };
  }

  try {
    const recent = await prisma.notificationLinkToken.count({
      where: {
        userId,
        type: parsed.data,
        createdAt: { gte: new Date(Date.now() - 60_000) },
        usedAt: null,
      },
    });
    if (recent >= 5) {
      return { success: false, error: "Слишком много запросов. Подождите минуту." };
    }

    const { token } = await createNotificationLinkToken(userId, parsed.data);
    const url =
      parsed.data === "TELEGRAM" ? buildTelegramDeepLink(token) : buildMaxDeepLink(token);

    if (!url) {
      return { success: false, error: "Не настроена ссылка на бота" };
    }

    return { success: true, data: { url } };
  } catch (e) {
    console.error("[createMessengerLink]", e);
    return { success: false, error: "Не удалось создать ссылку" };
  }
}

export async function disconnectMessengerChannel(type: NotificationChannelType): Promise<{
  success: boolean;
  error?: string;
}> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: "Необходимо войти" };

  const parsed = channelTypeSchema.safeParse(type);
  if (!parsed.success) return { success: false, error: "Некорректный канал" };

  try {
    await prisma.notificationChannel.updateMany({
      where: { userId, type: parsed.data },
      data: { isActive: false },
    });
    return { success: true };
  } catch (e) {
    console.error("[disconnectMessengerChannel]", e);
    return { success: false, error: "Не удалось отключить канал" };
  }
}
