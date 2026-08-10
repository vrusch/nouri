import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import type { Goal } from "./nutrition";

export interface RecipeResult {
  name: string;
  description: string;
  ingredients: string[];
  instructions: string[];
  prepMinutes: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface GenerateRecipeInput {
  remainingCalories: number;
  remainingProtein: number;
  remainingFat: number;
  remainingCarbs: number;
  goal: Goal;
  preferences?: string;
}

const generateRecipeFn = httpsCallable<GenerateRecipeInput, RecipeResult | null>(functions, "generateRecipe");

export const MyaRecipes = {
  /**
   * Vygeneruje recept sedící do zbývajících denních maker přes server-side Cloud Function.
   * Vrací null při chybě — volající strana musí zobrazit poctivý chybový stav, ne fallback recept.
   */
  async generateRecipe(input: GenerateRecipeInput): Promise<RecipeResult | null> {
    try {
      const response = await generateRecipeFn(input);
      return response.data;
    } catch (error) {
      console.error("Mya Recipe Error:", error);
      return null;
    }
  },
};
