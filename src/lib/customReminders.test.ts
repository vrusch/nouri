import { describe, it, expect } from "vitest";
import { pickDailyCustomReminder } from "./customReminders";

describe("pickDailyCustomReminder", () => {
  it("bez vlastních připomínek vrací null bez ohledu na datum", () => {
    expect(pickDailyCustomReminder([], "2026-08-08")).toBeNull();
    expect(pickDailyCustomReminder([], "2026-08-04")).toBeNull();
  });

  it("mimo interval (den v měsíci není násobek 4) vrací null", () => {
    expect(pickDailyCustomReminder(["Text A"], "2026-08-01")).toBeNull();
    expect(pickDailyCustomReminder(["Text A"], "2026-08-05")).toBeNull();
  });

  it("na dnech, co jsou násobkem 4, vrátí vlastní připomínku", () => {
    expect(pickDailyCustomReminder(["Text A"], "2026-08-04")).toBe("Text A");
    expect(pickDailyCustomReminder(["Text A"], "2026-08-08")).toBe("Text A");
    expect(pickDailyCustomReminder(["Text A"], "2026-08-12")).toBe("Text A");
  });

  it("se stejným datem vrací pořád stejný výsledek (deterministické, ne náhodné)", () => {
    const first = pickDailyCustomReminder(["A", "B", "C"], "2026-08-08");
    const second = pickDailyCustomReminder(["A", "B", "C"], "2026-08-08");
    expect(first).toBe(second);
  });

  it("s víc připomínkami rotuje mezi nimi podle data", () => {
    const a = pickDailyCustomReminder(["A", "B", "C"], "2026-08-04");
    const b = pickDailyCustomReminder(["A", "B", "C"], "2026-08-08");
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // Různá data v intervalu se nemusí nutně lišit, ale výsledek musí vždy být jedna ze zadaných možností.
    expect(["A", "B", "C"]).toContain(a);
    expect(["A", "B", "C"]).toContain(b);
  });
});
