import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { type UserProfile } from "../context/AuthContext";
import { calculateNutrition, type NutritionResults, type Goal } from "./nutrition";

export interface AIResponse {
  text: string;
  data?: NutritionResults;
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

export interface MacroPatternInput {
  avgProtein: number;
  targetProtein: number;
  daysConsidered: number;
  goal: Goal;
}

const suggestMacroFixFn = httpsCallable<MacroPatternInput, { text: string }>(functions, "suggestMacroFix");

export interface CalorieIntakePatternInput {
  avgCalories: number;
  targetCalories: number;
  daysConsidered: number;
  goal: Goal;
}

const checkLowCalorieIntakeFn = httpsCallable<CalorieIntakePatternInput, { text: string }>(functions, "checkLowCalorieIntake");

export interface WeeklySummaryInput {
  avgCalories: number;
  targetCalories: number;
  daysLogged: number;
  weekdayAvgProtein: number;
  weekdayDaysLogged: number;
  weekendAvgProtein: number;
  weekendDaysLogged: number;
  targetProtein: number;
  goal: Goal;
}

const getWeeklySummaryFn = httpsCallable<WeeklySummaryInput, { text: string }>(functions, "getWeeklySummary");

export interface ChatMessageInput {
  role: "user" | "assistant";
  content: string;
}

const chatWithMyaFn = httpsCallable<{ profile: UserProfile; messages: ChatMessageInput[] }, { text: string }>(
  functions,
  "chatWithMya"
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
      goal: profile.goal,
      calibratedTDEE: profile.calibratedTDEE
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
  },

  /**
   * Vygeneruje krátký proaktivní návrh, když appka delší dobu vidí nedostatek bílkovin
   * (viz detectLowProteinPattern v macroPattern.ts) — místo tichého reportování v grafu.
   */
  async suggestMacroFix(input: MacroPatternInput): Promise<string> {
    try {
      const response = await suggestMacroFixFn(input);
      return response.data.text;
    } catch (error) {
      console.error("Mya AI Error:", error);
      return `Posledních pár dní ti chybí bílkoviny k cíli (${input.targetProtein}g/den) — zkus přidat větší porci masa, tvarohu nebo luštěnin k jednomu z jídel.`;
    }
  },

  /**
   * Jemná, pečovatelská zpráva, když appka delší dobu vidí výrazně podprůměrný kalorický příjem
   * (viz detectLowCaloriePattern v calorieIntakePattern.ts) — místo tichého reportování v grafu.
   */
  async checkLowCalorieIntake(input: CalorieIntakePatternInput): Promise<string> {
    try {
      const response = await checkLowCalorieIntakeFn(input);
      return response.data.text;
    } catch (error) {
      console.error("Mya AI Error:", error);
      return `Posledních pár dní jíš výrazně méně, než je tvůj cíl (${input.targetCalories} kcal/den) — je u tebe všechno v pořádku?`;
    }
  },

  /**
   * Týdenní shrnutí na vyžádání (viz computeWeekdayWeekendProteinBreakdown v weekSummary.ts) —
   * na rozdíl od ostatních proaktivních funkcí se volá jen na klik tlačítka, ne automaticky.
   */
  async getWeeklySummary(input: WeeklySummaryInput): Promise<string> {
    try {
      const response = await getWeeklySummaryFn(input);
      return response.data.text;
    } catch (error) {
      console.error("Mya AI Error:", error);
      return `Tenhle týden jsi v průměru měla ${input.avgCalories} kcal/den z cíle ${input.targetCalories} kcal (zapsáno ${input.daysLogged}/7 dní).`;
    }
  },

  /**
   * Volný chat s Myou — na rozdíl od ostatních funkcí přijímá historii konverzace,
   * ořezanou appkou na posledních pár zpráv (viz MyaChatModal), aby volání OpenAI
   * nerostlo do nekonečna s délkou konverzace.
   */
  async chatWithMya(profile: UserProfile, messages: ChatMessageInput[]): Promise<string> {
    try {
      const response = await chatWithMyaFn({ profile, messages });
      return response.data.text;
    } catch (error) {
      console.error("Mya AI Error:", error);
      return "Mya právě neodpovídá — zkus to prosím znovu za chvíli.";
    }
  }
};
