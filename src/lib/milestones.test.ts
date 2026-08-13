import { describe, it, expect } from "vitest";
import { detectNewStreakMilestone, detectNewWeightMilestone } from "./milestones";

describe("detectNewStreakMilestone", () => {
  it("streak pod první hranicí nevrací žádný milník", () => {
    expect(detectNewStreakMilestone(5, undefined)).toBeNull();
  });

  it("streak přesně na první hranici bez dřívějšího oslavení vrátí ji", () => {
    expect(detectNewStreakMilestone(7, undefined)).toBe(7);
  });

  it("streak mezi hranicemi vrátí nejvyšší dosaženou", () => {
    expect(detectNewStreakMilestone(45, undefined)).toBe(30);
  });

  it("hranice už oslavená se znovu nevrátí", () => {
    expect(detectNewStreakMilestone(10, 7)).toBeNull();
  });

  it("nová vyšší hranice se vrátí i po dřívějším oslavení nižší", () => {
    expect(detectNewStreakMilestone(30, 7)).toBe(30);
  });

  it("streak nad všemi hranicemi vrátí nejvyšší (365)", () => {
    expect(detectNewStreakMilestone(400, 100)).toBe(365);
  });
});

describe("detectNewWeightMilestone", () => {
  it("cíl 'maintain' nikdy nevrací milník", () => {
    expect(detectNewWeightMilestone(80, 70, "maintain", undefined)).toBeNull();
  });

  it("hubnutí o 5 kg dosáhne prvního milníku", () => {
    expect(detectNewWeightMilestone(80, 75, "lose", undefined)).toBe(5);
  });

  it("hubnutí o méně než 5 kg zatím žádný milník", () => {
    expect(detectNewWeightMilestone(80, 77, "lose", undefined)).toBeNull();
  });

  it("váha jde opačným směrem než cíl — žádný milník", () => {
    expect(detectNewWeightMilestone(80, 82, "lose", undefined)).toBeNull();
  });

  it("nabírání o 5 kg dosáhne milníku ve správném směru", () => {
    expect(detectNewWeightMilestone(70, 75, "gain", undefined)).toBe(5);
  });

  it("milník už oslavený na stejné úrovni se znovu nevrátí", () => {
    expect(detectNewWeightMilestone(80, 75, "lose", 5)).toBeNull();
  });

  it("další 5 kg pokroku po dřívějším oslavení vrátí novou hranici", () => {
    expect(detectNewWeightMilestone(80, 70, "lose", 5)).toBe(10);
  });
});
