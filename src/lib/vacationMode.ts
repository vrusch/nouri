// Volný den i dovolenkový režim (FEATURE_IDEAS.md sekce 3) sdílí jednu datovou strukturu —
// plochý seznam ISO datumů (UserProfile.vacationDates). Jednorázové "dnes mám volno" přidá/ubere
// jediné datum (toggleVacationDate), dovolená přidá celý rozsah najednou (addVacationRange) —
// obojí zapisuje do stejného pole, takže "je dnes appka v dovolenkovém tichu" je vždy jen
// jedno `isVacationDay(today, ...)` bez ohledu na to, jak se tam dané datum dostalo.

const MAX_VACATION_RANGE_DAYS = 60; // ochrana proti překlepu v datu (např. špatný rok místo dne)

function addDaysISO(dateISO: string, delta: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().split("T")[0];
}

export function isVacationDay(dateISO: string, vacationDates: string[] | undefined): boolean {
  return !!vacationDates?.includes(dateISO);
}

export function toggleVacationDate(vacationDates: string[] | undefined, dateISO: string): string[] {
  const current = vacationDates ?? [];
  const next = current.includes(dateISO) ? current.filter((d) => d !== dateISO) : [...current, dateISO];
  return next.sort();
}

/**
 * Rozbalí rozsah (včetně obou krajů) na jednotlivá ISO data. Obrácený rozsah (konec před
 * začátkem) vrátí prázdné pole, ne chybu — appka tak jen tiše nic nepřidá místo pádu.
 */
export function expandDateRange(startISO: string, endISO: string): string[] {
  if (endISO < startISO) return [];
  const dates: string[] = [];
  let cursor = startISO;
  while (cursor <= endISO && dates.length < MAX_VACATION_RANGE_DAYS) {
    dates.push(cursor);
    cursor = addDaysISO(cursor, 1);
  }
  return dates;
}

export function addVacationRange(vacationDates: string[] | undefined, startISO: string, endISO: string): string[] {
  const merged = new Set([...(vacationDates ?? []), ...expandDateRange(startISO, endISO)]);
  return Array.from(merged).sort();
}

/** "Ukončit dovolenou" — smaže vynechané dny od zadaného data (včetně) dál, minulost nechá beze změny. */
export function endVacationFromDate(vacationDates: string[] | undefined, fromISO: string): string[] {
  return (vacationDates ?? []).filter((d) => d < fromISO);
}
