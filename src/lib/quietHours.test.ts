import { describe, it, expect } from "vitest";
import { isQuietHours } from "./quietHours";

describe("isQuietHours", () => {
  it("s výchozím rozsahem (22-7) je půlnoc i pozdní večer tichý čas", () => {
    expect(isQuietHours(23)).toBe(true);
    expect(isQuietHours(0)).toBe(true);
    expect(isQuietHours(2)).toBe(true);
  });

  it("hranice start (22) je tichý čas, hranice end (7) už ne", () => {
    expect(isQuietHours(22)).toBe(true);
    expect(isQuietHours(7)).toBe(false);
  });

  it("den mimo tichý čas", () => {
    expect(isQuietHours(21)).toBe(false);
    expect(isQuietHours(12)).toBe(false);
    expect(isQuietHours(8)).toBe(false);
  });

  it("rozsah nepřesahující půlnoc (např. 9-17) funguje jako běžný interval", () => {
    expect(isQuietHours(10, 9, 17)).toBe(true);
    expect(isQuietHours(9, 9, 17)).toBe(true);
    expect(isQuietHours(17, 9, 17)).toBe(false);
    expect(isQuietHours(8, 9, 17)).toBe(false);
    expect(isQuietHours(18, 9, 17)).toBe(false);
  });
});
