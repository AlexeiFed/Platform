/**
 * Web Push (VAPID): рассылка подписчикам из таблицы push_subscriptions.
 * Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:реальный@домен или https://домен).
 */
import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { isApplePushEndpoint, resolveVapidSubject } from "@/lib/push-vapid";

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

let vapidConfigured = false;
let vapidSubjectUsed: string | null = null;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;

  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!pub || !priv) {
    console.error(
      "[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY не заданы в окружении сервера. " +
        "Push не будет отправлен. Проверьте что переменные доступны в рантайме (pm2/systemd/docker)."
    );
    return false;
  }

  const subject = resolveVapidSubject();
  if (!subject) {
    console.error(
      "[push] VAPID_SUBJECT не задан или невалиден для Apple. " +
        "Задайте VAPID_SUBJECT=mailto:admin@ваш-домен.ru или https://ваш-домен.ru " +
        "(не localhost). Без этого iPhone не получит push, Android может работать."
    );
    return false;
  }

  try {
    webpush.setVapidDetails(subject, pub, priv);
  } catch (e) {
    console.error("[push] webpush.setVapidDetails failed — проверьте формат VAPID-ключей", e);
    return false;
  }
  vapidConfigured = true;
  vapidSubjectUsed = subject;
  console.info("[push] VAPID настроен, subject=", subject);
  return true;
}

export function getVapidSubjectForDiagnostics(): string | null {
  return vapidSubjectUsed ?? resolveVapidSubject();
}

export { isInvalidAppleVapidSubject, resolveVapidSubject } from "@/lib/push-vapid";

export async function sendWebPushToUserIds(
  userIds: string[],
  payload: { title: string; body: string; url?: string }
): Promise<void> {
  if (!ensureVapidConfigured()) return;
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) {
    console.info("[push] sendWebPushToUserIds: пустой список userIds");
    return;
  }

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: unique } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (subs.length === 0) {
    console.warn(
      `[push] нет подписок для userIds=[${unique.join(",")}]. Получатели не нажимали кнопку «колокольчик» в шапке либо подписка была удалена браузером.`
    );
    return;
  }
  console.info(`[push] отправляю ${subs.length} подпискам для ${unique.length} пользователей: "${payload.title}"`);

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
  });

  await Promise.allSettled(
    subs.map(async (s) => {
      const apple = isApplePushEndpoint(s.endpoint);
      try {
        const result = await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 3600, urgency: apple ? "high" : "normal" }
        );

        if (apple && result.statusCode !== 201) {
          console.warn("[push] Apple endpoint non-201:", result.statusCode, s.endpoint.slice(0, 48));
        }
      } catch (err: unknown) {
        const status =
          typeof err === "object" && err !== null && "statusCode" in err
            ? (err as { statusCode: number }).statusCode
            : undefined;
        const errBody =
          typeof err === "object" && err !== null && "body" in err
            ? String((err as { body: string }).body)
            : "";

        if (status === 404 || status === 410) {
          await prisma.pushSubscription.deleteMany({ where: { id: s.id } });
          return;
        }

        if (apple && status === 403) {
          console.error(
            "[push] Apple 403 — проверьте VAPID_SUBJECT (реальный email/домен, не localhost).",
            "subject=",
            getVapidSubjectForDiagnostics(),
            errBody || err
          );
          return;
        }

        console.error("[push] send failed", apple ? "apple" : "other", status, err);
      }
    })
  );
}
