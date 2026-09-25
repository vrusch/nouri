import { shouldMuteMealRemindersOnVacation, type CoachingStyle } from "./coachingStyle";
import type { MealReminderStatus } from "./mealReminder";
import type { WaterPaceStatus } from "./water";

// Jediný zdroj pravdy pro připomínky jídla a vody (REFERENCE/STRICT_COACHING_SPEC.md, A5) —
// zvon v hlavičce i banner na Home volají tuhle funkci, ať si nikdy neodporují. Tichý režim
// tu záměrně NENÍ: zvon jde otevřít ručně i v noci (potlačuje se jen červená tečka a banner),
// takže o něm rozhoduje volající strana, stejně jako dřív u vážení a oběda.

export type NudgeKind = "breakfast" | "lunch" | "dinner" | "water";

export interface Nudge {
  kind: NudgeKind;
  text: string;
  /** Klíč pro "schovat" — u vody obsahuje očekávaný počet sklenic, ať se připomínka po
   *  zavření vrátí, jakmile skluz dál naroste. */
  dismissKey: string;
}

export interface NudgeInput {
  mealReminder: MealReminderStatus;
  /** null = voda ještě nedorazila z Firestore (0 by jinak vypadalo jako "nic nevypito"). */
  waterPace: (WaterPaceStatus & { glasses: number }) | null;
  style: CoachingStyle;
  isVacationDay: boolean;
}

// Čeština potřebuje u každého jídla jiný pád i rod — tabulka je čitelnější než skládání koncovek.
const MEAL_TEXTS: Record<Exclude<NudgeKind, "water">, { nominative: string; gentle: string; balanced: string; strict: string }> = {
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

function mealNudgeText(kind: Exclude<NudgeKind, "water">, style: CoachingStyle, isVacationDay: boolean): string {
  const texts = MEAL_TEXTS[kind];
  // Na volnu se připomínka jídla ukáže jen v přísném stylu (viz shouldMuteMealRemindersOnVacation).
  if (isVacationDay) return `Volno neznamená nezapisovat — ${texts.nominative} ještě chybí.`;
  return texts[style];
}

function waterNudgeText(glasses: number, expected: number, style: CoachingStyle): string {
  if (style === "gentle") return `Dej si sklenici vody — touhle dobou bývá ${expected}, máš ${glasses}.`;
  if (style === "strict") return `Piješ málo! Máš ${glasses} z ${expected} sklenic, co už měly být vypité.`;
  return `Voda zaostává — touhle dobou bys měla mít ${expected} sklenic, máš ${glasses}.`;
}

export function computeActiveNudges({ mealReminder, waterPace, style, isVacationDay }: NudgeInput): Nudge[] {
  const nudges: Nudge[] = [];
  const muteMeals = isVacationDay && shouldMuteMealRemindersOnVacation(style);

  if (!muteMeals) {
    const overdueMeal: Exclude<NudgeKind, "water"> | null = mealReminder.breakfastOverdue
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

  // Voda se volnem neztlumí nikdy — pitný režim není dieta.
  if (waterPace?.behind) {
    nudges.push({
      kind: "water",
      text: waterNudgeText(waterPace.glasses, waterPace.expectedGlasses, style),
      dismissKey: `water_${waterPace.expectedGlasses}`,
    });
  }

  return nudges;
}
