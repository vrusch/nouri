import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserProfile } from "../context/AuthContext";

// N48 (AUDIT_2026-08-14.md) — kontrakt tenkého obalu nad Cloud Functions: správné jméno
// funkce, payload beze změny, a hlavně chování při selhání — ai.ts nikdy nevyhodí, vrací
// český fallback text (viz CLAUDE.md, "degrade gracefully").
const callable = vi.hoisted(() => ({
  calls: [] as { name: string; payload: unknown }[],
  results: new Map<string, () => Promise<unknown>>(),
}));

vi.mock("./firebase", () => ({ functions: {} }));
vi.mock("../context/AuthContext", () => ({}));
vi.mock("firebase/functions", () => ({
  httpsCallable: (_functions: unknown, name: string) => (payload: unknown) => {
    callable.calls.push({ name, payload });
    const result = callable.results.get(name);
    return result ? result() : Promise.reject(new Error(`${name}: internal`));
  },
}));

const { MyaAI } = await import("./ai");
const { calculateNutrition } = await import("./nutrition");

const profile = {
  name: "Jana",
  gender: "female",
  height: 168,
  weight: 70,
  birthDate: "1990-05-01",
  activityLevel: 1.375,
  goal: "lose",
  targetCalories: 1600,
  setupComplete: true,
} as UserProfile;

function respond(name: string, data: unknown) {
  callable.results.set(name, () => Promise.resolve({ data }));
}

beforeEach(() => {
  callable.calls.length = 0;
  callable.results.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("MyaAI — úspěšné volání", () => {
  it("getDailyGreeting pošle profil i statistiky a vrátí text ze serveru", async () => {
    respond("getDailyGreeting", { text: "Dobré ráno!" });
    const stats = { consumedCalories: 500, consumedProtein: 30, localHour: 8 };

    await expect(MyaAI.getDailyGreeting(profile, stats)).resolves.toBe("Dobré ráno!");
    expect(callable.calls).toEqual([{ name: "getDailyGreeting", payload: { profile, ...stats } }]);
  });

  it("chatWithMya pošle profil a historii zpráv", async () => {
    respond("chatWithMya", { text: "Jasně." });
    const messages = [{ role: "user" as const, content: "Kolik bílkovin?" }];

    await expect(MyaAI.chatWithMya(profile, messages)).resolves.toBe("Jasně.");
    expect(callable.calls).toEqual([{ name: "chatWithMya", payload: { profile, messages } }]);
  });

  it("generateWelcomeReport vrátí data ze serveru beze změny", async () => {
    respond("generateWelcomeReport", { text: "### Report" });

    await expect(MyaAI.generateWelcomeReport(profile)).resolves.toEqual({ text: "### Report" });
    expect(callable.calls[0]).toEqual({ name: "generateWelcomeReport", payload: { profile } });
  });

  it.each([
    ["getMealFeedback", () => MyaAI.getMealFeedback({ mealName: "Oběd", calories: 600, protein: 30, mealType: "lunch", consumedTodayCalories: 900, targetCalories: 1600 })],
    ["suggestMacroFix", () => MyaAI.suggestMacroFix({ avgProtein: 50, targetProtein: 100, daysConsidered: 7, goal: "lose" })],
    ["checkLowCalorieIntake", () => MyaAI.checkLowCalorieIntake({ avgCalories: 900, targetCalories: 1600, daysConsidered: 14, goal: "lose" })],
    ["getWeeklySummary", () => MyaAI.getWeeklySummary({ avgCalories: 1500, targetCalories: 1600, daysLogged: 6, weekdayAvgProtein: 90, weekdayDaysLogged: 4, weekendAvgProtein: 70, weekendDaysLogged: 2, targetProtein: 100, goal: "lose" })],
    ["congratulateGoalReached", () => MyaAI.congratulateGoalReached({ targetWeight: 65, currentWeight: 64.8, goal: "lose" })],
  ])("%s volá stejnojmennou Cloud Function a vrátí její text", async (name, call) => {
    respond(name, { text: "Od serveru" });

    await expect(call()).resolves.toBe("Od serveru");
    expect(callable.calls.map((c) => c.name)).toEqual([name]);
  });
});

describe("MyaAI — selhání Cloud Function nikdy nevyhodí, vrací fallback", () => {
  it("generateWelcomeReport spočítá plán lokálně a čísla dá do fallback textu", async () => {
    const expected = calculateNutrition({
      gender: profile.gender,
      weight: profile.weight,
      height: profile.height,
      birthDate: profile.birthDate,
      activityLevel: profile.activityLevel,
      goal: profile.goal,
    });

    const result = await MyaAI.generateWelcomeReport(profile);

    expect(result.data).toEqual(expected);
    expect(result.text).toContain(`${expected.targetCalories} kcal`);
    expect(result.text).toContain(`${expected.macros.protein}g`);
  });

  it("getDailyGreeting oslovuje jménem", async () => {
    await expect(MyaAI.getDailyGreeting(profile, { consumedCalories: 0, consumedProtein: 0 })).resolves.toBe(
      "Ahoj Jana! Nezapomeň si dnes zapsat všechna jídla."
    );
  });

  it("getMealFeedback vrátí krátké potvrzení", async () => {
    await expect(
      MyaAI.getMealFeedback({ mealName: "Oběd", calories: 600, protein: 30, mealType: "lunch", consumedTodayCalories: 900, targetCalories: 1600 })
    ).resolves.toBe("Zapsáno! 👍");
  });

  it("fallbacky proaktivních karet obsahují čísla ze vstupu", async () => {
    await expect(MyaAI.suggestMacroFix({ avgProtein: 50, targetProtein: 100, daysConsidered: 7, goal: "lose" })).resolves.toContain("100g/den");
    await expect(MyaAI.checkLowCalorieIntake({ avgCalories: 900, targetCalories: 1600, daysConsidered: 14, goal: "lose" })).resolves.toContain("1600 kcal/den");
    await expect(
      MyaAI.getWeeklySummary({ avgCalories: 1500, targetCalories: 1600, daysLogged: 6, weekdayAvgProtein: 90, weekdayDaysLogged: 4, weekendAvgProtein: 70, weekendDaysLogged: 2, targetProtein: 100, goal: "lose" })
    ).resolves.toContain("1500 kcal/den z cíle 1600 kcal (zapsáno 6/7 dní)");
    await expect(MyaAI.congratulateGoalReached({ targetWeight: 65, currentWeight: 64.8, goal: "lose" })).resolves.toContain("65 kg");
  });

  it("chatWithMya vrátí omluvu místo chyby", async () => {
    await expect(MyaAI.chatWithMya(profile, [])).resolves.toBe("Mya právě neodpovídá — zkus to prosím znovu za chvíli.");
  });
});
