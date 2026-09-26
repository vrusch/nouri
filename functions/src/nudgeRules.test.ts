import { describe, expect, it } from "vitest";
import {
  computeActiveNudges,
  isQuietHours,
  MAX_PUSHES_PER_DAY,
  nextPushState,
  selectNudgesToSend,
  type CoachingStyle,
  type ServerNudge,
} from "./nudgeRules.js";
// Klientský originál — paritní test hlídá, že serverová kopie neujede.
import { computeActiveNudges as clientComputeActiveNudges } from "../../src/lib/nudges";
import { computeMealReminderStatus as clientMealReminder } from "../../src/lib/mealReminder";
import { computeWaterPaceStatus as clientWaterPace } from "../../src/lib/water";
import { getWaterBehindThreshold as clientWaterThreshold } from "../../src/lib/coachingStyle";
import { isQuietHours as clientIsQuietHours } from "../../src/lib/quietHours";

const STYLES: CoachingStyle[] = ["gentle", "balanced", "strict"];
const MEAL_SETS: string[][] = [[], ["breakfast"], ["lunch"], ["breakfast", "lunch"], ["breakfast", "lunch", "dinner"], ["snack"]];

describe("paritní test: serverová kopie = klientské computeActiveNudges", () => {
  it("shoduje se přes mřížku hodin × minut × stylů × volna × jídel × vody", () => {
    let compared = 0;
    for (let hour = 0; hour < 24; hour++) {
      for (const minute of [0, 30, 59]) {
        const now = new Date(2026, 8, 26, hour, minute);
        for (const style of STYLES) {
          for (const isVacationDay of [false, true]) {
            for (const meals of MEAL_SETS) {
              for (const glasses of [0, 2, 5, 8]) {
                const client = clientComputeActiveNudges({
                  mealReminder: clientMealReminder(meals, now),
                  waterPace: { ...clientWaterPace(glasses, now, clientWaterThreshold(style)), glasses },
                  style,
                  isVacationDay,
                });
                const server = computeActiveNudges({ todaysMealTypes: meals, waterGlasses: glasses, hour, minute, style, isVacationDay });
                expect(server).toEqual(client);
                compared++;
              }
            }
          }
        }
      }
    }
    expect(compared).toBe(24 * 3 * 3 * 2 * MEAL_SETS.length * 4);
  });

  it("tichý režim se shoduje pro všechny hodiny a běžná i přes-půlnoční okna", () => {
    for (const [start, end] of [[22, 7], [8, 12], [5, 5], [23, 0]]) {
      for (let hour = 0; hour < 24; hour++) {
        expect(isQuietHours(hour, start, end)).toBe(clientIsQuietHours(hour, start, end));
      }
    }
  });
});

const lunch: ServerNudge = { kind: "lunch", text: "oběd", dismissKey: "lunch" };
const water4: ServerNudge = { kind: "water", text: "voda", dismissKey: "water_4" };
const water5: ServerNudge = { kind: "water", text: "voda", dismissKey: "water_5" };

describe("selectNudgesToSend / nextPushState", () => {
  it("bez stavu pošle všechny aktivní připomínky", () => {
    expect(selectNudgesToSend([lunch, water4], undefined, "2026-09-26")).toEqual([lunch, water4]);
  });

  it("stejnou připomínku podruhé ten den neposlat", () => {
    const state = nextPushState(undefined, "2026-09-26", [lunch, water4]);
    expect(selectNudgesToSend([lunch, water4], state, "2026-09-26")).toEqual([]);
  });

  it("voda se připomene znovu, až skluz naroste (jiný klíč)", () => {
    const state = nextPushState(undefined, "2026-09-26", [water4]);
    expect(selectNudgesToSend([water5], state, "2026-09-26")).toEqual([water5]);
  });

  it("denní strop platí i napříč hodinami", () => {
    let state = nextPushState(undefined, "2026-09-26", [lunch, water4]);
    expect(state.count).toBe(2);
    const third = selectNudgesToSend([water5], state, "2026-09-26");
    expect(third).toEqual([water5]);
    state = nextPushState(state, "2026-09-26", third);
    expect(state.count).toBe(MAX_PUSHES_PER_DAY);
    expect(selectNudgesToSend([{ kind: "dinner", text: "večeře", dismissKey: "dinner" }], state, "2026-09-26")).toEqual([]);
  });

  it("stav ze včerejška se nepočítá", () => {
    const yesterday = nextPushState(undefined, "2026-09-25", [lunch, water4, water5]);
    expect(selectNudgesToSend([lunch], yesterday, "2026-09-26")).toEqual([lunch]);
    expect(nextPushState(yesterday, "2026-09-26", [lunch])).toEqual({ date: "2026-09-26", sentKeys: ["lunch"], count: 1 });
  });
});
