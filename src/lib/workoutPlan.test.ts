import { describe, it, expect } from "vitest";
import { computeWorkoutPlanStatus } from "./workoutPlan";

describe("computeWorkoutPlanStatus", () => {
  // 2026-08-12 je středa (day 3)
  const wednesday = new Date("2026-08-12T10:00:00");

  it("bez naplánovaných dní appka nic nepřipomíná", () => {
    const status = computeWorkoutPlanStatus(undefined, false, wednesday);
    expect(status.isPlannedToday).toBe(false);
    expect(status.reminderDue).toBe(false);
  });

  it("prázdné pole naplánovaných dní se chová stejně jako chybějící", () => {
    const status = computeWorkoutPlanStatus([], false, wednesday);
    expect(status.isPlannedToday).toBe(false);
    expect(status.reminderDue).toBe(false);
  });

  it("dnešek je naplánovaný a trénink ještě nezapsaný — připomínka aktivní", () => {
    const status = computeWorkoutPlanStatus([1, 3, 5], false, wednesday);
    expect(status.isPlannedToday).toBe(true);
    expect(status.reminderDue).toBe(true);
  });

  it("dnešek je naplánovaný, ale trénink už zapsaný — připomínka zmizí", () => {
    const status = computeWorkoutPlanStatus([1, 3, 5], true, wednesday);
    expect(status.isPlannedToday).toBe(true);
    expect(status.reminderDue).toBe(false);
  });

  it("dnešek není mezi naplánovanými dny — žádná připomínka bez ohledu na zápis", () => {
    const status = computeWorkoutPlanStatus([1, 5], false, wednesday);
    expect(status.isPlannedToday).toBe(false);
    expect(status.reminderDue).toBe(false);
  });
});
