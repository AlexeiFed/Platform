import { getResolvedMarathonTimeZone } from "@/lib/marathon-time-zone";

const DATETIME_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/;

/**
 * Строка из <input type="datetime-local"> — без смещения часового пояса.
 * Интерпретируем как местное «настенное» время в зоне марафона (MARATHON_TIME_ZONE), в БД кладём UTC instant.
 */
export function parseDatetimeLocalInTimeZone(local: string, timeZone: string): Date | null {
  const m = DATETIME_LOCAL_RE.exec(local.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mon = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6] ?? 0);

  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const wallKeyAt = (instant: number): string => {
    const parts = fmt.formatToParts(new Date(instant));
    const pick = (t: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === t)?.value ?? "00";
    return `${pick("year")}-${pick("month")}-${pick("day")}T${pick("hour")}:${pick("minute")}:${pick("second")}`;
  };

  const target = `${String(y).padStart(4, "0")}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  const start = Date.UTC(y, mon - 1, d, 0, 0, 0) - 48 * 3600 * 1000;
  const end = start + 96 * 3600 * 1000;
  for (let t = start; t <= end; t += 60 * 1000) {
    if (wallKeyAt(t) === target) return new Date(t);
  }
  return null;
}

/** Пусто → null; datetime-local → зона марафона; иначе обычный Date (ISO с Z и т.д.). */
export function parseOptionalDateTimeLocalInMarathonZone(value?: string | null): Date | null {
  if (!value?.trim()) return null;
  const v = value.trim();
  if (DATETIME_LOCAL_RE.test(v)) {
    const tz = getResolvedMarathonTimeZone();
    return parseDatetimeLocalInTimeZone(v, tz) ?? new Date(v);
  }
  return new Date(v);
}

/** UTC из БД → значение для datetime-local в зоне марафона. */
export function formatUtcIsoForDatetimeLocal(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const pick = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "00";
  return `${pick("year")}-${pick("month")}-${pick("day")}T${pick("hour")}:${pick("minute")}`;
}
