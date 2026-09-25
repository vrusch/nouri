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

describe("computeMealReminderStatus — snídaně a večeře", () => {
  const at = (time: string) => new Date(`2026-08-12T${time}:00`);

  it("v 9:00 snídani ještě nepřipomíná", () => {
    expect(computeMealReminderStatus([], at("09:00")).breakfastOverdue).toBe(false);
  });

  it("od 10:00 bez snídaně připomíná snídani", () => {
    expect(computeMealReminderStatus([], at("10:00")).breakfastOverdue).toBe(true);
    expect(computeMealReminderStatus(["snack"], at("12:30")).breakfastOverdue).toBe(true);
  });

  it("se zapsanou snídaní nebo obědem snídani nepřipomíná", () => {
    expect(computeMealReminderStatus(["breakfast"], at("11:00")).breakfastOverdue).toBe(false);
    expect(computeMealReminderStatus(["lunch"], at("13:00")).breakfastOverdue).toBe(false);
  });

  it("od 14:00 už snídani nepřipomíná — přebírá to oběd", () => {
    const status = computeMealReminderStatus([], at("14:00"));
    expect(status.breakfastOverdue).toBe(false);
    expect(status.lunchOverdue).toBe(true);
  });

  it("od 20:00 bez večeře připomíná večeři, oběd už ne", () => {
    const status = computeMealReminderStatus([], at("20:00"));
    expect(status.dinnerOverdue).toBe(true);
    expect(status.lunchOverdue).toBe(false);
  });

  it("v 19:59 večeři ještě nepřipomíná", () => {
    expect(computeMealReminderStatus([], at("19:59")).dinnerOverdue).toBe(false);
  });

  it("se zapsanou večeří večeři nepřipomíná", () => {
    expect(computeMealReminderStatus(["dinner"], at("21:00")).dinnerOverdue).toBe(false);
  });

  it("v jednu chvíli appka připomíná nejvýš jedno jídlo", () => {
    for (let h = 0; h < 24; h++) {
      const s = computeMealReminderStatus([], at(`${String(h).padStart(2, "0")}:30`));
      expect([s.breakfastOverdue, s.lunchOverdue, s.dinnerOverdue].filter(Boolean).length).toBeLessThanOrEqual(1);
    }
  });
});
