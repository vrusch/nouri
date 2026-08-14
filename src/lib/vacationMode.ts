// Volný den i dovolenkový režim (FEATURE_IDEAS.md sekce 3) sdílí jednu datovou strukturu —
// plochý seznam ISO datumů (UserProfile.vacationDates). Appka do něj píše výhradně přes
// AuthContext's updateProfileArray (arrayUnion/arrayRemove, viz N15 v AUDIT_2026-08-14.md,
// stejný atomický vzor jako adjustWaterGlasses/increment() u vody) — tenhle soubor proto drží
// jen čisté pomocné funkce, které appce řeknou KTERÁ konkrétní data union/remove dostanou,
// ne jak sloučit/přepsat celé pole (to teď dělá Firestore server-side). "Je dnes appka
// v dovolenkovém tichu" je vždy jen jedno `isVacationDay(today, ...)` bez ohledu na to, jak
// se tam dané datum dostalo.

const MAX_VACATION_RANGE_DAYS = 60; // ochrana proti překlepu v datu (např. špatný rok místo dne)

function addDaysISO(dateISO: string, delta: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().split("T")[0];
}

export function isVacationDay(dateISO: string, vacationDates: string[] | undefined): boolean {
  return !!vacationDates?.includes(dateISO);
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

/**
 * "Ukončit dovolenou" — appka nemaže celé pole, jen přesně ty dny od zadaného data (včetně)
 * dál, co arrayRemove() má odstranit; minulost necháno beze změny. Na rozdíl od dřívějšího
 * plného přepisu pole appka teď jmenuje přesně to, co se má smazat, takže souběžné přidání
 * jiného data z druhého zařízení nepřežije jen náhodou (viz N15).
 */
export function datesToEndVacation(vacationDates: string[] | undefined, fromISO: string): string[] {
  return (vacationDates ?? []).filter((d) => d >= fromISO);
}
