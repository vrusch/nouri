import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { type UserProfile } from "../context/AuthContext";
import { calculateNutrition } from "./nutrition";

export interface AIResponse {
  text: string;
  data?: any;
}

const generateWelcomeReportFn = httpsCallable<{ profile: UserProfile }, AIResponse>(
  functions,
  "generateWelcomeReport"
);

interface DailyStats {
  consumedCalories: number;
  consumedProtein: number;
}

const getDailyGreetingFn = httpsCallable<{ profile: UserProfile } & DailyStats, { text: string }>(
  functions,
  "getDailyGreeting"
);

export interface MealFeedbackInput {
  mealName: string;
  calories: number;
  protein: number;
  mealType: string;
  consumedTodayCalories: number;
  targetCalories: number;
}

const getMealFeedbackFn = httpsCallable<MealFeedbackInput, { text: string }>(functions, "getMealFeedback");

export const MyaAI = {
  /**
   * Vygeneruje úvodní report (vstupní diagnózu) přes server-side Cloud Function.
   */
  async generateWelcomeReport(profile: UserProfile): Promise<AIResponse> {
    // Spočítáno i lokálně, aby fallback zprávy měly reálná čísla i při výpadku funkce samotné.
    const results = calculateNutrition({
      gender: profile.gender,
      weight: profile.weight,
      height: profile.height,
      birthDate: profile.birthDate,
      activityLevel: profile.activityLevel,
      goal: profile.goal
    });

    try {
      const response = await generateWelcomeReportFn({ profile });
      return response.data;
    } catch (error) {
      console.error("Mya AI Error:", error);
      return {
        text: "Mya právě odpočívá. Tvůj plán: Jez " + results.targetCalories + " kcal denně a soustřeď se na bílkoviny (" + results.macros.protein + "g).",
        data: results
      };
    }
  },

  /**
   * Vygeneruje krátkou proaktivní zprávu pro Home screen přes server-side Cloud Function.
   * Zohledňuje i snězené bílkoviny, ne jen kalorie.
   */
  async getDailyGreeting(profile: UserProfile, stats: DailyStats): Promise<string> {
    try {
      const response = await getDailyGreetingFn({ profile, ...stats });
      return response.data.text;
    } catch (error) {
      console.error("Mya AI Error:", error);
      return `Ahoj ${profile.name}! Nezapomeň si dnes zapsat všechna jídla.`;
    }
  },

  /**
   * Krátká AI reakce na konkrétní právě uložené jídlo.
   */
  async getMealFeedback(input: MealFeedbackInput): Promise<string> {
    try {
      const response = await getMealFeedbackFn(input);
      return response.data.text;
    } catch (error) {
      console.error("Mya AI Error:", error);
      return "Zapsáno! 👍";
    }
  }
};
