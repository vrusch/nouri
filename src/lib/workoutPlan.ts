export const DAY_NAMES_CS = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];

export interface WorkoutPlanStatus {
  isPlannedToday: boolean;
  reminderDue: boolean;
}

/**
 * Vyhodnotí, jestli má appka dnes připomenout naplánovaný trénink — stejný "overdue" pattern
 * jako computeWeighInStatus/computeProfileCheckStatus, jen místo počtu dní od posledního
 * záznamu appka porovnává den v týdnu s uživatelem vybranými plánovanými dny (viz Profile.tsx,
 * "Plán tréninků"). Bez naplánovaných dní (prázdné/chybí pole) appka nic nepřipomíná — na
 * rozdíl od profileCheck tady "nikdy nenastaveno" neznamená "po termínu", ale "appka o plánu neví".
 */
export function computeWorkoutPlanStatus(
  plannedDays: number[] | undefined,
  workoutLoggedToday: boolean,
  now: Date = new Date()
): WorkoutPlanStatus {
  const isPlannedToday = !!plannedDays && plannedDays.includes(now.getDay());
  return { isPlannedToday, reminderDue: isPlannedToday && !workoutLoggedToday };
}
