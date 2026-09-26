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

const { MyaRecipes } = await import("./recipes");

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
const input = { remainingCalories: 500, remainingProtein: 40, remainingFat: 15, remainingCarbs: 50, goal: "lose" as const };

beforeEach(() => {
  callable.calls.length = 0;
  callable.results.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("MyaRecipes", () => {
  it("generateRecipe pošle vstup beze změny a vrátí recept", async () => {
    callable.results.set("generateRecipe", () => Promise.resolve({ data: recipe }));

    await expect(MyaRecipes.generateRecipe(input)).resolves.toEqual(recipe);
    expect(callable.calls).toEqual([{ name: "generateRecipe", payload: input }]);
  });

  it("generateRecipeFromFridgePhoto volá generateRecipeFromFridge a propustí i null (nic nerozpoznáno)", async () => {
    callable.results.set("generateRecipeFromFridge", () => Promise.resolve({ data: null }));
    const fridgeInput = { ...input, imageDataUrl: "data:image/jpeg;base64,xx" };

    await expect(MyaRecipes.generateRecipeFromFridgePhoto(fridgeInput)).resolves.toBeNull();
    expect(callable.calls).toEqual([{ name: "generateRecipeFromFridge", payload: fridgeInput }]);
  });

  it("při selhání obě metody vrátí null, nevyhodí", async () => {
    await expect(MyaRecipes.generateRecipe(input)).resolves.toBeNull();
    await expect(MyaRecipes.generateRecipeFromFridgePhoto({ ...input, imageDataUrl: "x" })).resolves.toBeNull();
  });
});
