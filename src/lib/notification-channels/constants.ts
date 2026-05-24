import type { NotificationChannelType } from "@prisma/client";

export const NOTIFICATION_LINK_TTL_MINUTES = Number(
  process.env.NOTIFICATION_LINK_TTL_MINUTES ?? 15
);

export const MAX_API_BASE = "https://platform-api.max.ru";

/** Включить кнопку «Подключить» MAX в UI (бот ещё не готов у заказчика). */
export const MAX_MESSENGER_CONNECT_ENABLED = false;

export type MessengerChannelType = NotificationChannelType;
