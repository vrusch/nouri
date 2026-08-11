import { describe, it, expect } from "vitest";
import { getRecentUniqueMeals } from "./recentMeals";
import type { MealItem } from "../db/db";

function meal(overrides: Partial<MealItem>): MealItem {
  return { name: "Jídlo", value: 100, time: "12:00", date: "2026-08-01", type: "lunch", ...overrides };
}

describe("getRecentUniqueMeals", () => {
  it("z prázdného seznamu vrátí prázdný seznam", () => {
    expect(getRecentUniqueMeals([])).toEqual([]);
  });

  it("seřadí od nejnovějšího podle data a času", () => {
    const meals = [
      meal({ name: "A", date: "2026-08-01", time: "08:00" }),
      meal({ name: "B", date: "2026-08-03", time: "08:00" }),
      meal({ name: "C", date: "2026-08-02", time: "08:00" }),
    ];
    expect(getRecentUniqueMeals(meals).map((m) => m.name)).toEqual(["B", "C", "A"]);
  });

  it("stejný název sloučí do jedné položky, vyhrává nejnovější záznam", () => {
    const meals = [
      meal({ name: "Kuřecí salát", value: 400, date: "2026-08-01", time: "12:00" }),
      meal({ name: "Kuřecí salát", value: 620, date: "2026-08-03", time: "12:00" }),
    ];
    const result = getRecentUniqueMeals(meals);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(620);
  });

  it("respektuje limit", () => {
    const meals = Array.from({ length: 10 }, (_, i) => meal({ name: `Jídlo ${i}`, date: "2026-08-01", time: `0${i}:00` }));
    expect(getRecentUniqueMeals(meals, 3)).toHaveLength(3);
  });

  it("výchozí limit je 5", () => {
    const meals = Array.from({ length: 10 }, (_, i) => meal({ name: `Jídlo ${i}`, date: "2026-08-01", time: `0${i}:00` }));
    expect(getRecentUniqueMeals(meals)).toHaveLength(5);
  });
});
