import { getPreviousDateISO } from "./date";
import type { CoachingStyle } from "./coachingStyle";

// Fáze B přísnějšího vedení (REFERENCE/STRICT_COACHING_SPEC.md, sekce 6) — opakované přejídání
// a bilance po dovolené. Obojí jsou deterministické texty podle stylu Myi, ne AI: mantinely
// (žádné "jez méně", žádné hladovění, jen zpátky k běžnému cíli) tak platí zaručeně a appka
// kvůli tomu nepotřebuje další Cloud Function ani placené volání OpenAI.

export interface DayIntake {
  date: string;
  calories: number;
  /** Cíl toho dne včetně tréninkového bonusu — stejně jako adjustedGoalCalories na Home. */
  target: number;
}

/**
 * Denní příjem vs. cíl pro zadaná data. Dny bez jediného zapsaného jídla appka vynechá —
 * "nic nezapsáno" není "nic nesnědeno" (stejná past jako u getProgressCaption).
 *
 * Na rozdíl od sledování NÍZKÉHO příjmu (calorieIntakePattern.ts) appka tady hrubé odhady
 * ("Jím venku") počítá: jsou spíš podhodnocené, takže když je i odhad přes cíl, přes cíl to je.
 */
export function buildDailyIntakes(
  meals: { date: string; value: number }[],
  workouts: { date: string; caloriesBurned: number }[],
  baseTargetCalories: number,
  dates: string[]
): DayIntake[] {
  const wanted = new Set(dates);
  const calories = new Map<string, number>();
  meals.forEach((m) => {
    if (wanted.has(m.date)) calories.set(m.date, (calories.get(m.date) ?? 0) + m.value);
  });
  const bonus = new Map<string, number>();
  workouts.forEach((w) => {
    if (wanted.has(w.date)) bonus.set(w.date, (bonus.get(w.date) ?? 0) + w.caloriesBurned);
  });
  return dates
    .filter((d) => calories.has(d))
    .map((d) => ({ date: d, calories: Math.round(calories.get(d)!), target: Math.round(baseTargetCalories + (bonus.get(d) ?? 0)) }));
}

// --- Opakované přejídání -------------------------------------------------------------------

export const HIGH_CALORIE_WINDOW_DAYS = 7;
export const HIGH_CALORIE_MIN_OVER_DAYS = 4;
export const HIGH_CALORIE_PATTERN_COOLDOWN_DAYS = 7; // = délka okna, ať appka neopakuje tentýž týden
const HIGH_RATIO = 1.1; // "přes cíl" = víc než 110 % — pár desítek kcal nad cílem není vzorec

export interface HighCaloriePatternResult {
  detected: boolean;
  overDays: number;
  loggedDays: number;
  /** Průměrné překročení jen přes dny, které byly přes (kcal). */
  avgOverage: number;
}

/**
 * Volající strana předá už vyfiltrované okno: posledních 7 dní BEZ dneška (den ještě neskončil)
 * a BEZ dní volna (ty řeší bilance po dovolené níž, jinak by appka týž týden vyčetla dvakrát).
 */
export function detectHighCaloriePattern(intakes: DayIntake[]): HighCaloriePatternResult {
  const over = intakes.filter((d) => d.target > 0 && d.calories > d.target * HIGH_RATIO);
  const avgOverage =
    over.length > 0 ? Math.round(over.reduce((sum, d) => sum + (d.calories - d.target), 0) / over.length) : 0;
  return {
    detected: over.length >= HIGH_CALORIE_MIN_OVER_DAYS,
    overDays: over.length,
    loggedDays: intakes.length,
    avgOverage,
  };
}

export function buildHighCaloriePatternText(result: HighCaloriePatternResult, style: CoachingStyle): string {
  const { overDays, loggedDays, avgOverage } = result;
  const facts = `${overDays} z ${loggedDays} zapsaných dní za poslední týden jsi byla přes cíl, v průměru o ${avgOverage} kcal.`;
  if (style === "gentle") return `${facts} Stává se to — zkus se tenhle týden držet běžného cíle, zvládneš to.`;
  if (style === "strict") return `${facts} Tohle už není výjimka, to je zvyk. Od dneška přesně podle cíle, žádné mlsání navíc.`;
  return `${facts} Z výjimky se stává zvyk — tenhle týden se drž běžného cíle.`;
}

// --- Bilance po dovolené -------------------------------------------------------------------

export const VACATION_RECAP_MAX_DAYS_AFTER = 3; // appka bilanci ukazuje nejvýš 3 dny po návratu
export const VACATION_RECAP_MIN_DAYS = 2; // jednodenní volno řeší caption toho dne, ne bilance

export interface EndedVacation {
  start: string;
  end: string;
  dates: string[];
}

/**
 * Najde poslední souvislý blok volna, který skončil nejvýš před VACATION_RECAP_MAX_DAYS_AFTER dny.
 * Když je volno i dnes, dovolená ještě neskončila → null.
 */
export function findRecentlyEndedVacation(
  vacationDates: string[] | undefined,
  todayISO: string,
  maxDaysAfter: number = VACATION_RECAP_MAX_DAYS_AFTER
): EndedVacation | null {
  const set = new Set(vacationDates ?? []);
  if (set.has(todayISO)) return null;

  // Hledá se jen v okně pár dní zpátky — starší volno už bilanci nedostane.
  let cursor = getPreviousDateISO(todayISO);
  let end: string | null = null;
  for (let i = 0; i < maxDaysAfter; i++) {
    if (set.has(cursor)) {
      end = cursor;
      break;
    }
    cursor = getPreviousDateISO(cursor);
  }
  if (!end) return null;

  const dates: string[] = [end];
  let prev = getPreviousDateISO(end);
  while (set.has(prev) && dates.length < 60) {
    dates.unshift(prev);
    prev = getPreviousDateISO(prev);
  }
  if (dates.length < VACATION_RECAP_MIN_DAYS) return null;
  return { start: dates[0], end, dates };
}

export interface VacationSummary {
  vacationDays: number;
  loggedDays: number;
  overDays: number;
  /** Průměrný rozdíl příjem − cíl přes zapsané dny (kladný = nad cílem). */
  avgDelta: number;
}

export function summarizeVacation(vacation: EndedVacation, intakes: DayIntake[]): VacationSummary {
  const logged = intakes.filter((d) => vacation.dates.includes(d.date));
  const avgDelta =
    logged.length > 0 ? Math.round(logged.reduce((sum, d) => sum + (d.calories - d.target), 0) / logged.length) : 0;
  return {
    vacationDays: vacation.dates.length,
    loggedDays: logged.length,
    overDays: logged.filter((d) => d.calories > d.target).length,
    avgDelta,
  };
}

function formatDaysGenitiveCs(n: number): string {
  // "Za 5 dní volna", "Za 2 dny volna" → po předložce "za" 2–4 = "dny", jinak "dní".
  return n >= 2 && n <= 4 ? `${n} dny` : `${n} dní`;
}

export function buildVacationRecapText(summary: VacationSummary, style: CoachingStyle): string {
  const { vacationDays, loggedDays, overDays, avgDelta } = summary;
  const period = `Za ${formatDaysGenitiveCs(vacationDays)} volna`;

  if (loggedDays === 0) {
    if (style === "strict") return `${period} jsi nezapsala ani jedno jídlo. Volno skončilo — od dneška zase zapisuj všechno.`;
    if (style === "gentle") return `${period} jsi nic nezapsala — nevadí, od dneška se k zapisování zase vrať.`;
    return `${period} jsi nic nezapsala. Volno skončilo, od dneška zase zapisuj.`;
  }

  const coverage = loggedDays < vacationDays ? ` (zapsáno ${loggedDays} z ${vacationDays} dní)` : "";
  if (avgDelta > 0) {
    const facts = `${period} jsi byla v průměru o ${avgDelta} kcal/den nad cílem, přes cíl ${overDays}×${coverage}.`;
    if (style === "gentle") return `${facts} Užila sis to a to je v pořádku — teď zpátky k běžnému cíli.`;
    if (style === "strict") return `${facts} Dovolená skončila a s ní i výjimky. Od dneška zpátky přesně na cíl.`;
    return `${facts} Dovolená skončila — zpátky do rytmu a k běžnému cíli.`;
  }

  const facts = `${period} jsi v průměru držela cíl${coverage}.`;
  if (style === "strict") return `${facts} Dobře, takhle se to dělá. Pokračuj stejně.`;
  if (style === "gentle") return `${facts} Skvělá práce, i na dovolené!`;
  return `${facts} Výborně, pokračuj v tom.`;
}
