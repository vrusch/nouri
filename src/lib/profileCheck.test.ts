import { describe, it, expect } from "vitest";
import { computeProfileCheckStatus, PROFILE_CHECK_INTERVAL_DAYS } from "./profileCheck";

describe("computeProfileCheckStatus", () => {
  const today = "2026-08-11";

  it("bez záznamu je 'nikdy nezkontrolováno' a nabídka je aktivní", () => {
    const status = computeProfileCheckStatus(undefined, today);
    expect(status.daysSinceCheck).toBeNull();
    expect(status.checkOverdue).toBe(true);
  });

  it("kontrola v rámci intervalu není po termínu", () => {
    const status = computeProfileCheckStatus("2026-08-05", today);
    expect(status.daysSinceCheck).toBe(6);
    expect(status.checkOverdue).toBe(false);
  });

  it("kontrola přesně na hranici intervalu je už po termínu (>=)", () => {
    const boundaryDate = "2026-07-21"; // 21 dní zpět
    const status = computeProfileCheckStatus(boundaryDate, today);
    expect(status.daysSinceCheck).toBe(PROFILE_CHECK_INTERVAL_DAYS);
    expect(status.checkOverdue).toBe(true);
  });

  it("den před hranicí intervalu ještě není po termínu", () => {
    const status = computeProfileCheckStatus("2026-07-22", today);
    expect(status.daysSinceCheck).toBe(20);
    expect(status.checkOverdue).toBe(false);
  });

  it("kontrola dávno po termínu zůstává po termínu", () => {
    const status = computeProfileCheckStatus("2026-01-01", today);
    expect(status.checkOverdue).toBe(true);
  });
});
