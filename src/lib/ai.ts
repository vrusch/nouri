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

const getDailyGreetingFn = httpsCallable<{ profile: UserProfile; consumedToday: number }, { text: string }>(
  functions,
  "getDailyGreeting"
);

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
   */
  async getDailyGreeting(profile: UserProfile, consumedToday: number): Promise<string> {
    try {
      const response = await getDailyGreetingFn({ profile, consumedToday });
      return response.data.text;
    } catch (error) {
      console.error("Mya AI Error:", error);
      return `Ahoj ${profile.name}! Nezapomeň si dnes zapsat všechna jídla.`;
    }
  }
};
