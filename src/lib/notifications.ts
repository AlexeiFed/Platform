/**
 * notifications.ts
 * Утилиты для отправки уведомлений: Email (nodemailer) и Telegram Bot API.
 * Конфигурируется через переменные окружения — при их отсутствии уведомления молча пропускаются.
 */

import nodemailer from "nodemailer";

// === Email ===

function getTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: process.env.SMTP_SECURE !== "false",
    auth: { user, pass },
  });
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}) {
  const transport = getTransport();
  if (!transport) return; // env не настроен — тихо пропускаем
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
  } catch (err) {
    console.error("[sendEmail]", err);
  }
}

// === Telegram ===

/**
 * Отправляет сообщение в Telegram-чат или группу через Bot API.
 * Требуются env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 */
export async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch (err) {
    console.error("[sendTelegram]", err);
  }
}
