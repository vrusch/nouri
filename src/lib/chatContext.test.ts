import { describe, expect, it } from "vitest";
import { buildChatContext, getRecentDates, type ChatContextSources } from "./chatContext";
import type { NutritionResults } from "./nutrition";

const nutrition: NutritionResults = {
  bmr: 1450,
  tdee: 2420,
  targetCalories: 1920,
  macros: { protein: 153, fat: 53, carbs: 210 },
};

const base: ChatContextSources = {
  today: "2026-10-10",
  localHour: 21,
  nutrition,
  meals: [
    { date: "2026-10-10", name: "Kuřecí maso s bramborem", type: "lunch", time: "14:47", value: 360, protein: 30, carbs: 40, fat: 8 },
    { date: "2026-10-10", name: "Ovesná kaše s kiwi", type: "breakfast", time: "08:10", value: 250 },
    { date: "2026-10-09", name: "Pizza", type: "dinner", time: "19:00", value: 1100 },
    { date: "2026-10-09", name: "Toust", type: "breakfast", time: "08:00", value: 400 },
    { date: "2026-09-30", name: "Mimo okno", type: "lunch", time: "12:00", value: 999 },
  ],
  workouts: [
    { date: "2026-10-10", name: "Běh", caloriesBurned: 300, durationMinutes: 30 },
    { date: "2026-10-09", name: "Jóga", caloriesBurned: 100 },
  ],
  waterGlasses: 8,
  waterTarget: 8,
  weightLogs: [
    { date: "2026-09-20", weight: 71.2 },
    { date: "2026-10-08", weight: 70.4 },
  ],
  vacationDates: ["2026-10-09"],
  targetWeight: 64,
};

describe("getRecentDates", () => {
  it("vrátí 7 dní před dneškem od nejstaršího, bez dneška", () => {
    expect(getRecentDates("2026-10-10")).toEqual([
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
    ]);
  });
});

describe("buildChatContext", () => {
  it("dnešní součty počítá stejně jako Home (jídla, makra, tréninkový bonus)", () => {
    const ctx = buildChatContext(base);
    expect(ctx.consumedCalories).toBe(610);
    expect(ctx.consumedProtein).toBe(30);
    expect(ctx.hasIncompleteMacroData).toBe(true);
    expect(ctx.workoutBonusCalories).toBe(300);
    expect(ctx.workouts).toEqual([{ name: "Běh", caloriesBurned: 300, durationMinutes: 30 }]);
  });

  it("dnešní jídla seřadí podle času a nepošle jídla z jiných dní", () => {
    const ctx = buildChatContext(base);
    expect(ctx.meals.map((m) => m.name)).toEqual(["Ovesná kaše s kiwi", "Kuřecí maso s bramborem"]);
    expect(ctx.meals[0]).toEqual({ name: "Ovesná kaše s kiwi", type: "breakfast", time: "08:10", calories: 250 });
  });

  it("předchozí dny: jen dny se zápisem v 7denním okně, cíl vč. tréninku toho dne, volno", () => {
    const ctx = buildChatContext(base);
    expect(ctx.recentDays).toEqual([{ date: "2026-10-09", calories: 1500, target: 2020, isVacationDay: true }]);
  });

  it("nenačtenou vodu a váhu vůbec nepošle (≠ 0 sklenic / žádné vážení)", () => {
    const ctx = buildChatContext({ ...base, waterGlasses: null, weightLogs: null });
    expect(ctx).not.toHaveProperty("waterGlasses");
    expect(ctx).not.toHaveProperty("weightLogs");
    expect(buildChatContext({ ...base, waterGlasses: 0, weightLogs: [] })).toMatchObject({ waterGlasses: 0, weightLogs: [] });
  });

  it("z historie vážení pošle jen posledních 10 záznamů", () => {
    const weightLogs = Array.from({ length: 15 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, weight: 70 }));
    const ctx = buildChatContext({ ...base, weightLogs });
    expect(ctx.weightLogs).toHaveLength(10);
    expect(ctx.weightLogs?.[9].date).toBe("2026-09-15");
  });
});
