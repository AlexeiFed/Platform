import { createHash, timingSafeEqual } from "crypto";

/**
 * Проверка подлинности HTTP-уведомления ЮMoney по полю `sha1_hash`.
 * @see https://yoomoney.ru/docs/payment-buttons/using-api/notifications
 */
export function verifyYooMoneyNotificationSha1(
  body: URLSearchParams,
  notificationSecret: string
): boolean {
  const sha1Hash = body.get("sha1_hash");
  if (!sha1Hash || !/^[a-f0-9]{40}$/i.test(sha1Hash)) return false;

  const notification_type = body.get("notification_type") ?? "";
  const operation_id = body.get("operation_id") ?? "";
  const amount = body.get("amount") ?? "";
  const currency = body.get("currency") ?? "";
  const datetime = body.get("datetime") ?? "";
  const sender = body.get("sender") ?? "";
  const rawCodepro = body.get("codepro");
  const codepro = rawCodepro === "true" || rawCodepro === "1" ? "true" : "false";
  const label = body.get("label") ?? "";

  const checkString = `${notification_type}&${operation_id}&${amount}&${currency}&${datetime}&${sender}&${codepro}&${notificationSecret}&${label}`;
  const digest = createHash("sha1").update(checkString, "utf8").digest("hex");

  try {
    return timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(sha1Hash.toLowerCase(), "hex"));
  } catch {
    return false;
  }
}
