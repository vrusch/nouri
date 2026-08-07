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
  targetCalories: number;
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

    const remaining = profile.targetCalories - consumedCalories;
    const targetProtein = calculateNutrition({
      gender: profile.gender,
      weight: profile.weight,
      height: profile.height,
      birthDate: profile.birthDate,
      activityLevel: profile.activityLevel,
      goal: profile.goal,
    }).macros.protein;
    const proteinRemaining = Math.max(0, targetProtein - consumedProtein);

    const systemPrompt = `Jsi Mya z aplikace Nouri. Piš krátké, úderné a motivující zprávy (max 2 věty).
Zohledni aktuální stav uživatele. Pokud výrazně chybí bílkoviny vzhledem k denní době, zmiň to konkrétně (počet gramů).`;

    const userPrompt = `Uživatel: ${profile.name}. Cíl: ${profile.targetCalories} kcal (bílkoviny ${targetProtein}g). Dnes snědeno: ${consumedCalories} kcal (bílkoviny ${consumedProtein}g). Zbývá: ${remaining} kcal, ${proteinRemaining}g bílkovin.`;

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
