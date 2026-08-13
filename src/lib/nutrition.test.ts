import { describe, it, expect, vi, afterEach } from "vitest";
import {
  calculateAge,
  calculateNutrition,
  calibrateTarget,
  getProgressCaption,
  getDayTrafficLight,
  computeRemainingMacros,
  getRecipeAvailability,
  type NutritionResults,
} from "./nutrition";

function addDays(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

function dailyRange(start: string, endExclusive: string, kcal: number) {
  const out: { date: string; calories: number }[] = [];
  let d = start;
  while (d < endExclusive) {
    out.push({ date: d, calories: kcal });
    d = addDays(d, 1);
  }
  return out;
}

describe("calculateAge", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ještě nepřipočítá rok, pokud narozeniny letos ještě nebyly", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T12:00:00Z")); // březen, narozeniny v prosinci
    expect(calculateAge("1996-12-25")).toBe(29);
  });

  it("připočítá rok, jakmile narozeniny letos proběhly", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T12:00:00Z")); // březen, narozeniny v lednu
    expect(calculateAge("1996-01-10")).toBe(30);
  });
});

describe("calculateNutrition", () => {
  const base = {
    gender: "female" as const,
    weight: 70,
    height: 165,
    birthDate: "1995-01-01",
    activityLevel: 1.2,
    goal: "lose" as const,
  };

  it("používá formulkový TDEE, když není kalibrace", () => {
    const result = calculateNutrition(base);
    expect(result.tdee).not.toBe(2700);
    expect(result.bmr).toBeGreaterThan(0);
  });

  it("calibratedTDEE přepíše formulkový odhad úplně všude", () => {
    const result = calculateNutrition({ ...base, calibratedTDEE: 2700 });
    expect(result.tdee).toBe(2700);
    expect(result.targetCalories).toBe(2200); // lose: 2700 - 500
  });

  it("nejde pod BMR pojistku ani při hubnutí", () => {
    const result = calculateNutrition({ ...base, activityLevel: 1, weight: 50 });
    expect(result.targetCalories).toBeGreaterThanOrEqual(result.bmr);
  });

  it("gain přidává 300 kcal nad TDEE", () => {
    const withoutCalibration = calculateNutrition({ ...base, goal: "gain", calibratedTDEE: 2000 });
    expect(withoutCalibration.targetCalories).toBe(2300);
  });

  it("maintain cílí přímo na TDEE", () => {
    const result = calculateNutrition({ ...base, goal: "maintain", calibratedTDEE: 2000 });
    expect(result.targetCalories).toBe(2000);
  });

  it("BMR se liší podle pohlaví (Mifflin-St Jeor +5 muži / -161 ženy) při stejných ostatních vstupech", () => {
    const female = calculateNutrition({ ...base, gender: "female" });
    const male = calculateNutrition({ ...base, gender: "male" });
    // Rozdíl mezi větvemi je přesně +5 - (-161) = 166 kcal.
    expect(male.bmr - female.bmr).toBe(166);
  });

  it("vyšší activityLevel dává vyšší TDEE (monotónnost)", () => {
    const low = calculateNutrition({ ...base, activityLevel: 1.2 });
    const high = calculateNutrition({ ...base, activityLevel: 1.725 });
    expect(high.tdee).toBeGreaterThan(low.tdee);
  });

  it("makra: bílkoviny = 1.8g/kg, tuky = 25 % cíle, sacharidy = zbytek", () => {
    const result = calculateNutrition({ ...base, goal: "maintain", calibratedTDEE: 2000 });
    expect(result.macros.protein).toBe(Math.round(base.weight * 1.8)); // 70*1.8 = 126
    expect(result.macros.fat).toBe(Math.round((2000 * 0.25) / 9)); // 55.5 -> 56
    const proteinKcal = result.macros.protein * 4;
    const fatKcal = result.macros.fat * 9;
    const carbsKcal = result.macros.carbs * 4;
    // Součet makro-kalorií musí sedět na cílové kalorie (v rámci zaokrouhlení na gramy).
    expect(proteinKcal + fatKcal + carbsKcal).toBeGreaterThanOrEqual(1990);
    expect(proteinKcal + fatKcal + carbsKcal).toBeLessThanOrEqual(2010);
  });
});

describe("calibrateTarget", () => {
  const START = "2026-07-01";

  it("navrhne vyšší TDEE, když hubla rychleji, než formulka čekala", () => {
    const weighIns = [
      { date: START, weight: 80 },
      { date: addDays(START, 21), weight: 77.5 },
    ];
    const daily = dailyRange(START, addDays(START, 21), 1700);
    const result = calibrateTarget(weighIns, daily, "lose", 1450, 2200);

    expect(result).not.toBeNull();
    expect(result?.daysSpan).toBe(21);
    expect(result?.avgLoggedCalories).toBe(1700);
    expect(result?.weightChangeKg).toBe(-2.5);
    expect(result?.estimatedTDEE).toBe(2617);
    expect(result?.suggestedTargetCalories).toBe(2117);
  });

  it("nic nenavrhne, když úbytek přesně odpovídá formulce", () => {
    const expectedLossKg = (500 * 21) / 7700;
    const weighIns = [
      { date: START, weight: 80 },
      { date: addDays(START, 21), weight: Math.round((80 - expectedLossKg) * 10) / 10 },
    ];
    const daily = dailyRange(START, addDays(START, 21), 1700);
    expect(calibrateTarget(weighIns, daily, "lose", 1450, 2200)).toBeNull();
  });

  it("nic nenavrhne při rozestupu vážení kratším než 14 dní", () => {
    const weighIns = [
      { date: START, weight: 80 },
      { date: addDays(START, 10), weight: 76 },
    ];
    const daily = dailyRange(START, addDays(START, 10), 1200);
    expect(calibrateTarget(weighIns, daily, "lose", 1450, 2200)).toBeNull();
  });

  it("nic nenavrhne, když je zapsáno málo dní s jídlem", () => {
    const weighIns = [
      { date: START, weight: 80 },
      { date: addDays(START, 20), weight: 77 },
    ];
    const daily = dailyRange(START, addDays(START, 5), 1500); // jen 5 dní z 20
    expect(calibrateTarget(weighIns, daily, "lose", 1450, 2200)).toBeNull();
  });

  // B4 v AUDIT_2026-08-13.md: MIN_CALIBRATION_LOGGED_DAYS samo o sobě appce dovolilo počítat
  // průměr jen ze 7 zapsaných dní z klidně 60denního rozpětí a tiše předpokládat, že reprezentují
  // celé období.
  it("vrací null, když je pokrytí zapsaných dní vůči rozpětí příliš řídké, i přes splnění MIN_CALIBRATION_LOGGED_DAYS", () => {
    const weighIns = [
      { date: START, weight: 90 },
      { date: addDays(START, 60), weight: 85 },
    ];
    const daily = dailyRange(START, addDays(START, 7), 1500); // 7 zapsaných dní z 60denního rozpětí (poměr ~0.12)
    expect(calibrateTarget(weighIns, daily, "lose", 1450, 2200)).toBeNull();
  });

  it("s vysokým pokrytím zapsaných dní beze změny chování (regresní pojistka)", () => {
    const weighIns = [
      { date: START, weight: 90 },
      { date: addDays(START, 21), weight: 87 },
    ];
    const daily = dailyRange(START, addDays(START, 21), 1700); // 21 zapsaných dní z 21denního rozpětí
    expect(calibrateTarget(weighIns, daily, "lose", 1450, 2200)).not.toBeNull();
  });

  it("odhadne nižší TDEE, když přibrala víc, než formulka čekala (goal: gain)", () => {
    const weighIns = [
      { date: START, weight: 60 },
      { date: addDays(START, 28), weight: 62 },
    ];
    const daily = dailyRange(START, addDays(START, 28), 2300);
    const result = calibrateTarget(weighIns, daily, "gain", 1300, 2000);

    expect(result?.estimatedTDEE).toBe(1750);
    expect(result?.suggestedTargetCalories).toBe(2050); // 1750 + 300
  });

  it("při nulové změně váhy je odhad TDEE roven průměru snězených kalorií", () => {
    const weighIns = [
      { date: START, weight: 70 },
      { date: addDays(START, 15), weight: 70 },
    ];
    const daily = dailyRange(START, addDays(START, 15), 2000);
    const result = calibrateTarget(weighIns, daily, "maintain", 1400, 2400);

    expect(result?.weightChangeKg).toBe(0);
    expect(result?.estimatedTDEE).toBe(2000);
  });

  it("respektuje pojistku na BMR i u navrženého cíle", () => {
    const weighIns = [
      { date: START, weight: 90 },
      { date: addDays(START, 20), weight: 88 },
    ];
    const daily = dailyRange(START, addDays(START, 20), 1030);
    const result = calibrateTarget(weighIns, daily, "lose", 1400, 1600);

    expect(result?.estimatedTDEE).toBe(1800);
    expect(result?.suggestedTargetCalories).toBe(1400); // zafixováno na BMR
  });

  it("funguje bez ohledu na pořadí vstupních záznamů váhy", () => {
    const weighIns = [
      { date: addDays(START, 21), weight: 77.5 },
      { date: START, weight: 80 },
    ];
    const daily = dailyRange(START, addDays(START, 21), 1700);
    const result = calibrateTarget(weighIns, daily, "lose", 1450, 2200);
    expect(result?.estimatedTDEE).toBe(2617);
  });

  it("hranice: přesně 14 dní mezi váženími už stačí (není null)", () => {
    const weighIns = [
      { date: START, weight: 80 },
      { date: addDays(START, 14), weight: 78 },
    ];
    const daily = dailyRange(START, addDays(START, 14), 1700);
    expect(calibrateTarget(weighIns, daily, "lose", 1450, 2200)).not.toBeNull();
  });

  it("hranice: přesně 7 zapsaných dní už stačí (není null)", () => {
    const weighIns = [
      { date: START, weight: 80 },
      { date: addDays(START, 20), weight: 76 },
    ];
    const daily = dailyRange(START, addDays(START, 7), 1200); // přesně 7 dní z 20
    expect(calibrateTarget(weighIns, daily, "lose", 1450, 2200)).not.toBeNull();
  });

  it("ignoruje zapsaná jídla mimo rozsah mezi prvním a posledním vážením", () => {
    const weighIns = [
      { date: START, weight: 80 },
      { date: addDays(START, 21), weight: 77.5 },
    ];
    const inWindow = dailyRange(START, addDays(START, 21), 1700);
    const outsideWindow = dailyRange(addDays(START, -5), START, 5000); // 5 dní PŘED oknem, extrémní hodnota
    const result = calibrateTarget(weighIns, [...inWindow, ...outsideWindow], "lose", 1450, 2200);

    // Kdyby filtr na rozsah dat nefungoval, průměr by vytáhly ty mimo-okenní 5000 kcal záznamy.
    expect(result?.loggedDays).toBe(21);
    expect(result?.avgLoggedCalories).toBe(1700);
  });

  it("hranice: odchylka přesně 10 % už návrh vyvolá (< práh, ne <=)", () => {
    // avgLoggedCalories 2200, nulová změna váhy -> estimatedTDEE = 2200, formulaTDEE 2000 -> odchylka přesně 0.10
    const weighIns = [
      { date: START, weight: 75 },
      { date: addDays(START, 14), weight: 75 },
    ];
    const daily = dailyRange(START, addDays(START, 14), 2200);
    const result = calibrateTarget(weighIns, daily, "maintain", 1400, 2000);
    expect(result).not.toBeNull();
    expect(result?.estimatedTDEE).toBe(2200);
  });

  it("hranice: odchylka těsně pod 10 % nic nenavrhne", () => {
    const weighIns = [
      { date: START, weight: 75 },
      { date: addDays(START, 14), weight: 75 },
    ];
    const daily = dailyRange(START, addDays(START, 14), 2199); // 199/2000 = 9.95 % < 10 %
    expect(calibrateTarget(weighIns, daily, "maintain", 1400, 2000)).toBeNull();
  });
});

describe("getProgressCaption (regrese: 'Skvělé tempo' při 0 kcal)", () => {
  it("nechválí 'skvělé tempo', když nic nebylo zapsáno", () => {
    expect(getProgressCaption(0, 0)).not.toMatch(/skvělé tempo/i);
    expect(getProgressCaption(0, 0)).toMatch(/nic nezapsala/i);
  });

  it("varuje před večeří nad 80 % postupu", () => {
    expect(getProgressCaption(1700, 85)).toMatch(/večeři/i);
  });

  it("chválí tempo mezi 0 a 80 % postupu, jen když už něco zapsáno je", () => {
    expect(getProgressCaption(500, 40)).toMatch(/skvělé tempo/i);
  });

  it("hranice: přesně 80 % ještě nevaruje před večeří (> práh, ne >=)", () => {
    expect(getProgressCaption(1600, 80)).not.toMatch(/večeři/i);
    expect(getProgressCaption(1601, 80.01)).toMatch(/večeři/i);
  });
});

describe("getDayTrafficLight (regrese: 0 kcal nesmí vyjít jako 'green')", () => {
  it("bez zapsaných kalorií je 'neutral', ne 'green'", () => {
    expect(getDayTrafficLight(0, 2000)).toBe("neutral");
  });

  it("do 80 % postupu je 'green'", () => {
    expect(getDayTrafficLight(1000, 2000)).toBe("green");
  });

  it("hranice: přesně 80 % je ještě 'green' (> práh, ne >=)", () => {
    expect(getDayTrafficLight(1600, 2000)).toBe("green");
  });

  it("nad 80 % a do 100 % je 'yellow'", () => {
    expect(getDayTrafficLight(1700, 2000)).toBe("yellow");
  });

  it("hranice: přesně 100 % je ještě 'yellow', ne 'red'", () => {
    expect(getDayTrafficLight(2000, 2000)).toBe("yellow");
  });

  it("nad cílem je 'red'", () => {
    expect(getDayTrafficLight(2200, 2000)).toBe("red");
  });
});

describe("computeRemainingMacros", () => {
  const target: NutritionResults = {
    bmr: 1400,
    tdee: 2000,
    targetCalories: 2000,
    macros: { protein: 120, fat: 60, carbs: 200 },
  };

  it("odečte snězené hodnoty od cíle", () => {
    const result = computeRemainingMacros(target, [
      { value: 500, protein: 40, fat: 15, carbs: 60 },
      { value: 300, protein: 20, fat: 10, carbs: 30 },
    ]);
    expect(result).toEqual({
      calories: 1200,
      protein: 60,
      fat: 35,
      carbs: 110,
      hasIncompleteMacroData: false,
    });
  });

  it("vrací signed záporný zbytek, když je uživatel už nad cílem — neořezává na 0", () => {
    const result = computeRemainingMacros(target, [{ value: 2300, protein: 120, fat: 60, carbs: 200 }]);
    expect(result.calories).toBe(-300);
  });

  it("bez zapsaných jídel se remaining rovná celému cíli", () => {
    const result = computeRemainingMacros(target, []);
    expect(result).toEqual({ calories: 2000, protein: 120, fat: 60, carbs: 200, hasIncompleteMacroData: false });
  });

  it("označí neúplná makro data, když jídlo má jen kalorie bez protein/fat/carbs", () => {
    const result = computeRemainingMacros(target, [{ value: 400 }]);
    expect(result.hasIncompleteMacroData).toBe(true);
    // Chybějící makra se počítají jako 0 snězeno, ne jako "neznámo" — zbytek zůstává vysoký.
    expect(result.protein).toBe(120);
  });
});

describe("getRecipeAvailability", () => {
  it("nad cílem (záporný zbytek) hlásí over-target, ne nulu", () => {
    expect(getRecipeAvailability(-50)).toBe("over-target");
  });

  it("přesně 0 zbývajících kalorií je taky over-target", () => {
    expect(getRecipeAvailability(0)).toBe("over-target");
  });

  it("málo zbývajících kalorií hlásí too-little-remaining", () => {
    expect(getRecipeAvailability(150)).toBe("too-little-remaining");
  });

  it("hranice: přesně 200 kcal už je ready (>= práh)", () => {
    expect(getRecipeAvailability(200)).toBe("ready");
    expect(getRecipeAvailability(199)).toBe("too-little-remaining");
  });

  it("dost zbývajících kalorií hlásí ready", () => {
    expect(getRecipeAvailability(800)).toBe("ready");
  });
});
