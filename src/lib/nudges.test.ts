import { describe, it, expect } from "vitest";
import { computeActiveNudges, type NudgeInput } from "./nudges";

const noMeals = { breakfastOverdue: false, lunchOverdue: false, dinnerOverdue: false };
const base: NudgeInput = { mealReminder: noMeals, waterPace: null, style: "balanced", isVacationDay: false };
const waterBehind = { glasses: 1, expectedGlasses: 4, glassesBehind: 3, behind: true };

describe("computeActiveNudges", () => {
  it("bez ničeho k připomenutí vrací prázdný seznam", () => {
    expect(computeActiveNudges(base)).toEqual([]);
  });

  it("připomene zapomenuté jídlo", () => {
    const nudges = computeActiveNudges({ ...base, mealReminder: { ...noMeals, lunchOverdue: true } });
    expect(nudges).toHaveLength(1);
    expect(nudges[0].kind).toBe("lunch");
    expect(nudges[0].text).toMatch(/oběd/);
  });

  it("každý styl má vlastní text", () => {
    const texts = (["gentle", "balanced", "strict"] as const).map(
      (style) => computeActiveNudges({ ...base, style, mealReminder: { ...noMeals, dinnerOverdue: true } })[0].text
    );
    expect(new Set(texts).size).toBe(3);
  });

  it("neznámá voda (null) nikdy nepřipomíná", () => {
    expect(computeActiveNudges({ ...base, waterPace: null })).toEqual([]);
  });

  it("zaostávající voda se připomene, klíč pro schování nese očekávaný počet", () => {
    const nudges = computeActiveNudges({ ...base, waterPace: waterBehind });
    expect(nudges[0].kind).toBe("water");
    expect(nudges[0].text).toContain("4");
    expect(nudges[0].dismissKey).toBe("water_4");
  });

  it("volno ztlumí jídlo v jemném i vyváženém stylu, vodu ale nikdy", () => {
    for (const style of ["gentle", "balanced"] as const) {
      const nudges = computeActiveNudges({
        ...base,
        style,
        isVacationDay: true,
        mealReminder: { ...noMeals, lunchOverdue: true },
        waterPace: waterBehind,
      });
      expect(nudges.map((n) => n.kind)).toEqual(["water"]);
    }
  });

  it("přísný styl připomíná jídlo i o volnu, s dovolenkovým textem", () => {
    const nudges = computeActiveNudges({
      ...base,
      style: "strict",
      isVacationDay: true,
      mealReminder: { ...noMeals, lunchOverdue: true },
    });
    expect(nudges).toHaveLength(1);
    expect(nudges[0].text).toMatch(/volno neznamená nezapisovat/i);
  });
});
