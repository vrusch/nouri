import { describe, it, expect } from "vitest";
import { buildShoppingListItems, countUnbought } from "./shoppingList";
import type { RecipeResult } from "./recipes";

function makeRecipe(ingredients: string[], name = "Test recept"): RecipeResult {
  return {
    name,
    description: "",
    ingredients,
    instructions: [],
    prepMinutes: 10,
    calories: 100,
    protein: 10,
    fat: 5,
    carbs: 10,
  };
}

describe("buildShoppingListItems", () => {
  it("namapuje ingredience na položky s názvem receptu", () => {
    const items = buildShoppingListItems(makeRecipe(["200g cizrny", "1 cibule"]));
    expect(items).toEqual([
      { text: "200g cizrny", recipeName: "Test recept" },
      { text: "1 cibule", recipeName: "Test recept" },
    ]);
  });

  it("zahodí prázdné a whitespace položky", () => {
    const items = buildShoppingListItems(makeRecipe(["200g cizrny", "   ", ""]));
    expect(items).toEqual([{ text: "200g cizrny", recipeName: "Test recept" }]);
  });

  it("oseká okolní mezery z textu položky", () => {
    const items = buildShoppingListItems(makeRecipe(["  200g cizrny  "]));
    expect(items[0].text).toBe("200g cizrny");
  });

  it("prázdný recept dá prázdný seznam", () => {
    expect(buildShoppingListItems(makeRecipe([]))).toEqual([]);
  });

  it("neslučuje stejné suroviny ze dvou různých receptů — každá zůstává samostatná položka", () => {
    const a = buildShoppingListItems(makeRecipe(["200g cizrny"], "Recept A"));
    const b = buildShoppingListItems(makeRecipe(["200g cizrny"], "Recept B"));
    expect([...a, ...b]).toHaveLength(2);
  });
});

describe("countUnbought", () => {
  it("spočítá jen nekoupené položky", () => {
    expect(countUnbought([{ bought: false }, { bought: true }, { bought: false }])).toBe(2);
  });

  it("prázdný seznam vrací 0", () => {
    expect(countUnbought([])).toBe(0);
  });

  it("vše koupeno vrací 0", () => {
    expect(countUnbought([{ bought: true }, { bought: true }])).toBe(0);
  });
});
