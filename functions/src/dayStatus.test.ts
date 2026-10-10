import { describe, expect, it } from "vitest";
import { describeIntakeStatusCs, INTAKE_STATUS_RULE } from "./dayStatus.js";

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
