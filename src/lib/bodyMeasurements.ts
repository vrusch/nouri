import { type BodyMeasurementEntry } from "./cloudSync";

export const MEASUREMENT_FIELDS = ["waist", "hips", "chest"] as const;
export type MeasurementField = (typeof MEASUREMENT_FIELDS)[number];

export const MEASUREMENT_LABELS_CS: Record<MeasurementField, string> = {
  waist: "Pas",
  hips: "Boky",
  chest: "Hrudník",
};

export interface MeasurementTrend {
  latest: number;
  delta: number | null; // null pokud appka pro tohle pole nemá aspoň dva záznamy
}

/**
 * Pro dané pole (pas/boky/hrudník) najde nejnovější hodnotu a rozdíl oproti prvnímu záznamu,
 * který to pole má vyplněné. "První se záznamem" není nutně entries[0] — uživatel nemusí
 * vyplnit všechna pole při každém zápisu, takže se pole sledují nezávisle na sobě.
 * Očekává entries seřazené vzestupně podle data (stejně jako je vrací subscribeBodyMeasurements).
 */
export function computeMeasurementTrend(entries: BodyMeasurementEntry[], field: MeasurementField): MeasurementTrend | null {
  const withField = entries.filter((e) => e[field] !== undefined);
  if (withField.length === 0) return null;

  const latest = withField[withField.length - 1][field] as number;
  const first = withField[0][field] as number;
  const delta = withField.length >= 2 ? Math.round((latest - first) * 10) / 10 : null;

  return { latest, delta };
}
