import { describe, expect, it } from "vitest";
import {
  MAX_RECIPES,
  FRIDGE_RECIPE_SET_ANOTHER_DAY_SYSTEM_PROMPT,
  FRIDGE_RECIPE_SET_SYSTEM_PROMPT,
  RECIPE_SET_ANOTHER_DAY_SYSTEM_PROMPT,
  RECIPE_SET_SYSTEM_PROMPT,
  FRIDGE_RECIPE_SET_PLANNED_SYSTEM_PROMPT,
  RECIPE_SET_PLANNED_SYSTEM_PROMPT,
  buildMealPlan,
  buildRecipeSetUserPrompt,
  describeNextMealCs,
  parseTodayMealTypes,
  plannedMealTypes,
  recipeSetSystemPromptFor,
  chatRecipeBudget,
  chatRecipeIntro,
  forcesRecipeTool,
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

describe("plannedMealTypes (6.6 bod 2)", () => {
  it("v 19:00 po snídani a obědě jen večeře", () => {
    expect(plannedMealTypes(["breakfast", "lunch"], 19)).toEqual(["dinner"]);
  });

  it("ráno bez zápisu všechna tři hlavní jídla, v poledne po snídani oběd a večeře", () => {
    expect(plannedMealTypes([], 8)).toEqual(["breakfast", "lunch", "dinner"]);
    expect(plannedMealTypes(["breakfast", "snack"], 12)).toEqual(["lunch", "dinner"]);
  });

  it("propásnutou snídani ani oběd nenavrhuje (čas minul nebo je zapsané pozdější jídlo)", () => {
    expect(plannedMealTypes(["lunch"], 13)).toEqual(["dinner"]);
    expect(plannedMealTypes([], 19)).toEqual(["dinner"]);
    expect(plannedMealTypes(["snack"], 11)).toEqual(["lunch", "dinner"]);
  });

  it("po všech hlavních jídlech svačina", () => {
    expect(plannedMealTypes(["breakfast", "lunch", "dinner"], 20)).toEqual(["snack"]);
    expect(plannedMealTypes(["dinner"], 20)).toEqual(["snack"]);
  });
});

describe("mealTargetFor / buildMealPlan (6.6 bod 1, D8)", () => {
  const remaining = { calories: 650, protein: 55, fat: 22, carbs: 70 };

  it("scénář 7: večeře jako poslední jídlo dostane celý zbytek a celou mezeru bílkovin", () => {
    expect(buildMealPlan(["breakfast", "lunch"], 18, remaining, 1750)).toEqual([
      { type: "dinner", calories: 650, minProtein: 55, maxFat: 22, maxCarbs: 70, remainderAboveCap: false },
    ]);
  });

  it("REGRESE: zbytek 700 kcal už nezastropuje 30 % denního cíle (~525 kcal)", () => {
    const [dinner] = buildMealPlan(["breakfast", "lunch"], 19, { calories: 700, protein: 50, fat: 25, carbs: 80 }, 1750);
    expect(dinner.calories).toBe(700);
  });

  it("zbytek nad 45 % denního cíle se zastropuje a označí (nezapsané jídlo nebo svačina)", () => {
    const [dinner] = buildMealPlan(["breakfast", "lunch"], 19, { calories: 1000, protein: 80, fat: 40, carbs: 100 }, 1750);
    expect(dinner.calories).toBe(788);
    expect(dinner.remainderAboveCap).toBe(true);
    expect(dinner.minProtein).toBe(63); // 80 × 788/1000
  });

  it("víc bílkovin, než se do porce vejde (~20 g na 100 kcal), se nežádá", () => {
    const [dinner] = buildMealPlan(["breakfast", "lunch"], 19, { calories: 300, protein: 80, fat: 5, carbs: 10 }, 1750);
    expect(dinner.minProtein).toBe(60);
  });

  it("oběd není poslední jídlo — jen podíl denního cíle, mezera v poměru porce", () => {
    const [lunch, dinner] = buildMealPlan(["breakfast"], 12, { calories: 1300, protein: 100, fat: 45, carbs: 140 }, 1750);
    expect(lunch.type).toBe("lunch");
    expect(lunch.calories).toBe(613); // 35 % z 1750
    expect(lunch.minProtein).toBe(47); // 100 × 612,5/1300
    expect(lunch.remainderAboveCap).toBe(false);
    expect(dinner.calories).toBe(788);
  });
});

describe("describeNextMealCs (6.6 bod 6)", () => {
  it("večeře s cílem porce, bez dalších jídel", () => {
    const plan = buildMealPlan(["breakfast", "lunch"], 18, { calories: 650, protein: 55, fat: 22, carbs: 70 }, 1750);
    expect(describeNextMealCs(plan, 650)).toBe(
      "Další jídla dne podle času a zápisů, každé s vlastním cílem porce (spočítala appka): večeře ~650 kcal, aspoň 55 g bílkovin, tuky max 22 g, sacharidy max 70 g."
    );
  });

  // REGRESE (živý test 2026-10-12): s cílem jen pro nejbližší jídlo (oběd) ho Mya na dotaz na večeři
  // použila pro večeři — každé zbývající jídlo má vlastní cíl.
  it("oběd i večeře, každé s vlastním cílem porce", () => {
    const plan = buildMealPlan(["breakfast"], 12, { calories: 1300, protein: 100, fat: 45, carbs: 140 }, 1750);
    const text = describeNextMealCs(plan, 1300)!;
    expect(text).toContain("oběd ~613 kcal, aspoň 47 g bílkovin");
    expect(text).toContain("; večeře ~788 kcal");
    expect(text).not.toContain("nezapsala");
  });

  it("velký zbytek: zeptat se na nezapsané jídlo, nebo svačina", () => {
    const plan = buildMealPlan(["breakfast", "lunch"], 18, { calories: 1000, protein: 80, fat: 40, carbs: 100 }, 1750);
    expect(describeNextMealCs(plan, 1000)).toContain("nezapsala (zeptej se)");
  });

  it("po hlavních jídlech svačina bez tlaku dojídat; vyčerpané tuky jako co nejméně", () => {
    const plan = buildMealPlan(["breakfast", "lunch", "dinner"], 20, { calories: 600, protein: 20, fat: 2, carbs: 60 }, 1750);
    const text = describeNextMealCs(plan, 600)!;
    expect(text).toContain("svačina");
    expect(text).toContain("tuky co nejméně");
    expect(text).toContain("dojídat to nemusí");
  });
});

describe("sada receptů s plánem jídel", () => {
  const remaining = { calories: 650, protein: 55, fat: 22, carbs: 70 };
  const daily = { calories: 1750, protein: 126, fat: 49, carbs: 200 };

  it("prompt nese chybějící jídla a cíl porce, bez plánu beze změny", () => {
    const mealPlan = buildMealPlan(["breakfast", "lunch"], 18, remaining, daily.calories);
    const text = buildRecipeSetUserPrompt({ remaining, goalLabel: "hubnutí", daily, mealPlan });
    expect(text).toContain("Jídla, která jí dnes ještě chybí: večeře.");
    expect(text).toContain(`(${MAX_RECIPES} různé varianty)`);
    expect(text).toContain("večeře ~650 kcal, aspoň 55 g bílkovin");
    expect(buildRecipeSetUserPrompt({ remaining, goalLabel: "hubnutí", daily })).not.toContain("chybí");
  });

  it("system prompt s plánem nenutí poměr denního cíle a přání má přednost", () => {
    const mealPlan = buildMealPlan(["breakfast", "lunch"], 18, remaining, daily.calories);
    expect(recipeSetSystemPromptFor(remaining, mealPlan)).toBe(RECIPE_SET_PLANNED_SYSTEM_PROMPT);
    expect(recipeSetSystemPromptFor(remaining, mealPlan, "fridge")).toBe(FRIDGE_RECIPE_SET_PLANNED_SYSTEM_PROMPT);
    expect(recipeSetSystemPromptFor(remaining, undefined)).toBe(RECIPE_SET_SYSTEM_PROMPT);
    expect(recipeSetSystemPromptFor(null, mealPlan)).toBe(RECIPE_SET_ANOTHER_DAY_SYSTEM_PROMPT);
    expect(RECIPE_SET_PLANNED_SYSTEM_PROMPT).not.toContain("v poměru jejího denního cíle");
    expect(RECIPE_SET_PLANNED_SYSTEM_PROMPT).toContain("přání má přednost");
    expect(RECIPE_SET_PLANNED_SYSTEM_PROMPT).toContain("nesmí mít víc kalorií");
    expect(RECIPE_SET_SYSTEM_PROMPT).toContain("v poměru jejího denního cíle");
  });

  it("typy jídel od klienta: neznámé vypadnou, ne-pole = nic", () => {
    expect(parseTodayMealTypes(["breakfast", "brunch", 3, "lunch"])).toEqual(["breakfast", "lunch"]);
    expect(parseTodayMealTypes("breakfast")).toBeUndefined();
    expect(parseTodayMealTypes([])).toEqual([]);
  });
});

// REGRESE (živý test a A/B 2026-10-12, scénář 6c): s historií karet model nástroj nezavolal.
describe("forcesRecipeTool", () => {
  it("žádost o vaření nebo nový recept nástroj vynutí", () => {
    for (const text of [
      "Co si mám uvařit k večeři?",
      "co uvařit z vajec a šunky",
      "Uvař mi něco rychlého",
      "Dej mi recept na večeři.",
      "Chci nějaký jiný recept",
      "navrhni recepty na oběd",
      "Recepty na večeři bez masa?",
      "Navařím si na tři dny, co by šlo?",
    ]) {
      expect(forcesRecipeTool(text), text).toBe(true);
    }
  });

  it("minulý čas, otázka k existujícímu receptu a běžný dotaz nástroj nevynutí", () => {
    for (const text of [
      "Uvařila jsem si těstoviny, je to ok?",
      "Kolik má ten recept tuku?",
      "V tom receptu nahradím šunku čím?",
      "Co si dám k večeři? Vařit se mi nechce.",
      "Jak dohnat bílkoviny?",
      "Jak dlouho to mám vařit?",
    ]) {
      expect(forcesRecipeTool(text), text).toBe(false);
    }
  });
});
