// Víc receptů naráz (generateRecipe / generateRecipeFromFridge s `multi: true`). Zpětná vazba
// 2026-10-11: jeden recept je málo a uživatelka chce ze surovin, co má doma, nápady na různá
// jídla dne — lehkou snídani, oběd, večeři. Každý recept je samostatná alternativa (porce podle
// typu jídla), ne jídelníček, který se má sečíst. Bez `multi` (starší build appky v cache PWA)
// funkce vrací jeden recept přesně jako dřív.

import { MAX_PROTEIN_PER_100_KCAL } from "./dayStatus.js";
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

// today = do zbytku dne bez plánu jídel (starší build appky), planned = do zbytku dne s cílem
// porce pro jídla, která dnes ještě chybí (MYA_COACH_SPEC 6.6), anotherDay = recepty "na jindy".
type RecipeSetMode = "today" | "planned" | "anotherDay";

function recipeSetRules(mode: RecipeSetMode): string {
  const which =
    mode === "planned"
      ? `Navrhni ${MAX_RECIPES} RŮZNÉ recepty reálně uvařitelné doma pro jídla, která uživatelce dnes ještě chybí (jsou v zadání).`
      : `Navrhni ${MAX_RECIPES} RŮZNÉ recepty reálně uvařitelné doma — standardně lehkou snídani, oběd a večeři.`;
  // Poměr maker denního cíle jen bez cíle porce — s ním by si pravidla odporovala (cíl porce
  // vychází ze zbývající mezery, ne z poměru celého dne).
  const portion =
    mode === "planned"
      ? `U jídla s cílem porce ze zadání drž kalorie co nejblíž cíli (klidně mírně pod, nikdy nad), bílkovin aspoň tolik, kolik cíl
uvádí, a tuky a sacharidy nejvýš podle cíle — recept má co nejlíp doplnit její denní cíl. Typ jídla bez cíle porce (podle přání)
drž podle orientačních kalorií. Žádný recept nesmí mít víc kalorií, než uživatelce dnes zbývá.`
      : `Velikost porce drž podle orientačních kalorií pro daný typ jídla ze zadání${
          mode === "today" ? " a žádný recept nesmí mít víc kalorií,\nnež uživatelce dnes zbývá" : ""
        }. Bílkoviny, tuky a sacharidy drž zhruba v poměru jejího denního cíle, hlavně ať má recept dost bílkovin.`;
  return `${which}
Pokud uživatelka v přání chce konkrétní typ jídla (např. "jen večeře", "něco ke svačině"), navrhni ${MAX_RECIPES} různé varianty
tohoto typu${mode === "planned" ? " — přání má přednost před jídly ze zadání" : ""}. Recepty se mají od sebe opravdu lišit (jiné hlavní jídlo nebo způsob přípravy), ne tři obměny téhož.

Každý recept je jedna porce pro jednu osobu a je to samostatná možnost, ne část jídelníčku — kalorie receptů se nesčítají.
${portion}`;
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

function recipeSetSystemPrompt(mode: RecipeSetMode): string {
  return `Jsi Mya, AI nutriční asistentka aplikace Nouri. Uživatelka chce nápady, co si uvařit.
${recipeSetRules(mode)}

Pokud uživatelka uvede suroviny, které má doma, každý recept musí jít uvařit JEN z nich — klidně navíc s běžnými
základními surovinami (sůl, pepř, koření, olej, voda), i když v seznamu nejsou, ale žádné jiné suroviny nenavrhuj.
Žádný recept nemusí použít všechny suroviny. Když suroviny neuvede, vyber z běžně dostupných.

Odpověz VÝHRADNĚ validním JSON objektem v tomto přesném tvaru (žádný markdown, žádný text okolo):
{
  ${RECIPE_SET_JSON_FIELDS}
}`;
}

export const RECIPE_SET_SYSTEM_PROMPT = recipeSetSystemPrompt("today");
export const RECIPE_SET_PLANNED_SYSTEM_PROMPT = recipeSetSystemPrompt("planned");
// Recepty "na jindy" (chat, když dnes zbývá málo nebo appka data dne neposlala) — bez pravidla o zbytku dne.
export const RECIPE_SET_ANOTHER_DAY_SYSTEM_PROMPT = recipeSetSystemPrompt("anotherDay");

function fridgeRecipeSetSystemPrompt(mode: RecipeSetMode): string {
  return `Jsi Mya, AI nutriční asistentka aplikace Nouri. Uživatelka ti pošle fotku obsahu lednice nebo spíže.
Podívej se, jaké potravinové suroviny jsou na fotce rozpoznatelné, a navrhni z nich recepty (klidně i s běžnými základními
surovinami jako sůl, pepř, olej, mouka, i když nejsou na fotce vidět).
${recipeSetRules(mode)}

Pokud na fotce nejde rozpoznat žádné použitelné potravinové suroviny (např. prázdná lednice, nesouvisející fotka),
nastav "recognized": false a "recipes" nech prázdné.

Odpověz VÝHRADNĚ validním JSON objektem v tomto přesném tvaru (žádný markdown, žádný text okolo):
{
  "recognized": true nebo false,
  ${RECIPE_SET_JSON_FIELDS}
}`;
}

export const FRIDGE_RECIPE_SET_SYSTEM_PROMPT = fridgeRecipeSetSystemPrompt("today");
export const FRIDGE_RECIPE_SET_PLANNED_SYSTEM_PROMPT = fridgeRecipeSetSystemPrompt("planned");
export const FRIDGE_RECIPE_SET_ANOTHER_DAY_SYSTEM_PROMPT = fridgeRecipeSetSystemPrompt("anotherDay");

/** System prompt sady receptů podle situace: na jindy / do zbytku dne / s plánem jídel. */
export function recipeSetSystemPromptFor(
  remaining: RecipeBudget | null,
  mealPlan: MealTarget[] | undefined,
  source: "text" | "fridge" = "text"
): string {
  if (!remaining) return source === "fridge" ? FRIDGE_RECIPE_SET_ANOTHER_DAY_SYSTEM_PROMPT : RECIPE_SET_ANOTHER_DAY_SYSTEM_PROMPT;
  if (mealPlan && mealPlan.length > 0) {
    return source === "fridge" ? FRIDGE_RECIPE_SET_PLANNED_SYSTEM_PROMPT : RECIPE_SET_PLANNED_SYSTEM_PROMPT;
  }
  return source === "fridge" ? FRIDGE_RECIPE_SET_SYSTEM_PROMPT : RECIPE_SET_SYSTEM_PROMPT;
}

// --- Jídla, která dnes ještě chybí, a cíl porce (MYA_COACH_SPEC 6.6, body 1 a 2; D8) ---
// Dřív sada receptů v 19:00 po snídani a obědě navrhla zase snídani, oběd a večeři a večeře mířila
// na 30 % denního cíle (při zbytku 700 kcal ~525 kcal), takže denní cíl nedoplnila. Typy jídel a
// velikost porce teď počítá appka z dnešních zápisů a hodiny, model jen vaří.

const MAIN_MEAL_TYPES = ["breakfast", "lunch", "dinner"] as const;
type MainMealType = (typeof MAIN_MEAL_TYPES)[number];

// Od téhle hodiny už dané hlavní jídlo nenavrhovat (snídaně ve 12:00 už je oběd).
const MAIN_MEAL_LAST_HOUR: Record<MainMealType, number> = { breakfast: 11, lunch: 16, dinner: 24 };

// Strop porce posledního hlavního jídla dne (D8). Zbytek nad ním je spíš nezapsané jídlo nebo
// prostor na svačinu než jedna obří večeře.
export const LAST_MEAL_MAX_SHARE = 0.45;
// Kolik bílkovin porce reálně unese — stejná hranice jako řádek "Zbývá dnes" (dayStatus.ts), ať
// si cíl porce a zbytek dne neodporují.
const MEAL_MAX_PROTEIN_PER_KCAL = MAX_PROTEIN_PER_100_KCAL / 100;
// Pod tímhle limitem se tuky/sacharidy v cíli porce neuvádí číslem, ale "co nejméně".
const MIN_MEANINGFUL_FAT_G = 5;
const MIN_MEANINGFUL_CARBS_G = 10;

export interface MealTarget {
  type: RecipeMealType;
  calories: number;
  minProtein: number;
  maxFat: number;
  maxCarbs: number;
  /** Zbytek dne je větší než strop porce tohohle jídla (D8). */
  remainderAboveCap: boolean;
}

/** Typy dnes zapsaných jídel od klienta (nedůvěryhodný vstup) — neznámé hodnoty vypadnou. */
export function parseTodayMealTypes(value: unknown): RecipeMealType[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .slice(0, 40)
    .map(parseMealType)
    .filter((type): type is RecipeMealType => type !== undefined);
}

/**
 * Hlavní jídla, která dnes ještě chybí a mají smysl. Jídlo vypadne, když je zapsané, když už je
 * zapsané pozdější hlavní jídlo, nebo když jeho čas minul. Když chybí jen svačina, je to svačina.
 */
export function plannedMealTypes(todayTypes: RecipeMealType[], hour: number): RecipeMealType[] {
  const logged = new Set<RecipeMealType>(todayTypes);
  const planned = MAIN_MEAL_TYPES.filter(
    (type, i) =>
      !logged.has(type) && !MAIN_MEAL_TYPES.slice(i + 1).some((later) => logged.has(later)) && hour < MAIN_MEAL_LAST_HOUR[type]
  );
  return planned.length > 0 ? [...planned] : ["snack"];
}

/**
 * Cíl porce jednoho jídla. Poslední hlavní jídlo dne dostane celý zbytek (se stropem
 * LAST_MEAL_MAX_SHARE denního cíle), ostatní podíl denního cíle omezený zbytkem. Bílkoviny, tuky
 * a sacharidy ze zbývající mezery v poměru porce ke zbytku dne.
 */
export function mealTargetFor(
  type: RecipeMealType,
  remaining: RecipeBudget,
  dailyCalories: number,
  isLastMainMeal: boolean
): MealTarget {
  const share = isLastMainMeal && type !== "snack" ? LAST_MEAL_MAX_SHARE : MEAL_PORTION_SHARES[type];
  const cap = dailyCalories * share;
  const calories = Math.max(0, Math.min(remaining.calories, cap));
  const ratio = remaining.calories > 0 ? calories / remaining.calories : 0;
  return {
    type,
    calories: Math.round(calories),
    minProtein: Math.round(Math.min(remaining.protein * ratio, calories * MEAL_MAX_PROTEIN_PER_KCAL)),
    maxFat: Math.round(remaining.fat * ratio),
    maxCarbs: Math.round(remaining.carbs * ratio),
    // Jen u jídla, které má zbytek dne uzavřít — u oběda zbytek po něm pokryje večeře.
    remainderAboveCap: (isLastMainMeal || type === "snack") && remaining.calories > cap + 1,
  };
}

/** Cíl porce pro každé jídlo, které dnes ještě chybí. */
export function buildMealPlan(
  todayTypes: RecipeMealType[],
  hour: number,
  remaining: RecipeBudget,
  dailyCalories: number
): MealTarget[] {
  const planned = plannedMealTypes(todayTypes, hour);
  const lastMain = planned.filter((type) => type !== "snack").at(-1);
  return planned.map((type) => mealTargetFor(type, remaining, dailyCalories, type === lastMain));
}

/**
 * Plán jídel pro chat z kontextu dne (typy zapsaných jídel, hodina, tréninkový bonus) — sdílí ho
 * karty receptů v chatWithMya, řádek "Další jídla dne" i skript na porovnání modelů.
 */
export function chatMealPlan(
  daily: DailyTarget,
  day: { meals: { type?: RecipeMealType }[]; localHour?: number; workoutBonusCalories: number } | undefined,
  remaining: RecipeBudget | null
): MealTarget[] | undefined {
  if (!remaining || !day || day.localHour === undefined) return undefined;
  const todayTypes = day.meals.flatMap((m) => (m.type ? [m.type] : []));
  return buildMealPlan(todayTypes, day.localHour, remaining, daily.calories + day.workoutBonusCalories);
}

const MEAL_TYPE_NAMES_CS: Record<RecipeMealType, string> = {
  breakfast: "snídaně",
  lunch: "oběd",
  dinner: "večeře",
  snack: "svačina",
};

function describePortionCs(target: MealTarget): string {
  const parts = [`~${target.calories} kcal`];
  if (target.minProtein > 0) parts.push(`aspoň ${target.minProtein} g bílkovin`);
  parts.push(target.maxFat >= MIN_MEANINGFUL_FAT_G ? `tuky max ${target.maxFat} g` : "tuky co nejméně");
  parts.push(target.maxCarbs >= MIN_MEANINGFUL_CARBS_G ? `sacharidy max ${target.maxCarbs} g` : "sacharidy co nejméně");
  return parts.join(", ");
}

export function describeMealTargetCs(target: MealTarget): string {
  return `${MEAL_TYPE_NAMES_CS[target.type]} ${describePortionCs(target)}`;
}

/**
 * Řádek do kontextu chatu: jídla, která dnes ještě zbývají, každé s vlastním cílem porce (6.6 bod 6).
 * Mya podle něj radí, "co si dát k večeři", i bez žádosti o recept.
 *
 * REGRESE (živý test 2026-10-12): řádek nesl cíl jen pro nejbližší jídlo (oběd ~476 kcal) a na
 * dotaz na večeři ho Mya použila pro večeři. Proto každé zbývající jídlo dostane svůj cíl.
 */
export function describeNextMealCs(plan: MealTarget[], remainingCalories: number): string | undefined {
  const next = plan[0];
  if (!next) return undefined;
  const remaining = Math.round(remainingCalories);
  if (next.type === "snack") {
    return (
      `Další jídla dne: hlavní jídla má dnes zapsaná, když má hlad, tak svačina — cíl porce ${describePortionCs(next)} (spočítala appka).` +
      (next.remainderAboveCap
        ? ` Zbývá ještě ${remaining} kcal, víc než na svačinu — zeptej se, jestli nějaké jídlo nezapomněla zapsat; dojídat to nemusí.`
        : "")
    );
  }
  const last = plan[plan.length - 1];
  return (
    `Další jídla dne podle času a zápisů, každé s vlastním cílem porce (spočítala appka): ` +
    `${plan.map((t) => `${MEAL_TYPE_NAMES_CS[t.type]} ${describePortionCs(t)}`).join("; ")}.` +
    (plan.length === 1 && last.remainderAboveCap
      ? ` Zbytek dne (${remaining} kcal) je víc než rozumná porce — buď nějaké jídlo nezapsala (zeptej se), nebo zbytek nech na svačinu.`
      : "")
  );
}

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
  // Jídla, která dnes ještě chybí, s cílem porce (buildMealPlan) — jen s `remaining`.
  mealPlan?: MealTarget[];
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
  if (remaining && input.mealPlan && input.mealPlan.length > 0) {
    const names = input.mealPlan.map((t) => MEAL_TYPE_NAMES_CS[t.type]);
    lines.push(
      `Jídla, která jí dnes ještě chybí: ${names.join(", ")}. Bez jiného přání navrhni jen tato jídla${
        names.length > 1 ? ` (${MAX_RECIPES} recepty rozděl mezi ně, každé aspoň jednou)` : ` (${MAX_RECIPES} různé varianty)`
      }.`,
      `Cíl porce (spočítala appka ze zbytku dne — drž se ho): ${input.mealPlan.map(describeMealTargetCs).join("; ")}.`
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
      "Navrhne uživatelce 3 různé recepty (jídla, která jí dnes ještě chybí, nebo podle přání) jako karty, které si může uložit " +
      "nebo poslat do nákupního seznamu. Použij vždy, když chce recept nebo nápad, co si uvařit (např. „co si mám uvařit k večeři?“), když vypíše suroviny, " +
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
            "Přání a omezení: typ jídla (např. „jen večeře“), dieta, čas přípravy, co vynechat — včetně toho, co podle " +
            "informací o uživatelce nejí nebo nemá ráda. Prázdné, když nic takového není.",
        },
      },
      additionalProperties: false,
    },
  },
};

// REGRESE (živý test a A/B 2026-10-12, scénář 6c): s historií, ve které už byly karty, gpt-4.1-mini
// na "Co si mám uvařit k večeři?" nástroj nezavolal ani po zpřísnění promptu a nabídl starší kartu.
// Žádost o vaření nebo nový recept proto pozná appka sama a nástroj vynutí (tool_choice).
// Jen přítomný čas / rozkaz ("uvařit", "uvařím", "uvař"), ne minulý ("uvařila jsem polévku").
const COOK_VERB = /(?<!\p{L})(?:u|na)va[řr](?:it|ím|íš|íme|te)?(?!\p{L})/iu;
const RECIPE_REQUEST =
  /(?<!\p{L})(?:dej mi|chci|navrhni|vymysli|pošli|nějak[ýé]|jin[ýé]|nov[ýé]|další)\s+(?:\p{L}+\s+)?recept|(?<!\p{L})recept[ya]?\s+na(?!\p{L})/iu;
// Otázka k už navrženému receptu ("kolik má ten recept tuku?") je na text, ne na nové karty.
const EXISTING_RECIPE = /(?<!\p{L})(?:ten|tenhle|tom|tomu|toho|tvůj|tvém|tvého|tvému)\s+recept/iu;

/** Zpráva uživatelky jednoznačně chce vařit nebo nové recepty — chat pak nástroj vynutí. */
export function forcesRecipeTool(message: string): boolean {
  if (EXISTING_RECIPE.test(message)) return false;
  return COOK_VERB.test(message) || RECIPE_REQUEST.test(message);
}

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
