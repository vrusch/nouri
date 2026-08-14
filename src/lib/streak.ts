import { getLocalDateISO } from "./date";

function addDaysISO(dateISO: string, delta: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().split("T")[0];
}

/**
 * Kolik dní po sobě je zapsané aspoň jedno jídlo. Pokud dnešek ještě nemá zápis, streak se
 * nezlomí hned ráno — počítá se od včerejška, dokud dnešní den nezapadne bez záznamu úplně.
 *
 * `excludedDates` (volný den / dovolenkový režim, viz vacationMode.ts) posouvá "walk" přes daný
 * den beze změny streaku — den ani nezlomí řetězec, ani se sám nezapočítá, pokud v něm žádné
 * jídlo zapsané není. Den, který je zároveň vyloučený i má zapsané jídlo, se počítá normálně.
 */
export function computeLoggingStreak(
  mealDates: string[],
  todayISO: string = getLocalDateISO(),
  excludedDates: string[] = []
): number {
  const dates = new Set(mealDates);
  const excluded = new Set(excludedDates);
  let cursor = dates.has(todayISO) || excluded.has(todayISO) ? todayISO : addDaysISO(todayISO, -1);
  let streak = 0;

  while (dates.has(cursor) || excluded.has(cursor)) {
    if (dates.has(cursor)) streak++;
    cursor = addDaysISO(cursor, -1);
  }

  return streak;
}
