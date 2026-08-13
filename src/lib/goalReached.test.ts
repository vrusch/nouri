import { describe, it, expect } from "vitest";
import { detectGoalReached } from "./goalReached";

describe("detectGoalReached", () => {
  it("cíl 'maintain' nikdy nevrací dosaženo, i kdyby targetWeight byl nastavený", () => {
    expect(detectGoalReached(70, 70, "maintain", undefined)).toBe(false);
  });

  it("bez targetWeight (dosud nenastaveno) nikdy nevrací dosaženo", () => {
    expect(detectGoalReached(70, undefined, "lose", undefined)).toBe(false);
  });

  it("hubnutí: váha nad cílem ještě není dosaženo", () => {
    expect(detectGoalReached(72, 70, "lose", undefined)).toBe(false);
  });

  it("hubnutí: váha přesně na cíli je dosaženo", () => {
    expect(detectGoalReached(70, 70, "lose", undefined)).toBe(true);
  });

  it("hubnutí: váha pod cílem je taky dosaženo (překročeno, ne jen shoda)", () => {
    expect(detectGoalReached(68, 70, "lose", undefined)).toBe(true);
  });

  it("nabírání: váha pod cílem ještě není dosaženo", () => {
    expect(detectGoalReached(68, 70, "gain", undefined)).toBe(false);
  });

  it("nabírání: váha na cíli nebo nad ním je dosaženo", () => {
    expect(detectGoalReached(72, 70, "gain", undefined)).toBe(true);
  });

  it("stejný cíl už jednou oslavený se znovu nevrací", () => {
    expect(detectGoalReached(68, 70, "lose", 70)).toBe(false);
  });

  it("nový (jiný) cíl po dřívější oslavě se vrací znovu, i když je zase dosažený", () => {
    expect(detectGoalReached(63, 65, "lose", 70)).toBe(true);
  });
});
