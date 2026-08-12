import { describe, it, expect } from "vitest";
import { computeIngredientsTotals } from "./mealComponents";

describe("computeIngredientsTotals", () => {
  it("sečte kalorie i makra napříč ingrediencemi", () => {
    const result = computeIngredientsTotals([
      { name: "Kuře", value: 200, protein: 30, fat: 5, carbs: 0 },
      { name: "Dresink", value: 150, protein: 1, fat: 15, carbs: 3 },
    ]);
    expect(result).toEqual({ value: 350, protein: 31, fat: 20, carbs: 3 });
  });

  it("makro je undefined, když ho aspoň jedna ingredience nemá vyplněné — ne částečný součet", () => {
    const result = computeIngredientsTotals([
      { name: "Kuře", value: 200, protein: 30, fat: 5, carbs: 0 },
      { name: "Zelenina", value: 50 }, // bez makr
    ]);
    expect(result.value).toBe(250);
    expect(result.protein).toBeUndefined();
    expect(result.fat).toBeUndefined();
    expect(result.carbs).toBeUndefined();
  });

  it("kalorie se sečtou vždy, i když makra chybí u všech ingrediencí", () => {
    const result = computeIngredientsTotals([
      { name: "Kuře", value: 200 },
      { name: "Rýže", value: 150 },
    ]);
    expect(result.value).toBe(350);
  });

  it("prázdný seznam ingrediencí vrací nulové kalorie a undefined makra", () => {
    expect(computeIngredientsTotals([])).toEqual({ value: 0, protein: undefined, fat: undefined, carbs: undefined });
  });

  it("jedna ingredience se všemi makry vyplněnými se prostě přenese", () => {
    const result = computeIngredientsTotals([{ name: "Banán", value: 105, protein: 1, fat: 0, carbs: 27 }]);
    expect(result).toEqual({ value: 105, protein: 1, fat: 0, carbs: 27 });
  });
});
