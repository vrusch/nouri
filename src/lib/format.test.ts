import { describe, it, expect } from "vitest";
import { formatDaysCs } from "./format";

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
