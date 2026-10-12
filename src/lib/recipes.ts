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

/** Podle čeho server navrhne jen jídla, která dnes ještě chybí (MYA_COACH_SPEC 6.6, bod 2). */
export interface RecipeDayPlanInput {
  todayMealTypes: RecipeMealType[];
  localHour: number;
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

const generateRecipeFn = httpsCallable<
  GenerateRecipeInput & RecipeDailyTarget & RecipeDayPlanInput & { multi: true },
  RecipeSetResponse
>(functions, "generateRecipe");
const generateRecipeFromFridgeFn = httpsCallable<
  GenerateRecipeFromFridgeInput & RecipeDailyTarget & RecipeDayPlanInput & { multi: true },
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
  async generateRecipes(input: GenerateRecipeInput & RecipeDailyTarget & RecipeDayPlanInput): Promise<RecipeResult[] | null> {
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
    input: GenerateRecipeFromFridgeInput & RecipeDailyTarget & RecipeDayPlanInput
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

/** Typy dnes zapsaných jídel pro server — jen známé typy, bez duplicit. */
export function todayMealTypesOf(meals: { type: string }[]): RecipeMealType[] {
  const known = Object.keys(RECIPE_MEAL_TYPE_LABELS) as RecipeMealType[];
  return known.filter((type) => meals.some((meal) => meal.type === type));
}

// --- Jak recept sedí na dnešní zbytek (MYA_COACH_SPEC 6.6 bod 5, D9) ---
// Karta říká "Doplní 42 z 48 g bílkovin, zbude ti 30 kcal" a nejlepší recept dostane štítek.
// Jen pro recepty do dneška — u receptů "na jindy" by čísla proti dnešku nedávala smysl.

// Stejná tolerance jako plánovaná kontrola receptů na serveru (spec 6.6 bod 4).
const FIT_CALORIE_TOLERANCE = 0.05;

export interface RecipeFit {
  proteinGap: number;
  proteinCovered: number;
  leftoverCalories: number;
  fits: boolean;
}

export function recipeFit(recipe: RecipeResult, remaining: { calories: number; protein: number }): RecipeFit {
  const proteinGap = Math.max(0, Math.round(remaining.protein));
  return {
    proteinGap,
    proteinCovered: Math.min(Math.round(recipe.protein), proteinGap),
    leftoverCalories: Math.round(remaining.calories - recipe.calories),
    fits: recipe.calories <= remaining.calories * (1 + FIT_CALORIE_TOLERANCE),
  };
}

export function describeRecipeFit(fit: RecipeFit): string {
  if (!fit.fits) return `O ${-fit.leftoverCalories} kcal víc, než ti dnes zbývá`;
  const leftover = fit.leftoverCalories > 0 ? `zbude ti ${fit.leftoverCalories} kcal` : "vyčerpá zbytek dne";
  if (fit.proteinGap === 0) return `Bílkoviny máš splněné · ${leftover}`;
  return `Doplní ${fit.proteinCovered} z ${fit.proteinGap} g bílkovin · ${leftover}`;
}

function fitRank(fit: RecipeFit): [number, number, number] {
  // Vejde se > pokryje víc bílkovin > zbude méně nevyužitých kcal.
  return [fit.fits ? 0 : 1, -fit.proteinCovered, Math.abs(fit.leftoverCalories)];
}

function compareRanks(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** Index receptu, který nejlíp sedí na dnešní cíl; null, když se žádný nevejde nebo je recept jen jeden. */
export function bestFitIndex(recipes: RecipeResult[], remaining: { calories: number; protein: number }): number | null {
  if (recipes.length < 2) return null;
  let best: number | null = null;
  recipes.forEach((recipe, i) => {
    const fit = recipeFit(recipe, remaining);
    if (!fit.fits) return;
    if (best === null || compareRanks(fitRank(fit), fitRank(recipeFit(recipes[best], remaining))) < 0) best = i;
  });
  return best;
}

const MEAL_TYPE_ORDER: RecipeMealType[] = ["breakfast", "lunch", "dinner", "snack"];

/**
 * Seřadí recepty podle toho, jak doplní dnešní cíl — v rámci stejného typu jídla (snídaně zůstává
 * před večeří), stabilně.
 */
export function sortRecipesByFit(recipes: RecipeResult[], remaining: { calories: number; protein: number }): RecipeResult[] {
  const typeRank = (recipe: RecipeResult) => (recipe.mealType ? MEAL_TYPE_ORDER.indexOf(recipe.mealType) : MEAL_TYPE_ORDER.length);
  return recipes
    .map((recipe, index) => ({ recipe, index, rank: [typeRank(recipe), ...fitRank(recipeFit(recipe, remaining))] }))
    .sort((a, b) => compareRanks(a.rank, b.rank) || a.index - b.index)
    .map(({ recipe }) => recipe);
}

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
