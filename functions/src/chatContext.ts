import { describeIntakeStatusCs, describeRemainingTodayCs, LATE_EVENING_HOUR } from "./dayStatus.js";
import { sanitizePromptText } from "./promptText.js";
import { chatMealPlan, chatRecipeBudget, describeNextMealCs } from "./recipes.js";

// Kontext dne pro chatWithMya (testování 2026-10-10: "Mya nevidí data uživatele a nemůže
// diskutovat o situaci"). Chat dřív znal jen jméno, cíl a cílové kalorie z profilu — na otázku
// "jak jsem na tom dnes?" neměl z čeho odpovědět. Klient (MyaChatModal.tsx, buildChatContext
// v src/lib/chatContext.ts) teď s každou zprávou posílá čerstvý snímek dne, spočítaný stejnými
// funkcemi jako Home. Je to nedůvěryhodný vstup, který jde do SYSTÉMOVÉ části promptu — čísla
// v mezích, texty přes sanitizePromptText, pole s horním limitem. Celý kontext je nepovinný:
// starší build appky v cache PWA ho neposílá a chat se pak chová jako dřív.

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "snídaně",
  lunch: "oběd",
  dinner: "večeře",
  snack: "svačina",
};

const MAX_MEALS = 40;
const MAX_WORKOUTS = 10;
const MAX_RECENT_DAYS = 7;
const MAX_WEIGHT_LOGS = 10;
const MAX_NAME_LENGTH = 80;

export interface ChatMealContext {
  name: string;
  type?: MealType;
  time?: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export interface ChatWorkoutContext {
  name: string;
  caloriesBurned: number;
  durationMinutes?: number;
}

export interface ChatContext {
  date?: string;
  localHour?: number;
  isVacationDay: boolean;
  consumedCalories: number;
  consumedProtein: number;
  consumedCarbs: number;
  consumedFat: number;
  hasIncompleteMacroData: boolean;
  workoutBonusCalories: number;
  meals: ChatMealContext[];
  workouts: ChatWorkoutContext[];
  waterGlasses?: number;
  waterTarget?: number;
  recentDays: { date: string; calories: number; target: number; isVacationDay: boolean }[];
  weightLogs?: { date: string; weight: number }[]; // undefined = klient je ještě nenačetl (≠ žádné vážení)
  targetWeight?: number;
}

// Na rozdíl od parseBoundedInt v index.ts povoluje desetinná čísla — váha (68.4) i makra
// z AI odhadu (12.5 g) celá čísla nejsou a nesmí tiše vypadnout.
function finiteInRange(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : undefined;
}

function intInRange(value: unknown, min: number, max: number): number | undefined {
  const n = finiteInRange(value, min, max);
  return n !== undefined && Number.isInteger(n) ? n : undefined;
}

function isoDate(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function hhmm(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{1,2}:\d{2}$/.test(value) ? value : undefined;
}

function asArray(value: unknown, max: number): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, max)
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object");
}

function parseMeal(raw: Record<string, unknown>): ChatMealContext | null {
  const name = sanitizePromptText(raw.name, MAX_NAME_LENGTH);
  const calories = finiteInRange(raw.calories, 0, 10000);
  if (!name || calories === undefined) return null;
  const meal: ChatMealContext = { name, calories };
  const type = (Object.keys(MEAL_TYPE_LABELS) as MealType[]).find((t) => t === raw.type);
  if (type) meal.type = type;
  const time = hhmm(raw.time);
  if (time) meal.time = time;
  const protein = finiteInRange(raw.protein, 0, 1000);
  if (protein !== undefined) meal.protein = protein;
  const carbs = finiteInRange(raw.carbs, 0, 1000);
  if (carbs !== undefined) meal.carbs = carbs;
  const fat = finiteInRange(raw.fat, 0, 1000);
  if (fat !== undefined) meal.fat = fat;
  return meal;
}

function parseWorkout(raw: Record<string, unknown>): ChatWorkoutContext | null {
  const name = sanitizePromptText(raw.name, MAX_NAME_LENGTH);
  const caloriesBurned = finiteInRange(raw.caloriesBurned, 0, 5000);
  if (!name || caloriesBurned === undefined) return null;
  const workout: ChatWorkoutContext = { name, caloriesBurned };
  const durationMinutes = finiteInRange(raw.durationMinutes, 0, 1440);
  if (durationMinutes !== undefined) workout.durationMinutes = durationMinutes;
  return workout;
}

/**
 * undefined = kontext chybí nebo je rozbitý (souhrnná čísla mimo meze) — chat pak jede jako
 * dřív, jen s profilem. Jednotlivé rozbité položky v polích (jídlo bez názvu apod.) se
 * zahodí, zbytek kontextu platí.
 */
export function parseChatContext(value: unknown): ChatContext | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;

  const consumedCalories = finiteInRange(raw.consumedCalories, 0, 20000);
  const consumedProtein = finiteInRange(raw.consumedProtein, 0, 2000);
  const consumedCarbs = finiteInRange(raw.consumedCarbs, 0, 3000);
  const consumedFat = finiteInRange(raw.consumedFat, 0, 2000);
  if (
    consumedCalories === undefined ||
    consumedProtein === undefined ||
    consumedCarbs === undefined ||
    consumedFat === undefined
  ) {
    return undefined;
  }

  const context: ChatContext = {
    isVacationDay: raw.isVacationDay === true,
    consumedCalories,
    consumedProtein,
    consumedCarbs,
    consumedFat,
    hasIncompleteMacroData: raw.hasIncompleteMacroData === true,
    workoutBonusCalories: finiteInRange(raw.workoutBonusCalories, 0, 5000) ?? 0,
    meals: asArray(raw.meals, MAX_MEALS)
      .map(parseMeal)
      .filter((m): m is ChatMealContext => m !== null),
    workouts: asArray(raw.workouts, MAX_WORKOUTS)
      .map(parseWorkout)
      .filter((w): w is ChatWorkoutContext => w !== null),
    recentDays: asArray(raw.recentDays, MAX_RECENT_DAYS).flatMap((d) => {
      const date = isoDate(d.date);
      const calories = finiteInRange(d.calories, 0, 20000);
      const target = finiteInRange(d.target, 500, 10000);
      return date && calories !== undefined && target !== undefined
        ? [{ date, calories, target, isVacationDay: d.isVacationDay === true }]
        : [];
    }),
  };

  if (Array.isArray(raw.weightLogs)) {
    context.weightLogs = asArray(raw.weightLogs.slice(-MAX_WEIGHT_LOGS), MAX_WEIGHT_LOGS).flatMap((w) => {
      const date = isoDate(w.date);
      const weight = finiteInRange(w.weight, 20, 500);
      return date && weight !== undefined ? [{ date, weight }] : [];
    });
  }
  const date = isoDate(raw.date);
  if (date) context.date = date;
  const localHour = intInRange(raw.localHour, 0, 23);
  if (localHour !== undefined) context.localHour = localHour;
  const waterGlasses = intInRange(raw.waterGlasses, 0, 50);
  if (waterGlasses !== undefined) context.waterGlasses = waterGlasses;
  const waterTarget = intInRange(raw.waterTarget, 1, 30);
  if (waterTarget !== undefined) context.waterTarget = waterTarget;
  const targetWeight = finiteInRange(raw.targetWeight, 20, 500);
  if (targetWeight !== undefined) context.targetWeight = targetWeight;
  return context;
}

function formatMacros(meal: ChatMealContext): string {
  const parts = [
    meal.protein !== undefined ? `B ${Math.round(meal.protein)} g` : null,
    meal.carbs !== undefined ? `S ${Math.round(meal.carbs)} g` : null,
    meal.fat !== undefined ? `T ${Math.round(meal.fat)} g` : null,
  ].filter(Boolean);
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

function formatKg(weight: number): string {
  return `${(Math.round(weight * 10) / 10).toString().replace(".", ",")} kg`;
}

/**
 * Kontext jako blok textu do system promptu chatu. `targets` je denní cíl z profilu BEZ
 * tréninkového bonusu (server ho počítá sám, stejně jako u getDailyGreeting) — bonus se přičte
 * tady, ať chat ukazuje stejný cíl jako Home (adjustedGoalCalories).
 */
export function formatChatContextCs(
  context: ChatContext,
  targets: { calories: number; protein: number; carbs: number; fat: number }
): string {
  const dayTarget = targets.calories + context.workoutBonusCalories;
  const lines: string[] = [];

  const when = [context.date, context.localHour !== undefined ? `${context.localHour}:00` : null].filter(Boolean).join(", ");
  lines.push(`Dnešní den${when ? ` (${when})` : ""}${context.isVacationDay ? " — volný den / dovolená" : ""}:`);
  lines.push(describeIntakeStatusCs(context.consumedCalories, dayTarget, context.consumedProtein, targets.protein));
  lines.push(
    `Makra dnes (snědeno / cíl): bílkoviny ${Math.round(context.consumedProtein)} / ${targets.protein} g, ` +
      `sacharidy ${Math.round(context.consumedCarbs)} / ${targets.carbs} g, tuky ${Math.round(context.consumedFat)} / ${targets.fat} g` +
      (context.hasIncompleteMacroData ? " (orientačně — některé dnešní jídlo nemá rozpad maker)." : ".")
  );

  // Zbytek dne a další jídlo počítá appka (MYA_COACH_SPEC 5.3, 6.6) — model je jen vykládá.
  // Bez zapsaného jídla zbytek neplatí ("nic nezapsáno" ≠ "nic nesnědeno"), další jídlo ano.
  const remainingLine = describeRemainingTodayCs({
    calories: dayTarget - context.consumedCalories,
    protein: targets.protein - context.consumedProtein,
    carbs: targets.carbs - context.consumedCarbs,
    fat: targets.fat - context.consumedFat,
    hasIncompleteMacroData: context.hasIncompleteMacroData,
    localHour: context.localHour,
  });
  if (remainingLine && context.consumedCalories > 0) lines.push(remainingLine);
  if (context.localHour !== undefined && context.localHour < LATE_EVENING_HOUR) {
    const budget = chatRecipeBudget(targets, context);
    const plan = chatMealPlan(targets, context, budget);
    const nextMeal = budget && plan ? describeNextMealCs(plan, budget.calories) : undefined;
    if (nextMeal) lines.push(nextMeal);
  }

  if (context.workouts.length > 0) {
    const workouts = context.workouts
      .map((w) => `${w.name} (${w.durationMinutes !== undefined ? `${Math.round(w.durationMinutes)} min, ` : ""}${Math.round(w.caloriesBurned)} kcal)`)
      .join("; ");
    lines.push(`Trénink dnes: ${workouts} — o spálené kalorie je dnešní cíl ${Math.round(dayTarget)} kcal už navýšený.`);
  } else {
    lines.push("Trénink dnes: nic nezapsáno.");
  }

  lines.push(
    context.waterGlasses !== undefined
      ? `Voda dnes: ${context.waterGlasses} z ${context.waterTarget ?? 8} sklenic (sklenice = 250 ml).`
      : "Voda dnes: appka údaj nenačetla."
  );

  if (context.meals.length > 0) {
    lines.push("Zapsaná jídla dnes:");
    for (const meal of context.meals) {
      const prefix = [meal.time, meal.type ? MEAL_TYPE_LABELS[meal.type] : null].filter(Boolean).join(" ");
      lines.push(`- ${prefix ? `${prefix}: ` : ""}${meal.name} — ${Math.round(meal.calories)} kcal${formatMacros(meal)}`);
    }
  } else {
    lines.push("Zapsaná jídla dnes: žádná.");
  }

  if (context.recentDays.length > 0) {
    lines.push("Předchozí dny (jen dny se zápisem; snědeno / cíl):");
    for (const day of context.recentDays) {
      const diff = Math.round(day.calories - day.target);
      const verdict = diff > 0 ? `přes cíl o ${diff} kcal` : diff === 0 ? "přesně na cíli" : `pod cílem o ${-diff} kcal`;
      lines.push(`- ${day.date}${day.isVacationDay ? " (volný den)" : ""}: ${Math.round(day.calories)} / ${Math.round(day.target)} kcal — ${verdict}`);
    }
  } else {
    lines.push("Předchozí dny: za posledních 7 dní nic zapsáno.");
  }

  if (context.weightLogs === undefined) {
    lines.push("Váha: appka záznamy vážení nenačetla.");
  } else if (context.weightLogs.length > 0) {
    lines.push(`Váha (poslední záznamy): ${context.weightLogs.map((w) => `${w.date}: ${formatKg(w.weight)}`).join("; ")}.`);
  } else {
    lines.push("Váha: žádný záznam vážení.");
  }
  if (context.targetWeight !== undefined) lines.push(`Cílová váha: ${formatKg(context.targetWeight)}.`);

  return lines.join("\n");
}
