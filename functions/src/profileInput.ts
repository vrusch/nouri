import type { Gender, Goal } from "./nutrition.js";

// N38 (AUDIT_2026-08-14.md) — generateWelcomeReport, getDailyGreeting a chatWithMya dřív
// věřily profilu z request.data napřímo (jen `as UserProfileInput`). Nesmyslné číslo (NaN,
// záporná váha, override maker jako řetězec) pak prošlo až do calculateNutrition a do promptu.
//
// Hranice jsou záměrně ŠIRŠÍ než validace v klientu (Onboarding: 100–250 cm, 30–300 kg,
// 10–100 let; Profil: vlastní makra 0–500 g) — profily založené dřív, než klient validoval,
// nesmí po nasazení spadnout na fallback texty. Server chytá jen zjevně rozbitá data.
// Povinná pole: rozbitá → null (volající vrátí invalid-argument). Nepovinné přepisy
// (kalibrace, vlastní makra): rozbité se zahodí a platí výpočet z formulky, stejně jako v klientu.

export interface UserProfileInput {
  name: string;
  gender: Gender;
  height: number;
  weight: number;
  birthDate: string;
  activityLevel: number;
  goal: Goal;
  calibratedTDEE?: number;
  customProteinGrams?: number;
  customFatGrams?: number;
  coachingStyle?: unknown; // Styl Myi, validuje parseCoachingStyle (viz coachingStyle.ts)
}

const GENDERS: readonly Gender[] = ["male", "female"];
const GOALS: readonly Goal[] = ["lose", "maintain", "gain"];

// Číselný řetězec ("168", "1.375") se převede na číslo — starý kód ho díky JS koerci
// (`10 * weight`) snesl, a nelze doložit, že ho žádný starší build nikdy do profilu nezapsal.
// Validace nesmí takový profil po nasazení odříznout; prázdný řetězec číslo není.
function finiteInRange(value: unknown, min: number, max: number): number | undefined {
  const num = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof num === "number" && Number.isFinite(num) && num >= min && num <= max ? num : undefined;
}

function isPlausibleBirthDate(value: unknown, now: Date): value is string {
  if (typeof value !== "string") return false;
  const birth = new Date(value);
  if (Number.isNaN(birth.getTime())) return false;
  const ageYears = (now.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return ageYears >= 0 && ageYears <= 130;
}

export function parseProfileInput(value: unknown, now: Date = new Date()): UserProfileInput | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  const gender = GENDERS.find((g) => g === raw.gender);
  const goal = GOALS.find((g) => g === raw.goal);
  const height = finiteInRange(raw.height, 50, 300);
  const weight = finiteInRange(raw.weight, 20, 500);
  const activityLevel = finiteInRange(raw.activityLevel, 1, 2.5);
  if (!gender || !goal || height === undefined || weight === undefined || activityLevel === undefined) return null;
  if (!isPlausibleBirthDate(raw.birthDate, now)) return null;

  const profile: UserProfileInput = {
    name: typeof raw.name === "string" ? raw.name : "",
    gender,
    height,
    weight,
    birthDate: raw.birthDate,
    activityLevel,
    goal,
    coachingStyle: raw.coachingStyle,
  };
  const calibratedTDEE = finiteInRange(raw.calibratedTDEE, 500, 10000);
  if (calibratedTDEE !== undefined) profile.calibratedTDEE = calibratedTDEE;
  const customProteinGrams = finiteInRange(raw.customProteinGrams, 0, 1000);
  if (customProteinGrams !== undefined) profile.customProteinGrams = customProteinGrams;
  const customFatGrams = finiteInRange(raw.customFatGrams, 0, 1000);
  if (customFatGrams !== undefined) profile.customFatGrams = customFatGrams;
  return profile;
}
