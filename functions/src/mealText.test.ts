import { describe, expect, it } from "vitest";
import { MAX_TEXT_MEALS, normalizeForMatch, parseMealsFromText, statedTypeFromPhrase } from "./mealText.js";

const DICTATION = "Na snídani jsem měla ovesnou kaši, na svačinu jablko a k obědu kuře s rýží.";

describe("statedTypeFromPhrase", () => {
  it("typ podle slov, která v popisu opravdu jsou (pády i slovesa)", () => {
    expect(statedTypeFromPhrase("na snídani", DICTATION)).toBe("breakfast");
    expect(statedTypeFromPhrase("na svačinu", DICTATION)).toBe("snack");
    expect(statedTypeFromPhrase("k obědu", DICTATION)).toBe("lunch");
    expect(statedTypeFromPhrase("večeřela jsem", "Večeřela jsem guláš")).toBe("dinner");
  });

  it("víc příležitostí ve frázi — platí poslední", () => {
    expect(statedTypeFromPhrase("po obědě na svačinu", "po obědě na svačinu jsem měla jogurt")).toBe("snack");
  });

  it("bez ohledu na velikost písmen a diakritiku (Whisper přepis)", () => {
    expect(statedTypeFromPhrase("NA SNIDANI", DICTATION)).toBe("breakfast");
    expect(normalizeForMatch("  Oběd\n s  rýží ")).toBe("obed s ryzi");
  });

  it("vymyšlená slova, která v popisu nejsou, typ nedají", () => {
    expect(statedTypeFromPhrase("k večeři", DICTATION)).toBeNull();
    expect(statedTypeFromPhrase("na snídani", "dvě vejce na měkko, krajíc chleba")).toBeNull();
  });

  it("slova bez jídelní příležitosti nebo prázdná fráze = null", () => {
    expect(statedTypeFromPhrase("kuře s rýží", DICTATION)).toBeNull();
    expect(statedTypeFromPhrase("", DICTATION)).toBeNull();
    expect(statedTypeFromPhrase(undefined, DICTATION)).toBeNull();
  });
});

describe("parseMealsFromText", () => {
  it("tři nadiktovaná jídla s typy podle diktátu", () => {
    const meals = parseMealsFromText(
      {
        meals: [
          { name: "ovesná kaše", calories: 320.4, protein: 11, fat: 7, carbs: 52, typePhrase: "Na snídani", confidence: "high" },
          { name: "Jablko", calories: 80, protein: 0, fat: 0, carbs: 20, typePhrase: "na svačinu", confidence: "high" },
          { name: "Kuře s rýží", calories: 600, protein: 40, fat: 12, carbs: 75, typePhrase: "k obědu", confidence: "medium" },
        ],
      },
      DICTATION
    );
    expect(meals.map((m) => [m.name, m.statedType])).toEqual([
      ["Ovesná kaše", "breakfast"],
      ["Jablko", "snack"],
      ["Kuře s rýží", "lunch"],
    ]);
    expect(meals[0].calories).toBe(320);
  });

  it("typ z modelu se nebere — bez doložené fráze null", () => {
    const meals = parseMealsFromText(
      { meals: [{ name: "Vejce s chlebem", calories: 350, type: "breakfast", typePhrase: "", confidence: "high" }] },
      "dvě vejce na měkko, krajíc chleba s máslem a rajče"
    );
    expect(meals).toHaveLength(1);
    expect(meals[0].statedType).toBeNull();
  });

  it("rozbité položky zahodí, neznámou confidence bere jako low", () => {
    const meals = parseMealsFromText(
      { meals: [null, { calories: 100 }, { name: "Neznámé jídlo", calories: 0 }, { name: "Banán", calories: "105", confidence: "jistě" }] },
      "banán"
    );
    expect(meals).toEqual([{ name: "Banán", calories: 105, protein: 0, fat: 0, carbs: 0, statedType: null, confidence: "low" }]);
  });

  it("počet jídel má horní limit a chybějící pole = nic", () => {
    const many = { meals: Array.from({ length: 20 }, (_, i) => ({ name: `Jídlo ${i}`, calories: 10 })) };
    expect(parseMealsFromText(many, "x")).toHaveLength(MAX_TEXT_MEALS);
    expect(parseMealsFromText({}, "x")).toEqual([]);
    expect(parseMealsFromText(null, "x")).toEqual([]);
  });
});
