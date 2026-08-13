import { describe, it, expect } from "vitest";
import { summarizeWeek, computeWeekdayWeekendProteinBreakdown } from "./weekSummary";

describe("summarizeWeek", () => {
  it("počítá průměr jen z dní s nenulovým příjmem", () => {
    const result = summarizeWeek([2000, 0, 1800, 0, 0, 0, 0]);
    expect(result.daysLogged).toBe(2);
    expect(result.avgCalories).toBe(1900);
  });

  it("bez jediného zapsaného dne vrací nulový průměr, ne NaN", () => {
    const result = summarizeWeek([0, 0, 0, 0, 0, 0, 0]);
    expect(result).toEqual({ avgCalories: 0, daysLogged: 0 });
  });

  it("prázdné pole (chybějící týden) vrací stejný nulový výsledek", () => {
    expect(summarizeWeek([])).toEqual({ avgCalories: 0, daysLogged: 0 });
  });

  it("plně zapsaný týden zprůměruje všech 7 dní", () => {
    const result = summarizeWeek([1800, 1900, 2000, 1700, 2100, 1850, 1950]);
    expect(result.daysLogged).toBe(7);
    expect(result.avgCalories).toBe(1900);
  });
});

describe("computeWeekdayWeekendProteinBreakdown", () => {
  // 2026-08-10 pondělí, 2026-08-11 úterý, 2026-08-15 sobota, 2026-08-16 neděle
  it("rozdělí dny na všední a víkendové a spočítá průměr zvlášť", () => {
    const result = computeWeekdayWeekendProteinBreakdown([
      { date: "2026-08-10", totalProtein: 120, reliable: true },
      { date: "2026-08-11", totalProtein: 100, reliable: true },
      { date: "2026-08-15", totalProtein: 40, reliable: true },
      { date: "2026-08-16", totalProtein: 60, reliable: true },
    ]);
    expect(result).toEqual({
      weekdayAvgProtein: 110,
      weekdayDaysLogged: 2,
      weekendAvgProtein: 50,
      weekendDaysLogged: 2,
    });
  });

  it("nespolehlivé dny se do žádné skupiny nepočítají", () => {
    const result = computeWeekdayWeekendProteinBreakdown([
      { date: "2026-08-10", totalProtein: 120, reliable: true },
      { date: "2026-08-15", totalProtein: 999, reliable: false },
    ]);
    expect(result.weekendDaysLogged).toBe(0);
    expect(result.weekendAvgProtein).toBe(0);
  });

  it("bez dat v jedné skupině vrací nulový průměr, ne NaN", () => {
    const result = computeWeekdayWeekendProteinBreakdown([{ date: "2026-08-10", totalProtein: 120, reliable: true }]);
    expect(result.weekendDaysLogged).toBe(0);
    expect(result.weekendAvgProtein).toBe(0);
  });

  it("prázdný vstup vrací nulové výsledky pro obě skupiny", () => {
    expect(computeWeekdayWeekendProteinBreakdown([])).toEqual({
      weekdayAvgProtein: 0,
      weekdayDaysLogged: 0,
      weekendAvgProtein: 0,
      weekendDaysLogged: 0,
    });
  });
});
