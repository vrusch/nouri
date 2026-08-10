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
}

function requireAuth(request: CallableRequest) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Musíš být přihlášená.");
  }
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

    const results = calculateNutrition({
      gender: profile.gender,
      weight: profile.weight,
      height: profile.height,
      birthDate: profile.birthDate,
      activityLevel: profile.activityLevel,
      goal: profile.goal,
      calibratedTDEE: profile.calibratedTDEE,
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
Jméno: ${profile.name}
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
    if (!profile) throw new HttpsError("invalid-argument", "Chybí profil.");

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
    });
    const targetProtein = nutrition.macros.protein;
    const remaining = nutrition.targetCalories - consumedCalories;
    const proteinRemaining = Math.max(0, targetProtein - consumedProtein);

    const systemPrompt = `Jsi Mya z aplikace Nouri. Piš krátké, úderné a motivující zprávy (max 2 věty).
Zohledni aktuální stav uživatele. Pokud výrazně chybí bílkoviny vzhledem k denní době, zmiň to konkrétně (počet gramů).`;

    const userPrompt = `Uživatel: ${profile.name}. Cíl: ${nutrition.targetCalories} kcal (bílkoviny ${targetProtein}g). Dnes snědeno: ${consumedCalories} kcal (bílkoviny ${consumedProtein}g). Zbývá: ${remaining} kcal, ${proteinRemaining}g bílkovin.`;

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
      return { text: `Ahoj ${profile.name}! Nezapomeň si dnes zapsat všechna jídla.` };
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
                { type: "text", text: "Analyzuj toto jídlo." },
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
    const description = request.data?.description as string | undefined;
    if (!description || !description.trim()) {
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
            { role: "user", content: description.trim() },
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
    if (!input?.mealName) throw new HttpsError("invalid-argument", "Chybí data o jídle.");

    const remaining = input.targetCalories - input.consumedTodayCalories;
    const mealTypeLabel = MEAL_TYPE_LABELS[input.mealType] ?? "jídlo";

    const systemPrompt = `Jsi Mya z aplikace Nouri. Uživatel právě zapsal jídlo. Reaguj JEDNOU krátkou větou (max ~15 slov),
věcně a přátelsky — jak tohle jídlo zapadá do zbytku dne. Žádné obecné fráze, konkrétní reakce na dané jídlo.`;

    const userPrompt = `Právě zapsáno jako ${mealTypeLabel}: "${input.mealName}" (${input.calories} kcal, ${input.protein}g bílkovin).
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

    const systemPrompt = `Jsi Mya, AI nutriční asistentka aplikace Nouri. Uživatel chce recept, který mu pomůže
dojíst zbytek denního nutričního cíle. Navrhni JEDEN recept reálně uvařitelný doma z běžně dostupných surovin,
jehož nutriční hodnoty (kalorie, bílkoviny, tuky, sacharidy) se co nejvíc blíží zadaným zbývajícím hodnotám —
klidně mírně pod nimi, ale nikdy výrazně nad.

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
Cíl uživatele: ${goalLabel}.${input.preferences?.trim() ? `\nPreference/omezení: ${input.preferences.trim()}.` : ""}`;

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
Cíl uživatele: ${goalLabel}.${input.preferences?.trim() ? `\nPreference/omezení: ${input.preferences.trim()}.` : ""}`;

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
