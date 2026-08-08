import { type WeightLogEntry } from "./cloudSync";

export function daysSince(dateISO: string, todayISO: string = new Date().toISOString().split("T")[0]): number {
  const msPerDay = 86400000;
  const diff = Date.parse(`${todayISO}T00:00:00Z`) - Date.parse(`${dateISO}T00:00:00Z`);
  return Math.round(diff / msPerDay);
}

export interface WeighInStatus {
  daysSinceWeighIn: number | null;
  weighInOverdue: boolean;
}

/**
 * Vyhodnotí stav připomínky vážení z posledního záznamu váhy. Za "reálné vážení" se počítá
 * jen výslovně source: "manual" — tichý seed bod (viz seedWeightLogIfEmpty) i starší záznamy
 * bez pole source (z doby před rozlišením seed/manual) se ignorují.
 */
export function computeWeighInStatus(
  latest: WeightLogEntry | null,
  reminderDays: number,
  todayISO: string = new Date().toISOString().split("T")[0]
): WeighInStatus {
  const lastRealWeighIn = latest && latest.source === "manual" ? latest : null;
  const daysSinceWeighIn = lastRealWeighIn ? daysSince(lastRealWeighIn.date, todayISO) : null;
  const weighInOverdue = daysSinceWeighIn === null || daysSinceWeighIn >= reminderDays;
  return { daysSinceWeighIn, weighInOverdue };
}
