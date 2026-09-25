// Včerejší bilance pro denní pozdrav Myi (REFERENCE/STRICT_COACHING_SPEC.md, A3) — ať Mya
// umí navázat na včerejší přestřelení ("včera +500 kcal, dnes zase podle plánu"). Cíl musí
// zahrnovat včerejší tréninkový bonus stejně jako Home (adjustedGoalCalories), jinak by
// přísná Mya po tréninkovém dni hlásila falešné překročení.

export interface YesterdayReview {
  consumedCalories: number;
  targetCalories: number;
  isVacationDay: boolean;
}

/**
 * null = včera nic zapsáno — appka pak o včerejšku mlčí, místo aby Mye podstrčila "0 kcal"
 * (stejná past jako "nic nezapsáno" vs. "nic nesnědeno" u getProgressCaption).
 *
 * baseTargetCalories je dnešní cíl bez tréninkového bonusu (vč. případného luteálního
 * bonusu) — cíl se mezi dvěma po sobě jdoucími dny prakticky nemění, přesná historie cílů
 * appka neukládá.
 */
export function buildYesterdayReview(
  yesterdayMeals: { value: number }[],
  yesterdayWorkouts: { caloriesBurned: number }[],
  baseTargetCalories: number,
  isVacationDay: boolean
): YesterdayReview | null {
  if (yesterdayMeals.length === 0) return null;
  const consumedCalories = Math.round(yesterdayMeals.reduce((sum, m) => sum + m.value, 0));
  const workoutBonus = yesterdayWorkouts.reduce((sum, w) => sum + w.caloriesBurned, 0);
  return { consumedCalories, targetCalories: Math.round(baseTargetCalories + workoutBonus), isVacationDay };
}
