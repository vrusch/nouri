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

// Kolik kcal odpovídá změně 1 kg tělesné hmotnosti — běžně používaná aproximace
// (ve skutečnosti kolísá s podílem tuku/vody, ale pro odhad z reálných dat stačí).
const KCAL_PER_KG = 7700;

function applyGoalAdjustment(tdee: number, goal: Goal, bmr: number): number {
  if (goal === 'lose') {
    const target = tdee - 500; // Standardní deficit pro 0.5kg týdně
    // Bezpečnostní pojistka: nejdeme pod BMR (nebo pod absolutní minimum)
    return target < bmr ? Math.round(bmr) : Math.round(target);
  }
  if (goal === 'gain') {
    return Math.round(tdee + 300); // Jemný přebytek pro nabírání svalů
  }
  return Math.round(tdee);
}

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
  calibratedTDEE?: number;
}): NutritionResults {
  const age = calculateAge(data.birthDate);

  // 1. Výpočet BMR (Mifflin-St Jeor)
  let bmr = (10 * data.weight) + (6.25 * data.height) - (5 * age);
  if (data.gender === 'male') {
    bmr += 5;
  } else {
    bmr -= 161;
  }

  // 2. Výpočet TDEE (Celkový denní výdej) — pokud existuje kalibrace ze skutečných dat
  // (viz calibrateTarget níže), má přednost před formulkovým odhadem z activityLevel.
  const tdee = data.calibratedTDEE ?? Math.round(bmr * data.activityLevel);

  // 3. Stanovení cílových kalorií podle cíle
  const targetCalories = applyGoalAdjustment(tdee, data.goal, bmr);

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

/**
 * Krátká hláška k dennímu kalorickému postupu na Home obrazovce. Musí rozlišit "nic
 * nezapsáno" od "postupuje v pohodě" — 0 % postupu není totéž co "skvělé tempo".
 */
export function getProgressCaption(consumedCalories: number, progressPercent: number): string {
  if (consumedCalories === 0) return "Zatím jsi dnes nic nezapsala — pojďme na to!";
  if (progressPercent > 80) return "Pozor na večeři!";
  return "Skvělé tempo! K obědu si můžeš dát něco vydatnějšího.";
}

const MIN_CALIBRATION_SPAN_DAYS = 14;
const MIN_CALIBRATION_LOGGED_DAYS = 7;
const CALIBRATION_DEVIATION_THRESHOLD = 0.1; // 10 % — pod touhle odchylkou se odhad bere jako "v podstatě sedí"

export interface CalibrationInsight {
  estimatedTDEE: number;
  suggestedTargetCalories: number;
  daysSpan: number;
  loggedDays: number;
  avgLoggedCalories: number;
  weightChangeKg: number;
}

/**
 * Odhadne skutečný denní výdej ze skutečných dat (reálné zápisy váhy + zapsaná jídla),
 * místo spoléhání na formulku + sebehodnocenou úroveň aktivity. Vrací null, pokud není
 * dost dat na spolehlivý odhad, nebo pokud se odhad od formulky v podstatě neliší.
 */
export function calibrateTarget(
  manualWeighIns: { date: string; weight: number }[],
  dailyCalories: { date: string; calories: number }[],
  goal: Goal,
  bmr: number,
  formulaTDEE: number
): CalibrationInsight | null {
  if (manualWeighIns.length < 2) return null;

  const sorted = [...manualWeighIns].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const daysSpan = Math.round((Date.parse(last.date) - Date.parse(first.date)) / 86400000);
  if (daysSpan < MIN_CALIBRATION_SPAN_DAYS) return null;

  const loggedInWindow = dailyCalories.filter((d) => d.date >= first.date && d.date <= last.date);
  if (loggedInWindow.length < MIN_CALIBRATION_LOGGED_DAYS) return null;

  const avgLoggedCalories = Math.round(
    loggedInWindow.reduce((sum, d) => sum + d.calories, 0) / loggedInWindow.length
  );
  const weightChangeKg = Math.round((last.weight - first.weight) * 10) / 10;
  const actualDailyBalance = (weightChangeKg * KCAL_PER_KG) / daysSpan;
  const estimatedTDEE = Math.round(avgLoggedCalories - actualDailyBalance);

  const deviation = Math.abs(estimatedTDEE - formulaTDEE) / formulaTDEE;
  if (deviation < CALIBRATION_DEVIATION_THRESHOLD) return null;

  return {
    estimatedTDEE,
    suggestedTargetCalories: applyGoalAdjustment(estimatedTDEE, goal, bmr),
    daysSpan,
    loggedDays: loggedInWindow.length,
    avgLoggedCalories,
    weightChangeKg,
  };
}
