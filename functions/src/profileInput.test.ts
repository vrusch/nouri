import { describe, expect, it } from "vitest";
import { parseProfileInput } from "./profileInput.js";

const NOW = new Date("2026-09-26T12:00:00Z");

const valid = {
  name: "Jana",
  gender: "female",
  height: 168,
  weight: 70,
  birthDate: "1990-05-01",
  activityLevel: 1.375,
  goal: "lose",
  // Klient posílá celý UserProfile — pole, která server nepotřebuje, se zahodí.
  targetCalories: 1600,
  setupComplete: true,
};

describe("parseProfileInput (N38)", () => {
  it("platný profil propustí jen se známými poli", () => {
    expect(parseProfileInput(valid, NOW)).toEqual({
      name: "Jana",
      gender: "female",
      height: 168,
      weight: 70,
      birthDate: "1990-05-01",
      activityLevel: 1.375,
      goal: "lose",
      coachingStyle: undefined,
    });
  });

  it("je volnější než onboarding — starší profil mimo dnešní hranice klienta projde", () => {
    // Onboarding dnes chce 100–250 cm / 30–300 kg / 10–100 let a aktivitu od 1.2.
    const legacy = { ...valid, height: 95, weight: 310, birthDate: "1920-01-01", activityLevel: 1 };
    expect(parseProfileInput(legacy, NOW)).not.toBeNull();
  });

  it("číselné řetězce ze staršího buildu převede na čísla (starý kód je díky JS koerci snesl)", () => {
    const result = parseProfileInput({ ...valid, height: "168", weight: "70.5", activityLevel: "1.375", customProteinGrams: "120" }, NOW);
    expect(result).toMatchObject({ height: 168, weight: 70.5, activityLevel: 1.375, customProteinGrams: 120 });
  });

  it.each([
    ["chybí profil", undefined],
    ["není objekt", "profil"],
    ["neznámé pohlaví", { ...valid, gender: "other" }],
    ["neznámý cíl", { ...valid, goal: "bulk" }],
    ["váha NaN", { ...valid, weight: Number.NaN }],
    ["váha jako nečíselný řetězec", { ...valid, weight: "sedmdesát" }],
    ["prázdná váha", { ...valid, weight: "" }],
    ["záporná výška", { ...valid, height: -168 }],
    ["aktivita mimo rozsah", { ...valid, activityLevel: 9 }],
    ["nečitelné datum narození", { ...valid, birthDate: "včera" }],
    ["datum narození v budoucnu", { ...valid, birthDate: "2030-01-01" }],
  ])("rozbitá povinná data → null (%s)", (_label, input) => {
    expect(parseProfileInput(input, NOW)).toBeNull();
  });

  it("platné přepisy (kalibrace, vlastní makra) zachová, včetně 0 g tuků", () => {
    const result = parseProfileInput({ ...valid, calibratedTDEE: 2100, customProteinGrams: 120, customFatGrams: 0 }, NOW);
    expect(result).toMatchObject({ calibratedTDEE: 2100, customProteinGrams: 120, customFatGrams: 0 });
  });

  it("rozbité nepovinné přepisy zahodí, profil jinak projde (platí formulka)", () => {
    const result = parseProfileInput(
      { ...valid, calibratedTDEE: Number.POSITIVE_INFINITY, customProteinGrams: "hodně", customFatGrams: -5 },
      NOW
    );
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("calibratedTDEE");
    expect(result).not.toHaveProperty("customProteinGrams");
    expect(result).not.toHaveProperty("customFatGrams");
  });

  it("jméno, které není řetězec, nahradí prázdným", () => {
    expect(parseProfileInput({ ...valid, name: { evil: true } }, NOW)?.name).toBe("");
  });

  it("styl Myi propustí beze změny — validuje ho parseCoachingStyle", () => {
    expect(parseProfileInput({ ...valid, coachingStyle: "strict" }, NOW)?.coachingStyle).toBe("strict");
  });
});
