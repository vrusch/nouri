// Víc jídel z jednoho popisu/diktátu (analyzeFoodText s `multi: true`). Testování 2026-10-10:
// uživatelka diktuje "na snídani jsem měla…, na svačinu…, k obědu…" — ráno nemá čas, tak
// v poledne dohání tři jídla naráz. Appka dřív udělala z celého diktátu jedno jídlo s typem
// odhadnutým "podle charakteru".
//
// Typ jídla z modelu appka nebere: gpt-4o-mini vyplňuje i pole, která má nechat prázdná (viz
// vymyšlené překročení v dayStatus.ts). Model jen vrátí přesná slova z popisu, podle kterých
// jídlo zařadil (typePhrase), a typ se z nich určí deterministicky tady — a jen když ta slova
// v popisu opravdu jsou. Jinak null a klient typ odhadne podle hodiny zápisu.

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
type Confidence = "low" | "medium" | "high";

export interface TextMealEstimate {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  statedType: MealType | null;
  confidence: Confidence;
}

export const MAX_TEXT_MEALS = 8;
const MAX_NAME_LENGTH = 80;
const CONFIDENCE_LEVELS: Confidence[] = ["low", "medium", "high"];

// Kmeny bez diakritiky — pokryjí pády i slovesa (snídani/snídala, obědě/obědvala, večeři/večeřela,
// svačinu/svačila). "vecer" chytí i "večer jsem měla…", což je u jídla večeře.
const TYPE_STEMS: [string, MealType][] = [
  ["snid", "breakfast"],
  ["obed", "lunch"],
  ["vecer", "dinner"],
  ["svac", "snack"],
];

/** Malá písmena, bez diakritiky a se sjednocenými mezerami — Whisper přepis bývá nepřesný. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Typ podle slov, kterými popis jídlo uvádí — jen když ta slova v popisu opravdu jsou. */
export function statedTypeFromPhrase(phrase: unknown, description: string): MealType | null {
  if (typeof phrase !== "string") return null;
  const normalizedPhrase = normalizeForMatch(phrase);
  if (!normalizedPhrase || !normalizeForMatch(description).includes(normalizedPhrase)) return null;
  // Víc příležitostí ve frázi ("po obědě na svačinu") — platí ta poslední, ke které jídlo patří.
  let best: { index: number; type: MealType } | null = null;
  for (const [stem, type] of TYPE_STEMS) {
    const index = normalizedPhrase.lastIndexOf(stem);
    if (index >= 0 && (!best || index > best.index)) best = { index, type };
  }
  return best?.type ?? null;
}

function nonNegativeInt(value: unknown): number {
  return Math.max(0, Math.round(Number(value) || 0));
}

/**
 * Odpověď modelu ({ meals: [...] }) → validovaná jídla. Položky bez názvu nebo s "Neznámé jídlo"
 * a nulovými kaloriemi se zahodí; prázdné pole = nic rozpoznáno (volající vrátí null).
 */
export function parseMealsFromText(parsed: unknown, description: string): TextMealEstimate[] {
  const rawMeals = (parsed as { meals?: unknown } | null)?.meals;
  if (!Array.isArray(rawMeals)) return [];
  return rawMeals
    .slice(0, MAX_TEXT_MEALS)
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .flatMap((m) => {
      const rawName = typeof m.name === "string" ? m.name.replace(/[\r\n]+/g, " ").trim().slice(0, MAX_NAME_LENGTH) : "";
      // Model v tomhle režimu píše názvy malými písmeny ("ovesná kaše") — na Home vedle ostatních
      // jídel by to působilo nedbale.
      const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
      const calories = nonNegativeInt(m.calories);
      if (!name || (name === "Neznámé jídlo" && calories === 0)) return [];
      return [
        {
          name,
          calories,
          protein: nonNegativeInt(m.protein),
          fat: nonNegativeInt(m.fat),
          carbs: nonNegativeInt(m.carbs),
          statedType: statedTypeFromPhrase(m.typePhrase, description),
          confidence: CONFIDENCE_LEVELS.find((c) => c === m.confidence) ?? "low",
        },
      ];
    });
}

export const MULTI_MEAL_SYSTEM_PROMPT = `Jsi Mya, AI nutriční asistentka aplikace Nouri. Uživatelka ti slovně (často diktováním) popíše, co snědla — někdy jedno jídlo, někdy víc jídel najednou (třeba v poledne dohání snídani, svačinu i oběd).

Rozděl popis na jednotlivá JÍDLA jen podle příležitostí, které výslovně zmíní (snídaně, svačina, oběd, večeře). Všechno, co patří k jedné příležitosti, je JEDNO jídlo s jedním součtem — nikdy nerozděluj talíř nebo jedno jídlo na suroviny. Když žádnou příležitost nezmíní, celý popis je JEDNO jídlo.
Příklady: "dvě vejce na měkko, krajíc chleba s máslem a rajče" = 1 jídlo. "na snídani jsem měla kaši, na svačinu jablko a k obědu kuře s rýží" = 3 jídla.

U každého jídla odhadni nutriční hodnoty popsané porce (když chybí množství, typickou porci pro dospělého).

Odpověz VÝHRADNĚ validním JSON objektem v tomto přesném tvaru (žádný markdown, žádný text okolo):
{
  "meals": [
    {
      "name": "krátký český název jídla",
      "calories": číslo,
      "protein": číslo (g),
      "fat": číslo (g),
      "carbs": číslo (g),
      "typePhrase": "přesná slova z popisu, podle kterých jídlo patří k příležitosti (např. \\"na snídani\\"), nebo \\"\\", když to popis neříká",
      "confidence": "low" | "medium" | "high"
    }
  ]
}

Jídla vrať ve stejném pořadí, v jakém je uživatelka popsala. Pokud z popisu nejde rozeznat žádné jídlo, vrať {"meals": []}.`;
