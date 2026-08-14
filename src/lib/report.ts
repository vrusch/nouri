import { MEASUREMENT_FIELDS, computeMeasurementTrend, type MeasurementField, type MeasurementTrend } from "./bodyMeasurements";
import { type WeightLogEntry, type BodyMeasurementEntry } from "./cloudSync";
import { getLocalDateISO } from "./date";

export interface ReportMealInput {
  date: string;
  value: number;
  protein?: number;
  fat?: number;
  carbs?: number;
}

export interface MonthlyReportData {
  periodStart: string;
  periodEnd: string;
  daysInPeriod: number;
  daysLogged: number;
  avgCalories: number;
  avgProtein: number;
  avgFat: number;
  avgCarbs: number;
  weightStart: number | null;
  weightEnd: number | null;
  weightChangeKg: number | null;
  weightEntriesCount: number;
  measurements: Partial<Record<MeasurementField, MeasurementTrend>>;
}

export const REPORT_PERIOD_DAYS = 30;

function addDaysIso(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

/**
 * Agreguje data appky za posledních N dní (výchozí 30) do podkladu pro formální PDF report
 * pro lékaře/nutričního poradce — čistá funkce, žádné vykreslování (to dělá pdfReport.ts).
 * Průměry počítá jen ze zapsaných dní, stejná konvence jako summarizeWeek (nezapsaný den
 * neutáhne průměr k nule, appka to nesmí předstírat jako "0 kcal" den).
 */
export function buildMonthlyReportData(
  meals: ReportMealInput[],
  weightLogs: WeightLogEntry[],
  measurements: BodyMeasurementEntry[],
  todayISO: string = getLocalDateISO(),
  periodDays: number = REPORT_PERIOD_DAYS
): MonthlyReportData {
  const periodEnd = todayISO;
  const periodStart = addDaysIso(todayISO, -(periodDays - 1));

  const mealsInPeriod = meals.filter((m) => m.date >= periodStart && m.date <= periodEnd);
  const dailyTotals = new Map<string, { calories: number; protein: number; fat: number; carbs: number }>();
  for (const m of mealsInPeriod) {
    const day = dailyTotals.get(m.date) ?? { calories: 0, protein: 0, fat: 0, carbs: 0 };
    day.calories += m.value;
    day.protein += m.protein ?? 0;
    day.fat += m.fat ?? 0;
    day.carbs += m.carbs ?? 0;
    dailyTotals.set(m.date, day);
  }
  const loggedDays = [...dailyTotals.values()];
  const daysLogged = loggedDays.length;
  const avg = (sum: number) => (daysLogged > 0 ? Math.round(sum / daysLogged) : 0);

  const weightInPeriod = weightLogs
    .filter((w) => w.date >= periodStart && w.date <= periodEnd)
    .sort((a, b) => a.date.localeCompare(b.date));
  const weightStart = weightInPeriod.length > 0 ? weightInPeriod[0].weight : null;
  const weightEnd = weightInPeriod.length > 0 ? weightInPeriod[weightInPeriod.length - 1].weight : null;
  const weightChangeKg =
    weightStart !== null && weightEnd !== null ? Math.round((weightEnd - weightStart) * 10) / 10 : null;

  const measurementsInPeriod = measurements.filter((m) => m.date >= periodStart && m.date <= periodEnd);
  const measurementTrends: Partial<Record<MeasurementField, MeasurementTrend>> = {};
  for (const field of MEASUREMENT_FIELDS) {
    const trend = computeMeasurementTrend(measurementsInPeriod, field);
    if (trend) measurementTrends[field] = trend;
  }

  return {
    periodStart,
    periodEnd,
    daysInPeriod: periodDays,
    daysLogged,
    avgCalories: avg(loggedDays.reduce((s, d) => s + d.calories, 0)),
    avgProtein: avg(loggedDays.reduce((s, d) => s + d.protein, 0)),
    avgFat: avg(loggedDays.reduce((s, d) => s + d.fat, 0)),
    avgCarbs: avg(loggedDays.reduce((s, d) => s + d.carbs, 0)),
    weightStart,
    weightEnd,
    weightChangeKg,
    weightEntriesCount: weightInPeriod.length,
    measurements: measurementTrends,
  };
}
