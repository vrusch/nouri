import { beforeEach, describe, expect, it, vi } from "vitest";

// N48 (AUDIT_2026-08-14.md) — kontrakt obalu: při chybě null (volající nabídne ruční zápis).
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

const { MyaVision } = await import("./vision");

const estimate = { name: "Guláš", calories: 650, protein: 35, fat: 30, carbs: 55, mealType: "lunch", confidence: "medium" };

beforeEach(() => {
  callable.calls.length = 0;
  callable.results.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("MyaVision", () => {
  it("analyzeFood pošle všechny fotky (první i zvlášť kvůli starší funkci) a upřesnění", async () => {
    callable.results.set("analyzeFood", () => Promise.resolve({ data: estimate }));

    const photos = ["data:image/jpeg;base64,xx", "data:image/jpeg;base64,yy"];
    await expect(MyaVision.analyzeFood(photos, "bez oleje")).resolves.toEqual(estimate);
    expect(callable.calls).toEqual([
      {
        name: "analyzeFood",
        payload: { imageDataUrl: "data:image/jpeg;base64,xx", imageDataUrls: photos, hint: "bez oleje" },
      },
    ]);
  });

  it("analyzeFoodText pošle popis", async () => {
    callable.results.set("analyzeFoodText", () => Promise.resolve({ data: estimate }));

    await expect(MyaVision.analyzeFoodText("talíř guláše")).resolves.toEqual(estimate);
    expect(callable.calls).toEqual([{ name: "analyzeFoodText", payload: { description: "talíř guláše" } }]);
  });

  it("analyzeMealsFromText pošle popis s multi a vrátí jídla", async () => {
    const meals = [
      { name: "Kaše", calories: 300, protein: 10, fat: 6, carbs: 50, statedType: "breakfast", confidence: "high" },
      { name: "Kuře s rýží", calories: 600, protein: 40, fat: 12, carbs: 75, statedType: "lunch", confidence: "medium" },
    ];
    callable.results.set("analyzeFoodText", () => Promise.resolve({ data: { meals } }));

    await expect(MyaVision.analyzeMealsFromText("na snídani kaše, k obědu kuře")).resolves.toEqual(meals);
    expect(callable.calls).toEqual([
      { name: "analyzeFoodText", payload: { description: "na snídani kaše, k obědu kuře", multi: true } },
    ]);
  });

  it("analyzeMealsFromText se starším serverem (jedno jídlo) vrátí jedno jídlo bez typu", async () => {
    callable.results.set("analyzeFoodText", () => Promise.resolve({ data: { ...estimate, type: "lunch" } }));

    await expect(MyaVision.analyzeMealsFromText("talíř guláše")).resolves.toEqual([
      { name: "Guláš", calories: 650, protein: 35, fat: 30, carbs: 55, confidence: "medium", statedType: null },
    ]);
  });

  it("analyzeMealsFromText: prázdný seznam nebo null = null", async () => {
    callable.results.set("analyzeFoodText", () => Promise.resolve({ data: { meals: [] } }));
    await expect(MyaVision.analyzeMealsFromText("x")).resolves.toBeNull();
    callable.results.set("analyzeFoodText", () => Promise.resolve({ data: null }));
    await expect(MyaVision.analyzeMealsFromText("x")).resolves.toBeNull();
  });

  it("při selhání vrátí null, nevyhodí", async () => {
    await expect(MyaVision.analyzeFood(["x"])).resolves.toBeNull();
    await expect(MyaVision.analyzeFoodText("x")).resolves.toBeNull();
    await expect(MyaVision.analyzeMealsFromText("x")).resolves.toBeNull();
  });
});
