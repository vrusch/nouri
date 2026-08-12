import { describe, it, expect } from "vitest";
import { computeMeasurementTrend } from "./bodyMeasurements";

describe("computeMeasurementTrend", () => {
  it("bez záznamů pro dané pole vrací null", () => {
    const trend = computeMeasurementTrend([{ date: "2026-08-01", hips: 95 }], "waist");
    expect(trend).toBeNull();
  });

  it("jeden záznam — latest je vyplněno, delta je null (nedá se s čím srovnat)", () => {
    const trend = computeMeasurementTrend([{ date: "2026-08-01", waist: 70 }], "waist");
    expect(trend).toEqual({ latest: 70, delta: null });
  });

  it("dva a víc záznamů — delta je rozdíl mezi prvním a posledním", () => {
    const entries = [
      { date: "2026-08-01", waist: 72 },
      { date: "2026-08-08", waist: 71 },
      { date: "2026-08-15", waist: 69.5 },
    ];
    const trend = computeMeasurementTrend(entries, "waist");
    expect(trend).toEqual({ latest: 69.5, delta: -2.5 });
  });

  it("pole vyplněné jen v některých záznamech — 'první' je první výskyt pole, ne entries[0]", () => {
    const entries = [
      { date: "2026-08-01", waist: 70 }, // hips chybí
      { date: "2026-08-08", hips: 96 }, // první záznam s hips
      { date: "2026-08-15", waist: 69, hips: 94 },
    ];
    const trend = computeMeasurementTrend(entries, "hips");
    expect(trend).toEqual({ latest: 94, delta: -2 });
  });

  it("prázdné pole entries vrací null", () => {
    expect(computeMeasurementTrend([], "chest")).toBeNull();
  });
});
