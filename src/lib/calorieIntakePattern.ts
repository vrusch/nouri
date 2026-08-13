// Stejná "cooldown" logika jako MACRO_PATTERN_COOLDOWN_DAYS v macroPattern.ts, jen jiné pole
// v profilu — appka po potvrzení mlčí, než stejný vzorek nízkého příjmu nabídne znovu.
export const LOW_CALORIE_PATTERN_COOLDOWN_DAYS = 14;

const MIN_RELIABLE_DAYS = 7;
const LOW_RATIO = 0.7; // pod 70 % cíle se den počítá jako "nízký" — stejný práh jako u bílkovin
const LOW_DAY_FRACTION = 0.7; // aspoň 70 % spolehlivých dní musí být nízkých

export interface DailyCalorieRecord {
  date: string;
  totalCalories: number;
  reliable: boolean;
}

/**
 * Sečte kalorie po dnech. Na rozdíl od buildDailyProteinRecords v macroPattern.ts appka nikdy
 * nemá zapsané jídlo bez kalorií (value je povinné pole MealItem), takže jediný důvod pro
 * "nespolehlivý" den je roughEstimate (režim "Jím venku") — hrubý odhad podle kategorie,
 * ne měřená data, stejná úvaha jako u bílkovin.
 */
// excludeDates (typicky dnešek) appce dovolí vyloučit ještě neskončený den z okna, aniž by
// appka musela filtrovat holým `r.date < today` v Stats.tsx, kde by to nešlo unit testovat
// (B5 v AUDIT_2026-08-13.md) — appka by jinak v 10 dopoledne po jedné snídani mohla vyhodnotit
// dnešek jako "pod 70 % cíle" a připočítat ho do vzorku nízkého příjmu.
export function buildDailyCalorieRecords(
  meals: { date: string; value: number; roughEstimate?: boolean }[],
  excludeDates?: string[]
): DailyCalorieRecord[] {
  const excluded = new Set(excludeDates ?? []);
  const byDate = new Map<string, { total: number; reliable: boolean }>();
  meals.forEach((m) => {
    if (excluded.has(m.date)) return;
    const entry = byDate.get(m.date) ?? { total: 0, reliable: true };
    entry.total += m.value;
    if (m.roughEstimate) entry.reliable = false;
    byDate.set(m.date, entry);
  });
  return Array.from(byDate, ([date, { total, reliable }]) => ({ date, totalCalories: total, reliable }));
}

export interface LowCaloriePatternResult {
  detected: boolean;
  reliableDaysConsidered: number;
  daysBelowTarget: number;
  avgCalories: number;
}

/**
 * Rozpozná dlouhodobě podprůměrný kalorický příjem z už předfiltrovaného okna dní — stejný
 * vzor jako detectLowProteinPattern v macroPattern.ts.
 */
export function detectLowCaloriePattern(
  records: DailyCalorieRecord[],
  targetCalories: number
): LowCaloriePatternResult {
  const reliable = records.filter((r) => r.reliable);
  const threshold = targetCalories * LOW_RATIO;
  const belowCount = reliable.filter((r) => r.totalCalories < threshold).length;
  const avgCalories =
    reliable.length > 0 ? Math.round(reliable.reduce((sum, r) => sum + r.totalCalories, 0) / reliable.length) : 0;
  const detected = reliable.length >= MIN_RELIABLE_DAYS && belowCount / reliable.length >= LOW_DAY_FRACTION;

  return { detected, reliableDaysConsidered: reliable.length, daysBelowTarget: belowCount, avgCalories };
}
