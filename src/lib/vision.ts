import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type Confidence = "low" | "medium" | "high";

export interface VisionResult {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  type: MealType;
  confidence: Confidence;
}

const analyzeFoodFn = httpsCallable<{ imageDataUrl: string }, VisionResult | null>(functions, "analyzeFood");
const analyzeFoodTextFn = httpsCallable<{ description: string }, VisionResult | null>(functions, "analyzeFoodText");

export const MyaVision = {
  /**
   * Rozpozná jídlo z fotky přes server-side Cloud Function (OpenAI klíč zůstává na serveru).
   * Vrací null při chybě — volající strana musí v tom případě nabídnout manuální zápis.
   */
  async analyzeFood(imageDataUrl: string): Promise<VisionResult | null> {
    try {
      const response = await analyzeFoodFn({ imageDataUrl });
      return response.data;
    } catch (error) {
      console.error("Mya Vision Error:", error);
      return null;
    }
  },

  /**
   * Odhadne nutriční hodnoty ze slovního popisu jídla (bez fotky), stejná server-side Cloud Function rodina.
   * Vrací null při chybě — volající strana musí v tom případě nabídnout manuální zápis.
   */
  async analyzeFoodText(description: string): Promise<VisionResult | null> {
    try {
      const response = await analyzeFoodTextFn({ description });
      return response.data;
    } catch (error) {
      console.error("Mya Vision Error:", error);
      return null;
    }
  }
};
