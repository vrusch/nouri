import { describe, it, expect } from "vitest";
import { computeLoggingStreak } from "./streak";

describe("computeLoggingStreak", () => {
  const today = "2026-08-11";

  it("bez záznamů je streak 0", () => {
    expect(computeLoggingStreak([], today)).toBe(0);
  });

  it("počítá souvislou řadu dní končící dneškem", () => {
    const dates = ["2026-08-08", "2026-08-09", "2026-08-10", "2026-08-11"];
    expect(computeLoggingStreak(dates, today)).toBe(4);
  });

  it("dnešek bez záznamu streak nezlomí — počítá se od včerejška", () => {
    const dates = ["2026-08-09", "2026-08-10"];
    expect(computeLoggingStreak(dates, today)).toBe(2);
  });

  it("mezera v historii useknutí streak na souvislou část", () => {
    const dates = ["2026-08-01", "2026-08-09", "2026-08-10", "2026-08-11"];
    expect(computeLoggingStreak(dates, today)).toBe(3);
  });

  it("mezera hned před včerejškem (bez dnešního záznamu) dá streak 0", () => {
    const dates = ["2026-08-05", "2026-08-09"];
    expect(computeLoggingStreak(dates, today)).toBe(0);
  });

  it("duplicitní data ve stejný den se počítají jen jednou, nerozbijí logiku", () => {
    const dates = ["2026-08-10", "2026-08-10", "2026-08-11", "2026-08-11"];
    expect(computeLoggingStreak(dates, today)).toBe(2);
  });

  it("správně přechází přes hranici měsíce", () => {
    const dates = ["2026-07-30", "2026-07-31", "2026-08-01"];
    expect(computeLoggingStreak(dates, "2026-08-01")).toBe(3);
  });

  it("bez excludedDates (undefined ani zadané) se chová stejně jako dřív", () => {
    const dates = ["2026-08-09", "2026-08-10", "2026-08-11"];
    expect(computeLoggingStreak(dates, today)).toBe(3);
  });

  it("prázdné excludedDates se chová stejně jako bez třetího argumentu", () => {
    const dates = ["2026-08-09", "2026-08-10", "2026-08-11"];
    expect(computeLoggingStreak(dates, today, [])).toBe(3);
  });

  it("vynechaný den uprostřed streaku ho nezlomí, ale sám se nepočítá", () => {
    // 08-09 a 08-10 zapsané, 08-10 je zároveň volný den bez jídla by streak nezlomil —
    // tady simulujeme mezeru (08-10 chybí v mealDates) překlenutou přes excludedDates.
    const dates = ["2026-08-08", "2026-08-09", "2026-08-11"];
    expect(computeLoggingStreak(dates, today, ["2026-08-10"])).toBe(3);
  });

  it("několik po sobě jdoucích vynechaných dní streak taky nezlomí", () => {
    const dates = ["2026-08-05", "2026-08-11"];
    const excluded = ["2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09", "2026-08-10"];
    expect(computeLoggingStreak(dates, today, excluded)).toBe(2);
  });

  it("dnešek vynechaný a bez jediného zápisu v historii dá streak 0", () => {
    expect(computeLoggingStreak([], today, [today])).toBe(0);
  });

  it("den, který je zároveň vynechaný i má zapsané jídlo, se počítá normálně", () => {
    const dates = ["2026-08-10", "2026-08-11"];
    expect(computeLoggingStreak(dates, today, ["2026-08-10"])).toBe(2);
  });
});
