import { describe, it, expect } from "vitest";
import { isVacationDay, expandDateRange, datesToEndVacation } from "./vacationMode";

describe("isVacationDay", () => {
  it("datum v seznamu je volný den", () => {
    expect(isVacationDay("2026-08-15", ["2026-08-14", "2026-08-15"])).toBe(true);
  });

  it("datum mimo seznam volný den není", () => {
    expect(isVacationDay("2026-08-16", ["2026-08-14", "2026-08-15"])).toBe(false);
  });

  it("bez seznamu (undefined) není nikdy volný den", () => {
    expect(isVacationDay("2026-08-15", undefined)).toBe(false);
  });
});

describe("expandDateRange", () => {
  it("jednodenní rozsah vrátí jedno datum", () => {
    expect(expandDateRange("2026-08-15", "2026-08-15")).toEqual(["2026-08-15"]);
  });

  it("vícedenní rozsah vrátí všechny dny včetně krajů", () => {
    expect(expandDateRange("2026-08-14", "2026-08-17")).toEqual([
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
      "2026-08-17",
    ]);
  });

  it("obrácený rozsah (konec před začátkem) vrátí prázdné pole", () => {
    expect(expandDateRange("2026-08-17", "2026-08-14")).toEqual([]);
  });

  it("rozsah delší než 60 dní se ořízne", () => {
    const result = expandDateRange("2026-01-01", "2026-12-31");
    expect(result.length).toBe(60);
    expect(result[0]).toBe("2026-01-01");
  });
});

describe("datesToEndVacation", () => {
  it("vrátí data od zadaného dne dál (k odstranění), minulost vynechá", () => {
    expect(datesToEndVacation(["2026-08-13", "2026-08-14", "2026-08-15"], "2026-08-14")).toEqual([
      "2026-08-14",
      "2026-08-15",
    ]);
  });

  it("bez seznamu (undefined) vrátí prázdné pole", () => {
    expect(datesToEndVacation(undefined, "2026-08-14")).toEqual([]);
  });
});
