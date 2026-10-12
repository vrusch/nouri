// Porovnání modelů chatu s Myou (REFERENCE/MYA_COACH_SPEC.md 5.4) — mimo build i mimo appku.
// Staví system prompt stejně jako produkce (functions/lib/chatPrompt.js) a posílá skutečný nástroj
// navrhni_recepty, ať porovnání prověří i volání nástroje.
//
// Klíč k OpenAI do sezení s Claudem nepatří. Spouští se ve vlastním terminálu:
//   npm --prefix functions run build
//   PowerShell: $env:OPENAI_API_KEY = (firebase functions:secrets:access OPENAI_API_KEY); node functions/scripts/compareChatModels.mjs
//   bash:       OPENAI_API_KEY=$(firebase functions:secrets:access OPENAI_API_KEY) node functions/scripts/compareChatModels.mjs
// Výsledek se uloží do REFERENCE/ab-chat-<datum>.md (REFERENCE je v .gitignore) a vyhodnotí se společně.
//
// Fáze 1: gpt-4o-mini (dnes) proti gpt-4.1-mini, oba s novým promptem a stejnými parametry jako
// produkce. Navíc průzkum pro fázi 2: gpt-6.1-sol s reasoning a nástrojem v Chat Completions na
// scénářích 1 a 6 — ukáže dopředu, jestli fáze 2 potřebuje Responses API.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildChatSystemPrompt } from "../lib/chatPrompt.js";
import { parseChatContext } from "../lib/chatContext.js";
import { nutritionFromProfile, parseProfileInput } from "../lib/profileInput.js";
import { parseUserStory } from "../lib/userStory.js";
import {
  SUGGEST_RECIPES_TOOL,
  buildRecipeSetUserPrompt,
  chatMealPlan,
  chatRecipeBudget,
  forcesRecipeTool,
  parseRecipeSet,
  parseSuggestRecipesArgs,
  recipeSetSystemPromptFor,
} from "../lib/recipes.js";

// --dry: jen vypíše system prompty scénářů, nic neposílá (kontrola bez klíče).
const dryRun = process.argv.includes("--dry");
const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey && !dryRun) {
  console.error("Chybí OPENAI_API_KEY (viz návod v hlavičce souboru).");
  process.exit(1);
}

const CHAT_MODELS = [
  { model: "gpt-4o-mini", kind: "chat" },
  { model: "gpt-4.1-mini", kind: "chat" },
];
// A/B 2026-10-12: gpt-6.1-sol reasoning_effort "none" vůbec nepodporuje (jen low/medium/high/xhigh) —
// průzkum proto zkouší "low" s nástrojem v Chat Completions.
const PROBE = { model: "gpt-6.1-sol", kind: "reasoning", effort: "low", scenarios: ["1", "6"] };

// Profil podobný uživatelce: 84 kg, cílová váha 70 kg, hubnutí, příběh 115 → 84 kg.
const RAW_PROFILE = {
  name: "Jana",
  gender: "female",
  height: 168,
  weight: 84,
  birthDate: "1988-05-01",
  activityLevel: 1.375,
  goal: "lose",
  targetWeight: 70,
  coachingStyle: "balanced",
  journeyStartWeight: 115,
  journeyStartDate: "2026-03-10",
  myaMemory:
    "Zhubla jsem se ChatGPT ze 115 na 84 kg. Fungovalo mi: hodně bílkovin, skyr a kuřecí, chodit 10 000 kroků.\n" +
    "Nefungovalo: přerušovaný půst (večer jsem se přejídala). Nemám ráda tvaroh a rybu.",
};
const profile = parseProfileInput(RAW_PROFILE);
const nutrition = nutritionFromProfile(profile);
const daily = {
  calories: nutrition.targetCalories,
  protein: nutrition.macros.protein,
  fat: nutrition.macros.fat,
  carbs: nutrition.macros.carbs,
};

const today = new Date().toISOString().slice(0, 10);

/** Den se zbytkem `remainingKcal` a mezerou bílkovin `proteinGap` (čísla dopočítá ze skutečného cíle). */
function day({ hour, remainingKcal, proteinGap, meals }) {
  const consumedCalories = daily.calories - remainingKcal;
  const consumedProtein = daily.protein - proteinGap;
  const share = (total) => meals.map((m) => Math.round((total * m.calories) / meals.reduce((s, x) => s + x.calories, 0)));
  const kcal = share(consumedCalories);
  const protein = share(consumedProtein);
  return parseChatContext({
    date: today,
    localHour: hour,
    isVacationDay: false,
    consumedCalories: kcal.reduce((a, b) => a + b, 0),
    consumedProtein: protein.reduce((a, b) => a + b, 0),
    // Sacharidy a tuky v poměru snědených kalorií, ať zbytek maker odpovídá zbytku kcal.
    consumedCarbs: Math.round((daily.carbs * consumedCalories) / daily.calories),
    consumedFat: Math.round((daily.fat * consumedCalories) / daily.calories),
    hasIncompleteMacroData: false,
    workoutBonusCalories: 0,
    meals: meals.map((m, i) => ({ ...m, calories: kcal[i], protein: protein[i] })),
    workouts: [],
    waterGlasses: 6,
    waterTarget: 8,
    recentDays: [],
    weightLogs: [
      { date: "2026-09-28", weight: 85.1 },
      { date: "2026-10-05", weight: 84.4 },
      { date: today, weight: 84 },
    ],
    targetWeight: 70,
  });
}

const SCENARIOS = [
  {
    id: "1",
    title: "Její den: zbývá 245 kcal / 48 g bílkovin",
    expect: "konkrétní gramáž, kolik z mezery pokryje, nic přes 245 kcal, nástroj se NESMÍ spustit",
    context: day({
      hour: 17,
      remainingKcal: 245,
      proteinGap: 48,
      meals: [
        { name: "Ovesná kaše s banánem", type: "breakfast", time: "08:00", calories: 3 },
        { name: "Těstoviny s kuřecím", type: "lunch", time: "12:30", calories: 5 },
        { name: "Croissant", type: "snack", time: "15:30", calories: 2 },
      ],
    }),
    question: "Chybí mi 48 g bílkovin a do cíle mám ještě 245 kcal. Jak to mám dohnat?",
  },
  {
    id: "5",
    title: "22:00, zbývá 400 kcal",
    expect: "rozumná lehká varianta, žádný tlak „musíš dojíst“",
    context: day({
      hour: 22,
      remainingKcal: 400,
      proteinGap: 30,
      meals: [
        { name: "Vajíčka s chlebem", type: "breakfast", time: "08:00", calories: 1 },
        { name: "Kuřecí rizoto", type: "lunch", time: "12:30", calories: 2 },
        { name: "Zeleninový salát s tuňákem", type: "dinner", time: "18:30", calories: 1 },
      ],
    }),
    question: "Ještě mi zbývá 400 kcal. Mám je dojíst?",
  },
  {
    id: "6",
    title: "Výslovná žádost o recept",
    expect: "nástroj navrhni_recepty se MUSÍ spustit",
    context: day({
      hour: 17,
      remainingKcal: 700,
      proteinGap: 50,
      meals: [
        { name: "Skyr s ovocem", type: "breakfast", time: "08:00", calories: 1 },
        { name: "Kuřecí wrap", type: "lunch", time: "12:30", calories: 2 },
      ],
    }),
    question: "Co si mám uvařit k večeři?",
  },
  {
    id: "6b",
    title: "Co si dát k večeři, bez vaření (hranice proti receptům)",
    expect: "textem: porce podle řádku Další jídlo dne, nástroj se NESMÍ spustit",
    context: day({
      hour: 17,
      remainingKcal: 700,
      proteinGap: 50,
      meals: [
        { name: "Skyr s ovocem", type: "breakfast", time: "08:00", calories: 1 },
        { name: "Kuřecí wrap", type: "lunch", time: "12:30", calories: 2 },
      ],
    }),
    question: "Co si dám dneska k večeři? Vařit se mi nechce.",
  },
  {
    id: "7",
    title: "Snídaně a oběd zapsané, 18:30, zbývá 650 kcal / 55 g",
    expect: "nástroj; 3 večeře, každá ≤ 650 kcal a ≥ ~40 g bílkovin",
    context: day({
      hour: 18,
      remainingKcal: 650,
      proteinGap: 55,
      meals: [
        { name: "Chléb se sýrem", type: "breakfast", time: "08:00", calories: 1 },
        { name: "Svíčková", type: "lunch", time: "12:30", calories: 2 },
      ],
    }),
    question: "Dej mi recept na večeři.",
  },
  {
    // REGRESE (živý test 2026-10-12): s historií, ve které už byly karty, Mya nástroj nezavolala
    // a nabídla starší kartu (s tvarohem, který podle paměti nejí).
    id: "6c",
    title: "Žádost o recept s historií dřívějších karet",
    expect: "nástroj se MUSÍ spustit i s historií, v preferences bez tvarohu a ryby, starší karta se nenabízí",
    context: day({
      hour: 17,
      remainingKcal: 700,
      proteinGap: 50,
      meals: [
        { name: "Skyr s ovocem", type: "breakfast", time: "08:00", calories: 1 },
        { name: "Kuřecí wrap", type: "lunch", time: "12:30", calories: 2 },
      ],
    }),
    history: [
      { role: "user", content: "Mám doma vejce, šunku a brambory, co z toho uvařit?" },
      {
        role: "assistant",
        content:
          "Z toho, co máš doma, mě napadly tyhle recepty — rozklikni, co tě láká:\n[Karty receptů:\n" +
          "- Snídaně: Vaječná omeleta se šunkou — 320 kcal, bílkoviny 24 g, tuky 20 g, sacharidy 4 g, 10 min; suroviny: 3 vejce, 50 g šunky; postup: Rozšlehej vejce. Opeč.\n" +
          "- Oběd: Brambory se šunkou — 450 kcal, bílkoviny 32 g, tuky 14 g, sacharidy 45 g, 25 min; suroviny: 300 g brambor, 80 g šunky; postup: Uvař brambory. Přidej šunku.\n" +
          "- Večeře: Vaječný salát se šunkou a tvarohem — 350 kcal, bílkoviny 28 g, tuky 14 g, sacharidy 4 g, 15 min; suroviny: 3 vejce, 50 g šunky, 100 g tvarohu; postup: Uvař vejce. Smíchej.]",
      },
      { role: "user", content: "A kolik má ten oběd tuku?" },
      { role: "assistant", content: "Brambory se šunkou mají 14 g tuku." },
    ],
    question: "Co si mám uvařit k večeři?",
  },
  {
    // REGRESE (živý test 2026-10-12): s cílem porce jen pro nejbližší jídlo (oběd) ho Mya použila pro večeři.
    id: "6d",
    title: "Ve 12:00 bez oběda: co k večeři (cíl porce večeře, ne oběda)",
    expect: "textem, s cílem porce VEČEŘE z řádku Další jídla dne (ne oběda), nástroj se NESMÍ spustit",
    context: day({
      hour: 12,
      remainingKcal: 1300,
      proteinGap: 100,
      meals: [{ name: "Skyr s ovocem", type: "breakfast", time: "08:00", calories: 1 }],
    }),
    question: "Co si dám dneska k večeři? Vařit se mi nechce.",
  },
  {
    id: "S",
    title: "Strategická otázka (příběh a paměť)",
    expect: "vazba na její data a příběh (115 → 84 kg, co jí fungovalo), 1–3 konkrétní kroky, čitelné na telefonu",
    context: day({
      hour: 10,
      remainingKcal: 1300,
      proteinGap: 100,
      meals: [{ name: "Skyr s ovocem", type: "breakfast", time: "08:00", calories: 1 }],
    }),
    question: "Jak to mám dělat, abych zhubla ještě 14 kg a neztratila přitom svaly?",
  },
];

async function callOpenAI(body) {
  const started = Date.now();
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { status: response.status, ms: Date.now() - started, json };
}

function chatBody({ model, kind, effort }, systemPrompt, question, history = []) {
  const base = {
    model,
    messages: [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: question }],
    tools: [SUGGEST_RECIPES_TOOL],
    // Stejná pojistka jako chatWithMya: jednoznačná žádost o vaření / nový recept nástroj vynutí.
    tool_choice: forcesRecipeTool(question) ? { type: "function", function: { name: SUGGEST_RECIPES_TOOL.function.name } } : "auto",
    parallel_tool_calls: false,
  };
  // Stejné parametry jako chatWithMya; reasoning model bere max_completion_tokens a bez temperature (spec 5A.1).
  return kind === "reasoning"
    ? { ...base, reasoning_effort: effort, max_completion_tokens: 1100 }
    : { ...base, max_tokens: 1100, temperature: 0.7 };
}

async function recipeSet(model, toolArguments, context) {
  const args = parseSuggestRecipesArgs(toolArguments);
  const remaining = chatRecipeBudget(daily, context);
  const mealPlan = chatMealPlan(daily, context, remaining);
  const result = await callOpenAI({
    model,
    messages: [
      { role: "system", content: recipeSetSystemPromptFor(remaining, mealPlan) },
      {
        role: "user",
        content: buildRecipeSetUserPrompt({
          remaining,
          goalLabel: "hubnutí",
          daily,
          preferences: args.preferences,
          availableIngredients: args.ingredients,
          mealPlan,
        }),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.8,
    max_tokens: 2200,
  });
  const content = result.json.choices?.[0]?.message?.content;
  let recipes = [];
  try {
    recipes = parseRecipeSet(JSON.parse(content ?? "{}"));
  } catch {
    recipes = [];
  }
  return { ms: result.ms, remaining, mealPlan, recipes };
}

const out = [];
const log = (line = "") => {
  out.push(line);
  console.log(line);
};

log(`# Porovnání modelů chatu — ${new Date().toISOString()}`);
log();
log(`Profil: ${profile.weight} kg → cíl ${profile.targetWeight} kg, denní cíl ${daily.calories} kcal, bílkoviny ${daily.protein} g.`);

for (const scenario of SCENARIOS) {
  const systemPrompt = buildChatSystemPrompt({
    profile,
    nutrition,
    story: parseUserStory(RAW_PROFILE),
    dayContext: scenario.context,
    recipeCards: true,
    richText: true,
  });
  if (dryRun) {
    console.log(`\n===== Scénář ${scenario.id}: ${scenario.title} =====\n${systemPrompt}`);
    continue;
  }
  log();
  log(`## Scénář ${scenario.id}: ${scenario.title}`);
  log();
  log(`Otázka: „${scenario.question}“  `);
  log(`Čeká se: ${scenario.expect}`);

  const runs = [...CHAT_MODELS];
  if (PROBE.scenarios.includes(scenario.id)) runs.push(PROBE);
  for (const run of runs) {
    const { model, kind } = run;
    const result = await callOpenAI(chatBody(run, systemPrompt, scenario.question, scenario.history));
    const choice = result.json.choices?.[0];
    const usage = result.json.usage;
    log();
    log(`### ${model}${kind === "reasoning" ? ` (reasoning_effort: ${run.effort})` : ""}`);
    log();
    log(
      `HTTP ${result.status}, ${result.ms} ms, finish_reason: ${choice?.finish_reason ?? "?"}, ` +
        `tokeny vstup/výstup: ${usage?.prompt_tokens ?? "?"}/${usage?.completion_tokens ?? "?"}` +
        (usage?.prompt_tokens_details?.cached_tokens ? ` (z cache ${usage.prompt_tokens_details.cached_tokens})` : "")
    );
    if (result.status !== 200) {
      log();
      log("```");
      log(JSON.stringify(result.json, null, 2));
      log("```");
      continue;
    }
    const toolCall = choice?.message?.tool_calls?.[0]?.function;
    if (toolCall) {
      log();
      log(`**Nástroj:** ${toolCall.name} ${toolCall.arguments}`);
      if (kind === "chat") {
        const set = await recipeSet(model, toolCall.arguments, scenario.context);
        log();
        log(
          `Sada receptů (${set.ms} ms), zbytek dne ${set.remaining ? `${set.remaining.calories} kcal / ${set.remaining.protein} g B` : "—"}` +
            (set.mealPlan ? `, plán: ${set.mealPlan.map((t) => `${t.type} ~${t.calories} kcal, ≥ ${t.minProtein} g B`).join("; ")}` : "")
        );
        for (const recipe of set.recipes) {
          log(`- ${recipe.mealType ?? "?"}: ${recipe.name} — ${recipe.calories} kcal, B ${recipe.protein} g, T ${recipe.fat} g, S ${recipe.carbs} g`);
        }
      }
    }
    const text = choice?.message?.content;
    if (text) {
      log();
      log(text);
    }
  }
}


if (dryRun) process.exit(0);

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "REFERENCE");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `ab-chat-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.md`);
writeFileSync(outFile, `${out.join("\n")}\n`, "utf8");
console.error(`\nUloženo do ${outFile}`);
