/**
 * Web Push (VAPID): рассылка подписчикам из таблицы push_subscriptions.
 * Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, опционально VAPID_SUBJECT (mailto:… или https:…).
 */
import webpush from "web-push";
import { prisma } from "@/lib/prisma";

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!pub || !priv) return false;
  const subject =
    process.env.VAPID_SUBJECT?.trim() ||
    (process.env.SMTP_FROM?.includes("@") ? `mailto:${process.env.SMTP_FROM}` : "mailto:noreply@localhost");
  webpush.setVapidDetails(subject, pub, priv);
  vapidConfigured = true;
  return true;
}

export async function sendWebPushToUserIds(
  userIds: string[],
  payload: { title: string; body: string; url?: string }
): Promise<void> {
  if (!ensureVapidConfigured()) return;
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return;

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: unique } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (subs.length === 0) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
  });

  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 3600, urgency: "normal" }
        );
      } catch (err: unknown) {
        const status = typeof err === "object" && err !== null && "statusCode" in err ? (err as { statusCode: number }).statusCode : undefined;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.deleteMany({ where: { id: s.id } });
        } else {
          console.error("[sendWebPushToUserIds]", err);
        }
      }
    })
  );
}
