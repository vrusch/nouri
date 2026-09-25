// Styl Myi (REFERENCE/STRICT_COACHING_SPEC.md) — serverová polovina. Klient posílá jen
// "gentle" | "balanced" | "strict"; cokoliv jiného (starší build appky, podvržený vstup)
// appka bere jako "balanced". Stejná whitelist validace jako mood v getDailyGreeting.

export type CoachingStyle = "gentle" | "balanced" | "strict";

export function parseCoachingStyle(value: unknown): CoachingStyle {
  return value === "gentle" || value === "balanced" || value === "strict" ? value : "balanced";
}

const STYLE_PROMPTS: Record<CoachingStyle, string> = {
  gentle:
    "Styl: JEMNÁ. Povzbuzuj a buď laskavá. Když je uživatel přes cíl, zmiň to, ale bez tlaku a výčitek.",
  balanced:
    "Styl: VYVÁŽENÁ. Buď věcná, upřímná a přátelská. Když je uživatel přes cíl, řekni to na rovinu i s číslem.",
  strict:
    "Styl: PŘÍSNÁ. Uživatel si v appce výslovně vyžádal přísné vedení. Buď přímá, bez obalu a bez zbytečné chvály. " +
    "Překročení cíle jasně pojmenuj číslem a dej najevo, že to není v pořádku. Když data výslovně uvádějí, že něco " +
    "chybí (voda, nezapsané jídlo), důrazně to připomeň — sama nic chybějícího nedomýšlej. Pochval jen to, co opravdu sedí.",
};

// Mantinely platí v KAŽDÉM stylu (principy 1 a 2 ve spec dokumentu) — přísnost nesmí sklouznout
// ke kompenzačnímu hladovění ani k útokům na tělo. Nízký příjem hlídá samostatná, záměrně
// pečující funkce checkLowCalorieIntake.
const COACHING_GUARDRAILS =
  "Hranice (platí vždy): kritizuj jen jídlo, čísla a návyky — nikdy tělo, vzhled ani člověka samotného, žádné urážky ani " +
  "zesměšňování. Po přejedení je jediný správný pokyn vrátit se k běžnému dennímu cíli (žádné mlsání navíc, další den " +
  "normálně podle plánu) — nikdy nenabádej jíst méně než cíl, vynechat jídlo, hladovět ani překročení \"dohánět\". " +
  "Nízký příjem nikdy nechval ani nevyčítej.";

const VACATION_PROMPT =
  "Dnes má uživatel volný den / dovolenou. Toleruj víc, ale překročení cíle nezamlčuj — pojmenuj ho a dej najevo, " +
  "že dnes je to v pořádku, ale ať si na to nezvyká.";

// Bez rodu model psal "Překročil jsi" / "vypil(a)" i ženě (appku používají hlavně ženy) —
// objeveno při živém ověření fáze A. Neznámý rod = nic, model pak zůstane u neutrální formy.
function genderPrompt(gender: unknown): string {
  if (gender === "female") return "Uživatelka je žena — oslovuj ji důsledně v ženském rodě (např. \"překročila jsi\", \"vypila jsi\").";
  if (gender === "male") return "Uživatel je muž — oslovuj ho v mužském rodě.";
  return "";
}

export function buildCoachingPrompt(style: CoachingStyle, isVacationDay: boolean, gender?: unknown): string {
  return [STYLE_PROMPTS[style], isVacationDay ? VACATION_PROMPT : "", COACHING_GUARDRAILS, genderPrompt(gender)]
    .filter(Boolean)
    .join("\n");
}
