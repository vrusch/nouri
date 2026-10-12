import { beforeEach, describe, expect, it, vi } from "vitest";

// N48 (AUDIT_2026-08-14.md) — kontrakt obalu: při chybě null (volající ukáže poctivý chybový
// stav), nikdy vymyšlený fallback recept.
const callable = vi.hoisted(() => ({
  calls: [] as { name: string; payload: unknown }[],
  results: new Map<string, () => Promise<unknown>>(),
}));

vi.mock("./firebase", () => ({ functions: {} }));
vi.mock("firebase/functions", () => ({
  httpsCallable: (_functions: unknown, name: string) => (payload: unknown) => {
    callable.calls.push({ name, payload });
    const result = callable.results.get(name);
    return result ? result() : Promise.reject(new Error(`${name}: internal`));
  },
}));

const {
  MyaRecipes,
  bestFitIndex,
  chatHistoryContent,
  describeRecipeFit,
  isRecipeSaved,
  normalizeRecipeSet,
  recipeFit,
  sortRecipesByFit,
  todayMealTypesOf,
} = await import("./recipes");

const recipe = {
  name: "Tvarohová miska",
  description: "Rychlá svačina",
  ingredients: ["tvaroh"],
  instructions: ["smíchat"],
  prepMinutes: 5,
  calories: 300,
  protein: 30,
  fat: 5,
  carbs: 20,
};
const dinner = { ...recipe, name: "Losos se zeleninou", mealType: "dinner" as const };
const input = {
  remainingCalories: 500,
  remainingProtein: 40,
  remainingFat: 15,
  remainingCarbs: 50,
  goal: "lose" as const,
  dailyCalories: 1800,
  dailyProtein: 120,
  dailyFat: 60,
  dailyCarbs: 190,
  // Jídla, která dnes ještě chybí (MYA_COACH_SPEC 6.6) — server podle nich navrhne jen večeři.
  todayMealTypes: ["breakfast" as const, "lunch" as const],
  localHour: 18,
};

beforeEach(() => {
  callable.calls.length = 0;
  callable.results.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("normalizeRecipeSet", () => {
  it("sada receptů projde beze změny", () => {
    expect(normalizeRecipeSet({ recipes: [recipe, dinner] })).toEqual([recipe, dinner]);
  });

  it("jeden recept ze staršího serveru (bez multi) zabalí do seznamu", () => {
    expect(normalizeRecipeSet(recipe)).toEqual([recipe]);
  });

  it("null, prázdná nebo neplatná sada = null", () => {
    expect(normalizeRecipeSet(null)).toBeNull();
    expect(normalizeRecipeSet({ recipes: [] })).toBeNull();
    expect(normalizeRecipeSet({ recipes: "recept" })).toBeNull();
    expect(normalizeRecipeSet({ recipes: [null, "x"] })).toBeNull();
  });
});

describe("MyaRecipes", () => {
  it("generateRecipes pošle vstup s multi: true a vrátí sadu receptů", async () => {
    callable.results.set("generateRecipe", () => Promise.resolve({ data: { recipes: [recipe, dinner] } }));

    await expect(MyaRecipes.generateRecipes(input)).resolves.toEqual([recipe, dinner]);
    expect(callable.calls).toEqual([{ name: "generateRecipe", payload: { ...input, multi: true } }]);
  });

  it("generateRecipesFromFridgePhoto volá generateRecipeFromFridge a propustí i null (nic nerozpoznáno)", async () => {
    callable.results.set("generateRecipeFromFridge", () => Promise.resolve({ data: null }));
    const fridgeInput = { ...input, imageDataUrl: "data:image/jpeg;base64,xx" };

    await expect(MyaRecipes.generateRecipesFromFridgePhoto(fridgeInput)).resolves.toBeNull();
    expect(callable.calls).toEqual([{ name: "generateRecipeFromFridge", payload: { ...fridgeInput, multi: true } }]);
  });

  it("při selhání obě metody vrátí null, nevyhodí", async () => {
    await expect(MyaRecipes.generateRecipes(input)).resolves.toBeNull();
    await expect(MyaRecipes.generateRecipesFromFridgePhoto({ ...input, imageDataUrl: "x" })).resolves.toBeNull();
  });
});

describe("isRecipeSaved", () => {
  it("stejný název (bez ohledu na velikost písmen) i kalorie = uloženo", () => {
    expect(isRecipeSaved(dinner, [{ ...dinner, name: " losos se ZELENINOU " }])).toBe(true);
  });

  it("jiné kalorie nebo jiný název = neuloženo", () => {
    expect(isRecipeSaved(dinner, [{ ...dinner, calories: 450 }])).toBe(false);
    expect(isRecipeSaved(dinner, [recipe])).toBe(false);
    expect(isRecipeSaved(dinner, [])).toBe(false);
  });
});

describe("chatHistoryContent", () => {
  it("zpráva bez receptů zůstane beze změny", () => {
    expect(chatHistoryContent({ content: "Ahoj" })).toBe("Ahoj");
    expect(chatHistoryContent({ content: "Ahoj", recipes: [] })).toBe("Ahoj");
  });

  // REGRESE: bez tuků/sacharidů ve shrnutí si Mya na "kolik má ten oběd tuku?" číslo vymyslela.
  it("k úvodní větě přidá shrnutí karet se vším, co karta ukazuje", () => {
    expect(chatHistoryContent({ content: "Tady máš tyhle recepty:", recipes: [recipe, dinner] })).toBe(
      "Tady máš tyhle recepty:\n[Karty receptů:\n" +
        "- Tvarohová miska — 300 kcal, bílkoviny 30 g, tuky 5 g, sacharidy 20 g, 5 min; suroviny: tvaroh; postup: smíchat\n" +
        "- Večeře: Losos se zeleninou — 300 kcal, bílkoviny 30 g, tuky 5 g, sacharidy 20 g, 5 min; suroviny: tvaroh; postup: smíchat]"
    );
  });
});

// MYA_COACH_SPEC 6.6 bod 5, D9 — "Doplní 42 z 48 g bílkovin, zbude ti 30 kcal" a štítek u nejlepšího.
describe("recipeFit / describeRecipeFit", () => {
  const remaining = { calories: 650, protein: 55 };

  it("recept do zbytku dne: kolik bílkovin doplní a kolik kcal zbude", () => {
    const fit = recipeFit({ ...dinner, calories: 620, protein: 48 }, remaining);
    expect(fit).toEqual({ proteinGap: 55, proteinCovered: 48, leftoverCalories: 30, fits: true });
    expect(describeRecipeFit(fit)).toBe("Doplní 48 z 55 g bílkovin · zbude ti 30 kcal");
  });

  it("víc bílkovin, než chybí, se počítá jen do mezery; splněné bílkoviny zvlášť", () => {
    expect(recipeFit({ ...dinner, protein: 70 }, remaining).proteinCovered).toBe(55);
    expect(describeRecipeFit(recipeFit(dinner, { calories: 650, protein: -10 }))).toBe("Bílkoviny máš splněné · zbude ti 350 kcal");
  });

  it("nad zbytkem dne (s tolerancí 5 %) varování, těsně nad ní ještě vejde", () => {
    const over = recipeFit({ ...dinner, calories: 780 }, remaining);
    expect(over.fits).toBe(false);
    expect(describeRecipeFit(over)).toBe("O 130 kcal víc, než ti dnes zbývá");
    const tight = recipeFit({ ...dinner, calories: 670 }, remaining);
    expect(tight.fits).toBe(true);
    expect(describeRecipeFit(tight)).toContain("vyčerpá zbytek dne");
  });
});

describe("bestFitIndex / sortRecipesByFit", () => {
  const remaining = { calories: 650, protein: 55 };
  const a = { ...dinner, name: "A", calories: 600, protein: 30 };
  const b = { ...dinner, name: "B", calories: 620, protein: 50 };
  const c = { ...dinner, name: "C", calories: 800, protein: 70 };

  it("nejlíp sedí recept, který se vejde a pokryje nejvíc bílkovin", () => {
    expect(bestFitIndex([a, b, c], remaining)).toBe(1);
    expect(bestFitIndex([c, { ...c, name: "D" }], remaining)).toBeNull(); // žádný se nevejde
    expect(bestFitIndex([b], remaining)).toBeNull(); // jediný recept štítek nepotřebuje
  });

  it("řadí podle shody jen v rámci typu jídla, stabilně", () => {
    const breakfast = { ...recipe, name: "Snídaně", mealType: "breakfast" as const, calories: 900, protein: 5 };
    expect(sortRecipesByFit([c, a, breakfast, b], remaining).map((r) => r.name)).toEqual(["Snídaně", "B", "A", "C"]);
  });
});

describe("todayMealTypesOf", () => {
  it("jen známé typy, bez duplicit", () => {
    expect(todayMealTypesOf([{ type: "lunch" }, { type: "breakfast" }, { type: "lunch" }, { type: "brunch" }])).toEqual(["breakfast", "lunch"]);
  });
});
