import { describe, it, expect } from "vitest";
import { computeIngredientsTotals, ingredientsFromComponents, sameIngredients, scaleIngredientToGrams } from "./mealComponents";

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

describe("scaleIngredientToGrams", () => {
  const ham = { name: "Šunka", value: 110, protein: 18, fat: 4, carbs: 1, grams: 100 };

  it("přepočítá kalorie i makra poměrem nové a původní gramáže", () => {
    expect(scaleIngredientToGrams(ham, 50)).toEqual({ name: "Šunka", value: 55, protein: 9, fat: 2, carbs: 1, grams: 50 });
    expect(scaleIngredientToGrams(ham, 150)).toEqual({ name: "Šunka", value: 165, protein: 27, fat: 6, carbs: 2, grams: 150 });
  });

  it("počítá z base, takže mezistav při psaní (1 g) nezničí poměr", () => {
    expect(scaleIngredientToGrams(ham, 1).value).toBe(1);
    expect(scaleIngredientToGrams(ham, 120)).toEqual({ name: "Šunka", value: 132, protein: 22, fat: 5, carbs: 1, grams: 120 });
  });

  it("chybějící makro zůstane chybět — ne nula a ani klíč s undefined", () => {
    const scaled = scaleIngredientToGrams({ name: "Sýr", value: 350, grams: 100 }, 30);
    expect(scaled).toEqual({ name: "Sýr", value: 105, grams: 30 });
    expect("protein" in scaled).toBe(false);
  });

  it("bez původních gramů není z čeho počítat — gramy se jen zapíšou", () => {
    expect(scaleIngredientToGrams({ name: "Salát", value: 80 }, 150)).toEqual({ name: "Salát", value: 80, grams: 150 });
    expect(scaleIngredientToGrams({ name: "Salát", value: 80, grams: 0 }, 150)).toEqual({ name: "Salát", value: 80, grams: 150 });
  });

  it("nula, záporné nebo nečíselné gramy nechají ingredienci beze změny", () => {
    expect(scaleIngredientToGrams(ham, 0)).toBe(ham);
    expect(scaleIngredientToGrams(ham, -20)).toBe(ham);
    expect(scaleIngredientToGrams(ham, Number.NaN)).toBe(ham);
  });
});

describe("ingredientsFromComponents", () => {
  it("složky z fotky převede na ingredience i s gramáží", () => {
    expect(
      ingredientsFromComponents([{ name: "Brambory", grams: 200, calories: 154, protein: 4, fat: 0, carbs: 34 }])
    ).toEqual([{ name: "Brambory", value: 154, protein: 4, fat: 0, carbs: 34, grams: 200 }]);
  });
});

describe("sameIngredients", () => {
  const fromPhoto = ingredientsFromComponents([
    { name: "Brambory", grams: 200, calories: 154, protein: 4, fat: 0, carbs: 34 },
    { name: "Šunka", grams: 50, calories: 55, protein: 9, fat: 2, carbs: 1 },
  ]);

  // REGRESE: fotka teď ingredience předvyplňuje sama — dřív "jsou nějaké ingredience" znamenalo
  // ruční úpravu, takže by každé "Upřesnit" bez jediné změny chtělo potvrdit přepsání.
  it("nezměněné ingredience z fotky nejsou úprava, ani když jsou to nové objekty", () => {
    expect(sameIngredients(fromPhoto, fromPhoto.map((item) => ({ ...item })))).toBe(true);
  });

  it("přepsané gramy, smazaná nebo přidaná ingredience je úprava", () => {
    expect(sameIngredients([scaleIngredientToGrams(fromPhoto[0], 150), fromPhoto[1]], fromPhoto)).toBe(false);
    expect(sameIngredients([fromPhoto[0]], fromPhoto)).toBe(false);
    expect(sameIngredients([...fromPhoto, { name: "Sýr", value: 100 }], fromPhoto)).toBe(false);
  });

  it("gramy vrácené na původní hodnotu už úprava nejsou (řádek počítá vždy z base)", () => {
    expect(sameIngredients([scaleIngredientToGrams(fromPhoto[0], 200), fromPhoto[1]], fromPhoto)).toBe(true);
  });
});
