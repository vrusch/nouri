import { describe, it, expect } from "vitest";
import { getLocalDateISO, getPreviousDateISO } from "./date";

describe("getLocalDateISO", () => {
  // REGRESE: AUDIT_2026-08-14.md N10 — `toISOString().split("T")[0]` vrací UTC datum
  // místo lokálního, appka cílí na ČR. Assertujeme jen na lokálních komponentách vstupu,
  // ne na tom, co by vrátil `toISOString()` (to je offset-závislé a bylo by flaky).
  it("skládá datum z lokálních komponent, ne z UTC", () => {
    expect(getLocalDateISO(new Date(2026, 7, 14, 23, 30))).toBe("2026-08-14");
  });

  it("doplňuje nulu u jednociferného měsíce a dne", () => {
    expect(getLocalDateISO(new Date(2026, 0, 5, 12, 0))).toBe("2026-01-05");
  });

  it("bez argumentu použije aktuální lokální datum", () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(getLocalDateISO()).toBe(expected);
  });
});

describe("getPreviousDateISO", () => {
  it("vrátí předchozí den", () => {
    expect(getPreviousDateISO("2026-09-25")).toBe("2026-09-24");
  });

  it("přes hranici měsíce i roku", () => {
    expect(getPreviousDateISO("2026-03-01")).toBe("2026-02-28");
    expect(getPreviousDateISO("2026-01-01")).toBe("2025-12-31");
  });

  it("den po změně času (ČR 2026-03-29 a 2026-10-25) nepřeskočí", () => {
    expect(getPreviousDateISO("2026-03-30")).toBe("2026-03-29");
    expect(getPreviousDateISO("2026-10-26")).toBe("2026-10-25");
  });
});
