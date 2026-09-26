import { describe, expect, it } from "vitest";
import { DEFAULT_TIME_ZONE, getLocalTimeParts, resolveTimeZone } from "./localTime.js";

describe("resolveTimeZone", () => {
  it("platné IANA pásmo propustí", () => {
    expect(resolveTimeZone("America/New_York")).toBe("America/New_York");
  });

  it.each([undefined, "", "Mars/Olympus", 42])("neplatné pásmo (%s) → Europe/Prague", (value) => {
    expect(resolveTimeZone(value)).toBe(DEFAULT_TIME_ZONE);
  });
});

describe("getLocalTimeParts", () => {
  it("v létě je Praha UTC+2", () => {
    expect(getLocalTimeParts(new Date("2026-07-15T10:30:00Z"), "Europe/Prague")).toEqual({ dateISO: "2026-07-15", hour: 12, minute: 30 });
  });

  it("v zimě je Praha UTC+1", () => {
    expect(getLocalTimeParts(new Date("2026-01-15T10:30:00Z"), "Europe/Prague")).toEqual({ dateISO: "2026-01-15", hour: 11, minute: 30 });
  });

  it("místní datum se přehoupne dřív než UTC (23:30 UTC = 01:30 dalšího dne v Praze v létě)", () => {
    expect(getLocalTimeParts(new Date("2026-07-15T23:30:00Z"), "Europe/Prague")).toEqual({ dateISO: "2026-07-16", hour: 1, minute: 30 });
  });

  it("přechod na letní čas (29. 3. 2026): 00:59 UTC = 01:59, 01:00 UTC = 03:00", () => {
    expect(getLocalTimeParts(new Date("2026-03-29T00:59:00Z"), "Europe/Prague")).toMatchObject({ hour: 1, minute: 59 });
    expect(getLocalTimeParts(new Date("2026-03-29T01:00:00Z"), "Europe/Prague")).toMatchObject({ hour: 3, minute: 0 });
  });

  it("přechod na zimní čas (25. 10. 2026): hodina 2 nastane dvakrát", () => {
    expect(getLocalTimeParts(new Date("2026-10-25T00:30:00Z"), "Europe/Prague")).toMatchObject({ hour: 2, minute: 30 });
    expect(getLocalTimeParts(new Date("2026-10-25T01:30:00Z"), "Europe/Prague")).toMatchObject({ hour: 2, minute: 30 });
  });

  it("půlnoc je hodina 0, ne 24", () => {
    expect(getLocalTimeParts(new Date("2026-01-15T23:00:00Z"), "Europe/Prague")).toEqual({ dateISO: "2026-01-16", hour: 0, minute: 0 });
  });

  it("neplatné pásmo spadne na Prahu místo výjimky", () => {
    expect(getLocalTimeParts(new Date("2026-07-15T10:30:00Z"), "Nesmysl/Zona")).toMatchObject({ hour: 12 });
  });
});
