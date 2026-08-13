import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { calculateNutrition, type Gender, type Goal } from "./nutrition.js";

const openaiApiKey = defineSecret("OPENAI_API_KEY");
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

interface UserProfileInput {
  name: string;
  gender: Gender;
  height: number;
  weight: number;
  birthDate: string;
  activityLevel: number;
  goal: Goal;
  calibratedTDEE?: number;
  customProteinGrams?: number;
  customFatGrams?: number;
}

function requireAuth(request: CallableRequest) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Musíš být přihlášená.");
  }
}

const DEFAULT_MAX_PROMPT_TEXT_LENGTH = 300;

// Ořeže délku a odstraní řádkové zlomy z volného textu, který appka posílá do promptu (jméno,
// hint, popis jídla/tréninku, preference, suroviny z lednice...) — appku dnes používá jen jedna
// autentizovaná uživatelka, takže reálné riziko je nízké (nanejvýš by obešla vlastní UI a
// poslala funkci upravený vstup přímo), ale sdílený limit je levnější než ho nechat bez hranic,
// zvlášť tam, kde text jde do SYSTÉMOVÉ části promptu (viz profile.name v chatWithMya).
// undefined vstup (nepovinné pole) i prázdný/jen-mezerový text appka mapuje na undefined, ať
// volající strana může použít stejný `?.trim()` fallback jako dřív.
function sanitizePromptText(value: unknown, maxLength: number = DEFAULT_MAX_PROMPT_TEXT_LENGTH): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[\r\n]+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

const ACTIVITY_LEVELS: Record<number, string> = {
  1: "Leží v posteli / naprostý klid",
  1.2: "Sedavé zaměstnání, minimální pohyb",
  1.375: "Lehká aktivita (1-3 dny/týden cvičení nebo 10k kroků)",
  1.55: "Střední aktivita (3-5 dní/týden cvičení)",
  1.725: "Vysoká aktivita (6-7 dní/týden cvičení)",
  1.9: "Extrémní aktivita (profesionální sport, těžká fyzická práce)",
};

export const generateWelcomeReport = onCall(
  { secrets: [openaiApiKey], region: "us-central1" },
  async (request) => {
    requireAuth(request);
    const profile = request.data?.profile as UserProfileInput | undefined;
    if (!profile) throw new HttpsError("invalid-argument", "Chybí profil.");
    const safeName = sanitizePromptText(profile.name, 100) ?? "";

    const results = calculateNutrition({
      gender: profile.gender,
      weight: profile.weight,
      height: profile.height,
      birthDate: profile.birthDate,
      activityLevel: profile.activityLevel,
      goal: profile.goal,
      calibratedTDEE: profile.calibratedTDEE,
      customProteinGrams: profile.customProteinGrams,
      customFatGrams: profile.customFatGrams,
    });

    const age = new Date().getFullYear() - new Date(profile.birthDate).getFullYear();
    const genderCzech = profile.gender === "female" ? "žena" : "muž";

    const systemPrompt = `Jsi Mya, empatická a profesionální AI asistentka pro zdravý životní styl aplikace Nouri.
Tvým úkolem je na základě vypočítaných dat vygenerovat motivující "Vstupní diagnózu" (Report).
Mluv česky, buď povzbuzující, ale věcná. Používej emoji.

DŮLEŽITÉ FORMÁTOVÁNÍ:
1. NIKDY nepoužívej markdown tabulky (|---|). Na mobilu jsou nečitelné.
2. Místo tabulek používej přehledné odrážky nebo tučný text pro klíčové hodnoty.
3. Používej strukturu:
   - ### 1. Analýza současného stavu (BMR, TDEE)
   - ### 2. Doporučený denní příjem a proč (vysvětli deficit/přebytek)
   - ### 3. Konkrétní tipy pro tebe (bílkoviny, kroky, voda)
   - ### 4. Přehled scénářů (Rychlý progres, Ideální balanc, Udržování) - zde použij odrážky, ne tabulku!`;

    const userPrompt = `Data uživatele:
Jméno: ${safeName}
Pohlaví: ${genderCzech}
Věk: ${age} let
Výška: ${profile.height} cm
Váha: ${profile.weight} kg
Aktivita: ${ACTIVITY_LEVELS[profile.activityLevel] || profile.activityLevel}
Cíl: ${profile.goal === "lose" ? "Hubnout" : profile.goal === "gain" ? "Nabírat svaly" : "Udržovat váhu"}
BMR: ${results.bmr} kcal
TDEE: ${results.tdee} kcal
Cílový příjem (Nouri výpočet): ${results.targetCalories} kcal
Doporučené bílkoviny: ${results.macros.protein} g

Prosím o vygenerování reportu ve stylu seniorního nutričního poradce.`;

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey.value()}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
        }),
      });

      if (response.status === 429) throw new Error("Rate limit exceeded");

      const json = (await response.json()) as { choices?: { message: { content: string } }[]; error?: unknown };
      if (!json.choices) {
        console.error("OpenAI response missing choices:", response.status, JSON.stringify(json));
        throw new Error("Invalid AI response");
      }

      return { text: json.choices[0].message.content, data: results };
    } catch (error) {
      console.error("Mya AI Error (report):", error);
      return {
        text:
          "Mya právě odpočívá (OpenAI limit). Tvůj plán: Jez " +
          results.targetCalories +
          " kcal denně a soustřeď se na bílkoviny (" +
          results.macros.protein +
          "g).",
        data: results,
      };
    }
  }
);

export const getDailyGreeting = onCall(
  { secrets: [openaiApiKey], region: "us-central1" },
  async (request) => {
    requireAuth(request);
    const profile = request.data?.profile as UserProfileInput | undefined;
    const consumedCalories = Number(request.data?.consumedCalories) || 0;
    const consumedProtein = Number(request.data?.consumedProtein) || 0;
    // Nálada/energie check-in (FEATURE_IDEAS.md sekce 3) — appka mood/moodNote nikam neukládá,
    // jen je jednorázově protlačí do tohohle promptu (viz handleSubmitMood v Home.tsx).
    const rawMood = Number(request.data?.mood);
    const mood = Number.isInteger(rawMood) && rawMood >= 1 && rawMood <= 5 ? rawMood : undefined;
    const moodNote = typeof request.data?.moodNote === "string" ? request.data.moodNote.trim().slice(0, 300) : undefined;
    if (!profile) throw new HttpsError("invalid-argument", "Chybí profil.");
    const safeName = sanitizePromptText(profile.name, 100) ?? "";

    // Živě přepočteno z profilu, ne z uloženého profile.targetCalories — to může být
    // zastaralé (naposledy zapsané při onboardingu nebo posledním "Aktualizovat analýzu").
    const nutrition = calculateNutrition({
      gender: profile.gender,
      weight: profile.weight,
      height: profile.height,
      birthDate: profile.birthDate,
      activityLevel: profile.activityLevel,
      goal: profile.goal,
      calibratedTDEE: profile.calibratedTDEE,
      customProteinGrams: profile.customProteinGrams,
      customFatGrams: profile.customFatGrams,
    });
    const targetProtein = nutrition.macros.protein;
    const remaining = nutrition.targetCalories - consumedCalories;
    const proteinRemaining = Math.max(0, targetProtein - consumedProtein);

    const systemPrompt = `Jsi Mya z aplikace Nouri. Piš krátké, úderné a motivující zprávy (max 2 věty).
Zohledni aktuální stav uživatele. Pokud výrazně chybí bílkoviny vzhledem k denní době, zmiň to konkrétně (počet gramů).${
      mood !== undefined
        ? " Uživatel právě odpověděl na otázku, jak se dnes cítí — zohledni to v tónu zprávy (empaticky, ale stručně), aniž by to bylo hlavní téma zprávy."
        : ""
    }`;

    const moodContext =
      mood !== undefined
        ? ` Dnešní nálada/energie: ${mood}/5 (1 = mizerně, 5 = skvěle).${moodNote ? ` Poznámka od uživatele: "${moodNote}"` : ""}`
        : "";

    // C1 v REFERENCE/DATA_COMPLETENESS_PLAN.md — appka dřív posílala doslovnou nulu i v případě,
    // že uživatel ještě jen nic nezapsal (ne že by reálně nic nesnědl), takže Mya mohla reagovat
    // na fiktivní hladovění. Stejný princip jako getProgressCaption v nutrition.ts: rozlišit
    // "nic nezapsáno" od "postupuje s nízkým číslem" jen podle toho, jestli je snězeno přesně 0.
    const intakeSummary =
      consumedCalories === 0
        ? "Zatím dnes nic nezapsal(a) do appky (nejde poznat, jestli ještě nejedl(a), nebo to jen ještě nezapsal(a))."
        : `Dnes snědeno: ${consumedCalories} kcal (bílkoviny ${consumedProtein}g). Zbývá: ${remaining} kcal, ${proteinRemaining}g bílkovin.`;

    const userPrompt = `Uživatel: ${safeName}. Cíl: ${nutrition.targetCalories} kcal (bílkoviny ${targetProtein}g). ${intakeSummary}${moodContext}`;

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey.value()}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 100,
        }),
      });

      if (response.status === 429) {
        return { text: "Dneska ti to sekne! Nezapomeň si zapisovat všechna jídla. ✨" };
      }

      const json = (await response.json()) as { choices?: { message: { content: string } }[] };
      if (!json.choices) {
        console.error("OpenAI response missing choices:", response.status, JSON.stringify(json));
      }
      return { text: json.choices?.[0]?.message?.content || "Krásný den! Jak se dnes daří?" };
    } catch (error) {
      console.error("Mya AI Error (greeting):", error);
      return { text: `Ahoj ${safeName}! Nezapomeň si dnes zapsat všechna jídla.` };
    }
  }
);

type MealType = "breakfast" | "lunch" | "dinner" | "snack";
type Confidence = "low" | "medium" | "high";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const CONFIDENCE_LEVELS: Confidence[] = ["low", "medium", "high"];

export const analyzeFood = onCall(
  { secrets: [openaiApiKey], region: "us-central1", memory: "512MiB", timeoutSeconds: 60 },
  async (request) => {
    requireAuth(request);
    const imageDataUrl = request.data?.imageDataUrl as string | undefined;
    const hint = sanitizePromptText(request.data?.hint, 300);
    if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
      throw new HttpsError("invalid-argument", "Chybí platný obrázek.");
    }

    const systemPrompt = `Jsi Mya, AI nutriční asistentka aplikace Nouri. Uživatel ti pošle fotku jídla.
Tvým úkolem je identifikovat jídlo a odhadnout jeho nutriční hodnoty pro porci na fotce.

Odpověz VÝHRADNĚ validním JSON objektem v tomto přesném tvaru (žádný markdown, žádný text okolo):
{
  "name": "krátký český název jídla",
  "calories": číslo (celkové kalorie porce na fotce),
  "protein": číslo (bílkoviny v gramech),
  "fat": číslo (tuky v gramech),
  "carbs": číslo (sacharidy v gramech),
  "type": "breakfast" | "lunch" | "dinner" | "snack" (odhad podle charakteru jídla),
  "confidence": "low" | "medium" | "high" (jak jistá si jsi odhadem)
}

Pokud na fotce není rozpoznatelné jídlo, vrať confidence "low", name "Neznámé jídlo" a nulové hodnoty.`;

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey.value()}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: hint
                    ? `Analyzuj toto jídlo. Doplňující upřesnění od uživatele: ${hint}`
                    : "Analyzuj toto jídlo.",
                },
                { type: "image_url", image_url: { url: imageDataUrl } },
              ],
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
        }),
      });

      if (response.status === 429) throw new Error("Rate limit exceeded");

      const json = (await response.json()) as { choices?: { message: { content: string } }[] };
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        console.error("OpenAI response missing content:", response.status, JSON.stringify(json));
        throw new Error("Invalid AI response");
      }

      const parsed = JSON.parse(content);

      return {
        name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : "Neznámé jídlo",
        calories: Math.max(0, Math.round(Number(parsed.calories) || 0)),
        protein: Math.max(0, Math.round(Number(parsed.protein) || 0)),
        fat: Math.max(0, Math.round(Number(parsed.fat) || 0)),
        carbs: Math.max(0, Math.round(Number(parsed.carbs) || 0)),
        type: MEAL_TYPES.includes(parsed.type) ? parsed.type : "snack",
        confidence: CONFIDENCE_LEVELS.includes(parsed.confidence) ? parsed.confidence : "low",
      };
    } catch (error) {
      console.error("Mya Vision Error:", error);
      return null;
    }
  }
);

export const analyzeFoodText = onCall(
  { secrets: [openaiApiKey], region: "us-central1", timeoutSeconds: 30 },
  async (request) => {
    requireAuth(request);
    const description = sanitizePromptText(request.data?.description, 500);
    if (!description) {
      throw new HttpsError("invalid-argument", "Chybí popis jídla.");
    }

    const systemPrompt = `Jsi Mya, AI nutriční asistentka aplikace Nouri. Uživatel ti slovně popíše, co snědl (bez fotky).
Tvým úkolem je z popisu odhadnout jídlo a jeho nutriční hodnoty pro popsanou porci. Pokud popis neuvádí množství, odhadni typickou porci pro dospělého člověka.

Odpověz VÝHRADNĚ validním JSON objektem v tomto přesném tvaru (žádný markdown, žádný text okolo):
{
  "name": "krátký český název jídla",
  "calories": číslo (celkové kalorie odhadované porce),
  "protein": číslo (bílkoviny v gramech),
  "fat": číslo (tuky v gramech),
  "carbs": číslo (sacharidy v gramech),
  "type": "breakfast" | "lunch" | "dinner" | "snack" (odhad podle charakteru jídla),
  "confidence": "low" | "medium" | "high" (nízká, pokud je popis vágní nebo množství neurčité)
}

Pokud z popisu nejde rozeznat žádné jídlo, vrať confidence "low", name "Neznámé jídlo" a nulové hodnoty.`;

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey.value()}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: description },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
        }),
      });

      if (response.status === 429) throw new Error("Rate limit exceeded");

      const json = (await response.json()) as { choices?: { message: { content: string } }[] };
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        console.error("OpenAI response missing content:", response.status, JSON.stringify(json));
        throw new Error("Invalid AI response");
      }

      const parsed = JSON.parse(content);

      return {
        name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : "Neznámé jídlo",
        calories: Math.max(0, Math.round(Number(parsed.calories) || 0)),
        protein: Math.max(0, Math.round(Number(parsed.protein) || 0)),
        fat: Math.max(0, Math.round(Number(parsed.fat) || 0)),
        carbs: Math.max(0, Math.round(Number(parsed.carbs) || 0)),
        type: MEAL_TYPES.includes(parsed.type) ? parsed.type : "snack",
        confidence: CONFIDENCE_LEVELS.includes(parsed.confidence) ? parsed.confidence : "low",
      };
    } catch (error) {
      console.error("Mya Text Analysis Error:", error);
      return null;
    }
  }
);

type WorkoutConfidence = "low" | "medium" | "high";

export const analyzeWorkout = onCall(
  { secrets: [openaiApiKey], region: "us-central1", timeoutSeconds: 30 },
  async (request) => {
    requireAuth(request);
    const description = sanitizePromptText(request.data?.description, 500);
    if (!description) {
      throw new HttpsError("invalid-argument", "Chybí popis tréninku.");
    }

    const systemPrompt = `Jsi Mya, AI fitness asistentka aplikace Nouri. Uživatel ti slovně popíše trénink, který právě dokončil
(např. "30 min běh", "hodina jógy", "posilovna nohy"). Tvým úkolem je odhadnout, kolik kalorií trénink spálil, pro
průměrně fit dospělou osobu. Pokud popis neuvádí délku, odhadni typickou délku pro danou aktivitu.

Odpověz VÝHRADNĚ validním JSON objektem v tomto přesném tvaru (žádný markdown, žádný text okolo):
{
  "name": "krátký český název aktivity",
  "caloriesBurned": číslo (odhad spálených kalorií za celý trénink),
  "durationMinutes": číslo (odhad délky tréninku v minutách),
  "confidence": "low" | "medium" | "high" (nízká, pokud je popis vágní nebo aktivita neurčitá)
}

Pokud z popisu nejde rozeznat žádná fyzická aktivita, vrať confidence "low", name "Neznámá aktivita" a nulové hodnoty.`;

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey.value()}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: description },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
        }),
      });

      if (response.status === 429) throw new Error("Rate limit exceeded");

      const json = (await response.json()) as { choices?: { message: { content: string } }[] };
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        console.error("OpenAI response missing content:", response.status, JSON.stringify(json));
        throw new Error("Invalid AI response");
      }

      const parsed = JSON.parse(content);
      const confidence: WorkoutConfidence = CONFIDENCE_LEVELS.includes(parsed.confidence) ? parsed.confidence : "low";

      return {
        name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : "Neznámá aktivita",
        caloriesBurned: Math.max(0, Math.round(Number(parsed.caloriesBurned) || 0)),
        durationMinutes: Math.max(0, Math.round(Number(parsed.durationMinutes) || 0)),
        confidence,
      };
    } catch (error) {
      console.error("Mya Workout Analysis Error:", error);
      return null;
    }
  }
);

interface MealFeedbackInput {
  mealName: string;
  calories: number;
  protein: number;
  mealType: MealType;
  consumedTodayCalories: number;
  targetCalories: number;
}

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "snídani",
  lunch: "oběd",
  dinner: "večeři",
  snack: "svačinu",
};

export const getMealFeedback = onCall(
  { secrets: [openaiApiKey], region: "us-central1" },
  async (request) => {
    requireAuth(request);
    const input = request.data as MealFeedbackInput | undefined;
    // B9 v AUDIT_2026-08-13.md — na rozdíl od suggestMacroFix a sourozenců appka dřív kontrolovala
    // jen mealName truthiness, ne že kalorie/bílkoviny/cíle jsou skutečná čísla; klient posílající
    // calories: "abc" by tak vyrobil "NaN kcal" v promptu.
    const mealName = sanitizePromptText(input?.mealName, 200);
    // protein je v appce záměrně nepovinné pole (MealItem["protein"]?: number) — appka umí
    // zapsat jídlo jen s kaloriemi, bez rozpadu na makra (viz "některé dnešní jídlo je bez
    // rozpadu na bílkoviny/sacharidy/tuky" v Home.tsx) — chybějící protein se proto dopočítá
    // na 0, ne odmítne, na rozdíl od skutečně povinných číselných polí níž.
    const protein = Number.isFinite(input?.protein) ? (input as MealFeedbackInput).protein : 0;
    if (
      !input ||
      !mealName ||
      !Number.isFinite(input.calories) ||
      !Number.isFinite(input.consumedTodayCalories) ||
      !Number.isFinite(input.targetCalories)
    ) {
      throw new HttpsError("invalid-argument", "Chybí platná data o jídle.");
    }

    const remaining = input.targetCalories - input.consumedTodayCalories;
    const mealTypeLabel = MEAL_TYPE_LABELS[input.mealType] ?? "jídlo";

    const systemPrompt = `Jsi Mya z aplikace Nouri. Uživatel právě zapsal jídlo. Reaguj JEDNOU krátkou větou (max ~15 slov),
věcně a přátelsky — jak tohle jídlo zapadá do zbytku dne. Žádné obecné fráze, konkrétní reakce na dané jídlo.`;

    const userPrompt = `Právě zapsáno jako ${mealTypeLabel}: "${mealName}" (${input.calories} kcal, ${protein}g bílkovin).
Dnes celkem snědeno: ${input.consumedTodayCalories} kcal z cíle ${input.targetCalories} kcal. Zbývá ${remaining} kcal.`;

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey.value()}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 60,
        }),
      });

      if (response.status === 429) {
        return { text: "Zapsáno! ✨" };
      }

      const json = (await response.json()) as { choices?: { message: { content: string } }[] };
      if (!json.choices) {
        console.error("OpenAI response missing choices:", response.status, JSON.stringify(json));
      }
      return { text: json.choices?.[0]?.message?.content || "Zapsáno! 👍" };
    } catch (error) {
      console.error("Mya AI Error (meal feedback):", error);
      return { text: "Zapsáno! 👍" };
    }
  }
);

interface RecipeInput {
  remainingCalories: number;
  remainingProtein: number;
  remainingFat: number;
  remainingCarbs: number;
  goal: Goal;
  preferences?: string;
  availableIngredients?: string;
}

interface RecipeResult {
  name: string;
  description: string;
  ingredients: string[];
  instructions: string[];
  prepMinutes: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

const GOAL_LABELS: Record<Goal, string> = {
  lose: "hubnutí",
  maintain: "udržování váhy",
  gain: "nabírání svalové hmoty",
};

function sanitizeStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, maxItems);
}

function sanitizeRecipeResult(parsed: Record<string, unknown>): RecipeResult {
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

export const generateRecipe = onCall(
  { secrets: [openaiApiKey], region: "us-central1", timeoutSeconds: 45 },
  async (request): Promise<RecipeResult | null> => {
    requireAuth(request);
    const input = request.data as RecipeInput | undefined;
    if (!input || !Number.isFinite(input.remainingCalories) || input.remainingCalories <= 0) {
      throw new HttpsError("invalid-argument", "Chybí platný zbývající kalorický rozpočet.");
    }

    const goalLabel = GOAL_LABELS[input.goal] ?? GOAL_LABELS.maintain;
    const preferences = sanitizePromptText(input.preferences, 300);
    const availableIngredients = sanitizePromptText(input.availableIngredients, 300);

    const systemPrompt = `Jsi Mya, AI nutriční asistentka aplikace Nouri. Uživatel chce recept, který mu pomůže
dojíst zbytek denního nutričního cíle. Navrhni JEDEN recept reálně uvařitelný doma z běžně dostupných surovin,
jehož nutriční hodnoty (kalorie, bílkoviny, tuky, sacharidy) se co nejvíc blíží zadaným zbývajícím hodnotám —
klidně mírně pod nimi, ale nikdy výrazně nad.

Pokud uživatel uvede seznam surovin, které má doma, recept musí jít uvařit JEN z nich — klidně navíc s běžnými
základními surovinami (sůl, pepř, olej, voda), i když v seznamu nejsou, ale žádné jiné suroviny nenavrhuj.

Odpověz VÝHRADNĚ validním JSON objektem v tomto přesném tvaru (žádný markdown, žádný text okolo):
{
  "name": "krátký český název receptu",
  "description": "jedna věta, proč recept sedí do zbytku dne",
  "ingredients": ["surovina s množstvím", ...],
  "instructions": ["krok 1", "krok 2", ...],
  "prepMinutes": číslo (odhad doby přípravy v minutách),
  "calories": číslo,
  "protein": číslo (g),
  "fat": číslo (g),
  "carbs": číslo (g)
}`;

    const userPrompt = `Zbývá do dnešního cíle: ${Math.round(input.remainingCalories)} kcal, ${Math.round(
      input.remainingProtein
    )}g bílkovin, ${Math.round(input.remainingFat)}g tuků, ${Math.round(input.remainingCarbs)}g sacharidů.
Cíl uživatele: ${goalLabel}.${preferences ? `\nPreference/omezení: ${preferences}.` : ""}${
      availableIngredients ? `\nSuroviny, které má doma: ${availableIngredients}.` : ""
    }`;

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey.value()}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
        }),
      });

      if (response.status === 429) throw new Error("Rate limit exceeded");

      const json = (await response.json()) as { choices?: { message: { content: string } }[] };
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        console.error("OpenAI response missing content:", response.status, JSON.stringify(json));
        throw new Error("Invalid AI response");
      }

      const parsed = JSON.parse(content);

      return sanitizeRecipeResult(parsed);
    } catch (error) {
      console.error("Mya Recipe Error:", error);
      return null;
    }
  }
);

interface MacroPatternInput {
  avgProtein: number;
  targetProtein: number;
  daysConsidered: number;
  goal: Goal;
}

export const suggestMacroFix = onCall(
  { secrets: [openaiApiKey], region: "us-central1" },
  async (request) => {
    requireAuth(request);
    const input = request.data as MacroPatternInput | undefined;
    if (!input || !Number.isFinite(input.avgProtein) || !Number.isFinite(input.targetProtein)) {
      throw new HttpsError("invalid-argument", "Chybí platná data o příjmu bílkovin.");
    }

    const goalLabel = GOAL_LABELS[input.goal] ?? GOAL_LABELS.maintain;
    const fallback = `Posledních pár dní ti chybí bílkoviny k cíli (${input.targetProtein}g/den) — zkus přidat větší porci masa, tvarohu nebo luštěnin k jednomu z jídel.`;

    const systemPrompt = `Jsi Mya, AI nutriční asistentka aplikace Nouri. Appka si všimla, že uživatel dlouhodobě
nedosahuje svého cíle na bílkoviny. Napiš krátkou (2-3 věty), vřelou a konkrétní zprávu, která to pojmenuje a
navrhne 1-2 praktické kroky ke zlepšení (např. konkrétní potraviny, posun rozložení jídel) — tón podpůrný, ne
kárající. Piš česky, neformálně. Vrať jen čistý text zprávy, žádný markdown ani uvozovky okolo.`;

    const userPrompt = `Za posledních ${input.daysConsidered} spolehlivě zapsaných dní měl uživatel v průměru ${input.avgProtein}g
bílkovin denně, cíl je ${input.targetProtein}g. Cíl uživatele: ${goalLabel}.`;

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey.value()}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 120,
        }),
      });

      if (response.status === 429) return { text: fallback };

      const json = (await response.json()) as { choices?: { message: { content: string } }[] };
      const content = json.choices?.[0]?.message?.content?.trim();
      if (!content) {
        console.error("OpenAI response missing content:", response.status, JSON.stringify(json));
        return { text: fallback };
      }
      return { text: content };
    } catch (error) {
      console.error("Mya Macro Pattern Error:", error);
      return { text: fallback };
    }
  }
);

interface CalorieIntakePatternInput {
  avgCalories: number;
  targetCalories: number;
  daysConsidered: number;
  goal: Goal;
}

// Citlivé sledování nízkého příjmu (FEATURE_IDEAS.md sekce 3) — appka místo tichého grafu
// pošle jemnou, pečovatelskou zprávu, když vidí dlouhodobě podprůměrný příjem (viz
// detectLowCaloriePattern v calorieIntakePattern.ts). Stejná kostra jako suggestMacroFix,
// jen s výslovným zákazem kárajícího/dietního tónu v system promptu.
export const checkLowCalorieIntake = onCall(
  { secrets: [openaiApiKey], region: "us-central1" },
  async (request) => {
    requireAuth(request);
    const input = request.data as CalorieIntakePatternInput | undefined;
    if (!input || !Number.isFinite(input.avgCalories) || !Number.isFinite(input.targetCalories)) {
      throw new HttpsError("invalid-argument", "Chybí platná data o kalorickém příjmu.");
    }

    const fallback = `Posledních pár dní jíš výrazně méně, než je tvůj cíl (${input.targetCalories} kcal/den) — je u tebe všechno v pořádku?`;

    const systemPrompt = `Jsi Mya, empatická AI nutriční asistentka aplikace Nouri. Appka si všimla, že uživatel
dlouhodobě jí výrazně méně, než je jeho denní cíl. Napiš krátkou (2-3 věty), vřelou a citlivou zprávu, která se
opatrně a s péčí zeptá, jestli je vše v pořádku. NENÍ to "hlídání" ani kárání — je to projev toho, že appce na
uživateli záleží. Nenavrhuj konkrétní jídla ani "jez víc", spíš otevři prostor pro odpověď (může to být záměr,
stres, nechutenství, cokoliv). Piš česky, neformálně. Vrať jen čistý text zprávy, žádný markdown ani uvozovky okolo.`;

    const userPrompt = `Za posledních ${input.daysConsidered} spolehlivě zapsaných dní měl uživatel v průměru ${input.avgCalories} kcal
denně, cíl je ${input.targetCalories} kcal. Cíl uživatele: ${GOAL_LABELS[input.goal] ?? GOAL_LABELS.maintain}.`;

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey.value()}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 120,
        }),
      });

      if (response.status === 429) return { text: fallback };

      const json = (await response.json()) as { choices?: { message: { content: string } }[] };
      const content = json.choices?.[0]?.message?.content?.trim();
      if (!content) {
        console.error("OpenAI response missing content:", response.status, JSON.stringify(json));
        return { text: fallback };
      }
      return { text: content };
    } catch (error) {
      console.error("Mya Low Calorie Check-in Error:", error);
      return { text: fallback };
    }
  }
);

interface WeeklySummaryInput {
  avgCalories: number;
  targetCalories: number;
  daysLogged: number;
  weekdayAvgProtein: number;
  weekdayDaysLogged: number;
  weekendAvgProtein: number;
  weekendDaysLogged: number;
  targetProtein: number;
  goal: Goal;
}

// Týdenní AI shrnutí na vyžádání (FEATURE_IDEAS.md sekce 3, "tenhle týden ti chyběly bílkoviny
// hlavně o víkendech") — na rozdíl od suggestMacroFix/checkLowCalorieIntake appka tuhle funkci
// nevolá automaticky při detekci vzorce, ale až na klik tlačítka na Stats (viz Stats.tsx).
export const getWeeklySummary = onCall(
  { secrets: [openaiApiKey], region: "us-central1" },
  async (request) => {
    requireAuth(request);
    const input = request.data as WeeklySummaryInput | undefined;
    if (!input || !Number.isFinite(input.avgCalories) || !Number.isFinite(input.targetCalories)) {
      throw new HttpsError("invalid-argument", "Chybí platná týdenní data.");
    }

    const fallback = `Tenhle týden jsi v průměru měla ${input.avgCalories} kcal/den z cíle ${input.targetCalories} kcal (zapsáno ${input.daysLogged}/7 dní).`;

    const systemPrompt = `Jsi Mya, AI nutriční asistentka aplikace Nouri. Uživatel si vyžádal shrnutí uplynulého
týdne. Napiš krátké (2-4 věty), věcné a přátelské shrnutí, které vyzdvihne nejzajímavější vzorec v datech —
například rozdíl mezi všedními dny a víkendem, jestli se dařilo dosahovat cíle na bílkoviny nebo kalorie, nebo
kolik dní bylo vůbec zapsáno. Pokud je dat málo (méně než 3 zapsané dny), zmiň to a nepřeháněj s jistotou závěrů.
Piš česky, neformálně, žádné obecné fráze. Vrať jen čistý text zprávy, žádný markdown ani uvozovky okolo.`;

    const userPrompt = `Cíl uživatele: ${GOAL_LABELS[input.goal] ?? GOAL_LABELS.maintain}.
Kalorie: průměr ${input.avgCalories} kcal/den z cíle ${input.targetCalories} kcal, zapsáno ${input.daysLogged}/7 dní.
Bílkoviny: cíl ${input.targetProtein}g/den. Všední dny průměr ${input.weekdayAvgProtein}g (${input.weekdayDaysLogged} zapsaných dní), víkend průměr ${input.weekendAvgProtein}g (${input.weekendDaysLogged} zapsaných dní).`;

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey.value()}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 160,
        }),
      });

      if (response.status === 429) return { text: fallback };

      const json = (await response.json()) as { choices?: { message: { content: string } }[] };
      const content = json.choices?.[0]?.message?.content?.trim();
      if (!content) {
        console.error("OpenAI response missing content:", response.status, JSON.stringify(json));
        return { text: fallback };
      }
      return { text: content };
    } catch (error) {
      console.error("Mya Weekly Summary Error:", error);
      return { text: fallback };
    }
  }
);

interface ChatMessageInput {
  role: "user" | "assistant";
  content: string;
}

const MAX_CHAT_HISTORY = 20;
const MAX_CHAT_MESSAGE_LENGTH = 2000;
const CHAT_FALLBACK_TEXT = "Mya právě neodpovídá — zkus to prosím znovu za chvíli.";

// Volný chat s Myou (FEATURE_IDEAS.md sekce 6) — jediná funkce v tomhle souboru s vícekolovou
// konverzací (ostatní jsou vždy přesně systém+user). Zůstává bezstavová jako všechny sourozenní
// funkce: appka posílá ořezanou historii z users/{uid}/chatMessages (viz cloudSync.ts), funkce
// sama do Firestore nesahá. Protože historie teď přichází od klienta, je to nedůvěryhodný vstup —
// validuje se délka pole i každé zprávy zvlášť, na rozdíl od ostatních funkcí v souboru.
export const chatWithMya = onCall(
  { secrets: [openaiApiKey], region: "us-central1", timeoutSeconds: 30 },
  async (request) => {
    requireAuth(request);
    const profile = request.data?.profile as UserProfileInput | undefined;
    if (!profile) throw new HttpsError("invalid-argument", "Chybí profil.");
    // profile.name jde na rozdíl od ostatních funkcí do SYSTÉMOVÉ části promptu (B8) — sanitizace
    // řádkových zlomů je tu obzvlášť důležitá, ať appka nemá jméno, které se snaží vydávat za
    // další systémovou instrukci.
    const safeName = sanitizePromptText(profile.name, 100) ?? "";

    const rawMessages = request.data?.messages;
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      throw new HttpsError("invalid-argument", "Chybí zprávy.");
    }
    if (rawMessages.length > MAX_CHAT_HISTORY) {
      throw new HttpsError("invalid-argument", "Příliš dlouhá historie konverzace.");
    }

    const messages: ChatMessageInput[] = [];
    for (const raw of rawMessages as unknown[]) {
      const entry = raw as { role?: unknown; content?: unknown } | null;
      const role = entry?.role;
      const content = entry?.content;
      if (role !== "user" && role !== "assistant") {
        throw new HttpsError("invalid-argument", "Neplatná role zprávy.");
      }
      if (typeof content !== "string" || !content.trim() || content.length > MAX_CHAT_MESSAGE_LENGTH) {
        throw new HttpsError("invalid-argument", "Neplatný obsah zprávy.");
      }
      messages.push({ role, content: content.trim() });
    }

    // Živě přepočteno z profilu, ne z profile.targetCalories (stejný důvod jako u getDailyGreeting).
    const nutrition = calculateNutrition({
      gender: profile.gender,
      weight: profile.weight,
      height: profile.height,
      birthDate: profile.birthDate,
      activityLevel: profile.activityLevel,
      goal: profile.goal,
      calibratedTDEE: profile.calibratedTDEE,
      customProteinGrams: profile.customProteinGrams,
      customFatGrams: profile.customFatGrams,
    });
    const goalLabel = profile.goal === "lose" ? "hubnutí" : profile.goal === "gain" ? "nabírání svalové hmoty" : "udržování váhy";

    const systemPrompt = `Jsi Mya, AI nutriční a fitness asistentka aplikace Nouri. Vedeš volnou konverzaci s uživatelkou/uživatelem appky.

Kontext uživatele: ${safeName}, cíl ${goalLabel}, cílový příjem ${nutrition.targetCalories} kcal/den (bílkoviny ${nutrition.macros.protein} g).

Pravidla:
- Odpovídej výhradně na témata výživy, hubnutí/nabírání/udržování váhy, cvičení, pohybu a zdravého životního stylu, případně dotazy k používání appky Nouri. Na cokoliv mimo tato témata zdvořile odpověz, že se raději bavíš o výživě a zdraví, a nasměruj konverzaci zpět.
- Piš česky, věcně ale přátelsky, jako zkušená kamarádka-nutriční poradkyně.
- Odpovědi drž přiměřeně stručné (typicky 2-5 vět) — delší jen když si to téma opravdu vyžádá (např. rozpis jídelníčku).
- Nikdy nepoužívej markdown tabulky.
- Nejsi lékařka — u zdravotních potížích nebo léčebných dotazech doporuč konzultaci s lékařem, nediagnostikuj.`;

    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey.value()}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: apiMessages,
          max_tokens: 500,
          temperature: 0.7,
        }),
      });

      if (response.status === 429) {
        return { text: "Mya je momentálně přetížená, zkus to prosím za chvíli." };
      }

      const json = (await response.json()) as { choices?: { message: { content: string } }[] };
      const content = json.choices?.[0]?.message?.content?.trim();
      if (!content) {
        console.error("OpenAI response missing content:", response.status, JSON.stringify(json));
        return { text: CHAT_FALLBACK_TEXT };
      }
      return { text: content };
    } catch (error) {
      console.error("Mya Chat Error:", error);
      return { text: CHAT_FALLBACK_TEXT };
    }
  }
);

const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
};

export const transcribeAudio = onCall(
  { secrets: [openaiApiKey], region: "us-central1", memory: "512MiB", timeoutSeconds: 30 },
  async (request): Promise<{ text: string } | null> => {
    requireAuth(request);
    const audioDataUrl = request.data?.audioDataUrl as string | undefined;
    if (!audioDataUrl || !audioDataUrl.startsWith("data:audio/")) {
      throw new HttpsError("invalid-argument", "Chybí platná nahrávka.");
    }

    try {
      const [header, base64Data] = audioDataUrl.split(",");
      const mimeMatch = header.match(/^data:(audio\/[a-zA-Z0-9.+-]+)/);
      const mimeType = mimeMatch?.[1] ?? "audio/webm";
      // Přípona podle skutečného MIME typu nahrávky — iOS Safari nahrává audio/mp4,
      // ne webm jako Chrome/Android. Whisper validuje podle přípony souboru, takže
      // natvrdo ".webm" na mp4 datech by na iPhonu vrátilo chybu.
      const extension = AUDIO_EXTENSIONS[mimeType] ?? "webm";
      const buffer = Buffer.from(base64Data, "base64");

      const formData = new FormData();
      formData.append("file", new Blob([buffer], { type: mimeType }), `recording.${extension}`);
      formData.append("model", "whisper-1");
      formData.append("language", "cs");

      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiApiKey.value()}` },
        body: formData,
      });

      if (response.status === 429) throw new Error("Rate limit exceeded");

      const json = (await response.json()) as { text?: string };
      const text = json.text?.trim();
      if (!text) {
        console.error("Whisper response missing text:", response.status, JSON.stringify(json));
        throw new Error("Invalid transcription response");
      }

      return { text };
    } catch (error) {
      console.error("Mya Voice Transcription Error:", error);
      return null;
    }
  }
);

interface FridgeRecipeInput {
  imageDataUrl: string;
  remainingCalories: number;
  remainingProtein: number;
  remainingFat: number;
  remainingCarbs: number;
  goal: Goal;
  preferences?: string;
}

interface GoalReachedInput {
  targetWeight: number;
  currentWeight: number;
  goal: Goal;
}

// Gratulace při dosažení cílové váhy (FEATURE_IDEAS.md sekce 3, "Detekce dosaženého cíle") —
// appka detekci dělá sama (viz detectGoalReached v goalReached.ts), tahle funkce jen dodá osobní
// gratulační text, stejná kostra jako checkLowCalorieIntake.
export const congratulateGoalReached = onCall(
  { secrets: [openaiApiKey], region: "us-central1" },
  async (request) => {
    requireAuth(request);
    const input = request.data as GoalReachedInput | undefined;
    if (!input || !Number.isFinite(input.targetWeight) || !Number.isFinite(input.currentWeight)) {
      throw new HttpsError("invalid-argument", "Chybí platná data o váze.");
    }

    const fallback = `Gratuluji, dosáhla jsi cílové váhy ${input.targetWeight} kg! Co kdybychom teď přepnuly na Udržování, ať se tam udržíš?`;

    const systemPrompt = `Jsi Mya, empatická AI nutriční asistentka aplikace Nouri. Uživatelka právě dosáhla své
cílové váhy. Napiš krátkou (2-3 věty), radostnou a upřímnou gratulační zprávu, oceň její vytrvalost. Jemně navrhni,
ať zváží přepnutí režimu na "Udržovat váhu" místo pokračování ve stejném kalorickém deficitu/přebytku — appka
k tomu hned pod zprávou nabídne tlačítko, takže to jen zmiň, nepiš instrukce jak to udělat. Piš česky, neformálně.
Vrať jen čistý text zprávy, žádný markdown ani uvozovky okolo.`;

    const goalLabel = input.goal === "gain" ? "nabírání" : "hubnutí";
    const userPrompt = `Uživatelka měla cíl ${goalLabel} na váhu ${input.targetWeight} kg a právě dosáhla ${input.currentWeight} kg.`;

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey.value()}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 120,
        }),
      });

      if (response.status === 429) return { text: fallback };

      const json = (await response.json()) as { choices?: { message: { content: string } }[] };
      const content = json.choices?.[0]?.message?.content?.trim();
      if (!content) {
        console.error("OpenAI response missing content:", response.status, JSON.stringify(json));
        return { text: fallback };
      }
      return { text: content };
    } catch (error) {
      console.error("Mya Goal Reached Congrats Error:", error);
      return { text: fallback };
    }
  }
);

export const generateRecipeFromFridge = onCall(
  { secrets: [openaiApiKey], region: "us-central1", memory: "512MiB", timeoutSeconds: 60 },
  async (request): Promise<RecipeResult | null> => {
    requireAuth(request);
    const input = request.data as FridgeRecipeInput | undefined;
    if (!input?.imageDataUrl || !input.imageDataUrl.startsWith("data:image/")) {
      throw new HttpsError("invalid-argument", "Chybí platný obrázek.");
    }
    if (!Number.isFinite(input.remainingCalories) || input.remainingCalories <= 0) {
      throw new HttpsError("invalid-argument", "Chybí platný zbývající kalorický rozpočet.");
    }

    const goalLabel = GOAL_LABELS[input.goal] ?? GOAL_LABELS.maintain;
    const preferences = sanitizePromptText(input.preferences, 300);

    const systemPrompt = `Jsi Mya, AI nutriční asistentka aplikace Nouri. Uživatel ti pošle fotku obsahu lednice nebo spíže.
Podívej se, jaké potravinové suroviny jsou na fotce rozpoznatelné, a navrhni JEDEN recept, který z nich (klidně i s
běžnými základními surovinami jako sůl, pepř, olej, mouka, i když nejsou na fotce vidět) jde reálně uvařit doma.
Nutriční hodnoty (kalorie, bílkoviny, tuky, sacharidy) se musí co nejvíc blížit zadaným zbývajícím hodnotám —
klidně mírně pod nimi, ale nikdy výrazně nad.

Pokud na fotce nejde rozpoznat žádné použitelné potravinové suroviny (např. prázdná lednice, nesouvisející fotka),
nastav "recognized": false a ostatní pole nech prázdná nebo nulová.

Odpověz VÝHRADNĚ validním JSON objektem v tomto přesném tvaru (žádný markdown, žádný text okolo):
{
  "recognized": true nebo false,
  "name": "krátký český název receptu",
  "description": "jedna věta, proč recept sedí do zbytku dne a co z fotky použil",
  "ingredients": ["surovina s množstvím", ...],
  "instructions": ["krok 1", "krok 2", ...],
  "prepMinutes": číslo (odhad doby přípravy v minutách),
  "calories": číslo,
  "protein": číslo (g),
  "fat": číslo (g),
  "carbs": číslo (g)
}`;

    const userPrompt = `Zbývá do dnešního cíle: ${Math.round(input.remainingCalories)} kcal, ${Math.round(
      input.remainingProtein
    )}g bílkovin, ${Math.round(input.remainingFat)}g tuků, ${Math.round(input.remainingCarbs)}g sacharidů.
Cíl uživatele: ${goalLabel}.${preferences ? `\nPreference/omezení: ${preferences}.` : ""}`;

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey.value()}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: userPrompt },
                { type: "image_url", image_url: { url: input.imageDataUrl } },
              ],
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
        }),
      });

      if (response.status === 429) throw new Error("Rate limit exceeded");

      const json = (await response.json()) as { choices?: { message: { content: string } }[] };
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        console.error("OpenAI response missing content:", response.status, JSON.stringify(json));
        throw new Error("Invalid AI response");
      }

      const parsed = JSON.parse(content);
      if (parsed.recognized !== true) return null;

      return sanitizeRecipeResult(parsed);
    } catch (error) {
      console.error("Mya Fridge Recipe Error:", error);
      return null;
    }
  }
);
