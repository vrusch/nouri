import type { MealIngredient } from "../db/db";
import type { FoodComponent } from "./vision";

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

/**
 * Ingredience přepočtená na jinou gramáž stejným poměrem kcal/g jako `base` — Mya na fotce pozná,
 * co na talíři je, ale gramy odhadne špatně; uživatelka je přepíše a hodnoty se přepočítají bez
 * dalšího volání AI. Počítá se vždy z `base` (hodnot před úpravou), ne z mezistavu při psaní
 * ("1" → "12" → "120" g), jinak by se poměr cestou zaokrouhlil na nulu. Bez gramů v `base` není
 * z čeho počítat — gramy se jen zapíšou a hodnoty zůstanou.
 */
export function scaleIngredientToGrams(base: MealIngredient, grams: number): MealIngredient {
  const roundedGrams = Math.round(grams);
  if (!(roundedGrams > 0)) return base;
  if (!base.grams || base.grams <= 0) return { ...base, grams: roundedGrams };
  const ratio = roundedGrams / base.grams;
  const scaled: MealIngredient = { name: base.name, value: Math.round(base.value * ratio), grams: roundedGrams };
  // Chybějící makro zůstane chybět (žádný klíč s undefined — Firestore by zápis odmítl).
  if (base.protein !== undefined) scaled.protein = Math.round(base.protein * ratio);
  if (base.fat !== undefined) scaled.fat = Math.round(base.fat * ratio);
  if (base.carbs !== undefined) scaled.carbs = Math.round(base.carbs * ratio);
  return scaled;
}

/** Složky z rozpoznání fotky → ingredience jídla (s gramáží, ať jde přepsat). */
export function ingredientsFromComponents(components: FoodComponent[]): MealIngredient[] {
  return components.map(({ name, grams, calories, protein, fat, carbs }) => ({ name, value: calories, protein, fat, carbs, grams }));
}

/**
 * Stejné ingredience (pořadí i hodnoty) — "Upřesnit" u fotky podle toho pozná, jestli uživatelka
 * od posledního rozpoznání přepsala gramy nebo ingredience, a jen tehdy se ptá, než je přepíše.
 */
export function sameIngredients(a: MealIngredient[], b: MealIngredient[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (item, i) =>
        item.name === b[i].name &&
        item.value === b[i].value &&
        item.grams === b[i].grams &&
        item.protein === b[i].protein &&
        item.fat === b[i].fat &&
        item.carbs === b[i].carbs
    )
  );
}
