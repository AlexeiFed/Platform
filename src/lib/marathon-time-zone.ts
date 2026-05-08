/** IANA TZ по умолчанию, если env пуст или невалиден для Intl */
export const MARATHON_TIME_ZONE_FALLBACK = "Europe/Moscow";

export function resolveMarathonTimeZone(envValue?: string): string {
  const raw = (envValue ?? "").trim();
  const candidate = raw || MARATHON_TIME_ZONE_FALLBACK;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: candidate }).formatToParts(new Date());
    return candidate;
  } catch {
    return MARATHON_TIME_ZONE_FALLBACK;
  }
}

export function getResolvedMarathonTimeZone(): string {
  return resolveMarathonTimeZone(process.env.MARATHON_TIME_ZONE);
}
