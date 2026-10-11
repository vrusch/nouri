import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type Confidence = "low" | "medium" | "high";

// Fotek jednoho jídla najednou — stejný limit hlídá i server (functions/src/visionInput.ts).
export const MAX_FOOD_PHOTOS = 3;

export interface VisionResult {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  type: MealType;
  confidence: Confidence;
}

/** Jedno jídlo z popisu/diktátu s víc jídly (viz functions/src/mealText.ts). */
export interface TextMealEstimate {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  statedType: MealType | null; // typ jen když ho uživatelka řekla ("na snídani…"), jinak null
  confidence: Confidence;
}

const analyzeFoodFn = httpsCallable<
  { imageDataUrl: string; imageDataUrls: string[]; hint?: string },
  VisionResult | null
>(functions, "analyzeFood");
const analyzeFoodTextFn = httpsCallable<{ description: string }, VisionResult | null>(functions, "analyzeFoodText");
const analyzeMealsTextFn = httpsCallable<
  { description: string; multi: true },
  { meals: TextMealEstimate[] } | VisionResult | null
>(functions, "analyzeFoodText");

export const MyaVision = {
  /**
   * Rozpozná jídlo z 1–3 fotek téhož jídla přes server-side Cloud Function (OpenAI klíč zůstává
   * na serveru). Volitelný `hint` je doplňující upřesnění od uživatele k nejisté fotce (viz
   * interaktivní doptání v AddMealModal), appka jím vyžádá re-analýzu se stejnými fotkami.
   * `imageDataUrl` (první fotka) jde navíc kvůli starší verzi funkce, která víc fotek nezná —
   * ta pak vyhodnotí aspoň první místo chyby.
   * Vrací null při chybě — volající strana musí v tom případě nabídnout manuální zápis.
   */
  async analyzeFood(imageDataUrls: string[], hint?: string): Promise<VisionResult | null> {
    try {
      const response = await analyzeFoodFn({ imageDataUrl: imageDataUrls[0], imageDataUrls, hint });
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
  },

  /**
   * Popis/diktát, který může obsahovat víc jídel ("na snídani…, k obědu…"), rozdělený na
   * jednotlivá jídla. Starší server bez `multi` režimu vrátí jedno jídlo — appka ho pak bere
   * jako jediné jídlo bez řečeného typu, tedy přesně jako dřív. null při chybě nebo když nic
   * nerozpoznal — volající strana nabídne manuální zápis.
   */
  async analyzeMealsFromText(description: string): Promise<TextMealEstimate[] | null> {
    try {
      const data = (await analyzeMealsTextFn({ description, multi: true })).data;
      if (!data) return null;
      if ("meals" in data) return Array.isArray(data.meals) && data.meals.length > 0 ? data.meals : null;
      const { name, calories, protein, fat, carbs, confidence } = data;
      return [{ name, calories, protein, fat, carbs, confidence, statedType: null }];
    } catch (error) {
      console.error("Mya Vision Error:", error);
      return null;
    }
  },
};
