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
  availableIngredients?: string;
}

// N39 (AUDIT_2026-08-14.md) — dřív `extends GenerateRecipeInput`, což slibovalo i
// availableIngredients — server (FridgeRecipeInput ve functions/src/index.ts) tohle pole
// nikdy nečetl (fotka lednice je přesně proto, aby appka suroviny nemusela vypisovat ručně)
// a appka ho ani neposílala, jen typ tvrdil, že by mohlo.
export interface GenerateRecipeFromFridgeInput {
  imageDataUrl: string;
  remainingCalories: number;
  remainingProtein: number;
  remainingFat: number;
  remainingCarbs: number;
  goal: Goal;
  preferences?: string;
}

const generateRecipeFn = httpsCallable<GenerateRecipeInput, RecipeResult | null>(functions, "generateRecipe");
const generateRecipeFromFridgeFn = httpsCallable<GenerateRecipeFromFridgeInput, RecipeResult | null>(
  functions,
  "generateRecipeFromFridge"
);

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

  /**
   * Rozpozná suroviny z fotky lednice/spíže a vygeneruje recept sedící do zbývajících maker.
   * Vrací null jak při chybě, tak když Mya na fotce nerozpozná použitelné suroviny.
   */
  async generateRecipeFromFridgePhoto(input: GenerateRecipeFromFridgeInput): Promise<RecipeResult | null> {
    try {
      const response = await generateRecipeFromFridgeFn(input);
      return response.data;
    } catch (error) {
      console.error("Mya Fridge Recipe Error:", error);
      return null;
    }
  },
};
