// Víc receptů naráz (generateRecipe / generateRecipeFromFridge s `multi: true`). Zpětná vazba
// 2026-10-11: jeden recept je málo a uživatelka chce ze surovin, co má doma, nápady na různá
// jídla dne — lehkou snídani, oběd, večeři. Každý recept je samostatná alternativa (porce podle
// typu jídla), ne jídelníček, který se má sečíst. Bez `multi` (starší build appky v cache PWA)
// funkce vrací jeden recept přesně jako dřív.

import type { OpenAITool } from "./openai.js";
import { sanitizePromptText } from "./promptText.js";

export type RecipeMealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface RecipeResult {
  name: string;
  description: string;
  ingredients: string[];
  instructions: string[];
  prepMinutes: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  // Jen u receptů ze sady. Klíč chybí (ne undefined), když ho model nevyplní platně — saveRecipe
  // na klientu recept rozkládá do setDoc a Firestore undefined odmítá.
  mealType?: RecipeMealType;
}

export interface DailyTarget {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export const MAX_RECIPES = 3;

const MEAL_TYPE_ORDER: RecipeMealType[] = ["breakfast", "lunch", "dinner", "snack"];

// Orientační podíl denního cíle na jednu porci — lehká snídaně je menší než oběd.
const MEAL_PORTION_SHARES: Record<RecipeMealType, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.3,
  snack: 0.1,
};

function sanitizeStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, maxItems);
}

export function sanitizeRecipeResult(parsed: Record<string, unknown>): RecipeResult {
  return {
    name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : "Recept",
    description: typeof parsed.description === "string" ? parsed.description.trim() : "",
    ingredients: sanitizeStringList(parsed.ingredients, 20),
    instructions: sanitizeStringList(parsed.instructions, 15),
    prepMinutes: Math.min(240, Math.max(1, Math.round(Number(parsed.prepMinutes) || 20))),
    calories: Math.max(0, Math.round(Number(parsed.calories) || 0)),
    protein: Math.max(0, Math.round(Number(parsed.protein) || 0)),
    fat: Math.max(0, Math.round(Number(parsed.fat) || 0)),
    carbs: Math.max(0, Math.round(Number(parsed.carbs) || 0)),
  };
}

function parseMealType(value: unknown): RecipeMealType | undefined {
  return MEAL_TYPE_ORDER.find((type) => type === value);
}

/**
 * Recepty z odpovědi modelu `{ recipes: [...] }`. Recept bez surovin, postupu nebo kalorií
 * vypadne, stejně jako druhý recept se stejným názvem. Seřazené snídaně → oběd → večeře →
 * svačina (stabilně, takže tři varianty večeře zůstanou v pořadí od modelu).
 */
export function parseRecipeSet(parsed: unknown): RecipeResult[] {
  const raw = (parsed as { recipes?: unknown } | null)?.recipes;
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const recipes: RecipeResult[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    const recipe = sanitizeRecipeResult(entry);
    if (recipe.ingredients.length === 0 || recipe.instructions.length === 0 || recipe.calories <= 0) continue;
    const key = recipe.name.toLocaleLowerCase("cs");
    if (seen.has(key)) continue;
    seen.add(key);
    const mealType = parseMealType(entry.mealType);
    recipes.push(mealType ? { ...recipe, mealType } : recipe);
    if (recipes.length === MAX_RECIPES) break;
  }

  const rank = (recipe: RecipeResult) => (recipe.mealType ? MEAL_TYPE_ORDER.indexOf(recipe.mealType) : MEAL_TYPE_ORDER.length);
  return recipes.sort((a, b) => rank(a) - rank(b));
}

function positiveUpTo(value: unknown, max: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= max ? value : undefined;
}

/** Denní cíl od klienta (nedůvěryhodný vstup) — bez platných kalorií appka cíl nepoužije. */
export function parseDailyTarget(input: Record<string, unknown> | undefined): DailyTarget | undefined {
  const calories = positiveUpTo(input?.dailyCalories, 10000);
  if (calories === undefined) return undefined;
  return {
    calories,
    protein: positiveUpTo(input?.dailyProtein, 1000) ?? 0,
    fat: positiveUpTo(input?.dailyFat, 1000) ?? 0,
    carbs: positiveUpTo(input?.dailyCarbs, 1500) ?? 0,
  };
}

/**
 * Orientační kcal na porci podle typu jídla — podíl denního cíle, nikdy víc, než dnes zbývá.
 * Bez zbytku dne (recepty "na jindy", viz chat) jen podíl denního cíle, bez denního cíle jen zbytek.
 */
export function mealPortionGuides(
  dailyCalories: number | undefined,
  remainingCalories: number | undefined
): Record<RecipeMealType, number> {
  const guide = (type: RecipeMealType) => {
    const share = dailyCalories === undefined ? undefined : dailyCalories * MEAL_PORTION_SHARES[type];
    if (share === undefined) return Math.round(remainingCalories ?? 0);
    return Math.round(remainingCalories === undefined ? share : Math.min(remainingCalories, share));
  };
  return { breakfast: guide("breakfast"), lunch: guide("lunch"), dinner: guide("dinner"), snack: guide("snack") };
}

// Pod touhle hranicí zbytku dne recept do dneška nemá smysl (stejně jako MIN_RECIPE_CALORIES na
// klientu) — chat pak navrhne recepty "na jindy" s porcemi podle denního cíle.
export const MIN_RECIPE_BUDGET_CALORIES = 200;

function recipeSetRules(limitToToday: boolean): string {
  return `Navrhni ${MAX_RECIPES} RŮZNÉ recepty reálně uvařitelné doma — standardně lehkou snídani, oběd a večeři.
Pokud uživatelka v přání chce konkrétní typ jídla (např. "jen večeře", "něco ke svačině"), navrhni ${MAX_RECIPES} různé varianty
tohoto typu. Recepty se mají od sebe opravdu lišit (jiné hlavní jídlo nebo způsob přípravy), ne tři obměny téhož.

Každý recept je jedna porce pro jednu osobu a je to samostatná možnost, ne část jídelníčku — kalorie receptů se nesčítají.
Velikost porce drž podle orientačních kalorií pro daný typ jídla ze zadání${
    limitToToday ? " a žádný recept nesmí mít víc kalorií,\nnež uživatelce dnes zbývá" : ""
  }. Bílkoviny, tuky a sacharidy drž zhruba v poměru jejího denního cíle, hlavně ať má recept dost bílkovin.`;
}


const RECIPE_SET_JSON_FIELDS = `"recipes": [
    {
      "mealType": "breakfast" | "lunch" | "dinner" | "snack",
      "name": "krátký český název receptu",
      "description": "jedna věta, proč se recept hodí",
      "ingredients": ["surovina s množstvím", ...],
      "instructions": ["krok 1", "krok 2", ...],
      "prepMinutes": číslo (odhad doby přípravy v minutách),
      "calories": číslo,
      "protein": číslo (g),
      "fat": číslo (g),
      "carbs": číslo (g)
    }
  ]`;

function recipeSetSystemPrompt(limitToToday: boolean): string {
  return `Jsi Mya, AI nutriční asistentka aplikace Nouri. Uživatelka chce nápady, co si uvařit.
${recipeSetRules(limitToToday)}

Pokud uživatelka uvede suroviny, které má doma, každý recept musí jít uvařit JEN z nich — klidně navíc s běžnými
základními surovinami (sůl, pepř, koření, olej, voda), i když v seznamu nejsou, ale žádné jiné suroviny nenavrhuj.
Žádný recept nemusí použít všechny suroviny. Když suroviny neuvede, vyber z běžně dostupných.

Odpověz VÝHRADNĚ validním JSON objektem v tomto přesném tvaru (žádný markdown, žádný text okolo):
{
  ${RECIPE_SET_JSON_FIELDS}
}`;
}

export const RECIPE_SET_SYSTEM_PROMPT = recipeSetSystemPrompt(true);
// Recepty "na jindy" (chat, když dnes zbývá málo nebo appka data dne neposlala) — bez pravidla o zbytku dne.
export const RECIPE_SET_ANOTHER_DAY_SYSTEM_PROMPT = recipeSetSystemPrompt(false);

function fridgeRecipeSetSystemPrompt(limitToToday: boolean): string {
  return `Jsi Mya, AI nutriční asistentka aplikace Nouri. Uživatelka ti pošle fotku obsahu lednice nebo spíže.
Podívej se, jaké potravinové suroviny jsou na fotce rozpoznatelné, a navrhni z nich recepty (klidně i s běžnými základními
surovinami jako sůl, pepř, olej, mouka, i když nejsou na fotce vidět).
${recipeSetRules(limitToToday)}

Pokud na fotce nejde rozpoznat žádné použitelné potravinové suroviny (např. prázdná lednice, nesouvisející fotka),
nastav "recognized": false a "recipes" nech prázdné.

Odpověz VÝHRADNĚ validním JSON objektem v tomto přesném tvaru (žádný markdown, žádný text okolo):
{
  "recognized": true nebo false,
  ${RECIPE_SET_JSON_FIELDS}
}`;
}

export const FRIDGE_RECIPE_SET_SYSTEM_PROMPT = fridgeRecipeSetSystemPrompt(true);
export const FRIDGE_RECIPE_SET_ANOTHER_DAY_SYSTEM_PROMPT = fridgeRecipeSetSystemPrompt(false);

export interface RecipeBudget {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

function nonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Zbytek dne pro sadu receptů ze záložky Recepty. null = recepty "na jindy" — zbývá méně než
 * MIN_RECIPE_BUDGET_CALORIES nebo je den přes cíl. Rozhodnutí 2026-10-11: záložka Recepty se
 * po splnění cíle už neblokuje, chová se jako chat (chatRecipeBudget). Makra pod nulou (už
 * snězeno víc bílkovin než cíl) jsou nula, ne záporné číslo v promptu.
 */
export function recipeSetBudget(input: {
  remainingCalories: number;
  remainingProtein?: unknown;
  remainingFat?: unknown;
  remainingCarbs?: unknown;
}): RecipeBudget | null {
  if (input.remainingCalories < MIN_RECIPE_BUDGET_CALORIES) return null;
  return {
    calories: input.remainingCalories,
    protein: nonNegative(input.remainingProtein),
    fat: nonNegative(input.remainingFat),
    carbs: nonNegative(input.remainingCarbs),
  };
}

export interface RecipeSetPromptInput {
  // null = recepty "na jindy" (jen chat): bez řádku o zbytku dne, porce jen podle denního cíle.
  remaining: RecipeBudget | null;
  goalLabel: string;
  daily?: DailyTarget;
  preferences?: string;
  availableIngredients?: string;
}

export function buildRecipeSetUserPrompt(input: RecipeSetPromptInput): string {
  const { remaining } = input;
  const guides = mealPortionGuides(input.daily?.calories, remaining?.calories);
  const lines = [
    remaining
      ? `Dnes ještě zbývá: ${Math.round(remaining.calories)} kcal, ${Math.round(remaining.protein)}g bílkovin, ${Math.round(
          remaining.fat
        )}g tuků, ${Math.round(remaining.carbs)}g sacharidů.`
      : "Recepty jsou inspirace na jindy, ne do dnešního zbytku — porci drž podle orientačních kalorií níž.",
  ];
  if (input.daily) {
    lines.push(
      `Denní cíl: ${Math.round(input.daily.calories)} kcal (bílkoviny ${Math.round(input.daily.protein)} g, tuky ${Math.round(
        input.daily.fat
      )} g, sacharidy ${Math.round(input.daily.carbs)} g).`
    );
  }
  lines.push(
    `Orientační kalorie na porci: snídaně ~${guides.breakfast} kcal, oběd ~${guides.lunch} kcal, večeře ~${guides.dinner} kcal, svačina ~${guides.snack} kcal.`,
    `Cíl uživatelky: ${input.goalLabel}.`
  );
  if (input.preferences) lines.push(`Přání/omezení: ${input.preferences}.`);
  if (input.availableIngredients) lines.push(`Suroviny, které má doma: ${input.availableIngredients}.`);
  return lines.join("\n");
}

// --- Karty receptů v chatu (chatWithMya s `recipeCards: true`) ---
// Chat model recepty nepíše textem, jen zavolá nástroj s tím, co uživatelka chce; samotnou sadu
// pak vygeneruje stejný prompt jako záložka Recepty a klient ji ukáže jako karty s Uložit/Do seznamu.

export const SUGGEST_RECIPES_TOOL_NAME = "navrhni_recepty";

export const SUGGEST_RECIPES_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: SUGGEST_RECIPES_TOOL_NAME,
    description:
      "Navrhne uživatelce 3 různé recepty (standardně lehkou snídani, oběd a večeři) jako karty, které si může uložit " +
      "nebo poslat do nákupního seznamu. Použij vždy, když chce recept nebo nápad, co si uvařit, když vypíše suroviny, " +
      "které má doma, nebo když chce nové návrhy či úpravu dřívějších (např. „to samé bez šunky“). Nepoužívej na otázky " +
      "k už navrženému receptu (kolik má kalorií, čím nahradit surovinu, jak dlouho péct) — na ty odpověz textem.",
    parameters: {
      type: "object",
      properties: {
        ingredients: {
          type: "string",
          description: "Suroviny, které uživatelka uvedla, že má doma (i z dřívějších zpráv), čárkami. Prázdné, když žádné neuvedla.",
        },
        preferences: {
          type: "string",
          description:
            "Přání a omezení: typ jídla (např. „jen večeře“), dieta, čas přípravy, co vynechat. Prázdné, když žádné nemá.",
        },
      },
      additionalProperties: false,
    },
  },
};

/** Argumenty nástroje od modelu (JSON text) — nevalidní JSON = bez surovin a přání. */
export function parseSuggestRecipesArgs(raw: string): { ingredients?: string; preferences?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  const args = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  return {
    ingredients: sanitizePromptText(args.ingredients, 500),
    preferences: sanitizePromptText(args.preferences, 300),
  };
}

export interface ChatDayIntake {
  consumedCalories: number;
  consumedProtein: number;
  consumedFat: number;
  consumedCarbs: number;
  workoutBonusCalories: number;
}

/**
 * Zbytek dne pro recepty z chatu — stejně jako kontext dne v chatu (cíl + bonus za trénink −
 * snězeno). null = recepty "na jindy": appka data dne neposlala, nebo zbývá méně než
 * MIN_RECIPE_BUDGET_CALORIES (chat na rozdíl od záložky Recepty nemá blokaci po splnění cíle).
 */
export function chatRecipeBudget(daily: DailyTarget, intake: ChatDayIntake | undefined): RecipeBudget | null {
  if (!intake) return null;
  const calories = daily.calories + intake.workoutBonusCalories - intake.consumedCalories;
  if (calories < MIN_RECIPE_BUDGET_CALORIES) return null;
  return {
    calories,
    protein: Math.max(0, daily.protein - intake.consumedProtein),
    fat: Math.max(0, daily.fat - intake.consumedFat),
    carbs: Math.max(0, daily.carbs - intake.consumedCarbs),
  };
}

/**
 * Úvodní věta nad kartami (deterministická — model při volání nástroje text obvykle nepíše).
 * todayFull jen když appka data dne poslala a zbývá málo — bez dat dne Mya o dnešku nic netvrdí.
 */
export function chatRecipeIntro(options: { hasIngredients: boolean; todayFull: boolean; count: number }): string {
  const what = options.count === 1 ? "tenhle recept" : "tyhle recepty";
  const base = options.hasIngredients
    ? `Z toho, co máš doma, mě napadly ${what} — rozklikni, co tě láká:`
    : `Tady máš ${what} — rozklikni, co tě láká:`;
  return options.todayFull ? `${base}\n(Dnes už ti do cíle skoro nic nezbývá, tak je ber jako inspiraci na jindy.)` : base;
}
