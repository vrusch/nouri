function addDaysISO(dateISO: string, delta: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().split("T")[0];
}

/**
 * Kolik dní po sobě je zapsané aspoň jedno jídlo. Pokud dnešek ještě nemá zápis, streak se
 * nezlomí hned ráno — počítá se od včerejška, dokud dnešní den nezapadne bez záznamu úplně.
 */
export function computeLoggingStreak(
  mealDates: string[],
  todayISO: string = new Date().toISOString().split("T")[0]
): number {
  const dates = new Set(mealDates);
  let cursor = dates.has(todayISO) ? todayISO : addDaysISO(todayISO, -1);
  let streak = 0;

  while (dates.has(cursor)) {
    streak++;
    cursor = addDaysISO(cursor, -1);
  }

  return streak;
}
