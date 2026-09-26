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

const { MyaWorkout } = await import("./workout");

beforeEach(() => {
  callable.calls.length = 0;
  callable.results.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("MyaWorkout.analyzeWorkout", () => {
  it("pošle popis tréninku do analyzeWorkout a vrátí odhad", async () => {
    const analysis = { name: "Běh", caloriesBurned: 350, durationMinutes: 35, confidence: "high" };
    callable.results.set("analyzeWorkout", () => Promise.resolve({ data: analysis }));

    await expect(MyaWorkout.analyzeWorkout("35 min běh")).resolves.toEqual(analysis);
    expect(callable.calls).toEqual([{ name: "analyzeWorkout", payload: { description: "35 min běh" } }]);
  });

  it("při selhání vrátí null, nevyhodí", async () => {
    await expect(MyaWorkout.analyzeWorkout("x")).resolves.toBeNull();
  });
});
