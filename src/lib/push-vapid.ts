/**
 * VAPID subject для Web Push.
 * Apple (web.push.apple.com) отклоняет @localhost и placeholder-домены — 403 BadJwtToken, без ошибки в UI.
 * FCM/Android при этом часто работает → типичный симптом «на Android ок, на iPhone нет».
 */

export function isInvalidAppleVapidSubject(subject: string): boolean {
  const s = subject.trim().toLowerCase();
  if (!s) return true;
  if (s.includes("localhost") || s.includes("127.0.0.1")) return true;

  if (s.startsWith("mailto:")) {
    const email = s.slice("mailto:".length);
    const at = email.lastIndexOf("@");
    if (at < 1) return true;
    const domain = email.slice(at + 1);
    if (!domain.includes(".")) return true;
    return false;
  }

  if (s.startsWith("https://") || s.startsWith("http://")) {
    try {
      const host = new URL(s).hostname;
      return host === "localhost" || host === "127.0.0.1";
    } catch {
      return true;
    }
  }

  return true;
}

/** Валидный subject для web-push.setVapidDetails или null. */
export function resolveVapidSubject(): string | null {
  const explicit = process.env.VAPID_SUBJECT?.trim();
  if (explicit && !isInvalidAppleVapidSubject(explicit)) {
    return explicit;
  }

  for (const key of ["NEXTAUTH_URL", "AUTH_URL"] as const) {
    const raw = process.env[key]?.trim();
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") continue;
      if (url.protocol === "https:") return url.origin;
      if (url.protocol === "http:") return url.origin;
    } catch {
      /* ignore */
    }
  }

  const smtp = process.env.SMTP_FROM?.trim();
  if (smtp) {
    const mailto = smtp.startsWith("mailto:") ? smtp : `mailto:${smtp}`;
    if (!isInvalidAppleVapidSubject(mailto)) return mailto;
  }

  return null;
}

export function isApplePushEndpoint(endpoint: string): boolean {
  return endpoint.includes("web.push.apple.com");
}
