import { describe, it, expect } from "vitest";
import {
  resolveCoachingStyle,
  getWaterBehindThreshold,
  shouldMuteMealRemindersOnVacation,
  DEFAULT_COACHING_STYLE,
} from "./coachingStyle";

describe("resolveCoachingStyle", () => {
  it("chybějící nebo neznámá hodnota = vyvážený styl", () => {
    expect(resolveCoachingStyle(undefined)).toBe("balanced");
    expect(resolveCoachingStyle("brutal")).toBe("balanced");
    expect(DEFAULT_COACHING_STYLE).toBe("balanced");
  });

  it("platné hodnoty projdou beze změny", () => {
    expect(resolveCoachingStyle("gentle")).toBe("gentle");
    expect(resolveCoachingStyle("strict")).toBe("strict");
  });
});

describe("getWaterBehindThreshold", () => {
  it("přísná připomíná nejdřív, jemná nejpozději", () => {
    expect(getWaterBehindThreshold("strict")).toBeLessThan(getWaterBehindThreshold("balanced"));
    expect(getWaterBehindThreshold("balanced")).toBeLessThan(getWaterBehindThreshold("gentle"));
  });
});

describe("shouldMuteMealRemindersOnVacation", () => {
  it("jen přísný styl připomíná jídlo i o volnu", () => {
    expect(shouldMuteMealRemindersOnVacation("gentle")).toBe(true);
    expect(shouldMuteMealRemindersOnVacation("balanced")).toBe(true);
    expect(shouldMuteMealRemindersOnVacation("strict")).toBe(false);
  });
});
