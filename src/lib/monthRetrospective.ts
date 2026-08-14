import { getLocalDateISO } from "./date";

const TARGET_DAYS_AGO = 30;
// Tolerance kolem 30 dní — appka hledá záznam nejbližší přesně měsíci zpátky, ale dál než
// týden od cíle radši nic neukáže, ať "před měsícem" nikdy neoznačí záznam starý 3 týdny.
const MAX_DAY_DISTANCE = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MonthRetrospective {
  monthAgoDate: string;
  monthAgoWeight: number;
  currentDate: string;
  currentWeight: number;
  deltaKg: number;
}

/**
 * Najde v historii váhy záznam nejbližší 30 dnům zpátky a porovná ho s nejnovějším záznamem —
 * čistě z `weightLogs`, žádná nová datová vrstva (FEATURE_IDEAS.md sekce 3, "Před měsícem vs. dnes").
 */
export function computeMonthRetrospective(
  weightLogs: { date: string; weight: number }[],
  todayISO: string = getLocalDateISO()
): MonthRetrospective | null {
  if (weightLogs.length < 2) return null;

  const sorted = [...weightLogs].sort((a, b) => a.date.localeCompare(b.date));
  const current = sorted[sorted.length - 1];
  const targetMs = new Date(`${todayISO}T00:00:00`).getTime() - TARGET_DAYS_AGO * DAY_MS;

  let best: { date: string; weight: number } | null = null;
  let bestDistanceDays = Infinity;
  for (const entry of sorted) {
    const distanceDays = Math.abs(new Date(`${entry.date}T00:00:00`).getTime() - targetMs) / DAY_MS;
    if (distanceDays < bestDistanceDays) {
      bestDistanceDays = distanceDays;
      best = entry;
    }
  }
  if (!best || bestDistanceDays > MAX_DAY_DISTANCE || best.date === current.date) return null;

  return {
    monthAgoDate: best.date,
    monthAgoWeight: best.weight,
    currentDate: current.date,
    currentWeight: current.weight,
    deltaKg: Math.round((current.weight - best.weight) * 10) / 10,
  };
}
