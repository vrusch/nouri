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

const { MyaRecipes, chatHistoryContent, isRecipeSaved, normalizeRecipeSet } = await import("./recipes");

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
