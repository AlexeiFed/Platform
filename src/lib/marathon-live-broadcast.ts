import { getMarathonEventDate } from "@/lib/marathon-progress";
import { getResolvedMarathonTimeZone, resolveMarathonTimeZone } from "@/lib/marathon-time-zone";

/** Ключ даты YYYY-MM-DD в заданной TZ (как в marathon-progress). */
export const marathonDateKeyInZone = (value: Date | string, timeZone?: string): string => {
  const tz = timeZone !== undefined ? resolveMarathonTimeZone(timeZone) : getResolvedMarathonTimeZone();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "00";
  const day = parts.find((p) => p.type === "day")?.value ?? "00";

  return `${year}-${month}-${day}`;
};

export type LiveBroadcastEventFields = {
  dayOffset: number;
  scheduledAt: Date | string | null;
  productStartDate: Date | string | null;
};

/** День эфира для сравнения с «сегодня» (приоритет: scheduledAt → день марафона по dayOffset). */
export const getLiveBroadcastDateKey = ({
  dayOffset,
  scheduledAt,
  productStartDate,
  timeZone,
}: LiveBroadcastEventFields & { timeZone?: string }): string | null => {
  const tz = timeZone !== undefined ? resolveMarathonTimeZone(timeZone) : getResolvedMarathonTimeZone();
  if (scheduledAt != null) return marathonDateKeyInZone(scheduledAt, tz);
  if (productStartDate != null) {
    return marathonDateKeyInZone(getMarathonEventDate(productStartDate, dayOffset), tz);
  }
  return null;
};

/** Можно ли заходить в эфир этого события: только в запланированный календарный день (в TZ марафона). */
export const isMarathonLiveJoinAllowedToday = (
  event: LiveBroadcastEventFields,
  now: Date = new Date(),
  timeZone?: string
): { ok: true } | { ok: false; reason: "no_schedule" | "too_early" | "too_late" } => {
  const tz = timeZone !== undefined ? resolveMarathonTimeZone(timeZone) : getResolvedMarathonTimeZone();
  const broadcastKey = getLiveBroadcastDateKey({ ...event, timeZone: tz });
  if (!broadcastKey) return { ok: false, reason: "no_schedule" };
  const todayKey = marathonDateKeyInZone(now, tz);
  if (todayKey < broadcastKey) return { ok: false, reason: "too_early" };
  if (todayKey > broadcastKey) return { ok: false, reason: "too_late" };
  return { ok: true };
};

export const marathonLiveJoinDeniedMessage = (
  r: { ok: false; reason: "no_schedule" | "too_early" | "too_late" }
): string => {
  switch (r.reason) {
    case "no_schedule":
      return "У эфира не задан день (укажите дату старта марафона / день / время эфира)";
    case "too_early":
      return "Эфир будет доступен только в день трансляции по расписанию";
    case "too_late":
      return "Эфир по расписанию уже прошёл, вход закрыт";
    default: {
      const _x: never = r.reason;
      return _x;
    }
  }
};
