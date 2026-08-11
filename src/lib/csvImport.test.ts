import { describe, it, expect } from "vitest";
import { parseMealsCsv } from "./csvImport";
import { type MealItem } from "../db/db";

// Stejný postup jako handleExportCsv v Profile.tsx — udržuje import v souladu s exportem,
// místo aby fixture CSV bylo napsané ručně a mohlo se s exportem rozejít.
function toExportCsv(meals: Omit<MealItem, "id" | "syncId">[]): string {
  const header = ["Datum", "Čas", "Typ", "Název", "Kalorie", "Bílkoviny (g)", "Tuky (g)", "Sacharidy (g)", "Zdroj"];
  const rows = meals.map((m) => [m.date, m.time, m.type, m.name, m.value, m.protein ?? "", m.fat ?? "", m.carbs ?? "", m.source ?? ""]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  return "﻿" + csv;
}

describe("parseMealsCsv", () => {
  it("kulatý výlet: co handleExportCsv vyexportuje, se naimportuje beze změny", () => {
    const original: Omit<MealItem, "id" | "syncId">[] = [
      { date: "2026-08-01", time: "08:15", type: "breakfast", name: "Ovesná kaše", value: 350, protein: 12, fat: 8, carbs: 55, source: "manual" },
      { date: "2026-08-01", time: "13:00", type: "lunch", name: 'Kuře, rýže "Basmati", zelenina', value: 620, protein: 45, fat: 15, carbs: 70, source: "photo" },
      { date: "2026-08-02", time: "19:30", type: "dinner", name: "Losos se salátem", value: 480 },
    ];

    const csv = toExportCsv(original);
    const { meals, errors } = parseMealsCsv(csv);

    expect(errors).toEqual([]);
    expect(meals).toEqual(original);
  });

  it("odmítne prázdný soubor", () => {
    const { meals, errors } = parseMealsCsv("");
    expect(meals).toEqual([]);
    expect(errors).toEqual(["Soubor je prázdný."]);
  });

  it("přeskočí řádek s neplatným datem, ale ostatní naimportuje", () => {
    const csv = [
      '"Datum","Čas","Typ","Název","Kalorie","Bílkoviny (g)","Tuky (g)","Sacharidy (g)","Zdroj"',
      '"not-a-date","08:00","breakfast","Test","300","","",""',
      '"2026-08-01","08:00","breakfast","Rohlík","300","","","",""',
    ].join("\n");

    const { meals, errors } = parseMealsCsv(csv);
    expect(meals).toHaveLength(1);
    expect(meals[0].name).toBe("Rohlík");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Řádek 2");
  });

  it("přeskočí řádek s neznámým typem jídla", () => {
    const csv = [
      '"Datum","Čas","Typ","Název","Kalorie","Bílkoviny (g)","Tuky (g)","Sacharidy (g)","Zdroj"',
      '"2026-08-01","08:00","brunch","Test","300","","","",""',
    ].join("\n");

    const { meals, errors } = parseMealsCsv(csv);
    expect(meals).toEqual([]);
    expect(errors[0]).toContain("neznámý typ");
  });

  it("přeskočí řádek s nulovými/neplatnými kaloriemi", () => {
    const csv = [
      '"Datum","Čas","Typ","Název","Kalorie","Bílkoviny (g)","Tuky (g)","Sacharidy (g)","Zdroj"',
      '"2026-08-01","08:00","breakfast","Test","0","","","",""',
    ].join("\n");

    const { meals, errors } = parseMealsCsv(csv);
    expect(meals).toEqual([]);
    expect(errors[0]).toContain("kalorie");
  });

  it("chybějící hlavičku pozná, ale řádky se přesto pokusí načíst", () => {
    const csv = '"2026-08-01","08:00","breakfast","Rohlík","300","","","",""';
    const { meals, errors } = parseMealsCsv(csv);
    expect(meals).toHaveLength(1);
    expect(errors[0]).toContain("Hlavička");
  });

  it("ignoruje neplatnou hodnotu ve sloupci Zdroj místo aby ji zapsala jako platnou", () => {
    const csv = [
      '"Datum","Čas","Typ","Název","Kalorie","Bílkoviny (g)","Tuky (g)","Sacharidy (g)","Zdroj"',
      '"2026-08-01","08:00","breakfast","Rohlík","300","","","","jina-appka"',
    ].join("\n");

    const { meals } = parseMealsCsv(csv);
    expect(meals[0].source).toBeUndefined();
  });
});
