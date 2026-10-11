import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import type { Goal } from "./nutrition";

export type RecipeMealType = "breakfast" | "lunch" | "dinner" | "snack";

export const RECIPE_MEAL_TYPE_LABELS: Record<RecipeMealType, string> = {
  breakfast: "Snídaně",
  lunch: "Oběd",
  dinner: "Večeře",
  snack: "Svačina",
};

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
  // Jen u receptů ze sady (generateRecipes) — starší uložené recepty ho nemají.
  mealType?: RecipeMealType;
}

/** Denní cíl, podle kterého Mya v sadě receptů dimenzuje porce (lehká snídaně je menší než oběd). */
export interface RecipeDailyTarget {
  dailyCalories: number;
  dailyProtein: number;
  dailyFat: number;
  dailyCarbs: number;
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

// `multi: true` = sada až 3 receptů (lehká snídaně, oběd, večeře — viz functions/src/recipes.ts).
// Server bez téhle změny vrací jeden recept, normalizeRecipeSet ho zabalí do seznamu.
type RecipeSetResponse = RecipeResult | { recipes: RecipeResult[] } | null;

const generateRecipeFn = httpsCallable<GenerateRecipeInput & RecipeDailyTarget & { multi: true }, RecipeSetResponse>(
  functions,
  "generateRecipe"
);
const generateRecipeFromFridgeFn = httpsCallable<
  GenerateRecipeFromFridgeInput & RecipeDailyTarget & { multi: true },
  RecipeSetResponse
>(functions, "generateRecipeFromFridge");

/** Odpověď funkce → seznam receptů, nebo null (nic, chyba, prázdná sada). */
export function normalizeRecipeSet(data: unknown): RecipeResult[] | null {
  if (!data || typeof data !== "object") return null;
  if ("recipes" in data) {
    const recipes = (data as { recipes: unknown }).recipes;
    if (!Array.isArray(recipes)) return null;
    const valid = recipes.filter((recipe): recipe is RecipeResult => !!recipe && typeof recipe === "object");
    return valid.length > 0 ? valid : null;
  }
  return [data as RecipeResult];
}

export const MyaRecipes = {
  /**
   * Vygeneruje sadu receptů (standardně lehká snídaně, oběd, večeře), každý sedící do zbývajících
   * denních maker, přes server-side Cloud Function. Při malém zbytku dne nebo po splnění cíle
   * server navrhne recepty "na jindy" s porcemi podle denního cíle. Vrací null při chybě —
   * volající strana musí zobrazit poctivý chybový stav, ne fallback recept.
   */
  async generateRecipes(input: GenerateRecipeInput & RecipeDailyTarget): Promise<RecipeResult[] | null> {
    try {
      const response = await generateRecipeFn({ ...input, multi: true });
      return normalizeRecipeSet(response.data);
    } catch (error) {
      console.error("Mya Recipe Error:", error);
      return null;
    }
  },

  /**
   * Rozpozná suroviny z fotky lednice/spíže a vygeneruje z nich sadu receptů.
   * Vrací null jak při chybě, tak když Mya na fotce nerozpozná použitelné suroviny.
   */
  async generateRecipesFromFridgePhoto(
    input: GenerateRecipeFromFridgeInput & RecipeDailyTarget
  ): Promise<RecipeResult[] | null> {
    try {
      const response = await generateRecipeFromFridgeFn({ ...input, multi: true });
      return normalizeRecipeSet(response.data);
    } catch (error) {
      console.error("Mya Fridge Recipe Error:", error);
      return null;
    }
  },
};

/**
 * Recept je už v Uložených, když tam je stejný název se stejnými kaloriemi. Jen název by
 * zablokoval uložení jiné "Omelety se špenátem" z pozdějšího návrhu.
 */
export function isRecipeSaved(recipe: RecipeResult, savedRecipes: RecipeResult[]): boolean {
  const name = recipe.name.trim().toLocaleLowerCase("cs");
  return savedRecipes.some((saved) => saved.name.trim().toLocaleLowerCase("cs") === name && saved.calories === recipe.calories);
}

/**
 * Obsah zprávy s kartami receptů pro historii, kterou chat posílá Mye. Uložený text zprávy je
 * jen úvodní věta, takže bez tohohle shrnutí by Mya na "a ten oběd bez šunky?" nevěděla, který
 * oběd navrhla. Formát "[Karty receptů: …]" server Mye popisuje jako metadata, ne vzor odpovědi.
 */
//
// REGRESE (živý test 2026-10-11): shrnutí neslo jen kcal a bílkoviny a na "kolik má ten oběd
// tuku?" Mya odpověděla 12 g, zatímco karta ukazovala 14 g — co v historii chybí, si model
// domyslí. Proto jde všechno, co karta ukazuje: makra, čas, suroviny i postup.
export function chatHistoryContent(message: { content: string; recipes?: RecipeResult[] }): string {
  if (!message.recipes || message.recipes.length === 0) return message.content;
  const lines = message.recipes.map((recipe) => {
    const type = recipe.mealType ? `${RECIPE_MEAL_TYPE_LABELS[recipe.mealType]}: ` : "";
    return (
      `- ${type}${recipe.name} — ${recipe.calories} kcal, bílkoviny ${recipe.protein} g, tuky ${recipe.fat} g, ` +
      `sacharidy ${recipe.carbs} g, ${recipe.prepMinutes} min; suroviny: ${recipe.ingredients.join(", ")}; ` +
      `postup: ${recipe.instructions.join(" ")}`
    );
  });
  return `${message.content}\n[Karty receptů:\n${lines.join("\n")}]`;
}
