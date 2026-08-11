import { describe, it, expect } from "vitest";
import { summarizeWeek } from "./weekSummary";

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
