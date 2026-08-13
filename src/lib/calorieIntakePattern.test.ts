import { describe, it, expect } from "vitest";
import { buildDailyCalorieRecords, detectLowCaloriePattern } from "./calorieIntakePattern";

describe("buildDailyCalorieRecords", () => {
  it("sečte kalorie po dnech", () => {
    const records = buildDailyCalorieRecords([
      { date: "2026-08-01", value: 400 },
      { date: "2026-08-01", value: 300 },
      { date: "2026-08-02", value: 900 },
    ]);
    expect(records).toContainEqual({ date: "2026-08-01", totalCalories: 700, reliable: true });
    expect(records).toContainEqual({ date: "2026-08-02", totalCalories: 900, reliable: true });
  });

  it("den s jídlem označeným jako roughEstimate je 'reliable: false'", () => {
    const records = buildDailyCalorieRecords([
      { date: "2026-08-01", value: 400 },
      { date: "2026-08-01", value: 300, roughEstimate: true },
    ]);
    expect(records).toEqual([{ date: "2026-08-01", totalCalories: 700, reliable: false }]);
  });

  it("beze změny chování, když excludeDates není zadané", () => {
    const meals = [
      { date: "2026-08-01", value: 400 },
      { date: "2026-08-02", value: 900 },
    ];
    expect(buildDailyCalorieRecords(meals)).toEqual(buildDailyCalorieRecords(meals, undefined));
  });

  it("excludeDates vyloučí dnešek (ještě neskončený den) z okna (B5 v AUDIT_2026-08-13.md)", () => {
    const records = buildDailyCalorieRecords(
      [
        { date: "2026-08-01", value: 900 },
        { date: "2026-08-02", value: 200 }, // jen snídaně, den ještě neskončil
      ],
      ["2026-08-02"]
    );
    expect(records).toEqual([{ date: "2026-08-01", totalCalories: 900, reliable: true }]);
  });
});

describe("detectLowCaloriePattern", () => {
  const target = 1800;

  function reliableDay(date: string, totalCalories: number) {
    return { date, totalCalories, reliable: true };
  }

  it("nedetekuje vzorec s málo spolehlivými dny, i kdyby všechny byly nízké", () => {
    const records = [reliableDay("2026-08-01", 900), reliableDay("2026-08-02", 900)];
    const result = detectLowCaloriePattern(records, target);
    expect(result.detected).toBe(false);
    expect(result.reliableDaysConsidered).toBe(2);
  });

  it("detekuje vzorec, když je většina spolehlivých dní výrazně pod cílem", () => {
    const records = Array.from({ length: 10 }, (_, i) => reliableDay(`2026-08-${String(i + 1).padStart(2, "0")}`, 1000));
    const result = detectLowCaloriePattern(records, target);
    expect(result.detected).toBe(true);
    expect(result.daysBelowTarget).toBe(10);
    expect(result.avgCalories).toBe(1000);
  });

  it("nedetekuje, když je většina dní v pořádku a jen pár nízkých", () => {
    const records = [
      ...Array.from({ length: 8 }, (_, i) => reliableDay(`ok-${i}`, 1750)),
      ...Array.from({ length: 2 }, (_, i) => reliableDay(`low-${i}`, 900)),
    ];
    const result = detectLowCaloriePattern(records, target);
    expect(result.detected).toBe(false);
  });

  it("nespolehlivé dny se do vyhodnocení vůbec nepočítají", () => {
    const records = [
      ...Array.from({ length: 8 }, (_, i) => reliableDay(`low-${i}`, 900)),
      { date: "unreliable-1", totalCalories: 0, reliable: false },
      { date: "unreliable-2", totalCalories: 0, reliable: false },
    ];
    const result = detectLowCaloriePattern(records, target);
    expect(result.reliableDaysConsidered).toBe(8);
    expect(result.detected).toBe(true);
  });

  it("prázdný vstup nevrací detekci ani NaN průměr", () => {
    const result = detectLowCaloriePattern([], target);
    expect(result).toEqual({ detected: false, reliableDaysConsidered: 0, daysBelowTarget: 0, avgCalories: 0 });
  });
});
