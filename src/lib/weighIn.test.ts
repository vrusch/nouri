import { describe, it, expect } from "vitest";
import { computeWeighInStatus, daysSince } from "./weighIn";

describe("daysSince", () => {
  it("počítá rozdíl dnů mezi dvěma daty", () => {
    expect(daysSince("2026-08-01", "2026-08-08")).toBe(7);
    expect(daysSince("2026-08-08", "2026-08-08")).toBe(0);
  });

  it("počítá správně přes hranici měsíce i roku (UTC, bez vlivu DST)", () => {
    expect(daysSince("2026-01-28", "2026-02-02")).toBe(5);
    expect(daysSince("2025-12-30", "2026-01-02")).toBe(3);
  });
});

describe("computeWeighInStatus", () => {
  const today = "2026-08-08";

  it("bez žádného záznamu je 'nikdy nezváženo' a připomínka je aktivní", () => {
    const status = computeWeighInStatus(null, 3, today);
    expect(status.daysSinceWeighIn).toBeNull();
    expect(status.weighInOverdue).toBe(true);
  });

  // Regrese: tichý "seed" bod (viz seedWeightLogIfEmpty) se dřív počítal jako reálné
  // vážení kvůli podmínce `source !== "seed"`, která brala i legacy záznamy bez pole
  // source jako "reálné". Appka pak mlčela, i když se uživatel nikdy nezvážil.
  it("REGRESE: seed záznam se nepočítá jako reálné vážení", () => {
    const status = computeWeighInStatus({ date: today, weight: 80, source: "seed" }, 3, today);
    expect(status.daysSinceWeighIn).toBeNull();
    expect(status.weighInOverdue).toBe(true);
  });

  it("REGRESE: legacy záznam bez pole source (z doby před seed/manual) se nepočítá jako reálný", () => {
    const status = computeWeighInStatus({ date: today, weight: 80 }, 3, today);
    expect(status.daysSinceWeighIn).toBeNull();
    expect(status.weighInOverdue).toBe(true);
  });

  it("reálné (manual) vážení v rámci intervalu není po termínu", () => {
    const status = computeWeighInStatus({ date: "2026-08-07", weight: 80, source: "manual" }, 3, today);
    expect(status.daysSinceWeighIn).toBe(1);
    expect(status.weighInOverdue).toBe(false);
  });

  it("reálné (manual) vážení starší než interval je po termínu", () => {
    const status = computeWeighInStatus({ date: "2026-08-01", weight: 80, source: "manual" }, 3, today);
    expect(status.daysSinceWeighIn).toBe(7);
    expect(status.weighInOverdue).toBe(true);
  });

  it("vážení přesně na hranici intervalu je už po termínu (>=)", () => {
    const status = computeWeighInStatus({ date: "2026-08-05", weight: 80, source: "manual" }, 3, today);
    expect(status.daysSinceWeighIn).toBe(3);
    expect(status.weighInOverdue).toBe(true);
  });

  it("den před hranicí intervalu ještě není po termínu", () => {
    const status = computeWeighInStatus({ date: "2026-08-06", weight: 80, source: "manual" }, 3, today);
    expect(status.daysSinceWeighIn).toBe(2);
    expect(status.weighInOverdue).toBe(false);
  });
});
