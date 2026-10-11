// BMI pro kartu ve Statistikách — orientační číslo z váhy a výšky v profilu, hranice
// kategorií podle WHO pro dospělé. Stupnice karty běží od BMI_SCALE_MIN do BMI_SCALE_MAX.

export const BMI_SCALE_MIN = 15;
export const BMI_SCALE_MAX = 35;
export const BMI_NORMAL_MIN = 18.5;
export const BMI_OVERWEIGHT_MIN = 25;
export const BMI_OBESE_MIN = 30;

export type BmiCategory = "underweight" | "normal" | "overweight" | "obese";

export const BMI_CATEGORY_LABELS_CS: Record<BmiCategory, string> = {
  underweight: "Podváha",
  normal: "Normální váha",
  overweight: "Nadváha",
  obese: "Obezita",
};

export const BMI_SCALE_SEGMENTS: { category: BmiCategory; from: number; to: number }[] = [
  { category: "underweight", from: BMI_SCALE_MIN, to: BMI_NORMAL_MIN },
  { category: "normal", from: BMI_NORMAL_MIN, to: BMI_OVERWEIGHT_MIN },
  { category: "overweight", from: BMI_OVERWEIGHT_MIN, to: BMI_OBESE_MIN },
  { category: "obese", from: BMI_OBESE_MIN, to: BMI_SCALE_MAX },
];

/** BMI zaokrouhlené na jedno desetinné místo, nebo null, když váha/výška chybí či nedává smysl. */
export function computeBmi(weightKg: number | undefined, heightCm: number | undefined): number | null {
  if (weightKg === undefined || heightCm === undefined) return null;
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm) || weightKg <= 0 || heightCm <= 0) return null;
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

/**
 * Kategorie z už zaokrouhlené (zobrazené) hodnoty — z nezaokrouhlené by zobrazené 25.0
 * mohlo dostat popisek "Normální váha".
 */
export function getBmiCategory(bmi: number): BmiCategory {
  if (bmi < BMI_NORMAL_MIN) return "underweight";
  if (bmi < BMI_OVERWEIGHT_MIN) return "normal";
  if (bmi < BMI_OBESE_MIN) return "overweight";
  return "obese";
}

/** Pozice na stupnici v procentech (0–100); hodnota mimo stupnici se přilepí ke kraji. */
export function getBmiScalePosition(bmi: number): number {
  const ratio = (bmi - BMI_SCALE_MIN) / (BMI_SCALE_MAX - BMI_SCALE_MIN);
  return Math.min(100, Math.max(0, ratio * 100));
}
