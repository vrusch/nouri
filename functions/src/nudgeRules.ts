// Fáze C (REFERENCE/STRICT_COACHING_SPEC.md, sekce 7) — serverová KOPIE pravidel připomínek
// z klienta: src/lib/mealReminder.ts, src/lib/water.ts, src/lib/nudges.ts, src/lib/coachingStyle.ts,
// src/lib/quietHours.ts. Stejný vzor jako functions/src/nutrition.ts (functions/ je samostatný
// TS projekt a klientský kód importovat nemůže). Rozdíl: bere místní hodinu/minutu (viz
// localTime.ts), ne Date — server běží v UTC.
//
// Shodu s klientem hlídá paritní test (nudgeRules.test.ts porovnává s computeActiveNudges přes
// mřížku hodin × stylů × volna × vody). Při změně pravidel nebo textů v klientu uprav i tohle.

export type CoachingStyle = "gentle" | "balanced" | "strict";
export type NudgeKind = "breakfast" | "lunch" | "dinner" | "water";
type MealKind = Exclude<NudgeKind, "water">;

export interface ServerNudge {
  kind: NudgeKind;
  text: string;
  /** Stejný klíč jako dismissKey v klientu — server ho používá k deduplikaci odeslaných pushů. */
  dismissKey: string;
}

export function resolveCoachingStyle(value: unknown): CoachingStyle {
  return value === "gentle" || value === "balanced" || value === "strict" ? value : "balanced";
}

// --- quietHours.ts ---
export const QUIET_HOURS_START = 22;
export const QUIET_HOURS_END = 7;

export function isQuietHours(hour: number, startHour: number = QUIET_HOURS_START, endHour: number = QUIET_HOURS_END): boolean {
  if (startHour === endHour) return false;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

// --- mealReminder.ts ---
const BREAKFAST_OVERDUE_FROM_HOUR = 10;
const LUNCH_OVERDUE_FROM_HOUR = 14;
const LUNCH_OVERDUE_UNTIL_HOUR = 20;
const DINNER_OVERDUE_FROM_HOUR = 20;

export function computeMealReminderStatus(todaysMealTypes: string[], hour: number) {
  const has = (type: string) => todaysMealTypes.includes(type);
  return {
    breakfastOverdue: hour >= BREAKFAST_OVERDUE_FROM_HOUR && hour < LUNCH_OVERDUE_FROM_HOUR && !has("breakfast") && !has("lunch"),
    lunchOverdue: hour >= LUNCH_OVERDUE_FROM_HOUR && hour < LUNCH_OVERDUE_UNTIL_HOUR && !has("lunch"),
    dinnerOverdue: hour >= DINNER_OVERDUE_FROM_HOUR && !has("dinner"),
  };
}

// --- water.ts + coachingStyle.ts ---
export const WATER_TARGET_GLASSES = 8;
const WATER_PACE_START_HOUR = 8;
const WATER_PACE_END_HOUR = 20;

export function getWaterBehindThreshold(style: CoachingStyle): number {
  if (style === "gentle") return 3;
  if (style === "strict") return 1;
  return 2;
}

export function computeWaterPaceStatus(glasses: number, hour: number, minute: number, behindThreshold: number, target: number = WATER_TARGET_GLASSES) {
  const hourFraction = hour + minute / 60;
  const dayProgress = Math.min(1, Math.max(0, (hourFraction - WATER_PACE_START_HOUR) / (WATER_PACE_END_HOUR - WATER_PACE_START_HOUR)));
  const expectedGlasses = Math.floor(dayProgress * target);
  const glassesBehind = Math.max(0, expectedGlasses - glasses);
  return { expectedGlasses, glassesBehind, behind: behindThreshold > 0 && glassesBehind >= behindThreshold };
}

export function shouldMuteMealRemindersOnVacation(style: CoachingStyle): boolean {
  return style !== "strict";
}

// --- nudges.ts ---
const MEAL_TEXTS: Record<MealKind, { nominative: string; gentle: string; balanced: string; strict: string }> = {
  breakfast: {
    nominative: "snídaně",
    gentle: "Nezapomeň si zapsat snídani.",
    balanced: "Dneska ještě nemáš zapsanou snídani.",
    strict: "Pořád tu nemáš snídani — zapiš ji hned, dokud víš, co jsi jedla.",
  },
  lunch: {
    nominative: "oběd",
    gentle: "Nezapomeň si zapsat oběd.",
    balanced: "Dneska ještě nemáš zapsaný oběd.",
    strict: "Pořád tu nemáš oběd — zapiš ho hned, dokud víš, co jsi jedla.",
  },
  dinner: {
    nominative: "večeře",
    gentle: "Nezapomeň si zapsat večeři.",
    balanced: "Dneska ještě nemáš zapsanou večeři.",
    strict: "Pořád tu nemáš večeři — zapiš ji hned, dokud víš, co jsi jedla.",
  },
};

function mealNudgeText(kind: MealKind, style: CoachingStyle, isVacationDay: boolean): string {
  const texts = MEAL_TEXTS[kind];
  if (isVacationDay) return `Volno neznamená nezapisovat — ${texts.nominative} ještě chybí.`;
  return texts[style];
}

function waterNudgeText(glasses: number, expected: number, style: CoachingStyle): string {
  if (style === "gentle") return `Dej si sklenici vody — touhle dobou bývá ${expected}, máš ${glasses}.`;
  if (style === "strict") return `Piješ málo! Máš ${glasses} z ${expected} sklenic, co už měly být vypité.`;
  return `Voda zaostává — touhle dobou bys měla mít ${expected} sklenic, máš ${glasses}.`;
}

export interface NudgeRuleInput {
  todaysMealTypes: string[];
  waterGlasses: number;
  hour: number;
  minute: number;
  style: CoachingStyle;
  isVacationDay: boolean;
}

export function computeActiveNudges({ todaysMealTypes, waterGlasses, hour, minute, style, isVacationDay }: NudgeRuleInput): ServerNudge[] {
  const nudges: ServerNudge[] = [];
  const mealReminder = computeMealReminderStatus(todaysMealTypes, hour);
  const muteMeals = isVacationDay && shouldMuteMealRemindersOnVacation(style);

  if (!muteMeals) {
    const overdueMeal: MealKind | null = mealReminder.breakfastOverdue
      ? "breakfast"
      : mealReminder.lunchOverdue
        ? "lunch"
        : mealReminder.dinnerOverdue
          ? "dinner"
          : null;
    if (overdueMeal) {
      nudges.push({ kind: overdueMeal, text: mealNudgeText(overdueMeal, style, isVacationDay), dismissKey: overdueMeal });
    }
  }

  const waterPace = computeWaterPaceStatus(waterGlasses, hour, minute, getWaterBehindThreshold(style));
  if (waterPace.behind) {
    nudges.push({
      kind: "water",
      text: waterNudgeText(waterGlasses, waterPace.expectedGlasses, style),
      dismissKey: `water_${waterPace.expectedGlasses}`,
    });
  }

  return nudges;
}

// --- jen server: výběr, co se opravdu pošle (fáze C) ---
export const MAX_PUSHES_PER_DAY = 3;

export interface PushState {
  date: string;
  sentKeys: string[];
  count: number;
}

/**
 * Z aktivních připomínek vybere ty, které se ještě dnes neposlaly (podle dismissKey — jídlo
 * nejvýš jednou za den, voda znovu jen když skluz naroste), a ořízne je na zbytek denního stropu.
 * Stav z jiného dne se bere jako prázdný.
 */
export function selectNudgesToSend(nudges: ServerNudge[], state: PushState | undefined, todayISO: string): ServerNudge[] {
  const current: PushState = state && state.date === todayISO ? state : { date: todayISO, sentKeys: [], count: 0 };
  const remaining = Math.max(0, MAX_PUSHES_PER_DAY - current.count);
  return nudges.filter((n) => !current.sentKeys.includes(n.dismissKey)).slice(0, remaining);
}

export function nextPushState(state: PushState | undefined, todayISO: string, sent: ServerNudge[]): PushState {
  const current: PushState = state && state.date === todayISO ? state : { date: todayISO, sentKeys: [], count: 0 };
  return {
    date: todayISO,
    sentKeys: [...current.sentKeys, ...sent.map((n) => n.dismissKey)],
    count: current.count + sent.length,
  };
}

export const PUSH_TITLES: Record<NudgeKind, string> = {
  breakfast: "Snídaně chybí",
  lunch: "Oběd chybí",
  dinner: "Večeře chybí",
  water: "Voda",
};
