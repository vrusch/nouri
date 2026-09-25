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
