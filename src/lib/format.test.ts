import { describe, it, expect } from "vitest";
import { formatDaysCs, formatMealsCs, formatRowsCs, formatGlassesCs } from "./format";

describe("formatDaysCs", () => {
  it("skloňuje 1 den", () => {
    expect(formatDaysCs(1)).toBe("1 den");
  });

  it("skloňuje 2-4 dny", () => {
    expect(formatDaysCs(2)).toBe("2 dny");
    expect(formatDaysCs(4)).toBe("4 dny");
  });

  it("skloňuje 0 a 5+ jako dní", () => {
    expect(formatDaysCs(0)).toBe("0 dní");
    expect(formatDaysCs(5)).toBe("5 dní");
    expect(formatDaysCs(21)).toBe("21 dní");
  });
});

describe("formatMealsCs", () => {
  it("skloňuje 1 jídlo", () => {
    expect(formatMealsCs(1)).toBe("1 jídlo");
  });

  it("skloňuje 2-4 jídla", () => {
    expect(formatMealsCs(2)).toBe("2 jídla");
    expect(formatMealsCs(4)).toBe("4 jídla");
  });

  it("skloňuje 0 a 5+ jako jídel", () => {
    expect(formatMealsCs(0)).toBe("0 jídel");
    expect(formatMealsCs(5)).toBe("5 jídel");
  });
});

describe("formatRowsCs", () => {
  it("skloňuje 1 řádek, 2-4 řádky, 0 a 5+ jako řádků", () => {
    expect(formatRowsCs(1)).toBe("1 řádek");
    expect(formatRowsCs(2)).toBe("2 řádky");
    expect(formatRowsCs(4)).toBe("4 řádky");
    expect(formatRowsCs(0)).toBe("0 řádků");
    expect(formatRowsCs(5)).toBe("5 řádků");
  });
});

describe("formatGlassesCs", () => {
  it("skloňuje 1 sklenici, 2-4 sklenice, 0 a 5+ jako sklenic", () => {
    expect(formatGlassesCs(1)).toBe("1 sklenice");
    expect(formatGlassesCs(2)).toBe("2 sklenice");
    expect(formatGlassesCs(4)).toBe("4 sklenice");
    expect(formatGlassesCs(0)).toBe("0 sklenic");
    expect(formatGlassesCs(5)).toBe("5 sklenic");
  });
});
