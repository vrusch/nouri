import { describe, it, expect } from "vitest";
import { classifyReportLine, splitBoldSegments } from "./aiReportMarkdown";

describe("classifyReportLine", () => {
  it("řádek začínající ### je header, marker i mezery se odříznou", () => {
    expect(classifyReportLine("### 1. Analýza současného stavu")).toEqual({
      kind: "header",
      text: "1. Analýza současného stavu",
    });
  });

  it("řádek začínající * je bullet, marker i mezera se odříznou", () => {
    expect(classifyReportLine("* Pij dostatek vody")).toEqual({ kind: "bullet", text: "Pij dostatek vody" });
  });

  it("řádek začínající - je bullet stejně jako *", () => {
    expect(classifyReportLine("- Pij dostatek vody")).toEqual({ kind: "bullet", text: "Pij dostatek vody" });
  });

  // REGRESE (B10 v AUDIT_2026-08-13.md): řádek začínající **tučný text** se dřív omylem
  // vykreslil jako odrážka, protože kontrola `line.startsWith('*')` nerozlišila jednu hvězdičku
  // (odrážka) od dvou (tučný text).
  it("řádek začínající **text** NENÍ bullet, i když taky začíná hvězdičkou", () => {
    const result = classifyReportLine("**Cílový příjem:** 1800 kcal");
    expect(result.kind).toBe("paragraph");
    expect(result.text).toBe("**Cílový příjem:** 1800 kcal");
  });

  it("prázdný řádek je blank", () => {
    expect(classifyReportLine("")).toEqual({ kind: "blank", text: "" });
    expect(classifyReportLine("   ")).toEqual({ kind: "blank", text: "" });
  });

  it("obyčejný text bez markeru je paragraph", () => {
    expect(classifyReportLine("Tohle je běžná věta.")).toEqual({ kind: "paragraph", text: "Tohle je běžná věta." });
  });
});

describe("splitBoldSegments", () => {
  it("bez ** vrátí celý text jako jeden nerozdělený segment", () => {
    expect(splitBoldSegments("Obyčejný text")).toEqual([{ text: "Obyčejný text", bold: false }]);
  });

  it("jeden pár ** rozseká na tři segmenty (před, tučný, po)", () => {
    expect(splitBoldSegments("Cíl je **1800 kcal** denně.")).toEqual([
      { text: "Cíl je ", bold: false },
      { text: "1800 kcal", bold: true },
      { text: " denně.", bold: false },
    ]);
  });

  it("víc párů ** rozseká na víc tučných úseků", () => {
    expect(splitBoldSegments("**Bílkoviny:** 120g, **Tuky:** 60g")).toEqual([
      { text: "Bílkoviny:", bold: true },
      { text: " 120g, ", bold: false },
      { text: "Tuky:", bold: true },
      { text: " 60g", bold: false },
    ]);
  });

  it("nepárová hvězdička (bez uzavíracích **) se bere jako obyčejný text", () => {
    expect(splitBoldSegments("Chybí uzavření **tady")).toEqual([{ text: "Chybí uzavření **tady", bold: false }]);
  });
});
