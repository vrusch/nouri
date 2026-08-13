import { describe, it, expect } from "vitest";
import { computeMealReminderStatus } from "./mealReminder";

describe("computeMealReminderStatus", () => {
  const morning = new Date("2026-08-12T10:00:00");
  const afternoon = new Date("2026-08-12T15:00:00");
  const boundary = new Date("2026-08-12T14:00:00");
  const evening = new Date("2026-08-12T21:00:00");
  const justBeforeCeiling = new Date("2026-08-12T19:00:00");
  const atCeiling = new Date("2026-08-12T20:00:00");

  it("dopoledne appka oběd nepřipomíná, ani když ještě není zapsaný", () => {
    const status = computeMealReminderStatus([], morning);
    expect(status.lunchOverdue).toBe(false);
  });

  it("odpoledne bez zapsaného oběda je připomínka aktivní", () => {
    const status = computeMealReminderStatus(["breakfast"], afternoon);
    expect(status.lunchOverdue).toBe(true);
  });

  it("odpoledne se zapsaným obědem připomínka zmizí", () => {
    const status = computeMealReminderStatus(["breakfast", "lunch"], afternoon);
    expect(status.lunchOverdue).toBe(false);
  });

  it("přesně ve 14:00 se už připomínka počítá jako odpoledne", () => {
    const status = computeMealReminderStatus([], boundary);
    expect(status.lunchOverdue).toBe(true);
  });

  it("bez zapsaných jídel vůbec se odpoledne připomínka taky spustí", () => {
    const status = computeMealReminderStatus([], afternoon);
    expect(status.lunchOverdue).toBe(true);
  });

  it("večer už appka oběd nepřipomíná — je čas spíš na večeři", () => {
    const status = computeMealReminderStatus([], evening);
    expect(status.lunchOverdue).toBe(false);
  });

  it("těsně pod horní hranicí (19:00) je připomínka ještě aktivní", () => {
    const status = computeMealReminderStatus([], justBeforeCeiling);
    expect(status.lunchOverdue).toBe(true);
  });

  it("přesně na horní hranici (20:00) už připomínka zmizí", () => {
    const status = computeMealReminderStatus([], atCeiling);
    expect(status.lunchOverdue).toBe(false);
  });
});
