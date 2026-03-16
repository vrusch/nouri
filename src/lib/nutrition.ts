/**
 * Logika pro výpočty metabolismu a nutričních cílů.
 * Používá Mifflin-St Jeor rovnici, která je v současnosti považována za nejpřesnější.
 */

export interface NutritionResults {
  bmr: number;
  tdee: number;
  targetCalories: number;
  macros: {
    protein: number; // g
    fat: number;     // g
    carbs: number;   // g
  };
}

export type Goal = 'lose' | 'maintain' | 'gain';
export type Gender = 'male' | 'female';

/**
 * Vypočítá věk z data narození
 */
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

/**
 * Hlavní funkce pro výpočet nutričního plánu
 */
export function calculateNutrition(data: {
  gender: Gender;
  weight: number;
  height: number;
  birthDate: string;
  activityLevel: number;
  goal: Goal;
}): NutritionResults {
  const age = calculateAge(data.birthDate);

  // 1. Výpočet BMR (Mifflin-St Jeor)
  let bmr = (10 * data.weight) + (6.25 * data.height) - (5 * age);
  if (data.gender === 'male') {
    bmr += 5;
  } else {
    bmr -= 161;
  }

  // 2. Výpočet TDEE (Celkový denní výdej)
  const tdee = Math.round(bmr * data.activityLevel);

  // 3. Stanovení cílových kalorií podle cíle
  let targetCalories = tdee;
  if (data.goal === 'lose') {
    targetCalories = tdee - 500; // Standardní deficit pro 0.5kg týdně
    // Bezpečnostní pojistka: nejdeme pod BMR (nebo pod absolutní minimum)
    if (targetCalories < bmr) targetCalories = Math.round(bmr);
  } else if (data.goal === 'gain') {
    targetCalories = tdee + 300; // Jemný přebytek pro nabírání svalů
  }

  // 4. Výpočet maker (Makroživin)
  // Bílkoviny: 1.8g - 2.2g na kg váhy (pro hubnutí/svaly)
  const proteinGrams = Math.round(data.weight * 1.8);
  
  // Tuky: cca 25-30 % celkového příjmu
  const fatGrams = Math.round((targetCalories * 0.25) / 9);
  
  // Sacharidy: zbytek kalorií
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
      carbs: carbGrams
    }
  };
}
