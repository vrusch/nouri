import { describe, expect, it } from "vitest";
import { MAX_FOOD_COMPONENTS, parseFoodComponents, parseFoodPhotoResult } from "./foodPhoto.js";

const potatoes = { name: "vařené brambory", grams: 200, calories: 154, protein: 4, fat: 0, carbs: 34 };
const ham = { name: "Šunka", grams: 50, calories: 55, protein: 9, fat: 2, carbs: 1 };

describe("parseFoodComponents", () => {
  it("vezme platné složky, zaokrouhlí čísla a název začne velkým písmenem", () => {
    expect(parseFoodComponents([{ ...potatoes, grams: 199.6, calories: "154" }, ham])).toEqual([
      { name: "Vařené brambory", grams: 200, calories: 154, protein: 4, fat: 0, carbs: 34 },
      { name: "Šunka", grams: 50, calories: 55, protein: 9, fat: 2, carbs: 1 },
    ]);
  });

  it("jedna vadná složka zahodí celý rozpad — kalorie se nesmí potichu ztratit ze součtu", () => {
    expect(parseFoodComponents([potatoes, { ...ham, grams: 0 }])).toEqual([]);
    expect(parseFoodComponents([potatoes, { ...ham, name: "  " }])).toEqual([]);
    expect(parseFoodComponents([potatoes, null])).toEqual([]);
  });

  it("složka bez číselných kalorií zahodí rozpad — jinak by součet přepsal souhrn menším číslem", () => {
    expect(parseFoodComponents([potatoes, { ...ham, calories: undefined }])).toEqual([]);
    expect(parseFoodComponents([potatoes, { ...ham, calories: "55 kcal" }])).toEqual([]);
    expect(parseFoodComponents([potatoes, { ...ham, calories: "" }])).toEqual([]);
    // Chybějící makro rozpad nezahodí, bude nula.
    expect(parseFoodComponents([{ ...ham, protein: undefined }])).toEqual([{ ...ham, protein: 0 }]);
  });

  it("chybějící, prázdný nebo příliš dlouhý seznam = bez rozpadu", () => {
    expect(parseFoodComponents(undefined)).toEqual([]);
    expect(parseFoodComponents("brambory")).toEqual([]);
    expect(parseFoodComponents([])).toEqual([]);
    expect(parseFoodComponents(Array.from({ length: MAX_FOOD_COMPONENTS + 1 }, () => ham))).toEqual([]);
  });
});

describe("parseFoodPhotoResult", () => {
  it("se složkami je souhrn jejich součtem, ne vlastní odhad modelu", () => {
    const result = parseFoodPhotoResult({
      name: "Brambory se šunkou",
      calories: 300,
      protein: 10,
      fat: 5,
      carbs: 30,
      type: "lunch",
      confidence: "medium",
      components: [potatoes, ham],
    });
    expect(result).toMatchObject({ calories: 209, protein: 13, fat: 2, carbs: 35, type: "lunch", confidence: "medium" });
    expect(result.components).toHaveLength(2);
  });

  it("bez platných složek vrátí souhrn jako dřív a pole components vůbec nemá", () => {
    const result = parseFoodPhotoResult({ name: "Guláš", calories: 650.4, protein: 35, fat: 30, carbs: 55, type: "x", components: [] });
    expect(result).toEqual({ name: "Guláš", calories: 650, protein: 35, fat: 30, carbs: 55, type: "snack", confidence: "low" });
    expect("components" in result).toBe(false);
  });

  it("nesmyslná odpověď skončí jako Neznámé jídlo s nulami", () => {
    expect(parseFoodPhotoResult(null)).toEqual({
      name: "Neznámé jídlo",
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      type: "snack",
      confidence: "low",
    });
  });
});
