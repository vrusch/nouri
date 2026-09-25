import { describe, it, expect } from "vitest";
import { getWaterProgressPercent, formatWaterVolumeCs, computeWaterPaceStatus, WATER_TARGET_GLASSES } from "./water";

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

describe("computeWaterPaceStatus", () => {
  const at = (time: string) => new Date(`2026-09-25T${time}:00`);

  it("před 8:00 appka nic nečeká", () => {
    expect(computeWaterPaceStatus(0, at("07:30")).expectedGlasses).toBe(0);
    expect(computeWaterPaceStatus(0, at("07:30")).behind).toBe(false);
  });

  it("ve 14:00 (polovina okna) čeká polovinu cíle", () => {
    expect(computeWaterPaceStatus(0, at("14:00")).expectedGlasses).toBe(4);
  });

  it("po 20:00 čeká celý cíl", () => {
    expect(computeWaterPaceStatus(0, at("21:00")).expectedGlasses).toBe(WATER_TARGET_GLASSES);
  });

  it("zaokrouhluje dolů — v 9:00 ještě žádnou sklenici nečeká", () => {
    expect(computeWaterPaceStatus(0, at("09:00")).expectedGlasses).toBe(0);
    expect(computeWaterPaceStatus(0, at("09:30")).expectedGlasses).toBe(1);
  });

  it("připomene až při skluzu >= práh", () => {
    // 14:00 → čeká 4
    expect(computeWaterPaceStatus(3, at("14:00"), 2).behind).toBe(false);
    expect(computeWaterPaceStatus(2, at("14:00"), 2).behind).toBe(true);
    expect(computeWaterPaceStatus(3, at("14:00"), 1).behind).toBe(true);
    expect(computeWaterPaceStatus(2, at("14:00"), 3).behind).toBe(false);
  });

  it("nad tempem skluz není záporný", () => {
    expect(computeWaterPaceStatus(8, at("10:00")).glassesBehind).toBe(0);
  });
});
