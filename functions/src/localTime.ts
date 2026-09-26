// Fáze C (REFERENCE/STRICT_COACHING_SPEC.md, sekce 7) — Cloud Functions běží v us-central1 (UTC),
// ale připomínky jídla a vody se řídí místním časem uživatelky. Klient zapisuje své pásmo do
// profilu (`timeZone`, IANA název z Intl), server z něj přes Intl dopočítá místní datum a hodinu.

export const DEFAULT_TIME_ZONE = "Europe/Prague";

export interface LocalTimeParts {
  dateISO: string; // YYYY-MM-DD v pásmu uživatelky — stejný formát jako MealItem.date a id dokumentu waterLogs
  hour: number; // 0–23
  minute: number; // 0–59
}

export function resolveTimeZone(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function getLocalTimeParts(now: Date, timeZone: string): LocalTimeParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    dateISO: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}
