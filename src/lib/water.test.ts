import { describe, it, expect } from "vitest";
import { getWaterProgressPercent, WATER_TARGET_GLASSES } from "./water";

describe("getWaterProgressPercent", () => {
  it("0 sklenic je 0 %", () => {
    expect(getWaterProgressPercent(0)).toBe(0);
  });

  it("polovina cíle je 50 %", () => {
    expect(getWaterProgressPercent(4, 8)).toBe(50);
  });

  it("přesně na cíli je 100 %", () => {
    expect(getWaterProgressPercent(8, 8)).toBe(100);
  });

  it("nad cílem se ořízne na 100 %", () => {
    expect(getWaterProgressPercent(12, 8)).toBe(100);
  });

  it("bez druhého argumentu použije výchozí cíl", () => {
    expect(getWaterProgressPercent(WATER_TARGET_GLASSES)).toBe(100);
  });
});
