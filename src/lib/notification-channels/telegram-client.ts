const TELEGRAM_API = "https://api.telegram.org";

function getToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

export function isTelegramConfigured(): boolean {
  return Boolean(getToken() && process.env.TELEGRAM_BOT_USERNAME?.trim());
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: { parseMode?: "HTML" | "Markdown" }
): Promise<{ ok: boolean; blocked?: boolean }> {
  const token = getToken();
  if (!token) return { ok: false };

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options?.parseMode ?? "HTML",
        disable_web_page_preview: false,
      }),
    });

    if (res.ok) return { ok: true };

    const data = (await res.json().catch(() => ({}))) as {
      description?: string;
      error_code?: number;
    };
    const blocked =
      data.error_code === 403 ||
      (data.description?.toLowerCase().includes("blocked") ?? false) ||
      (data.description?.toLowerCase().includes("deactivated") ?? false);

    console.error("[telegram] sendMessage failed", data);
    return { ok: false, blocked };
  } catch (err) {
    console.error("[telegram] sendMessage", err);
    return { ok: false };
  }
}

export function verifyTelegramWebhookSecret(req: Request): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  return req.headers.get("x-telegram-bot-api-secret-token") === secret;
}
