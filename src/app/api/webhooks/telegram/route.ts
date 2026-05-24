import { NextResponse } from "next/server";
import { linkNotificationChannelByToken } from "@/lib/notification-channels/link-token";
import {
  sendTelegramMessage,
  verifyTelegramWebhookSecret,
} from "@/lib/notification-channels/telegram-client";
import { appOrigin } from "@/lib/notification-channels/send";

type TelegramUpdate = {
  message?: {
    chat?: { id?: number };
    text?: string;
  };
};

function parseStartToken(text: string | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith("/start ")) return trimmed.slice(7).trim() || null;
  if (trimmed === "/start") return null;
  return null;
}

export async function POST(req: Request) {
  if (!verifyTelegramWebhookSecret(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const chatId = update.message?.chat?.id;
  const token = parseStartToken(update.message?.text);
  if (chatId == null || !token) {
    return NextResponse.json({ ok: true });
  }

  const linked = await linkNotificationChannelByToken("TELEGRAM", String(chatId), token);
  if (!linked.ok) {
    await sendTelegramMessage(
      String(chatId),
      "Ссылка недействительна или устарела. Откройте настройки уведомлений в LearnHub и подключите Telegram снова."
    );
    return NextResponse.json({ ok: true });
  }

  const siteUrl = appOrigin();
  await sendTelegramMessage(
    String(chatId),
    `✅ Уведомления LearnHub подключены.\n\n<a href="${siteUrl}">Вернуться в приложение</a>`
  );

  return NextResponse.json({ ok: true });
}
