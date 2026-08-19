import { describe, it, expect } from "vitest";
import { getWaterProgressPercent, formatWaterVolumeCs, WATER_TARGET_GLASSES } from "./water";

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

describe("formatWaterVolumeCs", () => {
  it("jedna sklenice je 250 ml", () => {
    expect(formatWaterVolumeCs(1)).toBe("250 ml");
  });

  it("pod litr zůstává v mililitrech", () => {
    expect(formatWaterVolumeCs(3)).toBe("750 ml");
  });

  it("celý denní cíl je 2 l bez desetinné části", () => {
    expect(formatWaterVolumeCs(WATER_TARGET_GLASSES)).toBe("2 l");
  });

  it("neceločíselné litry používají desetinnou čárku, ne tečku", () => {
    expect(formatWaterVolumeCs(6)).toBe("1,5 l");
    expect(formatWaterVolumeCs(7)).toBe("1,75 l");
  });

  it("přesně litr se ukáže v litrech, ne jako 1000 ml", () => {
    expect(formatWaterVolumeCs(4)).toBe("1 l");
  });

  it("respektuje vlastní objem sklenice", () => {
    expect(formatWaterVolumeCs(1, 300)).toBe("300 ml");
    expect(formatWaterVolumeCs(WATER_TARGET_GLASSES, 300)).toBe("2,4 l");
  });

  it("nula je 0 ml", () => {
    expect(formatWaterVolumeCs(0)).toBe("0 ml");
  });
});
