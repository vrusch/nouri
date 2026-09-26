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
  it("analyzeFood pošle fotku i upřesnění od uživatelky", async () => {
    callable.results.set("analyzeFood", () => Promise.resolve({ data: estimate }));

    await expect(MyaVision.analyzeFood("data:image/jpeg;base64,xx", "bez oleje")).resolves.toEqual(estimate);
    expect(callable.calls).toEqual([
      { name: "analyzeFood", payload: { imageDataUrl: "data:image/jpeg;base64,xx", hint: "bez oleje" } },
    ]);
  });

  it("analyzeFoodText pošle popis", async () => {
    callable.results.set("analyzeFoodText", () => Promise.resolve({ data: estimate }));

    await expect(MyaVision.analyzeFoodText("talíř guláše")).resolves.toEqual(estimate);
    expect(callable.calls).toEqual([{ name: "analyzeFoodText", payload: { description: "talíř guláše" } }]);
  });

  it("při selhání vrátí null, nevyhodí", async () => {
    await expect(MyaVision.analyzeFood("x")).resolves.toBeNull();
    await expect(MyaVision.analyzeFoodText("x")).resolves.toBeNull();
  });
});
