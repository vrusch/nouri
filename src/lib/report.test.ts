import { describe, it, expect } from "vitest";
import { buildMonthlyReportData } from "./report";

describe("buildMonthlyReportData", () => {
  it("průměruje kalorie a makra jen ze zapsaných dní, ne ze všech dní v období", () => {
    const meals = [
      { date: "2026-08-01", value: 1800, protein: 100, fat: 60, carbs: 200 },
      { date: "2026-08-02", value: 2200, protein: 140, fat: 80, carbs: 220 },
    ];
    const result = buildMonthlyReportData(meals, [], [], "2026-08-12", 30);
    expect(result.daysLogged).toBe(2);
    expect(result.avgCalories).toBe(2000);
    expect(result.avgProtein).toBe(120);
  });

  it("sečte víc jídel ve stejný den do jednoho denního součtu", () => {
    const meals = [
      { date: "2026-08-01", value: 500, protein: 30, fat: 10, carbs: 50 },
      { date: "2026-08-01", value: 700, protein: 40, fat: 20, carbs: 60 },
    ];
    const result = buildMonthlyReportData(meals, [], [], "2026-08-12", 30);
    expect(result.daysLogged).toBe(1);
    expect(result.avgCalories).toBe(1200);
  });

  it("vyřadí jídla mimo okno posledních N dní", () => {
    const meals = [
      { date: "2026-06-01", value: 1500 }, // dávno mimo 30denní okno
      { date: "2026-08-11", value: 2000 },
    ];
    const result = buildMonthlyReportData(meals, [], [], "2026-08-12", 30);
    expect(result.daysLogged).toBe(1);
    expect(result.avgCalories).toBe(2000);
  });

  it("bez dat vrací nuly a null, ne pád nebo NaN", () => {
    const result = buildMonthlyReportData([], [], [], "2026-08-12", 30);
    expect(result.daysLogged).toBe(0);
    expect(result.avgCalories).toBe(0);
    expect(result.weightStart).toBeNull();
    expect(result.weightEnd).toBeNull();
    expect(result.weightChangeKg).toBeNull();
    expect(result.measurements).toEqual({});
  });

  it("spočítá změnu váhy mezi prvním a posledním záznamem v období", () => {
    const weightLogs = [
      { date: "2026-07-20", weight: 68.5 },
      { date: "2026-08-01", weight: 67.8 },
      { date: "2026-08-10", weight: 67.2 },
    ];
    const result = buildMonthlyReportData([], weightLogs, [], "2026-08-12", 30);
    expect(result.weightStart).toBe(68.5);
    expect(result.weightEnd).toBe(67.2);
    expect(result.weightChangeKg).toBe(-1.3);
  });

  it("míry těla počítá jen z první/poslední hodnoty v rámci období, ne z celé historie", () => {
    const measurements = [
      { date: "2026-01-01", waist: 90 }, // dávno mimo okno, nesmí ovlivnit deltu
      { date: "2026-08-01", waist: 78 },
      { date: "2026-08-10", waist: 76 },
    ];
    const result = buildMonthlyReportData([], [], measurements, "2026-08-12", 30);
    expect(result.measurements.waist).toEqual({ latest: 76, delta: -2 });
    expect(result.measurements.hips).toBeUndefined();
  });
});
