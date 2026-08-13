import type { Goal } from "./nutrition";

export const STREAK_MILESTONES = [7, 30, 100, 365];

const STREAK_MESSAGES: Record<number, string> = {
  7: "🔥 Týden v řadě zapsáno! Skvělý začátek návyku.",
  30: "🎉 30 dní v řadě zapsáno! Tohle už je pevný návyk.",
  100: "🏆 100 dní v řadě zapsáno! Neuvěřitelná vytrvalost.",
  365: "👑 Celý rok v řadě zapsáno! Famózní výkon.",
};

/**
 * Nejvyšší práh ze STREAK_MILESTONES, který je aktuální streak dosáhla a ještě nebyl oslaven —
 * `lastCelebrated` je persistovaná hranice (profile.lastCelebratedStreakDays), takže appka
 * stejný milník neoznámí dvakrát.
 */
export function detectNewStreakMilestone(currentStreak: number, lastCelebrated: number | undefined): number | null {
  const last = lastCelebrated ?? 0;
  const reached = STREAK_MILESTONES.filter((m) => m <= currentStreak && m > last);
  return reached.length > 0 ? reached[reached.length - 1] : null;
}

export function buildStreakMilestoneMessage(days: number): string {
  return STREAK_MESSAGES[days] ?? `🔥 ${days} dní v řadě zapsáno!`;
}

const WEIGHT_MILESTONE_STEP_KG = 5;

/**
 * Nejvyšší násobek 5 kg pokroku směrem k cíli (lose = úbytek, gain = nabírání), který appka
 * ještě neoslavila. `maintain` nemá směr pokroku, takže se u něj milníky nepočítají.
 */
export function detectNewWeightMilestone(
  startWeight: number,
  currentWeight: number,
  goal: Goal,
  lastCelebratedKg: number | undefined
): number | null {
  if (goal === "maintain") return null;

  const progressKg = goal === "lose" ? startWeight - currentWeight : currentWeight - startWeight;
  if (progressKg <= 0) return null;

  const milestone = Math.floor(progressKg / WEIGHT_MILESTONE_STEP_KG) * WEIGHT_MILESTONE_STEP_KG;
  const last = lastCelebratedKg ?? 0;
  return milestone > last && milestone > 0 ? milestone : null;
}

export function buildWeightMilestoneMessage(kg: number, goal: Goal): string {
  return goal === "lose" ? `🎉 ${kg} kg dolů! Skvělý pokrok k tvému cíli.` : `🎉 ${kg} kg nahoru! Skvělý pokrok k tvému cíli.`;
}
