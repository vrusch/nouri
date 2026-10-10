import { computeRemainingMacros, type NutritionResults } from "./nutrition";
import { buildDailyIntakes } from "./overeatingReview";
import { isVacationDay } from "./vacationMode";
import { getPreviousDateISO } from "./date";

// Snímek dne pro chat s Myou (testování 2026-10-10: "Mya nevidí data uživatele a nemůže
// diskutovat o situaci"). Klientská polovina k functions/src/chatContext.ts — čísla se počítají
// stejnými funkcemi jako Home (součet jídel, computeRemainingMacros, tréninkový bonus,
// buildDailyIntakes), ať chat a počítadlo kalorií nikdy neukazují něco jiného. Cílové kalorie
// a makra appka neposílá: server je přepočítá z profilu (s efektivním calibratedTDEE) stejně
// jako u getDailyGreeting a přičte k nim workoutBonusCalories.

export const CHAT_CONTEXT_RECENT_DAYS = 7;
const CHAT_CONTEXT_WEIGHT_LOGS = 10;

export interface ChatContext {
  date: string;
  localHour: number;
  isVacationDay: boolean;
  consumedCalories: number;
  consumedProtein: number;
  consumedCarbs: number;
  consumedFat: number;
  hasIncompleteMacroData: boolean;
  workoutBonusCalories: number;
  meals: { name: string; type: string; time: string; calories: number; protein?: number; carbs?: number; fat?: number }[];
  workouts: { name: string; caloriesBurned: number; durationMinutes?: number }[];
  waterGlasses?: number;
  waterTarget: number;
  recentDays: { date: string; calories: number; target: number; isVacationDay: boolean }[];
  weightLogs?: { date: string; weight: number }[];
  targetWeight?: number;
}

export interface ChatContextSources {
  today: string;
  localHour: number;
  /** Efektivní cíl dne bez tréninku — stejný `nutrition` jako na Home (vč. luteálního bonusu). */
  nutrition: NutritionResults;
  /** Jídla a tréninky aspoň za dnešek + CHAT_CONTEXT_RECENT_DAYS předchozích dní (víc nevadí). */
  meals: { date: string; name: string; type: string; time: string; value: number; protein?: number; carbs?: number; fat?: number }[];
  workouts: { date: string; name: string; caloriesBurned: number; durationMinutes?: number }[];
  /** null = voda ještě nedorazila z Firestore (0 by znamenalo "nic nevypito"). */
  waterGlasses: number | null;
  waterTarget: number;
  /** null = záznamy vážení ještě nedorazily; jinak seřazené vzestupně podle data (subscribeWeightLogs). */
  weightLogs: { date: string; weight: number }[] | null;
  vacationDates?: string[];
  targetWeight?: number;
}

/** Dny před dneškem, od nejstaršího po včerejšek. */
export function getRecentDates(today: string, days: number = CHAT_CONTEXT_RECENT_DAYS): string[] {
  const dates: string[] = [];
  for (let d = getPreviousDateISO(today); dates.length < days; d = getPreviousDateISO(d)) dates.push(d);
  return dates.reverse();
}

export function buildChatContext(sources: ChatContextSources): ChatContext {
  const { today, nutrition } = sources;
  const todaysMeals = sources.meals.filter((m) => m.date === today).sort((a, b) => a.time.localeCompare(b.time));
  const todaysWorkouts = sources.workouts.filter((w) => w.date === today);
  const remaining = computeRemainingMacros(nutrition, todaysMeals);

  const context: ChatContext = {
    date: today,
    localHour: sources.localHour,
    isVacationDay: isVacationDay(today, sources.vacationDates),
    // Stejné výpočty jako Home: consumedCalories = součet jídel, makra = cíl − zbývá.
    consumedCalories: todaysMeals.reduce((sum, m) => sum + m.value, 0),
    consumedProtein: nutrition.macros.protein - remaining.protein,
    consumedCarbs: nutrition.macros.carbs - remaining.carbs,
    consumedFat: nutrition.macros.fat - remaining.fat,
    hasIncompleteMacroData: remaining.hasIncompleteMacroData,
    workoutBonusCalories: todaysWorkouts.reduce((sum, w) => sum + w.caloriesBurned, 0),
    meals: todaysMeals.map((m) => ({
      name: m.name,
      type: m.type,
      time: m.time,
      calories: m.value,
      ...(m.protein !== undefined ? { protein: m.protein } : {}),
      ...(m.carbs !== undefined ? { carbs: m.carbs } : {}),
      ...(m.fat !== undefined ? { fat: m.fat } : {}),
    })),
    workouts: todaysWorkouts.map((w) => ({
      name: w.name,
      caloriesBurned: w.caloriesBurned,
      ...(w.durationMinutes !== undefined ? { durationMinutes: w.durationMinutes } : {}),
    })),
    waterTarget: sources.waterTarget,
    recentDays: buildDailyIntakes(sources.meals, sources.workouts, nutrition.targetCalories, getRecentDates(today)).map(
      (d) => ({ ...d, isVacationDay: isVacationDay(d.date, sources.vacationDates) })
    ),
  };
  if (sources.waterGlasses !== null) context.waterGlasses = sources.waterGlasses;
  if (sources.weightLogs !== null) {
    context.weightLogs = sources.weightLogs.slice(-CHAT_CONTEXT_WEIGHT_LOGS).map(({ date, weight }) => ({ date, weight }));
  }
  if (sources.targetWeight !== undefined) context.targetWeight = sources.targetWeight;
  return context;
}
