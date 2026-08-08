export interface NutritionResults {
  bmr: number;
  tdee: number;
  targetCalories: number;
  macros: {
    protein: number; // g
    fat: number; // g
    carbs: number; // g
  };
}

export type Goal = "lose" | "maintain" | "gain";
export type Gender = "male" | "female";

export function calculateAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export function calculateNutrition(data: {
  gender: Gender;
  weight: number;
  height: number;
  birthDate: string;
  activityLevel: number;
  goal: Goal;
  calibratedTDEE?: number;
}): NutritionResults {
  const age = calculateAge(data.birthDate);

  let bmr = 10 * data.weight + 6.25 * data.height - 5 * age;
  if (data.gender === "male") {
    bmr += 5;
  } else {
    bmr -= 161;
  }

  // Pokud existuje kalibrace ze skutečných dat (viz calibrateTarget v klientském nutrition.ts),
  // má přednost před formulkovým odhadem z activityLevel.
  const tdee = data.calibratedTDEE ?? Math.round(bmr * data.activityLevel);

  let targetCalories = tdee;
  if (data.goal === "lose") {
    targetCalories = tdee - 500;
    if (targetCalories < bmr) targetCalories = Math.round(bmr);
  } else if (data.goal === "gain") {
    targetCalories = tdee + 300;
  }

  const proteinGrams = Math.round(data.weight * 1.8);
  const fatGrams = Math.round((targetCalories * 0.25) / 9);
  const proteinKcal = proteinGrams * 4;
  const fatKcal = fatGrams * 9;
  const carbKcal = targetCalories - proteinKcal - fatKcal;
  const carbGrams = Math.round(carbKcal / 4);

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    targetCalories: Math.round(targetCalories),
    macros: {
      protein: proteinGrams,
      fat: fatGrams,
      carbs: carbGrams,
    },
  };
}
