import { describe, it, expect } from "vitest";
import { buildYesterdayReview } from "./yesterdayReview";

describe("buildYesterdayReview", () => {
  it("bez včerejších jídel vrací null (nic nezapsáno ≠ nic nesnědeno)", () => {
    expect(buildYesterdayReview([], [{ caloriesBurned: 300 }], 1800, false)).toBeNull();
  });

  it("sečte včerejší kalorie", () => {
    expect(buildYesterdayReview([{ value: 500 }, { value: 900 }], [], 1800, false)).toEqual({
      consumedCalories: 1400,
      targetCalories: 1800,
      isVacationDay: false,
    });
  });

  // REGRESE-prevence: bez tréninkového bonusu by přísná Mya po tréninkovém dni hlásila
  // falešné "včera jsi přestřelila" (Home přitom ukazoval, že je vše v pořádku).
  it("cíl zahrnuje včerejší tréninkový bonus stejně jako Home", () => {
    const review = buildYesterdayReview([{ value: 2000 }], [{ caloriesBurned: 250 }], 1800, false);
    expect(review?.targetCalories).toBe(2050);
  });

  it("přenese příznak volného dne", () => {
    expect(buildYesterdayReview([{ value: 100 }], [], 1800, true)?.isVacationDay).toBe(true);
  });
});
