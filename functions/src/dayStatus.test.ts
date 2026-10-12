import { describe, expect, it } from "vitest";
import {
  achievableProteinGap,
  describeIntakeStatusCs,
  describeRemainingTodayCs,
  greetingProteinToCatchUp,
  INTAKE_STATUS_RULE,
} from "./dayStatus.js";

describe("INTAKE_STATUS_RULE", () => {
  // Pravidlo nesmí umlčet včerejší překročení v pozdravu (priorita 3) ani předchozí dny v chatu.
  it("omezuje jen DNEŠNÍ překročení, předchozí dny nechává na jejich vlastním řádku", () => {
    expect(INTAKE_STATUS_RULE).toContain("DNEŠNÍM překročení");
    expect(INTAKE_STATUS_RULE).toContain("Včerejšek a předchozí dny");
  });
});

describe("describeIntakeStatusCs", () => {
  // REGRESE: 1709 kcal z cíle 1920 — Home ukazovala "Zbývá ti 211 kcal", pozdrav Myi tvrdil
  // "překročila jsi cíl o 211 kcal". Text pod cílem musí nést výslovný STAV a nesmí obsahovat
  // nic, co by šlo číst jako překročení.
  it("pod cílem: STAV POD CÍLEM, zbývající kcal, žádné PŘEKROČENO", () => {
    const text = describeIntakeStatusCs(1709, 1920, 104, 153);
    expect(text).toContain("STAV: POD CÍLEM");
    expect(text).toContain("zbývá ještě 211 kcal");
    expect(text).toContain("do cíle chybí 49 g");
    expect(text).not.toContain("PŘEKROČENO");
    expect(text).not.toMatch(/PŘES cíl/);
  });

  it("přesně na cíli je ještě pod cílem (stejná hranice jako Home)", () => {
    const text = describeIntakeStatusCs(1920, 1920, 150, 153);
    expect(text).toContain("STAV: POD CÍLEM");
    expect(text).toContain("zbývá ještě 0 kcal");
  });

  it("nad cílem: STAV PŘEKROČENO s rozdílem", () => {
    const text = describeIntakeStatusCs(2131, 1920, 120, 153);
    expect(text).toContain("STAV: PŘEKROČENO");
    expect(text).toContain("PŘES cíl o 211 kcal");
    expect(text).not.toContain("POD CÍLEM");
  });

  it("nic nezapsáno se nehlásí jako hladovění ani jako stav pod cílem", () => {
    const text = describeIntakeStatusCs(0, 1920, 0, 153);
    expect(text).toContain("STAV: NIC NEZAPSÁNO");
    expect(text).not.toContain("POD CÍLEM");
    expect(text).not.toContain("PŘEKROČENO");
  });

  it("zaokrouhluje desetinná čísla z AI odhadů", () => {
    const text = describeIntakeStatusCs(1708.6, 1920, 103.6, 153);
    expect(text).toContain("dnes snědeno 1709 kcal");
    expect(text).toContain("zbývá ještě 211 kcal");
  });
});

describe("describeIntakeStatusCs bez bílkovin (pozdrav, D6)", () => {
  // Ze snědeného množství a cíle by si model mezeru "chybí 48 g" dopočítal sám.
  it("omitProtein vynechá jakékoli číslo o bílkovinách, STAV i zbytek kcal zůstávají", () => {
    const under = describeIntakeStatusCs(1505, 1750, 104, 152, { omitProtein: true });
    expect(under).toBe("STAV: POD CÍLEM (cíl nepřekročen) — dnes snědeno 1505 kcal z cíle 1750 kcal, zbývá ještě 245 kcal.");
    const over = describeIntakeStatusCs(1900, 1750, 104, 152, { omitProtein: true });
    expect(over).toContain("STAV: PŘEKROČENO");
    expect(over).not.toContain("bílkoviny");
  });
});

describe("achievableProteinGap", () => {
  it("víc než ~20 g na 100 kcal se do zbytku dne nevejde", () => {
    expect(achievableProteinGap(245, 48)).toBe(48); // 19,6 g/100 kcal — ještě jde
    expect(achievableProteinGap(150, 48)).toBe(30);
    expect(achievableProteinGap(0, 48)).toBe(0);
    expect(achievableProteinGap(-50, 48)).toBe(0);
    expect(achievableProteinGap(500, -5)).toBe(0);
  });
});

describe("describeRemainingTodayCs (MYA_COACH_SPEC 5.3)", () => {
  const base = { calories: 245, protein: 48, carbs: 30, fat: 9, hasIncompleteMacroData: false, localHour: 17 };

  it("REGRESE (2026-10-11): 245 kcal / 48 g → jen skoro čisté zdroje bílkovin, s hustotou", () => {
    const text = describeRemainingTodayCs(base)!;
    expect(text).toContain("Zbývá dnes: 245 kcal, bílkoviny 48 g, sacharidy 30 g, tuky 9 g.");
    expect(text).toContain("~20 g bílkovin na 100 kcal");
    expect(text).toContain("skoro čisté zdroje bílkovin");
  });

  it("když se bílkoviny do kalorií nevejdou, řekne dosažitelnou část bez výčitek", () => {
    const text = describeRemainingTodayCs({ ...base, calories: 150 })!;
    expect(text).toContain("nevejdou");
    expect(text).toContain("~30 g");
    expect(text).toContain("a to stačí");
  });

  it("při volnějším zbytku stačí běžné libové zdroje, při malé mezeře nic navíc", () => {
    expect(describeRemainingTodayCs({ ...base, calories: 600 })).toContain("libové maso");
    expect(describeRemainingTodayCs({ ...base, calories: 600, protein: 8 })).toBe(
      "Zbývá dnes: 600 kcal, bílkoviny 8 g, sacharidy 30 g, tuky 9 g."
    );
  });

  it("pozdě večer mezeru nehoní (D5)", () => {
    const text = describeRemainingTodayCs({ ...base, localHour: 22 })!;
    expect(text).toContain("mezeru už nehoň");
    expect(text).not.toContain("na 100 kcal");
  });

  it("neúplná makra = orientačně; přes cíl žádný řádek; záporná makra jako 0", () => {
    expect(describeRemainingTodayCs({ ...base, hasIncompleteMacroData: true })).toContain("orientačně");
    expect(describeRemainingTodayCs({ ...base, calories: 0 })).toBeUndefined();
    expect(describeRemainingTodayCs({ ...base, calories: -120 })).toBeUndefined();
    expect(describeRemainingTodayCs({ ...base, fat: -4 })).toContain("tuky 0 g");
  });
});

describe("greetingProteinToCatchUp (D6)", () => {
  it("jen dosažitelná část, malá mezera ani pozdní večer nic", () => {
    expect(greetingProteinToCatchUp(245, 48, 15)).toBe(48);
    expect(greetingProteinToCatchUp(150, 48, 15)).toBe(30);
    expect(greetingProteinToCatchUp(30, 48, 15)).toBeUndefined(); // dohnat jde jen 6 g
    expect(greetingProteinToCatchUp(245, 8, 15)).toBeUndefined();
    expect(greetingProteinToCatchUp(245, 48, 21)).toBeUndefined();
    expect(greetingProteinToCatchUp(245, 48, undefined)).toBe(48);
  });
});
