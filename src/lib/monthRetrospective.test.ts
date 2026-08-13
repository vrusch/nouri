import { describe, it, expect } from "vitest";
import { computeMonthRetrospective } from "./monthRetrospective";

describe("computeMonthRetrospective", () => {
  const today = "2026-08-12";

  it("bez záznamů vrací null", () => {
    expect(computeMonthRetrospective([], today)).toBeNull();
  });

  it("jen jeden záznam vrací null — není s čím srovnávat", () => {
    expect(computeMonthRetrospective([{ date: today, weight: 70 }], today)).toBeNull();
  });

  it("záznam přesně 30 dní zpátky se použije jako srovnání", () => {
    const result = computeMonthRetrospective(
      [
        { date: "2026-07-13", weight: 72 },
        { date: today, weight: 70 },
      ],
      today
    );
    expect(result).toEqual({
      monthAgoDate: "2026-07-13",
      monthAgoWeight: 72,
      currentDate: today,
      currentWeight: 70,
      deltaKg: -2,
    });
  });

  it("záznam v toleranci pár dní kolem 30 dní se taky použije", () => {
    const result = computeMonthRetrospective(
      [
        { date: "2026-07-17", weight: 71 }, // 26 dní zpátky
        { date: today, weight: 70 },
      ],
      today
    );
    expect(result?.monthAgoDate).toBe("2026-07-17");
  });

  it("záznam starý jen 3 týdny je mimo toleranci — vrací null", () => {
    const result = computeMonthRetrospective(
      [
        { date: "2026-07-22", weight: 71 }, // 21 dní zpátky
        { date: today, weight: 70 },
      ],
      today
    );
    expect(result).toBeNull();
  });

  it("z více kandidátů vybere ten nejbližší cílovým 30 dnům", () => {
    const result = computeMonthRetrospective(
      [
        { date: "2026-07-20", weight: 73 }, // 23 dní zpátky
        { date: "2026-07-13", weight: 72 }, // přesně 30 dní zpátky
        { date: "2026-07-06", weight: 74 }, // 37 dní zpátky
        { date: today, weight: 70 },
      ],
      today
    );
    expect(result?.monthAgoDate).toBe("2026-07-13");
  });
});
