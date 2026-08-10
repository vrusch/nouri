import type { RecipeResult } from "./recipes";

export interface ShoppingListItemDraft {
  text: string;
  recipeName: string;
}

/**
 * Suroviny z receptu jako samostatné položky nákupního seznamu, každá se svým
 * zdrojovým receptem. Žádné slučování/dedup napříč recepty — "200g cizrny" ze dvou
 * různých receptů znamená 400g, ne jednu položku "×2".
 */
export function buildShoppingListItems(recipe: RecipeResult): ShoppingListItemDraft[] {
  return recipe.ingredients
    .map((ingredient) => ingredient.trim())
    .filter((ingredient) => ingredient.length > 0)
    .map((text) => ({ text, recipeName: recipe.name }));
}

export function countUnbought(items: { bought: boolean }[]): number {
  return items.filter((item) => !item.bought).length;
}
