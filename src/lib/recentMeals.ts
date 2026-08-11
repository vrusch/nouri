import type { MealItem } from "../db/db";

export interface RecentMealSummary {
  name: string;
  value: number;
  type: MealItem["type"];
  protein?: number;
  fat?: number;
  carbs?: number;
}

const MAX_RECENT_MEALS = 5;

/**
 * Seřadí jídla od nejnovějšího a odstraní duplicity podle názvu — když bylo stejné jídlo
 * zapsáno vícekrát s jinými čísly (např. jiná porce), vyhrává nejnovější záznam, protože
 * je nejpravděpodobnější, že odpovídá tomu, co si uživatel chce znovu zapsat.
 */
export function getRecentUniqueMeals(meals: MealItem[], limit: number = MAX_RECENT_MEALS): RecentMealSummary[] {
  const sorted = [...meals].sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));

  const seenNames = new Set<string>();
  const result: RecentMealSummary[] = [];

  for (const meal of sorted) {
    const name = meal.name.trim();
    if (!name || seenNames.has(name)) continue;
    seenNames.add(name);
    result.push({ name, value: meal.value, type: meal.type, protein: meal.protein, fat: meal.fat, carbs: meal.carbs });
    if (result.length >= limit) break;
  }

  return result;
}
