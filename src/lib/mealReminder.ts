// Okna hodin, kdy appka považuje jídlo za "mělo už být zapsané" (FEATURE_IDEAS.md sekce 3,
// snídaně a večeře přibyly v REFERENCE/STRICT_COACHING_SPEC.md, A4). Okna na sebe navazují
// (10 → 14 → 20 → půlnoc), takže appka v jednu chvíli připomíná nejvýš jedno jídlo. Noc
// pokrývá tichý režim (quietHours.ts), ne tahle logika.
const BREAKFAST_OVERDUE_FROM_HOUR = 10;
const LUNCH_OVERDUE_FROM_HOUR = 14;
const LUNCH_OVERDUE_UNTIL_HOUR = 20;
const DINNER_OVERDUE_FROM_HOUR = 20;

export interface MealReminderStatus {
  breakfastOverdue: boolean;
  lunchOverdue: boolean;
  dinnerOverdue: boolean;
}

export type GuessedMealType = "breakfast" | "lunch" | "dinner" | "snack";

/**
 * Výchozí typ nového jídla podle hodiny zápisu (AddMealModal) — schválně tady vedle oken
 * připomínek, ať jídlo zapsané v okně připomínky tu připomínku taky zruší.
 *
 * REGRESE (testování 2026-10-10): "Nezapomeň si zapsat večeři", i když večeře zapsaná byla.
 * Odhad dřív vracel od 20:00 "snack" — přesně od hodiny, kdy začíná připomínka večeře — a
 * 14:00–19:59 "dinner", takže pozdní oběd připomínku oběda nezrušil a odpolední svačina tiše
 * "splnila" večeři. Večeře je teď od 17:00 až do půlnoci (celé okno připomínky); noční svačina
 * uložená jako večeře neuškodí, opačná chyba ano. Typ jde ve formuláři vždy přepnout.
 */
export function guessMealTypeForHour(hour: number): GuessedMealType {
  if (hour < 10) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 17) return "snack";
  return "dinner";
}

// Typický čas jídla podle typu — pro jídla zapsaná zpětně (šablona, diktát "na snídani jsem
// měla…" v poledne), kde čas zápisu není čas jídla. Dřív TEMPLATE_TIME_BY_TYPE v AddMealModal.
export const MEAL_TIME_BY_TYPE: Record<GuessedMealType, string> = {
  breakfast: "08:00",
  lunch: "12:00",
  dinner: "18:00",
  snack: "15:00",
};

/**
 * Typ a čas nového jídla. Řekla-li uživatelka typ sama (diktát "na snídani…", viz
 * functions/src/mealText.ts), platí její typ a typický čas — ale nikdy ne v budoucnu (svačina
 * nadiktovaná v poledne dostane poledne, ne 15:00). Jinak typ podle hodiny zápisu a čas zápisu.
 * Čas je jen pro zobrazení; připomínky, push i Mya se řídí typem.
 */
export function planMealTypeAndTime(statedType: GuessedMealType | null, now: Date): { type: GuessedMealType; time: string } {
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (!statedType) return { type: guessMealTypeForHour(now.getHours()), time: nowTime };
  const typical = MEAL_TIME_BY_TYPE[statedType];
  return { type: statedType, time: typical < nowTime ? typical : nowTime };
}

/**
 * Stejný "overdue" pattern jako computeWorkoutPlanStatus, jen místo dne v týdnu appka
 * porovnává aktuální hodinu s tím, jestli dnes už přibylo jídlo daného typu.
 *
 * Snídaně se nepřipomíná, pokud je už zapsaný oběd — kdo obědval, snídani buď vynechal,
 * nebo ji zapsal jinak (svačina), a dohánět ji zpětně nemá smysl.
 */
export function computeMealReminderStatus(
  todaysMealTypes: string[],
  now: Date = new Date()
): MealReminderStatus {
  const hour = now.getHours();
  const has = (type: string) => todaysMealTypes.includes(type);

  const breakfastOverdue =
    hour >= BREAKFAST_OVERDUE_FROM_HOUR && hour < LUNCH_OVERDUE_FROM_HOUR && !has("breakfast") && !has("lunch");
  const lunchOverdue = hour >= LUNCH_OVERDUE_FROM_HOUR && hour < LUNCH_OVERDUE_UNTIL_HOUR && !has("lunch");
  const dinnerOverdue = hour >= DINNER_OVERDUE_FROM_HOUR && !has("dinner");

  return { breakfastOverdue, lunchOverdue, dinnerOverdue };
}
