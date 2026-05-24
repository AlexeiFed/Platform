import { NextResponse } from "next/server";
import { linkNotificationChannelByToken } from "@/lib/notification-channels/link-token";
import {
  maxRecipientId,
  parseMaxStartToken,
  sendMaxMessage,
  verifyMaxWebhookSecret,
  type MaxUpdate,
} from "@/lib/notification-channels/max-client";
import { appOrigin } from "@/lib/notification-channels/send";

export async function POST(req: Request) {
  if (!verifyMaxWebhookSecret(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let update: MaxUpdate;
  try {
    update = (await req.json()) as MaxUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const token = parseMaxStartToken(update);
  const recipientId = maxRecipientId(update);

  if (!token || !recipientId) {
    return NextResponse.json({ ok: true });
  }

  const linked = await linkNotificationChannelByToken("MAX", recipientId, token);
  if (!linked.ok) {
    await sendMaxMessage(
      recipientId,
      "Ссылка недействительна или устарела. Откройте настройки уведомлений в LearnHub и подключите MAX снова."
    );
    return NextResponse.json({ ok: true });
  }

  const siteUrl = appOrigin();
  await sendMaxMessage(
    recipientId,
    `✅ Уведомления LearnHub подключены.\n\n<a href="${siteUrl}">Вернуться в приложение</a>`
  );

  return NextResponse.json({ ok: true });
}
