import { MAX_API_BASE } from "@/lib/notification-channels/constants";

function getToken(): string | null {
  return process.env.MAX_BOT_TOKEN?.trim() || null;
}

export function isMaxConfigured(): boolean {
  return Boolean(getToken() && (process.env.MAX_BOT_USERNAME?.trim() || process.env.MAX_BOT_LINK_BASE?.trim()));
}

export function verifyMaxWebhookSecret(req: Request): boolean {
  const secret = process.env.MAX_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  return req.headers.get("x-max-bot-api-secret") === secret;
}

export async function sendMaxMessage(
  recipientId: string,
  text: string,
  options?: { format?: "html" | "markdown" }
): Promise<{ ok: boolean; blocked?: boolean }> {
  const token = getToken();
  if (!token) return { ok: false };

  const params = new URLSearchParams({ user_id: recipientId });

  try {
    const res = await fetch(`${MAX_API_BASE}/messages?${params}`, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        format: options?.format ?? "html",
        notify: true,
      }),
    });

    if (res.ok) return { ok: true };

    const body = await res.text().catch(() => "");
    const blocked = res.status === 403 || body.toLowerCase().includes("blocked");
    console.error("[max] sendMessage failed", res.status, body);
    return { ok: false, blocked };
  } catch (err) {
    console.error("[max] sendMessage", err);
    return { ok: false };
  }
}

export type MaxUpdate = {
  update_type?: string;
  payload?: string | null;
  chat_id?: number;
  user?: { user_id?: number; name?: string };
  message?: {
    body?: { text?: string };
    sender?: { user_id?: number };
  };
};

export function parseMaxStartToken(update: MaxUpdate): string | null {
  if (update.update_type === "bot_started" && update.payload) {
    return update.payload.trim() || null;
  }
  const text = update.message?.body?.text?.trim();
  if (text?.startsWith("/start ")) {
    return text.slice(7).trim() || null;
  }
  if (text === "/start") return null;
  return null;
}

export function maxRecipientId(update: MaxUpdate): string | null {
  if (update.update_type === "bot_started") {
    if (update.user?.user_id != null) return String(update.user.user_id);
    if (update.chat_id != null) return String(update.chat_id);
  }
  if (update.message?.sender?.user_id != null) {
    return String(update.message.sender.user_id);
  }
  if (update.chat_id != null) return String(update.chat_id);
  return null;
}
