import { describe, it, expect } from "vitest";
import { buildDailyProteinRecords, detectLowProteinPattern } from "./macroPattern";

describe("buildDailyProteinRecords", () => {
  it("sečte bílkoviny po dnech", () => {
    const records = buildDailyProteinRecords([
      { date: "2026-08-01", protein: 20 },
      { date: "2026-08-01", protein: 30 },
      { date: "2026-08-02", protein: 50 },
    ]);
    expect(records).toContainEqual({ date: "2026-08-01", totalProtein: 50, reliable: true });
    expect(records).toContainEqual({ date: "2026-08-02", totalProtein: 50, reliable: true });
  });

  // REGRESE: jídlo zapsané jen s kaloriemi (bez rozpadu na makra) se nesmí počítat jako 0g
  // bílkovin — jinak appka nahlásí "nízký příjem" uživateli, který jen nevyplnil makra.
  it("REGRESE: den s jídlem bez zapsaného proteinu je 'reliable: false', ne 0g", () => {
    const records = buildDailyProteinRecords([
      { date: "2026-08-01", protein: 40 },
      { date: "2026-08-01" }, // jen kalorie, bez makra
    ]);
    expect(records).toEqual([{ date: "2026-08-01", totalProtein: 40, reliable: false }]);
  });

  // REGRESE: jídlo zapsané v režimu "Jím venku" má protein vyplněný (AI ho i tak odhadne),
  // ale je to hrubý odhad podle kategorie, ne měřená data — den se musí počítat jako nespolehlivý
  // stejně jako při úplně chybějícím makru, jinak by odhad z restaurace tiše kontaminoval vzorec.
  it("REGRESE: den s jídlem označeným jako roughEstimate je 'reliable: false', i když má protein vyplněný", () => {
    const records = buildDailyProteinRecords([
      { date: "2026-08-01", protein: 40 },
      { date: "2026-08-01", protein: 30, roughEstimate: true },
    ]);
    expect(records).toEqual([{ date: "2026-08-01", totalProtein: 70, reliable: false }]);
  });
});

describe("detectLowProteinPattern", () => {
  const target = 120;

  function reliableDay(date: string, totalProtein: number) {
    return { date, totalProtein, reliable: true };
  }

  it("nedetekuje vzorec s málo spolehlivými dny, i kdyby všechny byly nízké", () => {
    const records = [reliableDay("2026-08-01", 40), reliableDay("2026-08-02", 40)];
    const result = detectLowProteinPattern(records, target);
    expect(result.detected).toBe(false);
    expect(result.reliableDaysConsidered).toBe(2);
  });

  it("detekuje vzorec, když je většina spolehlivých dní výrazně pod cílem", () => {
    const records = Array.from({ length: 10 }, (_, i) => reliableDay(`2026-08-${String(i + 1).padStart(2, "0")}`, 50));
    const result = detectLowProteinPattern(records, target);
    expect(result.detected).toBe(true);
    expect(result.daysBelowTarget).toBe(10);
    expect(result.avgProtein).toBe(50);
  });

  it("nedetekuje, když je většina dní v pořádku a jen pár nízkých", () => {
    const records = [
      ...Array.from({ length: 8 }, (_, i) => reliableDay(`ok-${i}`, 115)),
      ...Array.from({ length: 2 }, (_, i) => reliableDay(`low-${i}`, 40)),
    ];
    const result = detectLowProteinPattern(records, target);
    expect(result.detected).toBe(false);
  });

  // REGRESE: nespolehlivé dny (neúplná makra) se nesmí počítat do jmenovatele ani čitatele —
  // jinak by appka nagovala na chybějící data místo na skutečně nízký příjem.
  it("REGRESE: nespolehlivé dny se do vyhodnocení vůbec nepočítají", () => {
    const records = [
      ...Array.from({ length: 8 }, (_, i) => reliableDay(`low-${i}`, 40)),
      { date: "unreliable-1", totalProtein: 0, reliable: false },
      { date: "unreliable-2", totalProtein: 0, reliable: false },
    ];
    const result = detectLowProteinPattern(records, target);
    expect(result.reliableDaysConsidered).toBe(8);
    expect(result.detected).toBe(true);
  });

  it("prázdný vstup nevrací detekci ani NaN průměr", () => {
    const result = detectLowProteinPattern([], target);
    expect(result).toEqual({ detected: false, reliableDaysConsidered: 0, daysBelowTarget: 0, avgProtein: 0 });
  });
});
