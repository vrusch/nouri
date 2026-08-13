import type { Goal } from "./nutrition";

/**
 * "Dosaženo" = překročeno, ne přesná shoda — u lose stačí currentWeight <= targetWeight (a obráceně
 * u gain), ať appka gratulaci neprošvihne kvůli desetině kila navíc/míň. `lastCelebratedGoalReachedWeight`
 * ukládá KONKRÉTNÍ targetWeight, který appka naposledy oslavila (ne bool) — stejný princip jako
 * lastCelebratedWeightMilestoneKg v milestones.ts — takže když si uživatelka nastaví nový cíl, appka
 * může gratulovat znovu, jakmile ho dosáhne.
 */
export function detectGoalReached(
  currentWeight: number,
  targetWeight: number | undefined,
  goal: Goal,
  lastCelebratedGoalReachedWeight: number | undefined
): boolean {
  if (goal === "maintain" || targetWeight === undefined) return false;

  const reached = goal === "lose" ? currentWeight <= targetWeight : currentWeight >= targetWeight;
  if (!reached) return false;

  return lastCelebratedGoalReachedWeight !== targetWeight;
}
