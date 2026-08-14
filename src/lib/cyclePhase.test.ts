import { describe, it, expect } from "vitest";
import {
  getCyclePhase,
  computeAvgCycleLength,
  DEFAULT_CYCLE_LENGTH_DAYS,
  isLutealBonusActive,
  applyLutealBonus,
  LUTEAL_CALORIE_BONUS,
} from "./cyclePhase";

describe("getCyclePhase", () => {
  const START = "2026-08-01";

  it("bez žádného záznamu vrací null", () => {
    expect(getCyclePhase([], DEFAULT_CYCLE_LENGTH_DAYS, START)).toBeNull();
  });

  it("vrací null, když je poslední záznam v budoucnosti", () => {
    expect(getCyclePhase([{ date: "2026-09-01" }], DEFAULT_CYCLE_LENGTH_DAYS, START)).toBeNull();
  });

  it("den 1 (datum záznamu samotného) je menstruace", () => {
    const result = getCyclePhase([{ date: START }], DEFAULT_CYCLE_LENGTH_DAYS, START);
    expect(result).toEqual({ phase: "menstruation", dayInCycle: 1 });
  });

  it("den 5 je ještě menstruace, den 6 už folikulární fáze (28denní cyklus)", () => {
    expect(getCyclePhase([{ date: START }], 28, "2026-08-05")?.phase).toBe("menstruation");
    expect(getCyclePhase([{ date: START }], 28, "2026-08-06")?.phase).toBe("follicular");
  });

  it("den 14 (28 - 14) je ovulace u 28denního cyklu", () => {
    expect(getCyclePhase([{ date: START }], 28, "2026-08-14")?.phase).toBe("ovulation");
  });

  it("den 17 už je luteální fáze u 28denního cyklu", () => {
    expect(getCyclePhase([{ date: START }], 28, "2026-08-17")?.phase).toBe("luteal");
  });

  it("den 28 (poslední den cyklu) je pořád luteální fáze, den 29 je nová menstruace", () => {
    expect(getCyclePhase([{ date: START }], 28, "2026-08-28")?.phase).toBe("luteal");
    const result = getCyclePhase([{ date: START }], 28, "2026-08-29");
    expect(result).toEqual({ phase: "menstruation", dayInCycle: 1 });
  });

  it("používá jen nejnovější záznam, ne nejstarší", () => {
    const logs = [{ date: "2026-06-01" }, { date: START }];
    expect(getCyclePhase(logs, 28, "2026-08-06")?.phase).toBe("follicular");
  });

  it("kratší cyklus posune ovulaci i luteální fázi dřív", () => {
    // 21denní cyklus: ovulace kolem dne 7 (21-14), luteální fáze od dne 10.
    expect(getCyclePhase([{ date: START }], 21, "2026-08-07")?.phase).toBe("ovulation");
    expect(getCyclePhase([{ date: START }], 21, "2026-08-10")?.phase).toBe("luteal");
  });

  it("nulová/neplatná avgCycleLengthDays spadne na výchozích 28 dní", () => {
    const withZero = getCyclePhase([{ date: START }], 0, "2026-08-17");
    const withDefault = getCyclePhase([{ date: START }], DEFAULT_CYCLE_LENGTH_DAYS, "2026-08-17");
    expect(withZero).toEqual(withDefault);
  });
});

describe("computeAvgCycleLength", () => {
  it("s méně než dvěma záznamy vrací null", () => {
    expect(computeAvgCycleLength([])).toBeNull();
    expect(computeAvgCycleLength([{ date: "2026-08-01" }])).toBeNull();
  });

  it("spočítá průměr rozestupů mezi po sobě jdoucími záznamy", () => {
    const logs = [{ date: "2026-06-01" }, { date: "2026-06-29" }, { date: "2026-07-28" }];
    // Rozestupy: 28, 29 -> průměr 28.5 -> zaokrouhleno na 29 (Math.round).
    expect(computeAvgCycleLength(logs)).toBe(29);
  });

  it("funguje bez ohledu na pořadí vstupních záznamů", () => {
    const sorted = [{ date: "2026-06-01" }, { date: "2026-06-29" }];
    const reversed = [{ date: "2026-06-29" }, { date: "2026-06-01" }];
    expect(computeAvgCycleLength(reversed)).toBe(computeAvgCycleLength(sorted));
  });

  it("ignoruje nepravděpodobně krátký rozestup (duplicitní/chybný zápis stejného cyklu)", () => {
    const logs = [{ date: "2026-06-01" }, { date: "2026-06-03" }, { date: "2026-06-29" }];
    // Rozestup 2 dny se zahodí, počítá se jen 26 (03 -> 29).
    expect(computeAvgCycleLength(logs)).toBe(26);
  });

  it("bere jen posledních MAX_CYCLES_FOR_AVERAGE rozestupů, starší (i věrohodný) rozestup appku netáhne", () => {
    const logs = [
      { date: "2026-01-01" },
      { date: "2026-02-10" }, // rozestup 40 dní od předchozího — věrohodný, ale mimo poslední okno
      { date: "2026-03-10" },
      { date: "2026-04-07" },
      { date: "2026-05-05" },
      { date: "2026-06-02" },
      { date: "2026-06-30" },
      { date: "2026-07-28" },
    ];
    // 8 záznamů -> appka bere jen posledních 7 (= 6 rozestupů), takže první rozestup (40 dní)
    // se do průměru vůbec nedostane. Zbylých 6 rozestupů je přesně 28 dní.
    expect(computeAvgCycleLength(logs)).toBe(28);
  });
});

describe("isLutealBonusActive", () => {
  // REGRESE (N-audit 2026-08-14): appka měla tuhle podmínku duplikovanou zvlášť v Home.tsx a
  // App.tsx (posílala AI funkcím cíl bez luteálního bonusu, i když Home nad tím ukazuje vyšší
  // GOAL_CALORIES) — extrahováno do jedné funkce, ať appka drží obě místa v syncu i do budoucna.
  it("bez záznamu cyklu je bonus neaktivní", () => {
    expect(isLutealBonusActive(null, false)).toBe(false);
  });

  it("v luteální fázi bez hormonální antikoncepce je bonus aktivní", () => {
    expect(isLutealBonusActive({ phase: "luteal", dayInCycle: 20 }, false)).toBe(true);
    expect(isLutealBonusActive({ phase: "luteal", dayInCycle: 20 }, undefined)).toBe(true);
  });

  it("v luteální fázi s hormonální antikoncepcí je bonus neaktivní", () => {
    expect(isLutealBonusActive({ phase: "luteal", dayInCycle: 20 }, true)).toBe(false);
  });

  it("mimo luteální fázi je bonus neaktivní i bez antikoncepce", () => {
    expect(isLutealBonusActive({ phase: "follicular", dayInCycle: 8 }, false)).toBe(false);
    expect(isLutealBonusActive({ phase: "menstruation", dayInCycle: 2 }, false)).toBe(false);
    expect(isLutealBonusActive({ phase: "ovulation", dayInCycle: 14 }, false)).toBe(false);
  });
});

describe("applyLutealBonus", () => {
  it("aktivní bonus přičte LUTEAL_CALORIE_BONUS k TDEE", () => {
    expect(applyLutealBonus(2000, true)).toBe(2000 + LUTEAL_CALORIE_BONUS);
  });

  it("neaktivní bonus vrátí TDEE beze změny", () => {
    expect(applyLutealBonus(2000, false)).toBe(2000);
  });
});
