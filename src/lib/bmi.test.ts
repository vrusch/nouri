import { describe, it, expect } from "vitest";
import { computeBmi, getBmiCategory, getBmiScalePosition } from "./bmi";

describe("computeBmi", () => {
  it("spočítá BMI z kg a cm, zaokrouhlené na jedno desetinné místo", () => {
    expect(computeBmi(70, 175)).toBe(22.9);
    expect(computeBmi(80, 165)).toBe(29.4);
  });

  it("bez váhy/výšky nebo s nesmyslnou hodnotou vrátí null", () => {
    expect(computeBmi(undefined, 170)).toBeNull();
    expect(computeBmi(70, undefined)).toBeNull();
    expect(computeBmi(70, 0)).toBeNull();
    expect(computeBmi(0, 170)).toBeNull();
    expect(computeBmi(NaN, 170)).toBeNull();
  });
});

describe("getBmiCategory", () => {
  it("hranice WHO patří vždy do vyšší kategorie", () => {
    expect(getBmiCategory(18.4)).toBe("underweight");
    expect(getBmiCategory(18.5)).toBe("normal");
    expect(getBmiCategory(24.9)).toBe("normal");
    expect(getBmiCategory(25)).toBe("overweight");
    expect(getBmiCategory(29.9)).toBe("overweight");
    expect(getBmiCategory(30)).toBe("obese");
  });

  it("kategorie sedí se zobrazenou (zaokrouhlenou) hodnotou", () => {
    // 72.15 kg / 1.70 m = 24.965… → zobrazí se 25 a musí to být nadváha, ne normální váha
    const bmi = computeBmi(72.15, 170)!;
    expect(bmi).toBe(25);
    expect(getBmiCategory(bmi)).toBe("overweight");
  });
});

describe("getBmiScalePosition", () => {
  it("převede BMI na procenta stupnice 15–35", () => {
    expect(getBmiScalePosition(15)).toBe(0);
    expect(getBmiScalePosition(25)).toBe(50);
    expect(getBmiScalePosition(35)).toBe(100);
  });

  it("hodnotu mimo stupnici přilepí ke kraji", () => {
    expect(getBmiScalePosition(12)).toBe(0);
    expect(getBmiScalePosition(42)).toBe(100);
  });
});
