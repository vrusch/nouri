import { describe, it, expect } from "vitest";
import {
  buildDailyIntakes,
  detectHighCaloriePattern,
  buildHighCaloriePatternText,
  findRecentlyEndedVacation,
  summarizeVacation,
  buildVacationRecapText,
  type DayIntake,
} from "./overeatingReview";

const day = (date: string, calories: number, target = 2000): DayIntake => ({ date, calories, target });

describe("buildDailyIntakes", () => {
  it("vynechá dny bez zapsaného jídla a sečte kalorie", () => {
    const intakes = buildDailyIntakes(
      [
        { date: "2026-09-20", value: 800 },
        { date: "2026-09-20", value: 700 },
        { date: "2026-09-22", value: 2500 },
      ],
      [],
      2000,
      ["2026-09-20", "2026-09-21", "2026-09-22"]
    );
    expect(intakes).toEqual([day("2026-09-20", 1500), day("2026-09-22", 2500)]);
  });

  // Bez tréninkového bonusu by appka po tréninku hlásila falešné přejídání (Home by přitom
  // ukazoval, že je vše v pořádku) — stejná úvaha jako u buildYesterdayReview.
  it("cíl dne zahrnuje tréninkový bonus toho dne", () => {
    const intakes = buildDailyIntakes(
      [{ date: "2026-09-20", value: 2300 }],
      [{ date: "2026-09-20", caloriesBurned: 400 }, { date: "2026-09-21", caloriesBurned: 999 }],
      2000,
      ["2026-09-20"]
    );
    expect(intakes[0].target).toBe(2400);
  });

  it("ignoruje jídla mimo zadané okno", () => {
    expect(buildDailyIntakes([{ date: "2026-01-01", value: 5000 }], [], 2000, ["2026-09-20"])).toEqual([]);
  });
});

describe("detectHighCaloriePattern", () => {
  it("4 dny přes 110 % cíle = vzorec", () => {
    const result = detectHighCaloriePattern([
      day("a", 2300),
      day("b", 2400),
      day("c", 2500),
      day("d", 2600),
      day("e", 1800),
    ]);
    expect(result).toEqual({ detected: true, overDays: 4, loggedDays: 5, avgOverage: 450 });
  });

  it("3 dny přes nestačí", () => {
    expect(detectHighCaloriePattern([day("a", 2300), day("b", 2300), day("c", 2300)]).detected).toBe(false);
  });

  it("těsně nad cílem (do 110 %) se nepočítá", () => {
    const intakes = ["a", "b", "c", "d", "e"].map((d) => day(d, 2200));
    expect(detectHighCaloriePattern(intakes).overDays).toBe(0);
  });

  it("bez dat nic nedetekuje", () => {
    expect(detectHighCaloriePattern([])).toEqual({ detected: false, overDays: 0, loggedDays: 0, avgOverage: 0 });
  });
});

describe("findRecentlyEndedVacation", () => {
  it("najde dovolenou, která skončila včera", () => {
    const v = findRecentlyEndedVacation(["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"], "2026-09-25");
    expect(v).toEqual({
      start: "2026-09-20",
      end: "2026-09-24",
      dates: ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"],
    });
  });

  it("dokud volno trvá i dnes, bilance se neukazuje", () => {
    expect(findRecentlyEndedVacation(["2026-09-24", "2026-09-25"], "2026-09-25")).toBeNull();
  });

  it("3 dny po návratu ještě ano, 4 dny už ne", () => {
    const dates = ["2026-09-20", "2026-09-21"];
    expect(findRecentlyEndedVacation(dates, "2026-09-24")?.end).toBe("2026-09-21");
    expect(findRecentlyEndedVacation(dates, "2026-09-25")).toBeNull();
  });

  it("jednodenní volno bilanci nedostane", () => {
    expect(findRecentlyEndedVacation(["2026-09-24"], "2026-09-25")).toBeNull();
  });

  it("vezme jen poslední souvislý blok", () => {
    const v = findRecentlyEndedVacation(["2026-09-10", "2026-09-11", "2026-09-23", "2026-09-24"], "2026-09-25");
    expect(v?.dates).toEqual(["2026-09-23", "2026-09-24"]);
  });

  it("přes hranici měsíce", () => {
    const v = findRecentlyEndedVacation(["2026-09-30", "2026-10-01"], "2026-10-02");
    expect(v?.dates).toEqual(["2026-09-30", "2026-10-01"]);
  });
});

describe("summarizeVacation + buildVacationRecapText", () => {
  const vacation = { start: "a", end: "e", dates: ["a", "b", "c", "d", "e"] };

  it("spočítá průměrný rozdíl jen přes zapsané dny", () => {
    const summary = summarizeVacation(vacation, [day("a", 2400), day("b", 2600), day("c", 1800), day("x", 9000)]);
    expect(summary).toEqual({ vacationDays: 5, loggedDays: 3, overDays: 2, avgDelta: 267 });
  });

  it("text nad cílem uvede číslo a pokrytí a vede zpátky k běžnému cíli", () => {
    const summary = summarizeVacation(vacation, [day("a", 2400), day("b", 2600), day("c", 1800)]);
    const text = buildVacationRecapText(summary, "balanced");
    expect(text).toContain("Za 5 dní volna");
    expect(text).toContain("267 kcal/den");
    expect(text).toContain("zapsáno 3 z 5 dní");
    expect(text).toMatch(/běžnému cíli/);
  });

  it("2–4 dny skloňuje 'dny'", () => {
    const text = buildVacationRecapText({ vacationDays: 3, loggedDays: 3, overDays: 0, avgDelta: -50 }, "balanced");
    expect(text).toContain("Za 3 dny volna");
  });

  it("bez zapsaných dní to řekne na rovinu", () => {
    const text = buildVacationRecapText({ vacationDays: 5, loggedDays: 0, overDays: 0, avgDelta: 0 }, "strict");
    expect(text).toMatch(/nezapsala/);
  });

  it("každý styl má vlastní tón", () => {
    const summary = { vacationDays: 5, loggedDays: 5, overDays: 4, avgDelta: 400 };
    const texts = (["gentle", "balanced", "strict"] as const).map((s) => buildVacationRecapText(summary, s));
    expect(new Set(texts).size).toBe(3);
  });
});

// Mantinel ze spec dokumentu (princip 1): po přejedení appka vede jen zpátky k běžnému cíli,
// nikdy ke kompenzaci hladověním — v žádném stylu, v žádné variantě textu.
describe("texty fáze B nikdy nenabádají ke kompenzačnímu hladovění", () => {
  const forbidden = /vynech|hladov|nejez|jez méně|méně jíst|pod cíl/i;
  it.each(["gentle", "balanced", "strict"] as const)("styl %s", (style) => {
    const texts = [
      buildHighCaloriePatternText({ detected: true, overDays: 5, loggedDays: 6, avgOverage: 600 }, style),
      buildVacationRecapText({ vacationDays: 7, loggedDays: 7, overDays: 7, avgDelta: 900 }, style),
      buildVacationRecapText({ vacationDays: 7, loggedDays: 0, overDays: 0, avgDelta: 0 }, style),
      buildVacationRecapText({ vacationDays: 7, loggedDays: 7, overDays: 1, avgDelta: -100 }, style),
    ];
    texts.forEach((t) => expect(t).not.toMatch(forbidden));
  });
});
