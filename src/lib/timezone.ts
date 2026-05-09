/**
 * Часовая зона проекта — Хабаровск (Asia/Vladivostok, UTC+10, без перехода на летнее время).
 * Используется как эталон для административных дат видимости/публикации.
 */
export const KHABAROVSK_TZ = "Asia/Vladivostok" as const;
const KHABAROVSK_OFFSET = "+10:00" as const;

/**
 * Преобразует строку из <input type="date"> (YYYY-MM-DD) в UTC-инстант,
 * соответствующий 00:00 указанного дня по часовому поясу Хабаровска.
 * Пустая/некорректная строка → null.
 */
export function khabarovskDateInputToUtc(yyyyMmDd: string | null | undefined): Date | null {
  const v = yyyyMmDd?.trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000${KHABAROVSK_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Преобразует UTC-инстант обратно в строку YYYY-MM-DD по дате в Хабаровске
 * (для подстановки в <input type="date">).
 */
export function utcToKhabarovskDateInput(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  // en-CA даёт формат YYYY-MM-DD
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: KHABAROVSK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

/**
 * DD.MM.YYYY по Хабаровску — для отображения в UI.
 */
export function formatKhabarovskDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: KHABAROVSK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Виден ли сейчас (по UTC-инстанту) материал с заданной датой видимости.
 * null/пусто → виден всегда.
 */
export function isVisibleNow(visibilityFrom: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!visibilityFrom) return true;
  const d = typeof visibilityFrom === "string" ? new Date(visibilityFrom) : visibilityFrom;
  if (Number.isNaN(d.getTime())) return true;
  return d.getTime() <= now.getTime();
}
