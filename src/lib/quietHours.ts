export const QUIET_HOURS_START = 22;
export const QUIET_HOURS_END = 7;

/**
 * Rozsah přes půlnoc (start > end, např. 22 → 7) se počítá jako "hodina >= start NEBO < end",
 * na rozdíl od běžného rozsahu uvnitř jednoho dne, kde platí AND.
 */
export function isQuietHours(hour: number, startHour: number = QUIET_HOURS_START, endHour: number = QUIET_HOURS_END): boolean {
  // N9 (AUDIT_2026-08-14.md) — start === end by jinak spadl do větve "přes půlnoc", kde
  // `hour >= start || hour < end` je pro libovolnou hodinu vždy true a appka by tiché hodiny
  // (a s nimi všechna pasivní upozornění) ztišila navždy, bez jakékoli chybové hlášky.
  if (startHour === endHour) return false;
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  return hour >= startHour || hour < endHour;
}
