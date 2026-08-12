import type { MealIngredient } from "../db/db";

export interface MealIngredientsTotals {
  value: number;
  protein?: number;
  fat?: number;
  carbs?: number;
}

/**
 * Součet ingrediencí jídla — pokud byť jedné ingredienci chybí konkrétní makro, výsledné
 * makro je undefined, ne částečný součet (stejná logika jako hasIncompleteMacroData v
 * computeRemainingMacros) — appka nesmí tiše ohlásit méně bílkovin, než uživatel reálně snědl,
 * jen proto že jednu ingredienci nedovyplnil.
 */
export function computeIngredientsTotals(ingredients: MealIngredient[]): MealIngredientsTotals {
  if (ingredients.length === 0) {
    return { value: 0, protein: undefined, fat: undefined, carbs: undefined };
  }

  const value = ingredients.reduce((sum, item) => sum + item.value, 0);
  const protein = ingredients.some((item) => item.protein === undefined)
    ? undefined
    : ingredients.reduce((sum, item) => sum + (item.protein ?? 0), 0);
  const fat = ingredients.some((item) => item.fat === undefined)
    ? undefined
    : ingredients.reduce((sum, item) => sum + (item.fat ?? 0), 0);
  const carbs = ingredients.some((item) => item.carbs === undefined)
    ? undefined
    : ingredients.reduce((sum, item) => sum + (item.carbs ?? 0), 0);

  return { value, protein, fat, carbs };
}
