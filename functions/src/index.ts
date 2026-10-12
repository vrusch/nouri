import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { calculateAge, type Goal } from "./nutrition.js";
import { callOpenAIChat } from "./openai.js";
import { enforceRateLimit } from "./rateLimit.js";
import { parseCoachingStyle, buildCoachingPrompt } from "./coachingStyle.js";
import { buildChatSystemPrompt } from "./chatPrompt.js";
import { parseUserStory } from "./userStory.js";
import { ACTIVITY_LEVELS, nutritionFromProfile, parseProfileInput } from "./profileInput.js";
import { describeIntakeStatusCs, greetingProteinToCatchUp, INTAKE_STATUS_RULE } from "./dayStatus.js";
import { parseChatContext } from "./chatContext.js";
import { parseChatMessages } from "./chatMessages.js";
import { sanitizePromptText } from "./promptText.js";
import { MULTI_MEAL_SYSTEM_PROMPT, parseMealsFromText } from "./mealText.js";
import { parseFoodImages } from "./visionInput.js";
import { FOOD_PHOTO_SYSTEM_PROMPT, parseFoodPhotoResult } from "./foodPhoto.js";
import {
  SUGGEST_RECIPES_TOOL,
  SUGGEST_RECIPES_TOOL_NAME,
  buildMealPlan,
  buildRecipeSetUserPrompt,
  chatMealPlan,
  chatRecipeBudget,
  chatRecipeIntro,
  forcesRecipeTool,
  parseDailyTarget,
  parseRecipeSet,
  parseSuggestRecipesArgs,
  parseTodayMealTypes,
  recipeSetBudget,
  recipeSetSystemPromptFor,
  sanitizeRecipeResult,
  type DailyTarget,
  type MealTarget,
  type RecipeBudget,
  type RecipeResult,
} from "./recipes.js";

// Fáze C (REFERENCE/STRICT_COACHING_SPEC.md) — push připomínky jídla a vody, viz pushNudges.ts.
export { sendNudgePushes, sendTestPush } from "./pushNudges.js";

const openaiApiKey = defineSecret("OPENAI_API_KEY");

// Model chatu a sad receptů (MYA_COACH_SPEC D1, D10). Fáze 1 gpt-4.1-mini — jde přes dnešní
// callOpenAIChat beze změny parametrů. Fáze 2 (spec 5A) ho vymění za gpt-6.1-sol a k tomu
// upraví parametry volání (reasoning_effort, max_completion_tokens).
const CHAT_MODEL = "gpt-4.1-mini";

function requireAuth(request: CallableRequest) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Musíš být přihlášená.");
  }
}

// N19 — obrana proti runaway smyčce (chybný retry v klientovi apod.). Dva tiery: EXPENSIVE pro
// gpt-4o vision/Whisper (3 funkce, nejdražší), STANDARD pro zbylých 11 — gpt-4o-mini s malým
// max_tokens, řádově levnější za volání, takže appka snese vyšší limit bez zbytečného škrcení
// legitimního použití (např. delší konverzace v chatu, víc jídel zapsaných rychle po sobě).
const EXPENSIVE_AI_CALL_MAX = 20;
const EXPENSIVE_AI_CALL_WINDOW_MS = 15 * 60 * 1000;
const STANDARD_AI_CALL_MAX = 60;
const STANDARD_AI_CALL_WINDOW_MS = 15 * 60 * 1000;

// Druhy připomínek z klientského computeActiveNudges (src/lib/nudges.ts) → text do promptu.
const NUDGE_KIND_LABELS = {
  breakfast: "nezapsaná snídaně",
  lunch: "nezapsaný oběd",
  dinner: "nezapsaná večeře",
  water: "málo vypité vody vzhledem k denní době",
} as const;

// Celé číslo v rozsahu, jinak undefined — pro nepovinná čísla od klienta (voda, trénink,
// včerejšek), stejný princip jako validace mood/localHour v getDailyGreeting.
function parseBoundedInt(value: unknown, min: number, max: number): number | undefined {
  const n = Number(value);
  return value !== undefined && value !== null && Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

export const generateWelcomeReport = onCall(
  { secrets: [openaiApiKey], region: "us-central1" },
  async (request) => {
    requireAuth(request);
    const profile = parseProfileInput(request.data?.profile);
    if (!profile) throw new HttpsError("invalid-argument", "Chybí profil nebo je neplatný.");
    await enforceRateLimit(request.auth!.uid, "generateWelcomeReport", STANDARD_AI_CALL_MAX, STANDARD_AI_CALL_WINDOW_MS);
    const safeName = sanitizePromptText(profile.name, 100) ?? "";

    const results = nutritionFromProfile(profile);

    // N36 (AUDIT_2026-08-14.md) — dřív naivní rozdíl kalendářních roků bez ohledu na to,
    // jestli už letos narozeniny byly, na rozdíl od calculateAge() o pár řádků výš uvnitř
    // buildNutritionFromProfile — Mya mohla v reportu zmínit věk o 1 vyšší, než jaký appka
    // reálně použila pro výpočet BMR.
    const age = calculateAge(profile.birthDate);
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
      const result = await callOpenAIChat({
        apiKey: openaiApiKey.value(),
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        maxTokens: 900,
      });

      if (!result.ok) throw new Error(result.reason === "rate_limited" ? "Rate limit exceeded" : "Invalid AI response");

      return { text: result.content, data: results };
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

/**
 * Slovní popis denní doby pro prompt. Hranice jsou schválně stejné jako v src/lib/greeting.ts na
 * klientovi (5/10/18/22), ať Mya v bublině nemluví o jiné části dne, než jakou hlásí nadpis přímo
 * nad ní. Duplikace je zde stejným kompromisem jako u nutrition.ts — klient a functions/ nemají
 * sdílený balíček. Noc jako jediná část přeskakuje půlnoc (22:00–4:59), proto dvě větve.
 */
function describeDayPartCs(hour: number): string {
  if (hour < 5) return "pozdě v noci";
  if (hour < 10) return "ráno";
  if (hour < 18) return "během dne";
  if (hour < 22) return "večer";
  return "pozdě v noci";
}

export const getDailyGreeting = onCall(
  { secrets: [openaiApiKey], region: "us-central1" },
  async (request) => {
    requireAuth(request);
    const profile = parseProfileInput(request.data?.profile);
    const consumedCalories = Number(request.data?.consumedCalories) || 0;
    const consumedProtein = Number(request.data?.consumedProtein) || 0;
    // Nálada/energie check-in (FEATURE_IDEAS.md sekce 3) — appka mood/moodNote nikam neukládá,
    // jen je jednorázově protlačí do tohohle promptu (viz handleSubmitMood v Home.tsx).
    const rawMood = Number(request.data?.mood);
    const mood = Number.isInteger(rawMood) && rawMood >= 1 && rawMood <= 5 ? rawMood : undefined;
    // N35 (AUDIT_2026-08-14.md) — dřív ruční .trim().slice(0,300), na rozdíl od zbytku volného
    // textu v souboru neodstraňovalo řádkové zlomy (\r\n). Reálné riziko nízké (UI pole je
    // <input type="text">, novou řádku appka nedovolí zadat), ale sdílená funkce je levnější
    // než vlastní kopii pravidla.
    const moodNote = sanitizePromptText(request.data?.moodNote, 300);
    // Místní hodina uživatele. Posílá ji klient (viz localHour v Home.tsx) — tahle funkce běží
    // v us-central1, takže serverové new Date().getHours() by byl čas úplně jiného pásma.
    // Validace stejným vzorem jako u mood výš; když hodina nedorazí (starší build appky v cache
    // PWA), prompt o denní době mlčí, místo aby si ji model domýšlel.
    const rawLocalHour = Number(request.data?.localHour);
    const localHour =
      Number.isInteger(rawLocalHour) && rawLocalHour >= 0 && rawLocalHour <= 23 ? rawLocalHour : undefined;
    // Přísnější vedení (REFERENCE/STRICT_COACHING_SPEC.md, A3) — všechno nepovinné, starší build
    // appky nic z toho neposílá a funkce se pak chová jako dřív (styl "balanced").
    const coachingStyle = parseCoachingStyle(request.data?.coachingStyle);
    const isVacationDay = request.data?.isVacationDay === true;
    // Aktivní připomínky spočítané klientem (computeActiveNudges, stejná funkce jako banner) —
    // server neví, která jídla jsou zapsaná, takže Mya o chybějícím jídle/vodě smí mluvit jen
    // podle tohohle seznamu. Whitelist, neznámé hodnoty se zahodí.
    const nudgeKinds = Array.isArray(request.data?.nudgeKinds)
      ? (request.data.nudgeKinds as unknown[]).filter(
          (k): k is keyof typeof NUDGE_KIND_LABELS => typeof k === "string" && k in NUDGE_KIND_LABELS
        )
      : [];
    const workoutBonusCalories = parseBoundedInt(request.data?.workoutBonusCalories, 0, 5000) ?? 0;
    const waterGlasses = parseBoundedInt(request.data?.waterGlasses, 0, 50);
    const waterTarget = parseBoundedInt(request.data?.waterTarget, 1, 30);
    const rawYesterday = request.data?.yesterday as
      | { consumedCalories?: unknown; targetCalories?: unknown; isVacationDay?: unknown }
      | undefined;
    const yesterdayConsumed = parseBoundedInt(rawYesterday?.consumedCalories, 1, 20000);
    const yesterdayTarget = parseBoundedInt(rawYesterday?.targetCalories, 500, 10000);
    if (!profile) throw new HttpsError("invalid-argument", "Chybí profil nebo je neplatný.");
    await enforceRateLimit(request.auth!.uid, "getDailyGreeting", STANDARD_AI_CALL_MAX, STANDARD_AI_CALL_WINDOW_MS);
    const safeName = sanitizePromptText(profile.name, 100) ?? "";

    // Živě přepočteno z profilu, ne z uloženého profile.targetCalories — to může být
    // zastaralé (naposledy zapsané při onboardingu nebo posledním "Aktualizovat analýzu").
    // Dnešní tréninkový bonus appka přičítá stejně jako Home (adjustedGoalCalories), jinak by
    // Mya po tréninku hlásila překročení, které Home neukazuje.
    const nutrition = nutritionFromProfile(profile);
    const targetCalories = nutrition.targetCalories + workoutBonusCalories;
    const targetProtein = nutrition.macros.protein;

    // Max 2 věty a čím dál víc kontextu (voda, včerejšek, překročení) — bez pořadí by model
    // buď nacpal všechno, nebo vybíral náhodně.
    const systemPrompt = `Jsi Mya z aplikace Nouri. Piš krátké, úderné zprávy (max 2 věty).
Zohledni aktuální stav uživatele. Nezmiňuj všechno najednou — vyber nejvýš dvě nejdůležitější věci v tomhle pořadí:
1) dnešní překročení kalorického cíle (jen při STAV: PŘEKROČENO), 2) připomínky uvedené v datech (nezapsané jídlo, málo vody), 3) včerejší překročení cíle, 4) bílkoviny k dohnání vzhledem k denní době — jen když je data uvádějí, a to přesně tím číslem, klidně s tipem, čím je dohnat (tvaroh, skyr, kuřecí), nikdy vyčítavě.
O chybějících bílkovinách mluv JEN podle řádku "Bílkoviny, které jde dnes ještě dohnat" — když v datech není, o chybějících bílkovinách nic neříkej.
${INTAKE_STATUS_RULE}
O nezapsaném jídle nebo málo vypité vodě mluv JEN když je uvedeno v "Appka právě připomíná" — jinak nic takového netvrď ani nedomýšlej.
${buildCoachingPrompt(coachingStyle, isVacationDay, profile.gender)}${
      localHour !== undefined
        ? " Zpráva musí sedět na aktuální denní dobu uvedenou níž — nikdy nepiš ranní pozdrav ani plán na celý den večer a v noci, a nebilancuj celý den dopoledne."
        : ""
    }${
      mood !== undefined
        ? // "dnes", ne "právě": klient náladu posílá s každým dalším pozdravem dne (Home.tsx, readStoredMood).
          " Uživatel dnes v appce odpověděl na otázku, jak se cítí — zohledni to v tónu zprávy (empaticky, ale stručně), aniž by to bylo hlavní téma zprávy."
        : ""
    }`;

    // Bez tohohle kontextu dostával model v system promptu pokyn zohlednit "denní dobu", aniž by
    // mu appka kdy řekla, kolik je hodin — proto Mya mohla znít ranně i v deset večer.
    const timeContext =
      localHour !== undefined
        ? ` Aktuální místní čas uživatele: ${localHour}:00 (${describeDayPartCs(localHour)}).`
        : "";

    const moodContext =
      mood !== undefined
        ? ` Dnešní nálada/energie: ${mood}/5 (1 = mizerně, 5 = skvěle).${moodNote ? ` Poznámka od uživatele: "${moodNote}"` : ""}`
        : "";

    // D6 (MYA_COACH_SPEC): celá mezera bílkovin ("chybí 48 g") při 245 zbývajících kcal byla hlavní
    // zdroj "vyčítavosti" — pozdrav dostane jen část, která se do zbytku dne reálně vejde, a pozdě
    // večer nic.
    const intakeSummary = describeIntakeStatusCs(consumedCalories, targetCalories, consumedProtein, targetProtein, {
      omitProtein: true,
    });
    const proteinToCatchUp =
      consumedCalories > 0
        ? greetingProteinToCatchUp(targetCalories - consumedCalories, targetProtein - consumedProtein, localHour)
        : undefined;
    const proteinContext =
      proteinToCatchUp !== undefined ? ` Bílkoviny, které jde dnes ještě dohnat: ~${proteinToCatchUp} g.` : "";

    const waterContext =
      waterGlasses !== undefined ? ` Voda dnes: ${waterGlasses} z ${waterTarget ?? 8} sklenic (sklenice = 250 ml).` : "";

    // Včerejšek jen když klient poslal obě čísla (včera něco zapsáno, viz buildYesterdayReview).
    const yesterdayContext =
      yesterdayConsumed !== undefined && yesterdayTarget !== undefined
        ? ` Včera${rawYesterday?.isVacationDay === true ? " (volný den)" : ""}: ${yesterdayConsumed} kcal z cíle ${yesterdayTarget} kcal${
            yesterdayConsumed > yesterdayTarget ? ` — přes cíl o ${yesterdayConsumed - yesterdayTarget} kcal` : ""
          }.`
        : "";

    const nudgeContext =
      nudgeKinds.length > 0 ? ` Appka právě připomíná: ${nudgeKinds.map((k) => NUDGE_KIND_LABELS[k]).join("; ")}.` : "";

    const workoutContext = workoutBonusCalories > 0 ? ` (včetně +${workoutBonusCalories} kcal za dnešní trénink)` : "";
    // Cíl bílkovin záměrně ne (D6) — jediné číslo o bílkovinách je proteinContext.
    const userPrompt = `Uživatel: ${safeName}. Cíl: ${targetCalories} kcal${workoutContext}.${timeContext} ${intakeSummary}${proteinContext}${waterContext}${nudgeContext}${yesterdayContext}${moodContext}`;

    try {
      const result = await callOpenAIChat({
        apiKey: openaiApiKey.value(),
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        // Nižší teplota než výchozí 1 — pozdrav opakuje konkrétní čísla z dat a nesmí si je
        // "kreativně" převracet (viz REGRESE v dayStatus.ts).
        temperature: 0.4,
        maxTokens: 100,
      });

      if (!result.ok) {
        return {
          text:
            result.reason === "rate_limited"
              ? "Dneska ti to sekne! Nezapomeň si zapisovat všechna jídla. ✨"
              : "Krásný den! Jak se dnes daří?",
        };
      }
      return { text: result.content };
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
    // 1–3 fotky jednoho jídla (viz visionInput.ts), starší klient posílá jen jednu.
    const imageDataUrls = parseFoodImages(request.data);
    const hint = sanitizePromptText(request.data?.hint, 300);
    if (!imageDataUrls) {
      throw new HttpsError("invalid-argument", "Chybí platný obrázek.");
    }
    await enforceRateLimit(request.auth!.uid, "analyzeFood", EXPENSIVE_AI_CALL_MAX, EXPENSIVE_AI_CALL_WINDOW_MS);

    try {
      const result = await callOpenAIChat({
        apiKey: openaiApiKey.value(),
        model: "gpt-4o",
        messages: [
          // Prompt i parsování odpovědi (včetně složek s gramáží) viz foodPhoto.ts.
          { role: "system", content: FOOD_PHOTO_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: hint
                  ? `Analyzuj toto jídlo. Doplňující upřesnění od uživatele: ${hint}`
                  : "Analyzuj toto jídlo.",
              },
              ...imageDataUrls.map((url) => ({ type: "image_url", image_url: { url } })),
            ],
          },
        ],
        responseFormat: "json_object",
        temperature: 0.3,
        // Se složkami (až 8× název, gramy a makra) by 300 uřízlo JSON uprostřed.
        maxTokens: 700,
      });

      if (!result.ok) throw new Error(result.reason === "rate_limited" ? "Rate limit exceeded" : "Invalid AI response");

      return parseFoodPhotoResult(JSON.parse(result.content));
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
    // `multi` (AddMealModal → popis/diktát) rozdělí popis na víc jídel, viz mealText.ts. Bez něj
    // (QuickLookupModal, starší build appky) funkce vrací jedno jídlo přesně jako dřív. Diktát
    // tří jídel je delší — limit 1000 znaků, ať appka neusekne poslední (obvykle právě dnešní) jídlo.
    const multi = request.data?.multi === true;
    const description = sanitizePromptText(request.data?.description, multi ? 1000 : 500);
    if (!description) {
      throw new HttpsError("invalid-argument", "Chybí popis jídla.");
    }
    await enforceRateLimit(request.auth!.uid, "analyzeFoodText", STANDARD_AI_CALL_MAX, STANDARD_AI_CALL_WINDOW_MS);

    if (multi) {
      try {
        const result = await callOpenAIChat({
          apiKey: openaiApiKey.value(),
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: MULTI_MEAL_SYSTEM_PROMPT },
            { role: "user", content: description },
          ],
          responseFormat: "json_object",
          temperature: 0.3,
          // 300 jako u jednoho jídla by JSON pro 3–5 jídel uřízlo uprostřed.
          maxTokens: 800,
        });
        if (!result.ok) throw new Error(result.reason === "rate_limited" ? "Rate limit exceeded" : "Invalid AI response");
        const meals = parseMealsFromText(JSON.parse(result.content), description);
        return meals.length > 0 ? { meals } : null;
      } catch (error) {
        console.error("Mya Text Analysis Error (multi):", error);
        return null;
      }
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
      const result = await callOpenAIChat({
        apiKey: openaiApiKey.value(),
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: description },
        ],
        responseFormat: "json_object",
        temperature: 0.3,
        maxTokens: 300,
      });

      if (!result.ok) throw new Error(result.reason === "rate_limited" ? "Rate limit exceeded" : "Invalid AI response");

      const parsed = JSON.parse(result.content);

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

export const analyzeWorkout = onCall(
  { secrets: [openaiApiKey], region: "us-central1", timeoutSeconds: 30 },
  async (request) => {
    requireAuth(request);
    const description = sanitizePromptText(request.data?.description, 500);
    if (!description) {
      throw new HttpsError("invalid-argument", "Chybí popis tréninku.");
    }
    await enforceRateLimit(request.auth!.uid, "analyzeWorkout", STANDARD_AI_CALL_MAX, STANDARD_AI_CALL_WINDOW_MS);

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
      const result = await callOpenAIChat({
        apiKey: openaiApiKey.value(),
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: description },
        ],
        responseFormat: "json_object",
        temperature: 0.3,
        maxTokens: 300,
      });

      if (!result.ok) throw new Error(result.reason === "rate_limited" ? "Rate limit exceeded" : "Invalid AI response");

      const parsed = JSON.parse(result.content);
      const confidence: Confidence = CONFIDENCE_LEVELS.includes(parsed.confidence) ? parsed.confidence : "low";

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
  coachingStyle?: unknown; // whitelist přes parseCoachingStyle
  isVacationDay?: unknown; // bere se jen doslovné true
  gender?: unknown; // "female" | "male", jen pro správný rod v odpovědi (viz genderPrompt)
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
    await enforceRateLimit(request.auth!.uid, "getMealFeedback", STANDARD_AI_CALL_MAX, STANDARD_AI_CALL_WINDOW_MS);

    const remaining = input.targetCalories - input.consumedTodayCalories;
    const mealTypeLabel = MEAL_TYPE_LABELS[input.mealType] ?? "jídlo";
    // REFERENCE/STRICT_COACHING_SPEC.md, A3 — nepovinné, starší build appky je neposílá.
    const coachingStyle = parseCoachingStyle(input.coachingStyle);
    const isVacationDay = input.isVacationDay === true;

    const systemPrompt = `Jsi Mya z aplikace Nouri. Uživatel právě zapsal jídlo. Reaguj JEDNOU krátkou větou (max ~20 slov) —
jak tohle jídlo zapadá do zbytku dne. Žádné obecné fráze, konkrétní reakce na dané jídlo.
Když je uživatel po tomhle jídle PŘES denní cíl, musíš to říct a uvést o kolik kcal — nesmíš to zamlčet ani obejít chválou.
${INTAKE_STATUS_RULE}
${buildCoachingPrompt(coachingStyle, isVacationDay, input.gender)}`;

    // Překročení appka modelu píše výslovně, ne jen jako záporné "Zbývá -300 kcal" — to dřív
    // model snadno přehlédl a odpověděl obecnou pochvalou. Opačný směr (vymyšlené překročení
    // pod cílem) hlídá výslovné STAV, stejně jako v pozdravu (viz REGRESE v dayStatus.ts).
    const balanceLine =
      remaining < 0
        ? `STAV: PŘEKROČENO — tímhle jídlem je PŘES denní cíl o ${-remaining} kcal.`
        : `STAV: POD CÍLEM (cíl nepřekročen) — zbývá ještě ${remaining} kcal.`;
    const userPrompt = `Právě zapsáno jako ${mealTypeLabel}: "${mealName}" (${input.calories} kcal, ${protein}g bílkovin).
Dnes celkem snědeno: ${input.consumedTodayCalories} kcal z cíle ${input.targetCalories} kcal. ${balanceLine}`;

    try {
      const result = await callOpenAIChat({
        apiKey: openaiApiKey.value(),
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        maxTokens: 80, // ~20 slov česky (dřív 60 na ~15 slov)
      });

      if (!result.ok) {
        return { text: result.reason === "rate_limited" ? "Zapsáno! ✨" : "Zapsáno! 👍" };
      }
      return { text: result.content };
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

const GOAL_LABELS: Record<Goal, string> = {
  lose: "hubnutí",
  maintain: "udržování váhy",
  gain: "nabírání svalové hmoty",
};

// Jídla, která dnes ještě chybí, s cílem porce (MYA_COACH_SPEC 6.6) — záložka Recepty posílá typy
// dnes zapsaných jídel a místní hodinu. Starší build appky je neposílá a sada se chová jako dřív.
function mealPlanFromRequest(
  data: Record<string, unknown> | undefined,
  remaining: RecipeBudget | null,
  daily: DailyTarget | undefined
): MealTarget[] | undefined {
  const todayMealTypes = parseTodayMealTypes(data?.todayMealTypes);
  const localHour = parseBoundedInt(data?.localHour, 0, 23);
  if (!remaining || !daily || !todayMealTypes || localHour === undefined) return undefined;
  return buildMealPlan(todayMealTypes, localHour, remaining, daily.calories);
}

// Sada receptů (záložka Recepty i karty v chatu) na stejném modelu jako chat (MYA_COACH_SPEC D10) —
// při chybě vyhodí, volající si sám rozhodne, co ukáže.
async function generateRecipeSet(systemPrompt: string, userPrompt: string): Promise<RecipeResult[]> {
  const result = await callOpenAIChat({
    apiKey: openaiApiKey.value(),
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    responseFormat: "json_object",
    temperature: 0.8,
    // 700 jako u jednoho receptu by JSON se třemi recepty uřízlo uprostřed.
    maxTokens: 2200,
  });
  if (!result.ok) throw new Error(result.reason === "rate_limited" ? "Rate limit exceeded" : "Invalid AI response");
  return parseRecipeSet(JSON.parse(result.content));
}

export const generateRecipe = onCall(
  { secrets: [openaiApiKey], region: "us-central1", timeoutSeconds: 45 },
  async (request): Promise<RecipeResult | { recipes: RecipeResult[] } | null> => {
    requireAuth(request);
    const input = request.data as RecipeInput | undefined;
    // Sada receptů (`multi`) umí i recepty "na jindy" — zbytek dne smí být malý i záporný
    // (den přes cíl), porce pak určí denní cíl. Jeden recept (starší appka) dál jen do zbytku dne.
    const multi = request.data?.multi === true;
    if (!input || !Number.isFinite(input.remainingCalories) || (!multi && input.remainingCalories <= 0)) {
      throw new HttpsError("invalid-argument", "Chybí platný zbývající kalorický rozpočet.");
    }
    const daily = parseDailyTarget(request.data);
    const remaining = recipeSetBudget(input);
    if (multi && !remaining && !daily) {
      throw new HttpsError("invalid-argument", "Chybí denní cíl pro recepty na jindy.");
    }
    await enforceRateLimit(request.auth!.uid, "generateRecipe", STANDARD_AI_CALL_MAX, STANDARD_AI_CALL_WINDOW_MS);

    const goalLabel = GOAL_LABELS[input.goal] ?? GOAL_LABELS.maintain;
    const preferences = sanitizePromptText(input.preferences, 300);
    // Ze seznamu surovin teď appka dělá tři různá jídla — 500 znaků, ať se vejde i delší výčet.
    const availableIngredients = sanitizePromptText(input.availableIngredients, 500);

    // `multi` (Recepty.tsx) = sada receptů, viz recipes.ts. Bez něj (starší build appky) jeden
    // recept přesně jako dřív.
    if (multi) {
      const mealPlan = mealPlanFromRequest(request.data, remaining, daily);
      try {
        const recipes = await generateRecipeSet(
          recipeSetSystemPromptFor(remaining, mealPlan),
          buildRecipeSetUserPrompt({ remaining, goalLabel, daily, preferences, availableIngredients, mealPlan })
        );
        return recipes.length > 0 ? { recipes } : null;
      } catch (error) {
        console.error("Mya Recipe Error (multi):", error);
        return null;
      }
    }

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
      const result = await callOpenAIChat({
        apiKey: openaiApiKey.value(),
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        responseFormat: "json_object",
        temperature: 0.7,
        maxTokens: 700,
      });

      if (!result.ok) throw new Error(result.reason === "rate_limited" ? "Rate limit exceeded" : "Invalid AI response");

      const parsed = JSON.parse(result.content);

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
    await enforceRateLimit(request.auth!.uid, "suggestMacroFix", STANDARD_AI_CALL_MAX, STANDARD_AI_CALL_WINDOW_MS);

    const goalLabel = GOAL_LABELS[input.goal] ?? GOAL_LABELS.maintain;
    const fallback = `Posledních pár dní ti chybí bílkoviny k cíli (${input.targetProtein}g/den) — zkus přidat větší porci masa, tvarohu nebo luštěnin k jednomu z jídel.`;

    const systemPrompt = `Jsi Mya, AI nutriční asistentka aplikace Nouri. Appka si všimla, že uživatel dlouhodobě
nedosahuje svého cíle na bílkoviny. Napiš krátkou (2-3 věty), vřelou a konkrétní zprávu, která to pojmenuje a
navrhne 1-2 praktické kroky ke zlepšení (např. konkrétní potraviny, posun rozložení jídel) — tón podpůrný, ne
kárající. Piš česky, neformálně. Vrať jen čistý text zprávy, žádný markdown ani uvozovky okolo.`;

    const userPrompt = `Za posledních ${input.daysConsidered} spolehlivě zapsaných dní měl uživatel v průměru ${input.avgProtein}g
bílkovin denně, cíl je ${input.targetProtein}g. Cíl uživatele: ${goalLabel}.`;

    try {
      const result = await callOpenAIChat({
        apiKey: openaiApiKey.value(),
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        maxTokens: 120,
      });

      if (!result.ok) return { text: fallback };
      const content = result.content.trim();
      if (!content) return { text: fallback };
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
    await enforceRateLimit(request.auth!.uid, "checkLowCalorieIntake", STANDARD_AI_CALL_MAX, STANDARD_AI_CALL_WINDOW_MS);

    const fallback = `Posledních pár dní jíš výrazně méně, než je tvůj cíl (${input.targetCalories} kcal/den) — je u tebe všechno v pořádku?`;

    const systemPrompt = `Jsi Mya, empatická AI nutriční asistentka aplikace Nouri. Appka si všimla, že uživatel
dlouhodobě jí výrazně méně, než je jeho denní cíl. Napiš krátkou (2-3 věty), vřelou a citlivou zprávu, která se
opatrně a s péčí zeptá, jestli je vše v pořádku. NENÍ to "hlídání" ani kárání — je to projev toho, že appce na
uživateli záleží. Nenavrhuj konkrétní jídla ani "jez víc", spíš otevři prostor pro odpověď (může to být záměr,
stres, nechutenství, cokoliv). Piš česky, neformálně. Vrať jen čistý text zprávy, žádný markdown ani uvozovky okolo.`;

    const userPrompt = `Za posledních ${input.daysConsidered} spolehlivě zapsaných dní měl uživatel v průměru ${input.avgCalories} kcal
denně, cíl je ${input.targetCalories} kcal. Cíl uživatele: ${GOAL_LABELS[input.goal] ?? GOAL_LABELS.maintain}.`;

    try {
      const result = await callOpenAIChat({
        apiKey: openaiApiKey.value(),
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        maxTokens: 120,
      });

      if (!result.ok) return { text: fallback };
      const content = result.content.trim();
      if (!content) return { text: fallback };
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
    await enforceRateLimit(request.auth!.uid, "getWeeklySummary", STANDARD_AI_CALL_MAX, STANDARD_AI_CALL_WINDOW_MS);

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
      const result = await callOpenAIChat({
        apiKey: openaiApiKey.value(),
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        maxTokens: 160,
      });

      if (!result.ok) return { text: fallback };
      const content = result.content.trim();
      if (!content) return { text: fallback };
      return { text: content };
    } catch (error) {
      console.error("Mya Weekly Summary Error:", error);
      return { text: fallback };
    }
  }
);

const CHAT_FALLBACK_TEXT = "Mya právě neodpovídá — zkus to prosím znovu za chvíli.";
const CHAT_RECIPE_FALLBACK_TEXT = "Recepty se mi teď nepodařilo vymyslet — zkus to prosím znovu za chvíli.";

// Volný chat s Myou (FEATURE_IDEAS.md sekce 6) — jediná funkce v tomhle souboru s vícekolovou
// konverzací (ostatní jsou vždy přesně systém+user). Zůstává bezstavová jako všechny sourozenní
// funkce: appka posílá ořezanou historii z users/{uid}/chatMessages (viz cloudSync.ts), funkce
// sama do Firestore nesahá. Protože historie teď přichází od klienta, je to nedůvěryhodný vstup —
// validuje se délka pole i každé zprávy zvlášť, na rozdíl od ostatních funkcí v souboru.
// System prompt staví chatPrompt.ts (pravidla, příběh a paměť, data dne).
// Timeout 60 s: odpověď s recepty jsou dvě volání OpenAI po sobě (nástroj + sada receptů).
export const chatWithMya = onCall(
  { secrets: [openaiApiKey], region: "us-central1", timeoutSeconds: 60 },
  async (request) => {
    requireAuth(request);
    const profile = parseProfileInput(request.data?.profile);
    if (!profile) throw new HttpsError("invalid-argument", "Chybí profil nebo je neplatný.");

    // Validace historie (délky, role, oříznutí dlouhé odpovědi Myi) — viz chatMessages.ts.
    const parsedMessages = parseChatMessages(request.data?.messages);
    if (!parsedMessages.ok) throw new HttpsError("invalid-argument", parsedMessages.error);
    const messages = parsedMessages.messages;
    await enforceRateLimit(request.auth!.uid, "chatWithMya", STANDARD_AI_CALL_MAX, STANDARD_AI_CALL_WINDOW_MS);

    // Živě přepočteno z profilu, ne z profile.targetCalories (stejný důvod jako u getDailyGreeting).
    const nutrition = nutritionFromProfile(profile);
    const goalLabel = GOAL_LABELS[profile.goal];
    // Snímek dne od klienta (viz chatContext.ts) — bez něj (starší build appky) chat zná jen profil.
    const dayContext = parseChatContext(request.data?.context);
    // Příznaky nové appky — starší build v cache PWA je neposílá a dostane recepty textem a čistý text.
    const recipeCards = request.data?.recipeCards === true;
    const richText = request.data?.richText === true;

    const systemPrompt = buildChatSystemPrompt({
      profile,
      nutrition,
      story: parseUserStory(request.data?.profile),
      dayContext,
      recipeCards,
      richText,
    });

    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    try {
      const result = await callOpenAIChat({
        apiKey: openaiApiKey.value(),
        model: CHAT_MODEL,
        messages: apiMessages,
        // 500 by tři recepty (viz CHAT_RECIPE_RULE) uřízlo uprostřed; běžné odpovědi jsou dál krátké.
        maxTokens: 1100,
        temperature: 0.7,
        ...(recipeCards
          ? {
              tools: [SUGGEST_RECIPES_TOOL],
              // Jednoznačná žádost o vaření / nový recept = karty vždy (viz forcesRecipeTool).
              ...(forcesRecipeTool(messages[messages.length - 1].content) ? { toolChoice: { name: SUGGEST_RECIPES_TOOL_NAME } } : {}),
            }
          : {}),
      });

      if (!result.ok) {
        return {
          text: result.reason === "rate_limited" ? "Mya je momentálně přetížená, zkus to prosím za chvíli." : CHAT_FALLBACK_TEXT,
        };
      }

      if (recipeCards && result.toolCall?.name === SUGGEST_RECIPES_TOOL_NAME) {
        const args = parseSuggestRecipesArgs(result.toolCall.arguments);
        const daily = {
          calories: nutrition.targetCalories,
          protein: nutrition.macros.protein,
          fat: nutrition.macros.fat,
          carbs: nutrition.macros.carbs,
        };
        const remaining = chatRecipeBudget(daily, dayContext);
        // Jídla, která dnes ještě chybí, z typů dnes zapsaných jídel a hodiny v kontextu (6.6).
        const mealPlan = chatMealPlan(daily, dayContext, remaining);
        try {
          const recipes = await generateRecipeSet(
            recipeSetSystemPromptFor(remaining, mealPlan),
            buildRecipeSetUserPrompt({
              remaining,
              goalLabel,
              daily,
              preferences: args.preferences,
              availableIngredients: args.ingredients,
              mealPlan,
            })
          );
          if (recipes.length === 0) return { text: CHAT_RECIPE_FALLBACK_TEXT };
          return {
            text: chatRecipeIntro({
              hasIngredients: !!args.ingredients,
              todayFull: !!dayContext && !remaining,
              count: recipes.length,
            }),
            recipes,
          };
        } catch (error) {
          console.error("Mya Chat Recipe Error:", error);
          return { text: CHAT_RECIPE_FALLBACK_TEXT };
        }
      }

      const content = result.content.trim();
      if (!content) return { text: CHAT_FALLBACK_TEXT };
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
    await enforceRateLimit(request.auth!.uid, "transcribeAudio", EXPENSIVE_AI_CALL_MAX, EXPENSIVE_AI_CALL_WINDOW_MS);

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
    await enforceRateLimit(request.auth!.uid, "congratulateGoalReached", STANDARD_AI_CALL_MAX, STANDARD_AI_CALL_WINDOW_MS);

    const fallback = `Gratuluji, dosáhla jsi cílové váhy ${input.targetWeight} kg! Co kdybychom teď přepnuly na Udržování, ať se tam udržíš?`;

    const systemPrompt = `Jsi Mya, empatická AI nutriční asistentka aplikace Nouri. Uživatelka právě dosáhla své
cílové váhy. Napiš krátkou (2-3 věty), radostnou a upřímnou gratulační zprávu, oceň její vytrvalost. Jemně navrhni,
ať zváží přepnutí režimu na "Udržovat váhu" místo pokračování ve stejném kalorickém deficitu/přebytku — appka
k tomu hned pod zprávou nabídne tlačítko, takže to jen zmiň, nepiš instrukce jak to udělat. Piš česky, neformálně.
Vrať jen čistý text zprávy, žádný markdown ani uvozovky okolo.`;

    const goalLabel = input.goal === "gain" ? "nabírání" : "hubnutí";
    const userPrompt = `Uživatelka měla cíl ${goalLabel} na váhu ${input.targetWeight} kg a právě dosáhla ${input.currentWeight} kg.`;

    try {
      const result = await callOpenAIChat({
        apiKey: openaiApiKey.value(),
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        maxTokens: 120,
      });

      if (!result.ok) return { text: fallback };
      const content = result.content.trim();
      if (!content) return { text: fallback };
      return { text: content };
    } catch (error) {
      console.error("Mya Goal Reached Congrats Error:", error);
      return { text: fallback };
    }
  }
);

export const generateRecipeFromFridge = onCall(
  { secrets: [openaiApiKey], region: "us-central1", memory: "512MiB", timeoutSeconds: 60 },
  async (request): Promise<RecipeResult | { recipes: RecipeResult[] } | null> => {
    requireAuth(request);
    const input = request.data as FridgeRecipeInput | undefined;
    if (!input?.imageDataUrl || !input.imageDataUrl.startsWith("data:image/")) {
      throw new HttpsError("invalid-argument", "Chybí platný obrázek.");
    }
    // Recepty "na jindy" stejně jako generateRecipe.
    const multi = request.data?.multi === true;
    if (!Number.isFinite(input.remainingCalories) || (!multi && input.remainingCalories <= 0)) {
      throw new HttpsError("invalid-argument", "Chybí platný zbývající kalorický rozpočet.");
    }
    const daily = parseDailyTarget(request.data);
    const remaining = recipeSetBudget(input);
    if (multi && !remaining && !daily) {
      throw new HttpsError("invalid-argument", "Chybí denní cíl pro recepty na jindy.");
    }
    await enforceRateLimit(request.auth!.uid, "generateRecipeFromFridge", EXPENSIVE_AI_CALL_MAX, EXPENSIVE_AI_CALL_WINDOW_MS);

    const goalLabel = GOAL_LABELS[input.goal] ?? GOAL_LABELS.maintain;
    const preferences = sanitizePromptText(input.preferences, 300);

    // `multi` (Recepty.tsx) = sada receptů jako u generateRecipe, viz recipes.ts.
    if (multi) {
      const mealPlan = mealPlanFromRequest(request.data, remaining, daily);
      try {
        const result = await callOpenAIChat({
          apiKey: openaiApiKey.value(),
          model: "gpt-4o",
          messages: [
            { role: "system", content: recipeSetSystemPromptFor(remaining, mealPlan, "fridge") },
            {
              role: "user",
              content: [
                { type: "text", text: buildRecipeSetUserPrompt({ remaining, goalLabel, daily, preferences, mealPlan }) },
                { type: "image_url", image_url: { url: input.imageDataUrl } },
              ],
            },
          ],
          responseFormat: "json_object",
          temperature: 0.7,
          maxTokens: 2200,
        });
        if (!result.ok) throw new Error(result.reason === "rate_limited" ? "Rate limit exceeded" : "Invalid AI response");
        const parsed = JSON.parse(result.content);
        if (parsed.recognized !== true) return null;
        const recipes = parseRecipeSet(parsed);
        return recipes.length > 0 ? { recipes } : null;
      } catch (error) {
        console.error("Mya Fridge Recipe Error (multi):", error);
        return null;
      }
    }

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
      const result = await callOpenAIChat({
        apiKey: openaiApiKey.value(),
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
        responseFormat: "json_object",
        temperature: 0.7,
        maxTokens: 700,
      });

      if (!result.ok) throw new Error(result.reason === "rate_limited" ? "Rate limit exceeded" : "Invalid AI response");

      const parsed = JSON.parse(result.content);
      if (parsed.recognized !== true) return null;

      return sanitizeRecipeResult(parsed);
    } catch (error) {
      console.error("Mya Fridge Recipe Error:", error);
      return null;
    }
  }
);
