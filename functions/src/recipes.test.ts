import { describe, expect, it } from "vitest";
import {
  MAX_RECIPES,
  FRIDGE_RECIPE_SET_ANOTHER_DAY_SYSTEM_PROMPT,
  FRIDGE_RECIPE_SET_SYSTEM_PROMPT,
  RECIPE_SET_ANOTHER_DAY_SYSTEM_PROMPT,
  RECIPE_SET_SYSTEM_PROMPT,
  buildRecipeSetUserPrompt,
  chatRecipeBudget,
  chatRecipeIntro,
  mealPortionGuides,
  parseDailyTarget,
  parseRecipeSet,
  parseSuggestRecipesArgs,
  recipeSetBudget,
} from "./recipes.js";

const recipe = (overrides: Record<string, unknown> = {}) => ({
  mealType: "lunch",
  name: "Kuřecí rizoto",
  description: "Sytý oběd",
  ingredients: ["150 g kuřecích prsou", "60 g rýže"],
  instructions: ["Opeč maso", "Přidej rýži"],
  prepMinutes: 30,
  calories: 520,
  protein: 42,
  fat: 12,
  carbs: 55,
  ...overrides,
});

describe("parseRecipeSet", () => {
  it("vezme recepty i s typem jídla a seřadí je snídaně → oběd → večeře", () => {
    const result = parseRecipeSet({
      recipes: [
        recipe({ mealType: "dinner", name: "Losos se zeleninou" }),
        recipe(),
        recipe({ mealType: "breakfast", name: "Omeleta", calories: 350.4 }),
      ],
    });
    expect(result.map((r) => [r.mealType, r.name])).toEqual([
      ["breakfast", "Omeleta"],
      ["lunch", "Kuřecí rizoto"],
      ["dinner", "Losos se zeleninou"],
    ]);
    expect(result[0].calories).toBe(350);
  });

  it("neplatný typ jídla klíč vynechá (ne undefined — Firestore by uložení odmítl)", () => {
    const [parsed] = parseRecipeSet({ recipes: [recipe({ mealType: "brunch" })] });
    expect("mealType" in parsed).toBe(false);
  });

  it("tři varianty stejného typu nechá v pořadí od modelu", () => {
    const names = ["A", "B", "C"];
    const result = parseRecipeSet({ recipes: names.map((name) => recipe({ mealType: "dinner", name })) });
    expect(result.map((r) => r.name)).toEqual(names);
  });

  it("zahodí recept bez surovin, postupu nebo kalorií a duplicitní název", () => {
    const result = parseRecipeSet({
      recipes: [
        recipe({ ingredients: [] }),
        recipe({ name: "Bez postupu", instructions: [] }),
        recipe({ name: "Bez kalorií", calories: "hodně" }),
        recipe({ name: "Rizoto" }),
        recipe({ name: "RIZOTO", mealType: "dinner" }),
        null,
        "recept",
      ],
    });
    expect(result.map((r) => r.name)).toEqual(["Rizoto"]);
  });

  it(`vrátí nejvýš ${MAX_RECIPES} recepty`, () => {
    const result = parseRecipeSet({ recipes: ["A", "B", "C", "D", "E"].map((name) => recipe({ name })) });
    expect(result).toHaveLength(MAX_RECIPES);
  });

  it("chybějící nebo neplatné pole = žádné recepty", () => {
    expect(parseRecipeSet(null)).toEqual([]);
    expect(parseRecipeSet({})).toEqual([]);
    expect(parseRecipeSet({ recipes: "recept" })).toEqual([]);
  });
});

describe("parseDailyTarget", () => {
  it("bez platných kalorií cíl nepoužije", () => {
    expect(parseDailyTarget(undefined)).toBeUndefined();
    expect(parseDailyTarget({ dailyCalories: 0 })).toBeUndefined();
    expect(parseDailyTarget({ dailyCalories: "1800" })).toBeUndefined();
    expect(parseDailyTarget({ dailyCalories: 50000 })).toBeUndefined();
  });

  it("neplatná makra jsou nula, kalorie zůstanou", () => {
    expect(parseDailyTarget({ dailyCalories: 1800, dailyProtein: 120, dailyFat: -5, dailyCarbs: Number.NaN })).toEqual({
      calories: 1800,
      protein: 120,
      fat: 0,
      carbs: 0,
    });
  });
});

describe("mealPortionGuides", () => {
  it("porce je podíl denního cíle, ale nikdy víc, než dnes zbývá", () => {
    expect(mealPortionGuides(2000, 1500)).toEqual({ breakfast: 500, lunch: 700, dinner: 600, snack: 200 });
    expect(mealPortionGuides(2000, 550)).toEqual({ breakfast: 500, lunch: 550, dinner: 550, snack: 200 });
  });

  it("bez denního cíle je vodítkem jen zbytek dne", () => {
    expect(mealPortionGuides(undefined, 640)).toEqual({ breakfast: 640, lunch: 640, dinner: 640, snack: 640 });
  });

  it("recepty na jindy (bez zbytku dne) jen podle denního cíle", () => {
    expect(mealPortionGuides(2000, undefined)).toEqual({ breakfast: 500, lunch: 700, dinner: 600, snack: 200 });
  });
});

describe("system prompt sady", () => {
  it("pro dnešek hlídá zbytek dne, na jindy ne", () => {
    expect(RECIPE_SET_SYSTEM_PROMPT).toContain("nesmí mít víc kalorií");
    expect(RECIPE_SET_ANOTHER_DAY_SYSTEM_PROMPT).not.toContain("nesmí mít víc kalorií");
    expect(RECIPE_SET_ANOTHER_DAY_SYSTEM_PROMPT).toContain('"recipes"');
    expect(FRIDGE_RECIPE_SET_SYSTEM_PROMPT).toContain("nesmí mít víc kalorií");
    expect(FRIDGE_RECIPE_SET_ANOTHER_DAY_SYSTEM_PROMPT).not.toContain("nesmí mít víc kalorií");
    expect(FRIDGE_RECIPE_SET_ANOTHER_DAY_SYSTEM_PROMPT).toContain('"recognized"');
  });
});

describe("recipeSetBudget", () => {
  it("dost zbytku = rozpočet, makra pod nulou jsou nula", () => {
    expect(
      recipeSetBudget({ remainingCalories: 600, remainingProtein: 40, remainingFat: -5, remainingCarbs: Number.NaN })
    ).toEqual({ calories: 600, protein: 40, fat: 0, carbs: 0 });
  });

  // Rozhodnutí 2026-10-11: záložka Recepty se po splnění cíle neblokuje, navrhne recepty na jindy.
  it("málo zbytku nebo den přes cíl = recepty na jindy (null)", () => {
    expect(recipeSetBudget({ remainingCalories: 199 })).toBeNull();
    expect(recipeSetBudget({ remainingCalories: 0 })).toBeNull();
    expect(recipeSetBudget({ remainingCalories: -350 })).toBeNull();
    expect(recipeSetBudget({ remainingCalories: 200 })).toEqual({ calories: 200, protein: 0, fat: 0, carbs: 0 });
  });
});

describe("buildRecipeSetUserPrompt", () => {
  const base = {
    remaining: { calories: 900, protein: 60, fat: 30, carbs: 90 },
    goalLabel: "hubnutí",
  };

  it("na jindy vynechá zbytek dne a porce bere z denního cíle", () => {
    const prompt = buildRecipeSetUserPrompt({
      remaining: null,
      goalLabel: "hubnutí",
      daily: { calories: 2000, protein: 120, fat: 60, carbs: 220 },
    });
    expect(prompt).not.toContain("zbývá");
    expect(prompt).toContain("inspirace na jindy");
    expect(prompt).toContain("snídaně ~500 kcal, oběd ~700 kcal");
  });

  it("obsahuje zbytek dne, denní cíl, porce, přání a suroviny", () => {
    const prompt = buildRecipeSetUserPrompt({
      ...base,
      daily: { calories: 1800, protein: 120, fat: 60, carbs: 190 },
      preferences: "bez lepku",
      availableIngredients: "vejce, špenát, tvaroh",
    });
    expect(prompt).toContain("Dnes ještě zbývá: 900 kcal, 60g bílkovin");
    expect(prompt).toContain("Denní cíl: 1800 kcal (bílkoviny 120 g, tuky 60 g, sacharidy 190 g)");
    expect(prompt).toContain("snídaně ~450 kcal, oběd ~630 kcal, večeře ~540 kcal, svačina ~180 kcal");
    expect(prompt).toContain("Přání/omezení: bez lepku.");
    expect(prompt).toContain("Suroviny, které má doma: vejce, špenát, tvaroh.");
  });

  it("bez denního cíle, přání a surovin ty řádky vynechá", () => {
    const prompt = buildRecipeSetUserPrompt(base);
    expect(prompt).not.toContain("Denní cíl");
    expect(prompt).not.toContain("Přání");
    expect(prompt).not.toContain("Suroviny");
    expect(prompt).toContain("snídaně ~900 kcal");
  });
});

describe("parseSuggestRecipesArgs", () => {
  it("vezme suroviny a přání, prázdné vynechá", () => {
    expect(parseSuggestRecipesArgs('{"ingredients":" vejce, tvaroh ","preferences":"jen večeře"}')).toEqual({
      ingredients: "vejce, tvaroh",
      preferences: "jen večeře",
    });
    expect(parseSuggestRecipesArgs('{"ingredients":"","preferences":"  "}')).toEqual({
      ingredients: undefined,
      preferences: undefined,
    });
  });

  it("nevalidní JSON nebo jiné typy = bez surovin a přání", () => {
    expect(parseSuggestRecipesArgs("{nevalidní")).toEqual({});
    expect(parseSuggestRecipesArgs("null")).toEqual({ ingredients: undefined, preferences: undefined });
    expect(parseSuggestRecipesArgs('{"ingredients":42}')).toEqual({ ingredients: undefined, preferences: undefined });
  });
});

describe("chatRecipeBudget", () => {
  const daily = { calories: 1800, protein: 120, fat: 60, carbs: 190 };
  const intake = { consumedCalories: 1000, consumedProtein: 70, consumedFat: 30, consumedCarbs: 200, workoutBonusCalories: 0 };

  it("zbytek dne jako kontext chatu: cíl + trénink − snězeno, makra ne pod nulu", () => {
    expect(chatRecipeBudget(daily, intake)).toEqual({ calories: 800, protein: 50, fat: 30, carbs: 0 });
    expect(chatRecipeBudget(daily, { ...intake, workoutBonusCalories: 300 })?.calories).toBe(1100);
  });

  it("bez dat dne nebo při malém zbytku = recepty na jindy (null)", () => {
    expect(chatRecipeBudget(daily, undefined)).toBeNull();
    expect(chatRecipeBudget(daily, { ...intake, consumedCalories: 1650 })).toBeNull();
    expect(chatRecipeBudget(daily, { ...intake, consumedCalories: 2400 })).toBeNull();
  });
});

describe("chatRecipeIntro", () => {
  it("podle surovin, počtu a splněného dne", () => {
    expect(chatRecipeIntro({ hasIngredients: true, todayFull: false, count: 3 })).toBe(
      "Z toho, co máš doma, mě napadly tyhle recepty — rozklikni, co tě láká:"
    );
    expect(chatRecipeIntro({ hasIngredients: false, todayFull: false, count: 1 })).toBe(
      "Tady máš tenhle recept — rozklikni, co tě láká:"
    );
    expect(chatRecipeIntro({ hasIngredients: false, todayFull: true, count: 3 })).toContain("inspiraci na jindy");
  });
});
