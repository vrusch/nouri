// Okno hodin, kdy appka považuje oběd za "měl už být zapsaný" (FEATURE_IDEAS.md sekce 3).
// Horní hranice appce brání připomínat oběd i večer, kdy už je namístě spíš večeře.
const LUNCH_OVERDUE_FROM_HOUR = 14;
const LUNCH_OVERDUE_UNTIL_HOUR = 20;

export interface MealReminderStatus {
  lunchOverdue: boolean;
}

/**
 * Stejný "overdue" pattern jako computeWorkoutPlanStatus, jen místo dne v týdnu appka
 * porovnává aktuální hodinu s tím, jestli dnes už přibylo jídlo typu "lunch".
 */
export function computeMealReminderStatus(
  todaysMealTypes: string[],
  now: Date = new Date()
): MealReminderStatus {
  const hour = now.getHours();
  const lunchOverdue =
    hour >= LUNCH_OVERDUE_FROM_HOUR && hour < LUNCH_OVERDUE_UNTIL_HOUR && !todaysMealTypes.includes("lunch");
  return { lunchOverdue };
}
